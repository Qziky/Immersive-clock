import { expect, test, type Locator, type Page } from "@playwright/test";

type Background =
  | { type: "default" }
  | { type: "black" }
  | { type: "color"; color: string; colorAlpha: number };

const FIXED_TIME = new Date("2026-06-01T08:30:00+08:00");

test.beforeEach(({ browserName }, testInfo) => {
  test.skip(
    testInfo.project.name !== "msedge" || browserName !== "chromium",
    "视觉基线仅维护系统 Edge/Windows 版本"
  );
});

async function prepareVisualPage(
  page: Page,
  viewport: { width: number; height: number },
  background: Background
) {
  await page.setViewportSize(viewport);
  await page.clock.setFixedTime(FIXED_TIME);
  await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
  await page.goto("/");
  await page.evaluate(
    ({ nextBackground, hideUntil }) => {
      const current = JSON.parse(localStorage.getItem("AppSettings") || "{}");
      current.general = {
        ...(current.general || {}),
        background: nextBackground,
        announcement: {
          ...(current.general?.announcement || {}),
          hideUntil,
          version: "3.13.3",
        },
      };
      localStorage.setItem("AppSettings", JSON.stringify(current));
      localStorage.setItem("immersive-clock:has-seen-tour", "true");
    },
    { nextBackground: background, hideUntil: FIXED_TIME.getTime() + 7 * 24 * 60 * 60 * 1000 }
  );
  await page.reload();
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
  await expect(page.getByRole("main", { name: "时钟应用主界面" })).toBeVisible();
}

async function openAppearanceEditor(page: Page, viewport: { width: number; height: number }) {
  await page.getByRole("button", { name: "打开设置" }).click();
  const dialog = page.getByRole("dialog", { name: "设置" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "视觉外观" }).click();

  if (viewport.width <= 720) {
    await dialog
      .getByRole("navigation", { name: "视觉外观子分类" })
      .getByRole("button", { name: "时间显示", exact: true })
      .click();
  } else {
    await dialog.getByRole("button", { name: "时间显示", exact: true }).click();
  }

  await expect(dialog.getByLabel("时钟外观预览")).toBeVisible();
  await expect(dialog.getByRole("tablist", { name: "时钟调整对象" })).toBeVisible();
  return dialog;
}

async function selectAppearanceSection(
  dialog: Locator,
  viewport: { width: number; height: number },
  sectionName: string
) {
  if (viewport.width <= 720) {
    const subnavigation = dialog.getByRole("navigation", { name: "视觉外观子分类" });
    if (!(await subnavigation.isVisible())) {
      await dialog
        .getByRole("navigation", { name: "设置紧凑导航" })
        .getByRole("button", { name: "视觉外观", exact: true })
        .click();
    }
    await subnavigation.getByRole("button", { name: sectionName, exact: true }).click();
    return;
  }

  await dialog.getByRole("button", { name: sectionName, exact: true }).click();
}

async function readPreviewLayout(preview: Locator) {
  return preview.evaluate((figure) => {
    const canvas = figure.firstElementChild;
    const cropTarget = canvas?.querySelector<HTMLElement>("[data-preview-crop-target]");
    if (!(canvas instanceof HTMLElement) || !cropTarget) return null;
    const canvasBounds = canvas.getBoundingClientRect();
    const contentBounds = [cropTarget, ...Array.from(cropTarget.querySelectorAll("*"))]
      .map((element) => element.getBoundingClientRect())
      .filter((bounds) => bounds.width > 0 && bounds.height > 0)
      .reduce(
        (result, bounds) => ({
          bottom: Math.max(result.bottom, bounds.bottom),
          left: Math.min(result.left, bounds.left),
          right: Math.max(result.right, bounds.right),
          top: Math.min(result.top, bounds.top),
        }),
        {
          bottom: Number.NEGATIVE_INFINITY,
          left: Number.POSITIVE_INFINITY,
          right: Number.NEGATIVE_INFINITY,
          top: Number.POSITIVE_INFINITY,
        }
      );
    const contentWidth = contentBounds.right - contentBounds.left;
    const contentHeight = contentBounds.bottom - contentBounds.top;
    return {
      fitsHorizontally:
        contentBounds.left >= canvasBounds.left - 1 &&
        contentBounds.right <= canvasBounds.right + 1,
      fitsVertically:
        contentBounds.top >= canvasBounds.top - 1 &&
        contentBounds.bottom <= canvasBounds.bottom + 1,
      areaUtilization: (contentWidth * contentHeight) / (canvasBounds.width * canvasBounds.height),
      utilization: Math.max(contentWidth / canvasBounds.width, contentHeight / canvasBounds.height),
    };
  });
}

for (const viewport of [
  { width: 1440, height: 900 },
  { width: 390, height: 844 },
  { width: 320, height: 568 },
]) {
  test(`设置抽屉视觉快照 ${viewport.width}×${viewport.height}`, async ({ page }) => {
    await prepareVisualPage(page, viewport, { type: "default" });
    await page.getByRole("button", { name: "打开设置" }).click();
    await expect(page.getByRole("dialog", { name: "设置" })).toBeVisible();

    await expect(page).toHaveScreenshot(`settings-${viewport.width}x${viewport.height}.png`, {
      animations: "disabled",
      caret: "hide",
      maxDiffPixelRatio: 0.01,
    });
  });
}

for (const viewport of [
  { width: 1440, height: 900 },
  { width: 390, height: 844 },
  { width: 320, height: 568 },
]) {
  test(`外观编辑器视觉快照 ${viewport.width}×${viewport.height}`, async ({ page }) => {
    await prepareVisualPage(page, viewport, { type: "default" });
    const dialog = await openAppearanceEditor(page, viewport);
    const previewLayout = await readPreviewLayout(dialog.getByLabel("时钟外观预览"));
    expect(previewLayout).toMatchObject({ fitsHorizontally: true, fitsVertically: true });
    expect(previewLayout?.areaUtilization).toBeGreaterThan(0.45);
    expect(previewLayout?.utilization).toBeGreaterThan(0.7);

    await expect(page).toHaveScreenshot(
      `appearance-editor-${viewport.width}x${viewport.height}.png`,
      {
        animations: "disabled",
        caret: "hide",
        maxDiffPixelRatio: 0.01,
      }
    );

    for (const preview of [
      { label: "天气外观预览", section: "天气" },
      { label: "顶部信息栏外观预览", section: "顶部信息栏" },
    ]) {
      await selectAppearanceSection(dialog, viewport, preview.section);
      const componentPreview = dialog.getByLabel(preview.label);
      await expect(componentPreview).toBeVisible();
      const componentLayout = await readPreviewLayout(componentPreview);
      expect(componentLayout).toMatchObject({
        fitsHorizontally: true,
        fitsVertically: true,
      });
      expect(componentLayout?.areaUtilization).toBeGreaterThan(0.45);
      expect(componentLayout?.utilization).toBeGreaterThan(0.7);
    }
  });
}

for (const [name, background] of [
  ["default", { type: "default" }],
  ["black", { type: "black" }],
  ["custom", { type: "color", color: "#20352d", colorAlpha: 0.9 }],
] as const) {
  test(`主界面 ${name} 背景视觉快照`, async ({ page }) => {
    await prepareVisualPage(page, { width: 1440, height: 900 }, background);

    await expect(page).toHaveScreenshot(`background-${name}-1440x900.png`, {
      animations: "disabled",
      caret: "hide",
      maxDiffPixelRatio: 0.01,
    });
  });
}
