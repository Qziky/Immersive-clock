import { expect, test } from "@playwright/test";

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
  await expect(dialog.getByRole("button", { name: "启动页面" })).toBeVisible();

  return dialog;
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

/** 端到端用例：验证设置页一级/二级导航只展示当前任务域（函数级注释） */
test("设置导航：一级分类切换后只显示当前二级分区", async ({ page }) => {
  await page.goto("/");

  const dialog = await openStudySettings(page);

  const viewport = page.viewportSize();
  await page.mouse.click((viewport?.width ?? 1280) - 4, Math.round((viewport?.height ?? 720) / 2));
  await expect(dialog).toBeVisible();

  await expect(dialog.getByRole("button", { name: "启动页面" })).toBeVisible();
  await expect(dialog.getByRole("button", { name: "自习显示" })).toBeVisible();
  await expect(dialog.getByRole("button", { name: "时间颜色" })).toBeHidden();

  await dialog.getByRole("button", { name: "视觉外观" }).click();
  await expect(dialog.getByRole("button", { name: "时间颜色" })).toBeVisible();
  await expect(dialog.getByRole("button", { name: "字体", exact: true })).toBeVisible();
  await expect(dialog.getByRole("button", { name: "背景", exact: true })).toBeVisible();
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

  test("全屏展示两级横向导航并将当前分组滚动入视口", async ({ page }) => {
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

    const groupRail = dialog.getByRole("navigation", { name: "设置一级分类" });
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
