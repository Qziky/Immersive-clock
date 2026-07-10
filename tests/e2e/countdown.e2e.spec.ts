import { expect, test } from "@playwright/test";
import { showHud } from "./e2eUtils";

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

  await dialog.getByRole("button", { name: "10分钟" }).click();
  await dialog.getByRole("button", { name: "确认" }).click();

  await showHud(page);

  const timeArea = page.locator("#countdown-panel").getByRole("button", {
    name: "双击或双触设置倒计时时间",
  });
  await expect(timeArea).toContainText("10:00");

  await toolbar.getByRole("button", { name: "开始倒计时" }).click();
  await expect(toolbar.getByRole("button", { name: "暂停倒计时" })).toBeVisible();

  await expect(timeArea).not.toContainText("10:00", { timeout: 8000 });

  await toolbar.getByRole("button", { name: "暂停倒计时" }).click();
  await expect(toolbar.getByRole("button", { name: "开始倒计时" })).toBeVisible();

  await toolbar.getByRole("button", { name: "重置倒计时" }).click();
  await expect(timeArea).toContainText("10:00");
});

test("倒计时：320×568 下末项可滚动到固定底栏上方", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto("/");

  await showHud(page);
  const tablist = page.getByRole("tablist", { name: "选择时钟模式" });
  await tablist.getByRole("tab", { name: /倒计时/ }).click();
  await page
    .getByRole("toolbar", { name: "时钟控制" })
    .getByRole("button", { name: "设置倒计时" })
    .click();

  const dialog = page.getByRole("dialog", { name: "设置倒计时" });
  const lastPreset = dialog.getByRole("button", { name: "2小时" });
  await lastPreset.scrollIntoViewIfNeeded();

  const geometry = await dialog.evaluate((element) => {
    const preset = Array.from(element.querySelectorAll("button")).find(
      (button) => button.textContent?.trim() === "2小时"
    );
    const footer = element.querySelector("footer");
    if (!preset || !footer) return null;
    return {
      presetBottom: preset.getBoundingClientRect().bottom,
      footerTop: footer.getBoundingClientRect().top,
    };
  });

  expect(geometry).not.toBeNull();
  expect(geometry!.presetBottom).toBeLessThanOrEqual(geometry!.footerTop);
});
