import { expect, test } from "@playwright/test";

import { CURRENT_SETTINGS_VERSION } from "../../src/constants/settings";

import { CURRENT_APP_VERSION, showHud } from "./e2eUtils";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(
    ({ appVersion, settingsVersion }) => {
      window.localStorage.setItem("immersive-clock:has-seen-tour", "true");
      if (window.localStorage.getItem("AppSettings")) return;
      window.localStorage.setItem(
        "AppSettings",
        JSON.stringify({
          version: settingsVersion,
          general: {
            announcement: {
              hideUntil: Date.now() + 7 * 24 * 60 * 60 * 1000,
              version: appVersion,
            },
            oledProtection: {
              enabled: true,
              idleMinutes: 1,
              brightnessPercent: 40,
            },
          },
        })
      );
    },
    { appVersion: CURRENT_APP_VERSION, settingsVersion: CURRENT_SETTINGS_VERSION }
  );
});

test("闲置屏保覆盖主界面、适配视口并在唤醒时拦截点击", async ({ page }) => {
  await page.clock.install({ time: new Date("2026-01-01T00:00:00.000Z") });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await showHud(page);
  await page.getByRole("button", { name: "打开设置" }).click();
  const settingsDialog = page.getByRole("dialog", { name: "设置" });
  await expect(settingsDialog).toBeVisible();
  await settingsDialog.getByRole("button", { name: /^视觉外观/ }).click();
  await settingsDialog.getByRole("button", { name: "时间显示", exact: true }).click();
  const centralTimeSize = settingsDialog.getByRole("slider", { name: "中央时间大小" });
  await centralTimeSize.focus();
  await centralTimeSize.press("End");
  await expect(centralTimeSize).toHaveValue("1.5");
  await settingsDialog.getByRole("button", { name: "保存", exact: true }).click();
  await expect(settingsDialog).toHaveCount(0);
  await expect
    .poll(() =>
      page.evaluate(() => {
        const settings = JSON.parse(localStorage.getItem("AppSettings") ?? "{}");
        return settings.general.timeDisplay.centralTimeScale;
      })
    )
    .toBe(1.5);

  const main = page.getByLabel("时钟应用主界面");
  const mainTime = page.locator('#clock-panel [aria-label^="当前时间："]');
  await expect(main).toBeVisible();
  const mainFontSize = await mainTime.evaluate((element) => getComputedStyle(element).fontSize);
  await page.clock.fastForward(60_000);

  const screenSaver = page.getByTestId("oled-screen-saver");
  const timeReadout = screenSaver.getByRole("region", { name: /时钟屏保时间/ });
  const screenSaverTime = screenSaver.getByTestId("oled-screen-saver-time");
  await expect(timeReadout).toBeVisible();
  await expect(screenSaverTime).toHaveCSS("font-size", mainFontSize);
  await expect(main).toHaveAttribute("inert", "");
  await expect(main).toHaveAttribute("aria-hidden", "true");

  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 390, height: 844 },
    { width: 320, height: 568 },
    { width: 844, height: 390 },
  ]) {
    await page.setViewportSize(viewport);
    const responsiveMainFontSize = await mainTime.evaluate(
      (element) => getComputedStyle(element).fontSize
    );
    await expect(screenSaverTime).toHaveCSS("font-size", responsiveMainFontSize);
    const bounds = await timeReadout.boundingBox();
    expect(bounds).not.toBeNull();
    expect(bounds!.x).toBeGreaterThanOrEqual(20);
    expect(bounds!.y).toBeGreaterThanOrEqual(20);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(viewport.width - 20);
    expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(viewport.height - 20);
  }

  await page.mouse.click(20, 20);
  await expect(screenSaver).toHaveCount(0);
  await expect(main).not.toHaveAttribute("inert", "");
  await expect(page.getByLabel("HUD 控制面板")).toHaveAttribute("aria-hidden", "true");
});

test("考试模式不会进入 OLED 屏保", async ({ page }) => {
  await page.clock.install({ time: new Date("2026-01-01T00:00:00.000Z") });
  await page.goto("/exam");
  await page.clock.fastForward(60_000);

  await expect(page.getByTestId("oled-screen-saver")).toHaveCount(0);
  await expect(page.getByLabel("时钟应用主界面")).not.toHaveAttribute("inert", "");
});

test("屏保使用四种日常模式当前显示的时间和状态", async ({ page }) => {
  await page.clock.install({ time: new Date("2026-01-01T00:00:00.000Z") });

  const modes = [
    { path: "/clock", label: /时钟屏保时间/, panel: "#clock-panel" },
    {
      path: "/countdown",
      label: /倒计时屏保时间：00:00:00/,
      panel: "#countdown-panel",
      status: "未开始",
    },
    {
      path: "/stopwatch",
      label: /秒表屏保时间：00:00:00/,
      panel: "#stopwatch-panel",
      status: "未开始",
    },
    { path: "/study", label: /自习时间屏保时间/, panel: "#study-panel" },
  ];

  for (const mode of modes) {
    await page.goto(mode.path);
    await expect(page.locator(mode.panel)).toBeVisible();
    await page.clock.fastForward(60_000);

    const timeReadout = page.getByRole("region", { name: mode.label });
    await expect(timeReadout).toBeVisible();
    if (mode.status) await expect(timeReadout).toContainText(mode.status);

    if (mode.path === "/clock" || mode.path === "/study") {
      const prefix = "当前时间：";
      const currentTimeLabel = await page
        .locator(`${mode.panel} [aria-label^="${prefix}"]`)
        .getAttribute("aria-label");
      expect(await timeReadout.getAttribute("aria-label")).toContain(
        currentTimeLabel?.replace(prefix, "") ?? ""
      );
    }

    await page.keyboard.press("Escape");
    await expect(page.getByTestId("oled-screen-saver")).toHaveCount(0);
  }
});

test("OLED 设置可取消、保存并在刷新后恢复", async ({ page }) => {
  await page.goto("/");

  const openOverallAppearance = async () => {
    await showHud(page);
    await page.getByRole("button", { name: "打开设置" }).click();
    const dialog = page.getByRole("dialog", { name: "设置" });
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: /^视觉外观/ }).click();
    await dialog.getByRole("button", { name: "整体样式", exact: true }).click();
    return dialog;
  };

  let dialog = await openOverallAppearance();
  const enabledSwitch = dialog.getByRole("switch", { name: "启用 OLED 防烧屏" });
  await expect(enabledSwitch).toHaveAttribute("aria-checked", "true");
  await enabledSwitch.click();
  await dialog.getByRole("combobox", { name: "进入屏保前的闲置时间" }).selectOption("3");
  const firstBrightness = dialog.getByRole("slider", { name: "屏保亮度" });
  await firstBrightness.focus();
  await firstBrightness.press("ArrowRight");
  await firstBrightness.press("ArrowRight");
  await firstBrightness.press("ArrowRight");
  await dialog.getByRole("button", { name: "取消", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect
    .poll(() =>
      page.evaluate(
        () => JSON.parse(localStorage.getItem("AppSettings") ?? "{}").general.oledProtection
      )
    )
    .toEqual({ enabled: true, idleMinutes: 1, brightnessPercent: 40 });

  dialog = await openOverallAppearance();
  const reopenedSwitch = dialog.getByRole("switch", { name: "启用 OLED 防烧屏" });
  await expect(reopenedSwitch).toHaveAttribute("aria-checked", "true");
  await reopenedSwitch.click();
  await dialog.getByRole("combobox", { name: "进入屏保前的闲置时间" }).selectOption("3");
  const brightness = dialog.getByRole("slider", { name: "屏保亮度" });
  await brightness.focus();
  await brightness.press("ArrowRight");
  await brightness.press("ArrowRight");
  await brightness.press("ArrowRight");
  await dialog.getByRole("button", { name: "保存", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect
    .poll(() =>
      page.evaluate(
        () => JSON.parse(localStorage.getItem("AppSettings") ?? "{}").general.oledProtection
      )
    )
    .toEqual({ enabled: false, idleMinutes: 3, brightnessPercent: 55 });

  await page.reload();
  dialog = await openOverallAppearance();
  await expect(dialog.getByRole("switch", { name: "启用 OLED 防烧屏" })).toHaveAttribute(
    "aria-checked",
    "false"
  );
  await expect(dialog.getByRole("combobox", { name: "进入屏保前的闲置时间" })).toHaveValue("3");
  await expect(dialog.getByRole("slider", { name: "屏保亮度" })).toHaveValue("55");
});
