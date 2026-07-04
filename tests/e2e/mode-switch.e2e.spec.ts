import { readFileSync } from "node:fs";

import { expect, test } from "@playwright/test";
import { showHud } from "./e2eUtils";

const packageJson = JSON.parse(
  readFileSync(new URL("../../package.json", import.meta.url), "utf-8")
) as { version: string };

test.describe.configure({ mode: "serial" });

test.beforeEach(async ({ page }) => {
  await page.addInitScript((appVersion) => {
    window.localStorage.setItem("immersive-clock:has-seen-tour", "true");
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

test("模式切换：四种模式可切换并同步 URL", async ({ page }) => {
  await page.goto("/");

  await showHud(page);
  let tablist = page.getByRole("tablist", { name: "选择时钟模式" });
  await expect(tablist).toBeVisible();

  await tablist.getByRole("tab", { name: /时钟/ }).click();
  await expect(page.locator("#clock-panel")).toBeVisible();
  await expect(page).toHaveURL(/\/clock$/);

  await showHud(page);
  tablist = page.getByRole("tablist", { name: "选择时钟模式" });
  await tablist.getByRole("tab", { name: /倒计时/ }).click();
  await expect(page.locator("#countdown-panel")).toBeVisible();
  await expect(page).toHaveURL(/\/countdown$/);

  await showHud(page);
  tablist = page.getByRole("tablist", { name: "选择时钟模式" });
  await tablist.getByRole("tab", { name: /秒表/ }).click();
  await expect(page.locator("#stopwatch-panel")).toBeVisible();
  await expect(page).toHaveURL(/\/stopwatch$/);

  await showHud(page);
  tablist = page.getByRole("tablist", { name: "选择时钟模式" });
  await tablist.getByRole("tab", { name: /自习/ }).click();
  await expect(page.locator("#study-panel")).toBeVisible();
  await expect(page).toHaveURL(/\/study$/);
});

test("模式 URL 可直接访问", async ({ page }) => {
  const routes = [
    { path: "/clock", panel: "#clock-panel" },
    { path: "/countdown", panel: "#countdown-panel" },
    { path: "/stopwatch", panel: "#stopwatch-panel" },
    { path: "/study", panel: "#study-panel" },
  ];

  for (const route of routes) {
    await page.goto(route.path);
    await expect(page.locator(route.panel)).toBeVisible();
  }
});
