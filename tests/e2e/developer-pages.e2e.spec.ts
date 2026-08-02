import { expect, test, type Page } from "@playwright/test";

const PUBLIC_ROBOTS_CONTENT = "index, follow, max-image-preview:large";
const DEVELOPER_PAGE_ROBOTS_CONTENT = "noindex, nofollow, noarchive";

async function installDeveloperMode(page: Page, enabled: boolean): Promise<void> {
  await page.addInitScript((developerModeEnabled) => {
    localStorage.setItem(
      "AppSettings",
      JSON.stringify({
        version: 11,
        general: { developerModeEnabled },
      })
    );
    localStorage.setItem("immersive-clock:has-seen-tour", "true");
  }, enabled);
}

async function expectRobotsPolicy(page: Page, content: string): Promise<void> {
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", content);
  await expect(page.locator('meta[name="googlebot"]')).toHaveAttribute("content", content);
}

test("开发者模式关闭时拒绝组件规范和音频调试页", async ({ page }) => {
  await installDeveloperMode(page, false);

  for (const path of ["/design-system", "/debug/audio"]) {
    await page.goto(path);
    await expect(page).toHaveURL("/");
    await expectRobotsPolicy(page, PUBLIC_ROBOTS_CONTENT);
  }

  await expect(page.getByRole("heading", { name: "公共组件总览" })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "音频采集诊断" })).toHaveCount(0);
});

test("开发者模式开启时允许两个调试页并保持禁索引", async ({ page }) => {
  await installDeveloperMode(page, true);

  await page.goto("/design-system");
  await expect(page.getByRole("heading", { name: "公共组件总览" })).toBeVisible();
  await expectRobotsPolicy(page, DEVELOPER_PAGE_ROBOTS_CONTENT);

  await page.goto("/debug/audio");
  await expect(page.getByRole("heading", { name: "音频采集诊断" })).toBeVisible();
  await expectRobotsPolicy(page, DEVELOPER_PAGE_ROBOTS_CONTENT);
});
