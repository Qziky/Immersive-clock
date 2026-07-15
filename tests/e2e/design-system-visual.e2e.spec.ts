import { expect, test, type Locator, type Page } from "@playwright/test";

const FIXED_TIME = new Date("2026-06-01T08:30:00+08:00");
const VIEWPORTS = [
  { width: 1440, height: 900 },
  { width: 390, height: 844 },
  { width: 320, height: 568 },
] as const;
const CATALOG_SECTIONS = [
  "foundation",
  "actions",
  "forms",
  "feedback",
  "navigation",
  "compositions",
] as const;
const SCREENSHOT_OPTIONS = {
  animations: "disabled" as const,
  caret: "hide" as const,
  maxDiffPixelRatio: 0.01,
};

test.beforeEach(({ browserName }, testInfo) => {
  test.skip(
    testInfo.project.name !== "msedge" || browserName !== "chromium",
    "设计系统视觉基线仅维护系统 Edge/Windows 版本"
  );
});

async function prepareDesignSystemPage(page: Page, viewport: (typeof VIEWPORTS)[number]) {
  await page.setViewportSize(viewport);
  await page.clock.setFixedTime(FIXED_TIME);
  await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
  await page.goto("/design-system");
  await page.addStyleTag({
    content: `
      *, *::before, *::after {
        animation: none !important;
        caret-color: transparent !important;
        transition: none !important;
      }
    `,
  });
  await page.evaluate(() => document.fonts.ready);
  await expect(page.locator("main[data-ui-root]")).toBeVisible();
  await expect(page.getByRole("heading", { name: "公共组件总览" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true
  );
}

async function expandCatalogForSectionScreenshots(page: Page) {
  await page.addStyleTag({
    content: `
      html,
      body,
      #root,
      main[data-ui-root] {
        height: auto !important;
        min-height: 100vh !important;
        overflow: visible !important;
      }

      main[data-ui-root] > [aria-label="组件示例"] {
        overflow: visible !important;
      }
    `,
  });
}

async function centerInViewport(locator: Locator) {
  await locator.evaluate((element) =>
    element.scrollIntoView({ block: "center", inline: "center" })
  );
  await expect(locator).toBeVisible();
}

async function expectInsideViewport(locator: Locator, page: Page) {
  await expect(locator).toBeVisible();
  const bounds = await locator.boundingBox();
  const viewport = page.viewportSize();

  expect(bounds).not.toBeNull();
  expect(viewport).not.toBeNull();
  expect(bounds?.x ?? -1).toBeGreaterThanOrEqual(0);
  expect(bounds?.y ?? -1).toBeGreaterThanOrEqual(0);
  expect((bounds?.x ?? 0) + (bounds?.width ?? 0)).toBeLessThanOrEqual(viewport?.width ?? 0);
  expect((bounds?.y ?? 0) + (bounds?.height ?? 0)).toBeLessThanOrEqual(viewport?.height ?? 0);
}

async function expectOverlayScreenshot(
  locator: Locator,
  page: Page,
  name: string,
  viewport: (typeof VIEWPORTS)[number]
) {
  await expectInsideViewport(locator, page);
  await expect(locator).toHaveScreenshot(
    `design-system-${name}-${viewport.width}x${viewport.height}.png`,
    SCREENSHOT_OPTIONS
  );
}

async function expectSectionScreenshot(
  section: Locator,
  page: Page,
  sectionId: (typeof CATALOG_SECTIONS)[number],
  viewport: (typeof VIEWPORTS)[number]
) {
  await expect(section).toBeVisible();
  const sectionHeight = await section.evaluate((element) =>
    Math.ceil(element.getBoundingClientRect().height)
  );
  await page.setViewportSize({
    width: viewport.width,
    height: Math.max(viewport.height, sectionHeight + 32),
  });
  await section.evaluate((element) => element.scrollIntoView({ block: "start", inline: "center" }));
  await expect(section).toHaveScreenshot(
    `design-system-section-${sectionId}-${viewport.width}x${viewport.height}.png`,
    SCREENSHOT_OPTIONS
  );
  await page.setViewportSize(viewport);
}

for (const viewport of VIEWPORTS) {
  test(`设计系统分区视觉快照 ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await prepareDesignSystemPage(page, viewport);
    await expandCatalogForSectionScreenshots(page);

    for (const sectionId of CATALOG_SECTIONS) {
      const section = page.locator(`[data-catalog-section="${sectionId}"]`);
      await expectSectionScreenshot(section, page, sectionId, viewport);
    }
  });

  test(`设计系统 Dropdown 浮层视觉与交互 ${viewport.width}x${viewport.height}`, async ({
    page,
  }) => {
    await prepareDesignSystemPage(page, viewport);

    const selectionExample = page.locator('[data-catalog-example="selection-fields"]');
    const dropdownTrigger = selectionExample.getByRole("button", { name: "分组单选" });
    await dropdownTrigger.evaluate((element) =>
      element.scrollIntoView({ block: "end", inline: "center" })
    );
    await dropdownTrigger.click();
    const dropdown = page.locator("[data-dropdown-menu]");
    await expectOverlayScreenshot(dropdown, page, "dropdown-open", viewport);
    await expect
      .poll(async () => {
        const triggerBounds = await dropdownTrigger.boundingBox();
        const menuBounds = await dropdown.boundingBox();
        return Boolean(
          triggerBounds && menuBounds && menuBounds.y + menuBounds.height <= triggerBounds.y
        );
      })
      .toBe(true);
    await dropdown.getByPlaceholder("搜索选项").fill("catalog-no-match");
    await expect(dropdown.getByText("没有匹配的选项")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dropdown).toBeHidden();
    await expect(dropdownTrigger).toBeFocused();
  });

  test(`设计系统轻量浮层视觉与交互 ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await prepareDesignSystemPage(page, viewport);

    const floatingExample = page.locator('[data-catalog-example="floating-overlays"]');
    await centerInViewport(floatingExample);

    const popoverTrigger = floatingExample.getByRole("button", { name: "打开浮层" });
    await popoverTrigger.evaluate((element) =>
      element.scrollIntoView({ block: "end", inline: "center" })
    );
    await popoverTrigger.click();
    const popover = page.getByRole("dialog", { name: "外观快速设置" });
    await expect
      .poll(async () => {
        const triggerBounds = await popoverTrigger.boundingBox();
        const panelBounds = await popover.boundingBox();
        return Boolean(
          triggerBounds && panelBounds && panelBounds.y + panelBounds.height <= triggerBounds.y
        );
      })
      .toBe(true);
    await expectOverlayScreenshot(popover, page, "popover-open", viewport);
    const popoverSwitch = popover.getByRole("switch", { name: "减少动态效果" });
    await popoverSwitch.focus();
    await expect(popoverSwitch).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(popover).toBeHidden();
    await expect(popoverTrigger).toBeFocused();

    await centerInViewport(floatingExample);
    const menuTrigger = floatingExample.getByRole("button", { name: "操作菜单" });
    await menuTrigger.click();
    const menu = page.getByRole("dialog", { name: "操作菜单" });
    await expect(menu.getByRole("menuitem", { name: "禁用项" })).toBeDisabled();
    await expect(menu.getByRole("menuitem", { name: "同步" })).toBeVisible();
    await expectOverlayScreenshot(menu, page, "menu-open", viewport);
    const menuItem = menu.getByRole("menuitem", { name: "同步" });
    await menuItem.focus();
    await expect(menuItem).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(menu).toBeHidden();
    await expect(menuTrigger).toBeFocused();

    const tooltipTrigger = floatingExample.getByRole("button", { name: "查看提示" });
    await tooltipTrigger.focus();
    const tooltip = page.getByRole("tooltip", { name: "Tooltip 用于解释图标按钮" });
    await expect(tooltip).toHaveCSS("opacity", "1");
    await expectOverlayScreenshot(tooltip, page, "tooltip-open", viewport);
    await tooltipTrigger.evaluate((element) => element.blur());
    await page.mouse.move(0, 0);
    await expect(tooltip).toHaveCSS("opacity", "0");
  });

  test(`设计系统模态与通知视觉和交互 ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await prepareDesignSystemPage(page, viewport);

    const modalExample = page.locator('[data-catalog-example="modal-interactive"]');
    await centerInViewport(modalExample);
    const modalTrigger = modalExample.getByRole("button", { name: "打开弹窗" });
    await modalTrigger.click();
    const modal = page.getByRole("dialog", { name: "弹窗组件" });
    await expectOverlayScreenshot(modal, page, "modal-open", viewport);
    await page.keyboard.press("Escape");
    await expect(modal).toBeHidden();
    await expect(modalTrigger).toBeFocused();

    const confirmExample = page.locator('[data-catalog-example="confirm-dialog-interactive"]');
    await centerInViewport(confirmExample);
    const confirmTrigger = confirmExample.getByRole("button", { name: "打开危险确认" });
    await confirmTrigger.click();
    const confirmDialog = page.getByRole("dialog", { name: "删除本地记录？" });
    await expect(confirmDialog.getByRole("button", { name: "取消" })).toBeFocused();
    await expectOverlayScreenshot(confirmDialog, page, "confirm-dialog-open", viewport);
    await page.keyboard.press("Escape");
    await expect(confirmDialog).toBeHidden();
    await expect(confirmTrigger).toBeFocused();

    const toastExample = page.locator('[data-catalog-example="toast-viewport-interactive"]');
    await centerInViewport(toastExample);
    await toastExample.getByRole("button", { name: "显示通知队列" }).click();
    const toastViewport = page
      .locator('[data-ui-overlay-root][aria-label="通知"]')
      .filter({ hasText: "来自 ToastViewport 的通知" });
    await expect(toastViewport.getByText("来自 ToastViewport 的通知")).toBeVisible();
    await expectOverlayScreenshot(toastViewport, page, "toast-open", viewport);
    await toastViewport.getByRole("button", { name: "完成" }).click();
    await expect(toastViewport.getByText("来自 ToastViewport 的通知")).toBeHidden();
  });
}
