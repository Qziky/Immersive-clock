import { readFileSync } from "node:fs";

import { expect, test, type Locator, type Page } from "@playwright/test";

const packageJson = JSON.parse(
  readFileSync(new URL("../../package.json", import.meta.url), "utf-8")
) as { version: string };

test.describe.configure({ mode: "serial" });
test.use({ viewport: { width: 1440, height: 900 } });

test.beforeEach(async ({ page }) => {
  await page.addInitScript((appVersion) => {
    window.localStorage.removeItem("immersive-clock:has-seen-tour");
    window.localStorage.setItem(
      "AppSettings",
      JSON.stringify({
        general: {
          announcement: {
            hideUntil: Date.now() + 7 * 24 * 60 * 60 * 1000,
            version: appVersion,
          },
        },
      })
    );
  }, packageJson.version);
});

async function expectTourStep(page: Page, title: string, progress: string) {
  const dialog = page.getByRole("dialog", { name: title });
  await expect(dialog).toBeVisible({ timeout: 10_000 });
  await expect(dialog.locator(".driver-popover-progress-text")).toHaveText(progress);
  return dialog;
}

async function getReadyNextButton(dialog: Locator) {
  const nextButton = dialog.getByRole("button", { name: "下一步", exact: true });
  await expect(nextButton).toBeEnabled();
  return nextButton;
}

async function clickReadyNext(page: Page, title: string, progress: string) {
  const dialog = await expectTourStep(page, title, progress);
  await (await getReadyNextButton(dialog)).click();
}

async function clickTwiceSynchronously(button: Locator) {
  await button.evaluate((element) => {
    const htmlButton = element as HTMLButtonElement;
    htmlButton.click();
    htmlButton.click();
  });
}

test("新手指引快速双击不会重启、连跳或丢失目标元素", async ({ page }) => {
  await page.goto("/");

  await clickReadyNext(page, "欢迎使用 Immersive Clock", "1 of 15");
  await clickReadyNext(page, "全屏模式", "2 of 15");
  await clickReadyNext(page, "切换模式", "3 of 15");

  const studyEntryDialog = await expectTourStep(page, "进入自习模式", "4 of 15");
  const studyNextButton = await getReadyNextButton(studyEntryDialog);
  await clickTwiceSynchronously(studyNextButton);
  await expect(studyEntryDialog.getByRole("button", { name: "处理中…" })).toBeDisabled();

  await expect(page).toHaveURL(/\/study$/);
  const studyDialog = await expectTourStep(page, "自习模式", "5 of 15");
  await expect(page.locator('[data-tour="clock-area"]')).toHaveClass(/driver-active-element/);

  await page.waitForTimeout(1200);
  await expect(studyDialog).toBeVisible();
  await expect(page.getByRole("dialog", { name: "欢迎使用 Immersive Clock" })).toHaveCount(0);

  await (await getReadyNextButton(studyDialog)).click();
  const settingsEntryDialog = await expectTourStep(page, "个性化设置", "6 of 15");
  const settingsNextButton = await getReadyNextButton(settingsEntryDialog);
  await clickTwiceSynchronously(settingsNextButton);

  const settingsPanelDialog = await expectTourStep(page, "设置面板", "7 of 15");
  await expect(page.locator("#settings-panel-container")).toHaveClass(/driver-active-element/);
  await expect(page.locator("#driver-dummy-element.driver-active-element")).toHaveCount(0);

  await (await getReadyNextButton(settingsPanelDialog)).click();
  const monitoringDialog = await expectTourStep(page, "监测设置", "8 of 15");
  await expect(
    page.locator('[data-settings-group="environment"].driver-active-element')
  ).toBeVisible();

  const monitoringNextButton = await getReadyNextButton(monitoringDialog);
  await clickTwiceSynchronously(monitoringNextButton);
  await expect(monitoringDialog.getByRole("button", { name: "处理中…" })).toBeDisabled();

  await expectTourStep(page, "打开校准设置", "9 of 15");
  await expect(page.locator("#noise-settings-tabs-tab-calibration")).toHaveClass(
    /driver-active-element/
  );
  await expect(page.locator("#driver-dummy-element.driver-active-element")).toHaveCount(0);
  await expect(page.getByText("操作未完成，请稍后重试", { exact: true })).toHaveCount(0);
});
