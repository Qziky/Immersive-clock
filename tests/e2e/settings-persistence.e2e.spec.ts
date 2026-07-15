import { expect, test, type Locator, type Page } from "@playwright/test";

import { showHud } from "./e2eUtils";

async function openStudySettings(page: Parameters<typeof showHud>[0]) {
  await showHud(page);
  const tablist = page.getByRole("tablist", { name: "选择时钟模式" });
  await tablist.getByRole("tab", { name: /自习/ }).click();

  const automaticReport = page.getByRole("dialog", { name: /统计报告/ });
  try {
    await automaticReport.waitFor({ state: "visible", timeout: 1000 });
    await page.keyboard.press("Escape");
    await expect(automaticReport).toBeHidden();
  } catch {
    // 当前时间不在课时结算点时不会出现自动报告。
  }

  await page.getByRole("button", { name: "打开设置" }).click();

  const dialog = page.getByRole("dialog", { name: "设置" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("button", { name: "常用工作台" })).toBeVisible();
  if ((page.viewportSize()?.width ?? 1280) <= 720) {
    await expect(dialog.getByRole("navigation", { name: "设置紧凑导航" })).toBeVisible();
    await expect(dialog.getByRole("heading", { name: "启动页面", level: 2 })).toBeVisible();
  } else {
    await expect(dialog.getByRole("button", { name: "启动页面" })).toBeVisible();
  }

  return dialog;
}

async function addStudyInfo(page: Page, dialog: Locator, optionName: string) {
  await dialog.getByRole("button", { name: "添加信息" }).click();
  await page.getByRole("option", { name: optionName, exact: false }).click();
}

/** 端到端用例：验证设置保存后写入本地存储且刷新后仍生效（函数级注释） */
test("设置持久化：修改目标年份并保存", async ({ page }) => {
  await page.goto("/");

  const dialog = await openStudySettings(page);
  await dialog.getByRole("button", { name: "倒计时", exact: true }).click();

  await dialog.getByRole("radio", { name: "高考" }).check({ force: true });

  const targetYearInput = dialog.getByLabel("年份");
  await targetYearInput.fill("2029");

  await dialog.getByRole("button", { name: "保存" }).click();

  const storedYear = await page.evaluate(() => {
    const raw = localStorage.getItem("AppSettings");
    if (!raw) return null;
    try {
      return JSON.parse(raw)?.study?.targetYear ?? null;
    } catch {
      return null;
    }
  });
  expect(storedYear).toBe(2029);

  await page.reload();
  const storedYearAfterReload = await page.evaluate(() => {
    const raw = localStorage.getItem("AppSettings");
    if (!raw) return null;
    try {
      return JSON.parse(raw)?.study?.targetYear ?? null;
    } catch {
      return null;
    }
  });
  expect(storedYearAfterReload).toBe(2029);
});

test("自习显示：进度信息与天气可独立控制并持久化", async ({ page }) => {
  await page.goto("/");

  let dialog = await openStudySettings(page);
  await dialog.getByRole("button", { name: "自习显示" }).click();

  const weatherSwitch = dialog.getByRole("switch", { name: "天气" });
  const removeDayProgress = dialog.getByRole("button", { name: "移出24 小时进度" });
  await expect(removeDayProgress).toBeVisible();
  await expect(weatherSwitch).toBeChecked();
  await removeDayProgress.click();
  await dialog.getByRole("button", { name: "保存" }).click();

  await expect(page.getByRole("progressbar")).toHaveCount(0);
  await expect(page.getByLabel("天气", { exact: true })).toBeVisible();

  await page.reload();
  dialog = await openStudySettings(page);
  await dialog.getByRole("button", { name: "自习显示" }).click();
  await expect(dialog.getByRole("button", { name: "移出24 小时进度" })).toHaveCount(0);
  await expect(dialog.getByRole("switch", { name: "天气" })).toBeChecked();
  await addStudyInfo(page, dialog, "24 小时进度");
  await dialog.getByRole("switch", { name: "天气" }).click();
  await dialog.getByRole("button", { name: "保存" }).click();

  await expect(page.getByRole("progressbar")).toBeVisible();
  await expect(page.getByLabel("天气", { exact: true })).toBeHidden();
});

test("自习显示：进度条目取消不保存并可持久化课时进度", async ({ page }) => {
  await page.goto("/");

  let dialog = await openStudySettings(page);
  await dialog.getByRole("button", { name: "自习显示" }).click();
  await expect(dialog.getByRole("button", { name: "移出24 小时进度" })).toBeVisible();
  await addStudyInfo(page, dialog, "课时/课间进度");
  await dialog.getByRole("button", { name: "移出24 小时进度" }).click();
  await dialog.getByRole("button", { name: "取消" }).click();

  expect(
    await page.evaluate(() => {
      const raw = localStorage.getItem("AppSettings");
      const items = raw ? (JSON.parse(raw)?.study?.infoCarousel?.items ?? []) : [];
      return items
        .filter(
          (item: { source?: string; enabled?: boolean }) =>
            item.source === "progress" && item.enabled
        )
        .map((item: { progressKind?: string }) => item.progressKind);
    })
  ).toEqual(["day"]);

  dialog = await openStudySettings(page);
  await dialog.getByRole("button", { name: "自习显示" }).click();
  await expect(dialog.getByRole("button", { name: "移出24 小时进度" })).toBeVisible();
  await addStudyInfo(page, dialog, "课时/课间进度");
  await dialog.getByRole("button", { name: "移出24 小时进度" }).click();
  await dialog.getByRole("button", { name: "保存" }).click();

  await expect(page.getByRole("progressbar", { name: "课时进度" })).toBeVisible();

  expect(
    await page.evaluate(() => {
      const raw = localStorage.getItem("AppSettings");
      const items = raw ? (JSON.parse(raw)?.study?.infoCarousel?.items ?? []) : [];
      return items
        .filter(
          (item: { source?: string; enabled?: boolean }) =>
            item.source === "progress" && item.enabled
        )
        .map((item: { progressKind?: string }) => item.progressKind);
    })
  ).toEqual(["schedule"]);

  await page.reload();
  dialog = await openStudySettings(page);
  await dialog.getByRole("button", { name: "自习显示" }).click();
  await expect(dialog.getByRole("button", { name: "移出课时/课间进度" })).toBeVisible();
});

test("组件外观：实时预览、取消回滚并在保存后持久化", async ({ page }) => {
  await page.goto("/");
  let dialog = await openStudySettings(page);
  await dialog.getByRole("button", { name: "视觉外观" }).click();
  await dialog.getByRole("button", { name: "时间显示", exact: true }).click();
  const timeViews = dialog.getByRole("radiogroup", { name: "时间显示类型" });
  await timeViews.getByRole("radio", { name: "时钟" }).click();

  const objectTabs = dialog.getByRole("tablist", { name: "时钟调整对象" });
  const preview = dialog.getByLabel("时钟外观预览");
  const previewTime = preview.getByText("12:45:09");
  const previewDate = preview.getByText("2026年7月13日星期一");
  await objectTabs.getByRole("tab", { name: "日期" }).hover();
  await expect(previewDate).toHaveAttribute("data-preview-highlighted", "true");
  await dialog.getByRole("heading", { name: "时钟", level: 3, exact: true }).hover();
  await expect(previewTime).toHaveAttribute("data-preview-highlighted", "true");

  await objectTabs.getByRole("tab", { name: "日期" }).click();
  await expect(dialog.getByLabel("颜色代码")).toHaveValue("#bbbbbb");
  await expect(dialog.getByText("使用整体样式")).toBeVisible();
  await objectTabs.getByRole("tab", { name: "主时间" }).click();

  const colorCode = dialog.getByLabel("颜色代码");
  await colorCode.fill("#ff3366");
  await expect(previewTime).toHaveCSS("color", "rgb(255, 51, 102)");
  await expect(dialog.getByText("已单独调整 1 项")).toBeVisible();

  await dialog.getByRole("button", { name: "取消" }).click();
  expect(
    await page.evaluate(() => {
      const raw = localStorage.getItem("AppSettings");
      return raw ? JSON.parse(raw)?.appearance?.scenes?.clock?.components?.clock : null;
    })
  ).toBeFalsy();

  dialog = await openStudySettings(page);
  await dialog.getByRole("button", { name: "视觉外观" }).click();
  await dialog.getByRole("button", { name: "时间显示", exact: true }).click();
  await dialog
    .getByRole("radiogroup", { name: "时间显示类型" })
    .getByRole("radio", { name: "时钟" })
    .click();
  await dialog.getByLabel("颜色代码").fill("#ff3366");
  await dialog.getByRole("button", { name: "保存" }).click();

  expect(
    await page.evaluate(() => {
      const raw = localStorage.getItem("AppSettings");
      return raw
        ? JSON.parse(raw)?.appearance?.scenes?.clock?.components?.clock?.slots?.time?.color
        : null;
    })
  ).toBe("#ff3366");
});

test("页面背景：可在整体背景和应用预设之间切换", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem(
      "AppSettings",
      JSON.stringify({
        appearance: {
          global: {
            background: { type: "color", color: "#123456", colorAlpha: 1 },
          },
        },
      })
    );
  });
  await page.goto("/");

  let dialog = await openStudySettings(page);
  await dialog.getByRole("button", { name: "视觉外观" }).click();
  await dialog.getByRole("button", { name: "时间显示", exact: true }).click();
  let previewStage = dialog.getByLabel("时钟外观预览").locator('[data-preview-stage="clock"]');
  await expect(previewStage).toHaveCSS("background-color", "rgb(18, 52, 86)");

  await dialog.getByRole("radio", { name: "应用预设" }).check({ force: true });
  await dialog.getByRole("button", { name: "保存" }).click();
  expect(
    await page.evaluate(() => {
      const raw = localStorage.getItem("AppSettings");
      return raw ? JSON.parse(raw)?.appearance?.scenes?.clock?.background?.type : null;
    })
  ).toBe("builtin");

  await page.getByRole("button", { name: "打开设置" }).click();
  dialog = page.getByRole("dialog", { name: "设置" });
  await dialog.getByRole("button", { name: "视觉外观" }).click();
  await dialog.getByRole("button", { name: "时间显示", exact: true }).click();
  previewStage = dialog.getByLabel("时钟外观预览").locator('[data-preview-stage="clock"]');
  await dialog.getByRole("radio", { name: "跟随整体" }).check({ force: true });
  await expect(previewStage).toHaveCSS("background-color", "rgb(18, 52, 86)");
  await dialog.getByRole("button", { name: "保存" }).click();

  expect(
    await page.evaluate(() => {
      const raw = localStorage.getItem("AppSettings");
      return raw ? JSON.parse(raw)?.appearance?.scenes?.clock?.background?.type : null;
    })
  ).toBe("inherit");
});

test("组件外观：多事件倒计时可按实例保存覆盖", async ({ page }) => {
  await page.goto("/");
  let dialog = await openStudySettings(page);
  await dialog.getByRole("button", { name: "倒计时", exact: true }).click();
  await dialog.getByRole("radio", { name: "高考" }).check({ force: true });
  await dialog.getByRole("button", { name: "保存" }).click();

  await page.evaluate(() => {
    const raw = localStorage.getItem("AppSettings");
    if (!raw) return;
    const settings = JSON.parse(raw);
    settings.study.countdownItems.push({
      id: "exam-other",
      kind: "custom",
      name: "期末考试",
      targetDate: "2026-12-31",
      order: 1,
    });
    localStorage.setItem("AppSettings", JSON.stringify(settings));
  });
  await page.reload();

  dialog = await openStudySettings(page);
  await dialog.getByRole("button", { name: "视觉外观" }).click();
  await dialog.getByRole("button", { name: "顶部信息栏", exact: true }).click();
  await dialog
    .getByRole("radiogroup", { name: "顶部信息栏内容" })
    .getByRole("radio", { name: "事件倒计时", exact: true })
    .click();
  await dialog.getByRole("radio", { name: "指定事件" }).check({ force: true });
  await dialog.getByRole("button", { name: "指定事件" }).click();
  await page.getByRole("option", { name: "高考倒计时" }).click();
  await dialog
    .getByRole("tablist", { name: "事件倒计时调整对象" })
    .getByRole("tab", { name: "天数" })
    .click();
  await expect(dialog.getByText("使用所有事件的样式")).toBeVisible();
  await dialog.getByLabel("颜色代码").fill("#33cc88");
  await dialog.getByRole("button", { name: "保存" }).click();

  const storedStyles = await page.evaluate(() => {
    const raw = localStorage.getItem("AppSettings");
    if (!raw) return null;
    const appearance = JSON.parse(raw)?.appearance;
    return {
      selected: appearance?.instances?.studyCountdown?.["gaokao-default"]?.slots?.digit?.color,
      other: appearance?.instances?.studyCountdown?.["exam-other"]?.slots?.digit?.color,
      allEvents: appearance?.scenes?.study?.components?.studyCountdown?.slots?.digit?.color,
    };
  });
  expect(storedStyles).toEqual({
    selected: "#33cc88",
    other: undefined,
    allEvents: undefined,
  });
});

/** 端到端用例：验证设置页一级/二级导航只展示当前任务域（函数级注释） */
test("设置导航：一级分类切换后只显示当前二级分区", async ({ page }) => {
  await page.goto("/");

  const dialog = await openStudySettings(page);

  const viewport = page.viewportSize();
  await page.mouse.click((viewport?.width ?? 1280) - 4, Math.round((viewport?.height ?? 720) / 2));
  await expect(dialog).toBeVisible();

  await expect(dialog.getByRole("button", { name: "启动页面" })).toBeVisible();
  await expect(dialog.getByRole("button", { name: "自习显示" })).toBeVisible();
  await expect(dialog.getByRole("button", { name: "整体样式", exact: true })).toBeHidden();

  await dialog.getByRole("button", { name: "视觉外观" }).click();
  const settingsNavigation = dialog.getByRole("navigation", { name: "设置分组" });
  await expect(
    settingsNavigation.getByRole("button", { name: "整体样式", exact: true })
  ).toBeVisible();
  await expect(
    settingsNavigation.getByRole("button", { name: "时间显示", exact: true })
  ).toBeVisible();
  await expect(
    settingsNavigation.getByRole("button", { name: "自习时间", exact: true })
  ).toHaveCount(0);
  await expect(settingsNavigation.getByRole("button", { name: "语录", exact: true })).toBeVisible();
  await expect(
    settingsNavigation.getByRole("button", { name: "顶部信息栏", exact: true })
  ).toBeVisible();
  await expect(settingsNavigation.getByRole("button", { name: "天气", exact: true })).toHaveCount(
    0
  );
  await expect(
    settingsNavigation.getByRole("button", { name: "事件倒计时", exact: true })
  ).toHaveCount(0);
  await expect(dialog.getByRole("button", { name: "启动页面" })).toBeHidden();

  await dialog.getByRole("button", { name: "环境提醒" }).click();
  await expect(dialog.getByRole("button", { name: "天气提醒" })).toBeVisible();
  await expect(dialog.getByRole("button", { name: "定位刷新" })).toBeVisible();
  await expect(dialog.getByRole("button", { name: "噪音控制" })).toBeVisible();
  await expect(dialog.getByRole("button", { name: "语录渠道" })).toBeHidden();

  await dialog.getByRole("button", { name: "内容语录" }).click();
  await expect(dialog.getByRole("button", { name: "刷新策略" })).toBeVisible();
  await expect(dialog.getByRole("button", { name: "语录渠道" })).toBeVisible();
  await expect(dialog.getByRole("button", { name: "天气提醒" })).toBeHidden();

  await dialog.getByRole("button", { name: "系统数据" }).click();
  await expect(dialog.getByRole("button", { name: "时间校准" })).toBeVisible();
  await expect(dialog.getByRole("button", { name: "设置数据" })).toBeVisible();
  await expect(dialog.getByRole("button", { name: "错误与调试" })).toBeVisible();
  await expect(dialog.getByRole("button", { name: "启动页面" })).toBeHidden();
});

/** 端到端用例：课程表作为设置草稿参与统一保存，取消后重新读取已保存数据。 */
test("课程表：随设置统一保存并在取消时丢弃草稿", async ({ page }) => {
  await page.goto("/");

  const dialog = await openStudySettings(page);
  await dialog.getByRole("button", { name: "课程表" }).click();

  const firstCourseName = dialog.getByLabel("课程名称").first();
  await firstCourseName.fill("晨间数学");
  await dialog.getByRole("button", { name: "保存" }).click();

  const savedName = await page.evaluate(() => {
    const raw = localStorage.getItem("AppSettings");
    if (!raw) return null;
    return JSON.parse(raw)?.study?.schedule?.[0]?.name ?? null;
  });
  expect(savedName).toBe("晨间数学");

  await page.getByRole("button", { name: "打开设置" }).click();
  const secondDialog = page.getByRole("dialog", { name: "设置" });
  await secondDialog.getByRole("button", { name: "课程表" }).click();
  await secondDialog.getByLabel("课程名称").first().fill("未保存课程");
  await secondDialog.getByRole("button", { name: "取消" }).click();
  await expect(secondDialog).toBeHidden();

  await page.getByRole("button", { name: "打开设置" }).click();
  const reopenedDialog = page.getByRole("dialog", { name: "设置" });
  await reopenedDialog.getByRole("button", { name: "课程表" }).click();
  await expect(reopenedDialog.getByLabel("课程名称").first()).toHaveValue("晨间数学");
});

/** 端到端用例：切换“错误与调试-记录方式”时不应在保存前清空持久化记录（函数级注释） */
test("错误与调试：记录方式切换延迟到保存", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem(
      "AppSettings",
      JSON.stringify({
        study: {
          alerts: {
            errorCenterMode: "persist",
            errorPopup: true,
          },
        },
      })
    );
    localStorage.setItem(
      "error-center.records",
      JSON.stringify([
        {
          id: "e2e-1",
          ts: Date.now(),
          lastTs: Date.now(),
          level: "error",
          source: "e2e",
          title: "e2e",
          message: "e2e",
          count: 1,
        },
      ])
    );
  });

  await page.goto("/");

  const dialog = await openStudySettings(page);
  await dialog.getByRole("button", { name: "系统数据" }).click();
  await dialog.getByRole("button", { name: "错误与调试" }).click();

  const beforeSwitch = await page.evaluate(() => localStorage.getItem("error-center.records"));
  expect(beforeSwitch).not.toBeNull();

  const recordModeGroup = dialog.getByRole("radiogroup", { name: "记录方式" });
  await recordModeGroup.locator("label").filter({ hasText: "关闭" }).click();

  const afterSwitchBeforeSave = await page.evaluate(() =>
    localStorage.getItem("error-center.records")
  );
  expect(afterSwitchBeforeSave).not.toBeNull();

  await dialog.getByRole("button", { name: "取消" }).click();
  await expect(dialog).toBeHidden();

  const afterCancel = await page.evaluate(() => localStorage.getItem("error-center.records"));
  expect(afterCancel).not.toBeNull();

  await page.getByRole("button", { name: "打开设置" }).click();
  const dialog2 = page.getByRole("dialog", { name: "设置" });
  await expect(dialog2).toBeVisible();
  await dialog2.getByRole("button", { name: "系统数据" }).click();
  await dialog2.getByRole("button", { name: "错误与调试" }).click();

  const recordModeGroup2 = dialog2.getByRole("radiogroup", { name: "记录方式" });
  await expect(recordModeGroup2.getByRole("radio", { name: "持久化" })).toBeChecked();

  await recordModeGroup2.locator("label").filter({ hasText: "关闭" }).click();
  await dialog2.getByRole("button", { name: "保存" }).click();
  await expect(dialog2).toBeHidden();

  const afterSave = await page.evaluate(() => localStorage.getItem("error-center.records"));
  expect(afterSave).toBeNull();
});

test.describe("移动端设置抽屉", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("外观组件二级菜单可滚动且项目不横向截断", async ({ page }) => {
    await page.goto("/");
    const dialog = await openStudySettings(page);
    await dialog.getByRole("button", { name: "视觉外观" }).click();

    const componentMenu = dialog.getByRole("navigation", { name: "视觉外观子分类" });
    await expect(componentMenu).toBeVisible();
    expect(await componentMenu.getByRole("button").count()).toBe(4);

    const lastItem = componentMenu.getByRole("button", { name: "顶部信息栏" });
    await lastItem.scrollIntoViewIfNeeded();
    await expect(lastItem).toBeInViewport();
    expect(
      await componentMenu.evaluate((element) => element.scrollWidth <= element.clientWidth)
    ).toBe(true);

    await componentMenu.getByRole("button", { name: "时间显示" }).click();
    const timeViews = dialog.getByRole("radiogroup", { name: "时间显示类型" });
    await timeViews.getByRole("radio", { name: "秒表" }).click();
    const objectTabs = dialog.getByRole("tablist", { name: "秒表调整对象" });
    const objectTabLayout = await objectTabs.evaluate((element) => ({
      clientWidth: element.clientWidth,
      scrollWidth: element.scrollWidth,
      labelsFit: Array.from(element.querySelectorAll<HTMLElement>("[role='tab']")).every(
        (tab) => tab.scrollWidth <= tab.clientWidth
      ),
    }));
    expect(objectTabLayout.scrollWidth).toBeGreaterThan(objectTabLayout.clientWidth);
    expect(objectTabLayout.labelsFit).toBe(true);

    const lastObject = objectTabs.getByRole("tab", { name: "里程碑" });
    await lastObject.scrollIntoViewIfNeeded();
    await expect(lastObject).toBeInViewport();
    expect(await objectTabs.evaluate((element) => element.scrollLeft)).toBeGreaterThan(0);
  });

  test("全屏展示纵向紧凑导航并将当前分组滚动入视口", async ({ page }) => {
    await page.goto("/");
    const dialog = await openStudySettings(page);

    await expect
      .poll(async () => {
        const dialogBox = await dialog.boundingBox();
        return Boolean(
          dialogBox && Math.abs(dialogBox.x) < 0.01 && Math.abs(dialogBox.width - 390) < 0.01
        );
      })
      .toBe(true);

    const groupRail = dialog.getByRole("navigation", { name: "设置紧凑导航" });
    await groupRail.getByRole("button", { name: "系统数据" }).click();
    await dialog.getByRole("button", { name: "错误与调试" }).click();
    await expect(dialog.getByRole("heading", { name: "错误与调试", level: 2 })).toBeVisible();

    await expect
      .poll(() =>
        groupRail.evaluate((element) => {
          const current = element.querySelector<HTMLElement>("[aria-current='page']");
          if (!current) return false;
          const railRect = element.getBoundingClientRect();
          const currentRect = current.getBoundingClientRect();
          return currentRect.left >= railRect.left && currentRect.right <= railRect.right;
        })
      )
      .toBe(true);

    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)
    ).toBe(true);
  });
});
