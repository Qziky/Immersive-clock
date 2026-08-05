import { readFileSync } from "node:fs";
import path from "node:path";

import { expect, test, type Page } from "@playwright/test";

/**
 * 端到端用例：验证 SEO / GEO 优化
 * - 首页含可爬取 <h1> 与合法 FAQPage JSON-LD
 * - 各公共路由 canonical 自引用
 * - /llms.txt 可访问且事实密集
 * - robots.txt 与 sitemap.xml 含 AI 爬虫指令与模式路由
 */

const ROUTE_CANONICALS: Array<{ path: string; canonical: string }> = [
  { path: "/", canonical: "https://clock.qqhkx.com/" },
  { path: "/clock", canonical: "https://clock.qqhkx.com/clock" },
  { path: "/countdown", canonical: "https://clock.qqhkx.com/countdown" },
  { path: "/stopwatch", canonical: "https://clock.qqhkx.com/stopwatch" },
  { path: "/study", canonical: "https://clock.qqhkx.com/study" },
];

async function installSeenTour(page: Page): Promise<void> {
  await page.addInitScript(() => {
    localStorage.setItem("immersive-clock:has-seen-tour", "true");
  });
}

test("首页包含可爬取 h1 与合法 FAQPage 结构化数据", async ({ page }) => {
  await installSeenTour(page);
  await page.goto("/");

  const h1 = page.locator("[data-seo-content] h1");
  await expect(h1).toHaveText(/沉浸式时钟/);

  // 路由级结构化数据脚本存在且含合法 FAQPage。
  const jsonld = await page
    .locator("#route-structured-data")
    .textContent({ timeout: 10000 });
  expect(jsonld).toBeTruthy();
  const parsed = JSON.parse(jsonld ?? "[]") as Array<Record<string, unknown>>;
  const faq = parsed.find((entry) => entry["@type"] === "FAQPage");
  expect(faq).toBeDefined();
  expect(Array.isArray(faq?.mainEntity)).toBe(true);
  expect((faq?.mainEntity as unknown[]).length).toBeGreaterThan(0);
});

for (const { path: routePath, canonical } of ROUTE_CANONICALS) {
  test(`路由 ${routePath} 的 canonical 自引用为 ${canonical}`, async ({ page }) => {
    await installSeenTour(page);
    await page.goto(routePath);

    await expect(page.locator("[data-seo-content] h1")).toBeVisible();
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", canonical);
  });
}

test("/llms.txt 可访问且包含事实密集内容", async ({ request }) => {
  const response = await request.get("/llms.txt");
  expect(response.ok()).toBe(true);
  const body = await response.text();
  expect(body).toContain("沉浸式时钟");
  expect(body).toContain("GPL-3.0");
  expect(body.toLowerCase()).toContain("https://clock.qqhkx.com/");
});

test("robots.txt 显式放行主流 AI 爬虫", () => {
  const robots = readFileSync(path.join(process.cwd(), "robots.txt"), "utf-8");
  for (const agent of ["GPTBot", "OAI-SearchBot", "ClaudeBot", "PerplexityBot", "Baiduspider"]) {
    expect(robots).toContain(`User-agent: ${agent}`);
  }
  expect(robots).toContain("Sitemap: https://clock.qqhkx.com/sitemap.xml");
});

test("sitemap.xml 覆盖首页与四个模式路由", () => {
  const sitemap = readFileSync(path.join(process.cwd(), "sitemap.xml"), "utf-8");
  for (const loc of [
    "https://clock.qqhkx.com/",
    "https://clock.qqhkx.com/clock",
    "https://clock.qqhkx.com/countdown",
    "https://clock.qqhkx.com/stopwatch",
    "https://clock.qqhkx.com/study",
  ]) {
    expect(sitemap).toContain(`<loc>${loc}</loc>`);
  }
});
