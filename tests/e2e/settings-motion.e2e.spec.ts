import { expect, test, type Locator, type Page } from "@playwright/test";

import { showHud } from "./e2eUtils";

async function openSettings(page: Page) {
  await showHud(page);
  await page.getByRole("button", { name: "打开设置" }).click();

  const dialog = page.getByRole("dialog", { name: "设置" });
  await expect(dialog).toBeVisible();
  return dialog;
}

async function readAnimation(locator: Locator) {
  return locator.evaluate((element) => {
    const computed = getComputedStyle(element);
    const animation = element.getAnimations()[0];
    const keyframes = (animation?.effect as KeyframeEffect | null)?.getKeyframes() ?? [];
    return {
      name: computed.animationName,
      firstTransform: String(keyframes[0]?.transform ?? ""),
    };
  });
}

async function readAnimationDelay(locator: Locator) {
  return locator.evaluate((element) => {
    const delay = getComputedStyle(element).animationDelay.trim();
    return delay.endsWith("ms") ? Number.parseFloat(delay) : Number.parseFloat(delay) * 1000;
  });
}

test.describe("设置动效", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("桌面抽屉从屏幕左侧进入并完整退出", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.goto("/");

    const dialog = await openSettings(page);
    const enterAnimation = await readAnimation(dialog);
    expect(enterAnimation.name).toContain("uiDrawerIn");
    expect(enterAnimation.firstTransform).toContain("-100%");

    await expect
      .poll(async () => {
        const box = await dialog.boundingBox();
        return box ? Math.abs(box.x) : Number.POSITIVE_INFINITY;
      })
      .toBeLessThan(0.5);

    await dialog.getByRole("button", { name: "取消" }).click();
    const exitingDialog = page.locator('[role="dialog"][data-ui-presence="exiting"]');
    await expect(exitingDialog).toHaveAttribute("aria-hidden", "true");
    expect((await readAnimation(exitingDialog)).name).toContain("uiDrawerOut");
    await expect(dialog).toHaveCount(0);
  });

  test("分区与条件字段使用轻量进入动画且保留输入状态", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.goto("/");

    const dialog = await openSettings(page);
    await dialog.getByRole("button", { name: "视觉外观" }).click();
    await dialog.getByRole("button", { name: "语录", exact: true }).click();
    await dialog.getByRole("button", { name: "整体样式", exact: true }).click();

    const paneTitle = dialog.getByRole("heading", { name: "整体样式", level: 2 });
    await expect(paneTitle).toBeVisible();
    const animatedHeader = paneTitle.locator("..");
    expect(
      await animatedHeader.evaluate((element) => getComputedStyle(element).animationName)
    ).toContain("settingsReveal");

    const backgroundSection = dialog
      .getByRole("heading", { name: "整体背景" })
      .locator("xpath=ancestor::section[1]");
    const animatedSection = backgroundSection;
    const firstSetting = dialog
      .getByText("背景类型", { exact: true })
      .first()
      .locator("xpath=ancestor::*[@data-ui-motion-item][1]");
    await expect(backgroundSection).toBeVisible();
    await expect(firstSetting).toBeVisible();

    const headerDelay = await readAnimationDelay(animatedHeader);
    const sectionDelay = await readAnimationDelay(animatedSection);
    const itemDelay = await readAnimationDelay(firstSetting);
    expect(headerDelay).toBeLessThan(sectionDelay);
    expect(sectionDelay).toBeLessThan(itemDelay);

    await dialog.getByRole("radio", { name: "纯色", exact: true }).check({ force: true });
    const colorCode = dialog.getByLabel("背景颜色");
    await expect(colorCode).toBeVisible();
    await colorCode.fill("#123456");
    await expect(colorCode).toHaveValue("#123456");

    const colorSetting = colorCode.locator("xpath=ancestor::*[@data-ui-motion-item][1]");
    await expect(colorSetting).toBeVisible();
    expect(
      await colorSetting.evaluate((element) => getComputedStyle(element).animationName)
    ).toContain("settingsItemReveal");
  });

  test("秒表预览停用组件动画并正确呈现对象与状态", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.goto("/");

    const dialog = await openSettings(page);
    await dialog.getByRole("button", { name: "视觉外观" }).click();
    await dialog.getByRole("button", { name: "时间显示", exact: true }).click();
    await dialog
      .getByRole("radiogroup", { name: "时间显示类型" })
      .getByRole("radio", { name: "秒表", exact: true })
      .check({ force: true });

    const preview = dialog.getByLabel("秒表外观预览");
    const previewCanvas = preview.locator(":scope > div");
    const status = preview.getByText("已暂停", { exact: true });
    const milestone = preview.getByText("已超过1小时！", { exact: true });
    await expect(previewCanvas).toHaveAttribute("data-preview-frame-highlighted", "true");
    await expect(
      dialog
        .getByRole("tablist", { name: "秒表调整对象" })
        .getByRole("tab", { name: "暂停提示", exact: true })
    ).toBeVisible();
    await expect(status).toHaveCSS("animation-name", "none");
    await expect(status).toHaveCSS("opacity", "0.8");
    await expect(milestone).toHaveCSS("animation-name", "none");
    await expect(milestone).toHaveCSS("opacity", "1");

    const stateTabs = dialog.getByRole("tablist", { name: "秒表状态样式" });
    await stateTabs.getByRole("tab", { name: "运行状态", exact: true }).click();
    await expect(preview.getByText("已暂停", { exact: true })).toHaveCount(0);
    await stateTabs.getByRole("tab", { name: "暂停状态", exact: true }).click();
    await expect(preview.getByText("已暂停", { exact: true })).toHaveCSS("opacity", "0.8");
  });

  test("减少动效模式下立即稳定并即时卸载", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/");

    const dialog = await openSettings(page);
    await expect(dialog).toHaveAttribute("data-ui-motion", "none");
    expect(
      await dialog.evaluate((element) =>
        [element, ...element.querySelectorAll("*")].reduce(
          (count, current) => count + current.getAnimations().length,
          0
        )
      )
    ).toBe(0);

    await dialog.getByRole("button", { name: "取消" }).click();
    await expect(dialog).toHaveCount(0);
  });
});

test.describe("移动端设置动效", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("紧凑子菜单与遮罩可逆退出且不产生横向溢出", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.goto("/");

    const dialog = await openSettings(page);
    const groupRail = dialog.getByRole("navigation", { name: "设置紧凑导航" });
    await groupRail.getByRole("button", { name: "视觉外观" }).click();

    const submenu = dialog.locator("#settings-compact-submenu");
    await expect(submenu).toBeVisible();
    expect((await readAnimation(submenu)).name).toContain("settingsCompactMenuIn");

    const submenuScrim = dialog.getByRole("button", { name: "关闭设置子菜单" });
    const scrimBox = await submenuScrim.boundingBox();
    expect(scrimBox).not.toBeNull();
    await submenuScrim.click({
      position: { x: (scrimBox?.width ?? 16) - 8, y: 8 },
    });
    await expect(submenu).toHaveAttribute("data-ui-presence", "exiting");
    await expect(submenu).toHaveAttribute("aria-hidden", "true");
    await expect(submenu).toHaveAttribute("inert", "");
    await expect(submenu).toHaveCount(0);

    const appearanceTrigger = groupRail.getByRole("button", { name: "视觉外观" });
    await appearanceTrigger.click();
    await dialog
      .getByRole("navigation", { name: "视觉外观子分类" })
      .getByRole("button", { name: "整体样式" })
      .click();
    await expect(dialog.getByRole("heading", { name: "整体样式", level: 2 })).toBeVisible();
    await expect(appearanceTrigger).toBeFocused();

    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)
    ).toBe(true);
  });
});
