import { expect, test } from "@playwright/test";

import { CURRENT_APP_VERSION, showHud } from "./e2eUtils";

test.beforeEach(async ({ page }) => {
  await page.addInitScript((appVersion) => {
    window.localStorage.setItem("immersive-clock:has-seen-tour", "true");
    const settings = JSON.parse(window.localStorage.getItem("AppSettings") ?? "{}");
    window.localStorage.setItem(
      "AppSettings",
      JSON.stringify({
        ...settings,
        general: {
          ...settings.general,
          announcement: {
            hideUntil: Date.now() + 7 * 24 * 60 * 60 * 1000,
            version: appVersion,
          },
        },
      })
    );
  }, CURRENT_APP_VERSION);
});

/** 端到端用例：验证倒计时可设置、开始、暂停与重置（函数级注释） */
test("倒计时：设置 10 分钟并开始/暂停/重置", async ({ page }) => {
  await page.goto("/");

  await showHud(page);
  const tablist = page.getByRole("tablist", { name: "选择时钟模式" });
  await tablist.getByRole("tab", { name: /倒计时/ }).click();

  const toolbar = page.getByRole("toolbar", { name: "时钟控制" });
  await toolbar.getByRole("button", { name: "设置倒计时" }).click();

  const dialog = page.getByRole("dialog", { name: "设置倒计时" });
  await expect(dialog).toBeVisible();

  await expect(dialog.getByRole("radio", { name: "1小时15分" })).toHaveCount(0);
  await expect(dialog.getByRole("radio", { name: "2小时" })).toHaveCount(0);

  await dialog.getByRole("radio", { name: "10分钟" }).check();
  await dialog.getByRole("button", { name: "确认" }).click();

  await showHud(page);

  const timeArea = page.locator("#countdown-panel").getByRole("button", {
    name: "单击设置倒计时时间",
  });
  await expect(timeArea).toContainText("10:00");

  await toolbar.getByRole("button", { name: "开始倒计时" }).click();
  await expect(toolbar.getByRole("button", { name: "暂停倒计时" })).toBeVisible();

  await expect(timeArea).not.toContainText("10:00", { timeout: 8000 });

  await toolbar.getByRole("button", { name: "暂停倒计时" }).click();
  await expect(toolbar.getByRole("button", { name: "开始倒计时" })).toBeVisible();

  await toolbar.getByRole("button", { name: "重置倒计时" }).click();
  await expect(timeArea).toContainText("10:00");

  await timeArea.click();
  await expect(dialog).toBeVisible();
});

test("倒计时：320×568 下末项可滚动到固定底栏上方", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await page.addInitScript(() => {
    const settings = JSON.parse(window.localStorage.getItem("AppSettings") ?? "{}");
    settings.countdown = { ...(settings.countdown ?? {}), customQuickPresetSeconds: 660 };
    window.localStorage.setItem("AppSettings", JSON.stringify(settings));
  });
  await page.goto("/");

  await showHud(page);
  const tablist = page.getByRole("tablist", { name: "选择时钟模式" });
  await tablist.getByRole("tab", { name: /倒计时/ }).click();
  await page
    .getByRole("toolbar", { name: "时钟控制" })
    .getByRole("button", { name: "设置倒计时" })
    .click();

  const dialog = page.getByRole("dialog", { name: "设置倒计时" });
  const lastPreset = dialog.getByRole("radio", { name: "自定义（11分钟）" });
  await lastPreset.scrollIntoViewIfNeeded();

  const visualLabel = lastPreset.locator("xpath=..").locator("span").last();
  await expect(visualLabel).toHaveText("自定义");
  await expect
    .poll(() => visualLabel.evaluate((element) => element.scrollWidth === element.clientWidth))
    .toBe(true);

  const [presetBox, footerBox] = await Promise.all([
    lastPreset.locator("..").boundingBox(),
    dialog.locator("footer").boundingBox(),
  ]);

  expect(presetBox).not.toBeNull();
  expect(footerBox).not.toBeNull();
  expect(presetBox!.y + presetBox!.height).toBeLessThanOrEqual(footerBox!.y);
});

test("倒计时：保存自定义 45 分钟快速设置并在重新打开后复用", async ({ page }) => {
  await page.goto("/");

  await showHud(page);
  const tablist = page.getByRole("tablist", { name: "选择时钟模式" });
  await tablist.getByRole("tab", { name: /倒计时/ }).click();

  const toolbar = page.getByRole("toolbar", { name: "时钟控制" });
  await toolbar.getByRole("button", { name: "设置倒计时" }).click();

  const dialog = page.getByRole("dialog", { name: "设置倒计时" });
  await dialog.getByRole("radio", { name: "自定义" }).check();

  const minuteGroup = dialog.getByRole("group", { name: "分钟设置" });
  for (let index = 0; index < 35; index += 1) {
    await minuteGroup.getByRole("button", { name: "增加分钟" }).click();
  }
  await dialog.getByRole("button", { name: "确认" }).click();

  await showHud(page);
  const timeArea = page.locator("#countdown-panel").getByRole("button", {
    name: "单击设置倒计时时间",
  });
  await expect(timeArea).toContainText("45:00");
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          JSON.parse(localStorage.getItem("AppSettings") ?? "{}").countdown
            ?.customQuickPresetSeconds
      )
    )
    .toBe(2700);

  await timeArea.click();
  const reopenedDialog = page.getByRole("dialog", { name: "设置倒计时" });
  const customPreset = reopenedDialog.getByRole("radio", { name: "自定义（45分钟）" });
  await expect(customPreset).toBeVisible();
  await customPreset.check();
  await reopenedDialog.getByRole("button", { name: "确认" }).click();
  await expect(timeArea).toContainText("45:00");
});

test("常用：直接输入、刷新复用和运行/暂停替换保护", async ({ page }) => {
  await page.goto("/countdown");
  const time = page.getByRole("button", { name: /单击设置倒计时时间/ });
  const editor = page.getByRole("dialog", { name: "设置倒计时" });
  const button = (name: string) => editor.getByRole("button", { name, exact: true });
  const field = (name: string) => editor.getByRole("textbox", { name });
  const hud = page.getByRole("toolbar", { name: "时钟控制" });
  const showControls = () =>
    page.getByRole("main", { name: "时钟应用主界面" }).click({ position: { x: 20, y: 20 } });

  await time.click();
  await field("小时").fill("2");
  await field("分钟").fill("30");
  await button("加入常用").click();
  await field("小时").fill("3");
  await field("分钟").fill("0");
  await button("加入常用").click();
  await field("小时").fill("0");
  await field("分钟").fill("45");
  await button("确认").click();
  await expect(time).toHaveText("45:00");

  await page.reload();
  await time.click();
  await expect(button("2小时30分")).toBeVisible();
  await expect(editor.getByRole("radio", { name: "自定义（45分钟）" })).toBeVisible();
  await button("3小时").click();
  await expect(editor).toBeHidden();
  await expect(time).toHaveText("03:00:00");
  await showControls();
  await hud.getByRole("button", { name: "开始倒计时" }).click();
  await expect(time).not.toHaveText("03:00:00");
  await time.click();
  await button("2小时30分").click();
  await expect(field("小时")).toHaveValue("02");
  // Page-level timer shortcuts must not act on the live timer while editing.
  await field("分钟").focus();
  await field("分钟").press("Space");
  await field("分钟").press("Enter");
  await button("取消").click();
  await showControls();
  await hud.getByRole("button", { name: "暂停倒计时" }).click();
  await expect(time).toHaveText(/^02:59:/);
  const pausedTime = await time.textContent();

  await time.click();
  await button("2小时30分").click();
  await button("替换当前倒计时").click();
  const confirmation = page.getByRole("dialog", { name: "替换当前倒计时？" });
  await confirmation.getByRole("button", { name: "保留当前倒计时" }).click();
  await button("取消").click();
  await expect(time).toHaveText(pausedTime!);

  await time.click();
  await button("2小时30分").click();
  await button("替换当前倒计时").click();
  await confirmation.getByRole("button", { name: "确认替换" }).click();
  await expect(time).toHaveText("02:30:00");
  await showControls();
  await expect(hud.getByRole("button", { name: "开始倒计时" })).toBeVisible();
});
