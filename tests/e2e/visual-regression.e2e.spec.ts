import { expect, test, type Page } from "@playwright/test";

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
