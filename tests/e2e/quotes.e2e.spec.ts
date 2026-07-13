import { expect, test, type Page, type Route } from "@playwright/test";

import { showHud } from "./e2eUtils";

type QuotePreferenceSeed = {
  id: string;
  enabled: boolean;
  weight: number;
  hitokotoCategories?: string[];
  quotesOverride?: string[];
};

const LOCAL_FALLBACK_TEXT = "外部服务不可用时显示本地句子。";

async function seedQuoteSettings(page: Page, channels: QuotePreferenceSeed[]) {
  await page.addInitScript((quoteChannels) => {
    if (sessionStorage.getItem("quote-e2e-seeded") === "true") return;
    localStorage.setItem(
      "AppSettings",
      JSON.stringify({
        version: 3,
        modifiedAt: Date.now(),
        general: {
          quote: {
            autoRefreshEnabled: false,
            autoRefreshIntervalSec: 600,
            channels: quoteChannels,
            customChannels: [],
          },
        },
      })
    );
    sessionStorage.setItem("quote-e2e-seeded", "true");
  }, channels);
}

async function useDeterministicRandom(page: Page, value: number) {
  await page.addInitScript((randomValue) => {
    Math.random = () => randomValue;
  }, value);
}

function allOnlineWithLocalFallback(): QuotePreferenceSeed[] {
  return [
    {
      id: "local-inspirational",
      enabled: true,
      weight: 1,
      quotesOverride: [LOCAL_FALLBACK_TEXT],
    },
    { id: "university-mottos", enabled: false, weight: 1 },
    {
      id: "hitokoto-api",
      enabled: true,
      weight: 100,
      hitokotoCategories: ["d", "i", "k"],
    },
    { id: "jinrishici-api", enabled: true, weight: 100 },
    { id: "advice-slip-api", enabled: true, weight: 100 },
  ];
}

async function enterStudyMode(page: Page) {
  await showHud(page);
  await page
    .getByRole("tablist", { name: "选择时钟模式" })
    .getByRole("tab", { name: /自习/ })
    .click();
  await expect(page.locator("#study-panel")).toBeVisible();
}

async function openQuoteChannels(page: Page) {
  await enterStudyMode(page);
  await page.getByRole("button", { name: "打开设置" }).click();
  const dialog = page.getByRole("dialog", { name: "设置" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "内容语录" }).click();
  await dialog.getByRole("button", { name: "语录渠道" }).click();
  await expect(dialog.getByRole("heading", { name: "语录频道管理" })).toBeVisible();
  return dialog;
}

test("在线语录：一言主线路失败后使用国际线路", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await seedQuoteSettings(page, [
    { id: "local-inspirational", enabled: false, weight: 40 },
    { id: "university-mottos", enabled: false, weight: 40 },
    {
      id: "hitokoto-api",
      enabled: true,
      weight: 20,
      hitokotoCategories: ["d", "i", "k"],
    },
    { id: "jinrishici-api", enabled: false, weight: 10 },
    { id: "advice-slip-api", enabled: false, weight: 10 },
  ]);

  let primaryRequests = 0;
  let internationalRequests = 0;
  await page.route("https://v1.hitokoto.cn/**", async (route) => {
    primaryRequests += 1;
    await route.fulfill({ status: 503, contentType: "application/json", body: "{}" });
  });
  await page.route("https://international.v1.hitokoto.cn/**", async (route) => {
    internationalRequests += 1;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        uuid: "e2e-international",
        hitokoto: "国际线路返回的测试句子。",
        from_who: "测试作者",
        from: "测试来源",
      }),
    });
  });

  await page.goto("/");
  await enterStudyMode(page);

  const quoteButton = page.getByRole("button", { name: "刷新语录" });
  await expect(quoteButton).toContainText("国际线路返回的测试句子。");
  await expect(quoteButton).toContainText("测试作者 · 测试来源");
  expect(primaryRequests).toBeGreaterThan(0);
  expect(internationalRequests).toBeGreaterThan(0);
});

test("在线语录：通过拦截的今日诗词 SDK 展示正文与完整来源", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await seedQuoteSettings(page, [
    { id: "local-inspirational", enabled: false, weight: 40 },
    { id: "university-mottos", enabled: false, weight: 40 },
    { id: "hitokoto-api", enabled: false, weight: 20 },
    { id: "jinrishici-api", enabled: true, weight: 10 },
    { id: "advice-slip-api", enabled: false, weight: 10 },
  ]);

  let sdkRequests = 0;
  await page.route("https://sdk.jinrishici.com/v2/browser/jinrishici.js", async (route) => {
    sdkRequests += 1;
    await route.fulfill({
      status: 200,
      contentType: "application/javascript",
      body: `window.jinrishici = {
        load(callback) {
          callback({
            status: "success",
            data: {
              id: "e2e-poem",
              content: "但愿人长久，千里共婵娟。",
              origin: { dynasty: "宋", author: "苏轼", title: "水调歌头" }
            }
          });
        }
      };`,
    });
  });

  await page.goto("/");
  await enterStudyMode(page);

  const quoteButton = page.getByRole("button", { name: "刷新语录" });
  await expect(quoteButton).toContainText("但愿人长久，千里共婵娟。");
  await expect(quoteButton).toContainText("宋 · 苏轼 · 水调歌头");

  const quoteText = page.getByText("但愿人长久，千里共婵娟。", { exact: true });
  const attribution = page.getByText("—— 宋 · 苏轼 · 水调歌头", { exact: true });
  const attributionColor = await attribution.evaluate((element) => getComputedStyle(element).color);
  await quoteButton.hover();
  await expect
    .poll(() => attribution.evaluate((element) => getComputedStyle(element).color))
    .not.toBe(attributionColor);
  expect(await attribution.evaluate((element) => getComputedStyle(element).color)).toBe(
    await quoteText.evaluate((element) => getComputedStyle(element).color)
  );
  expect(sdkRequests).toBeGreaterThan(0);
});

test("在线语录：一言两条线路失败后切换到 Advice Slip", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await useDeterministicRandom(page, 0);
  await seedQuoteSettings(page, [
    { id: "local-inspirational", enabled: false, weight: 40 },
    { id: "university-mottos", enabled: false, weight: 40 },
    {
      id: "hitokoto-api",
      enabled: true,
      weight: 20,
      hitokotoCategories: ["d", "i", "k"],
    },
    { id: "jinrishici-api", enabled: false, weight: 10 },
    { id: "advice-slip-api", enabled: true, weight: 10 },
  ]);

  let primaryRequests = 0;
  let internationalRequests = 0;
  let adviceRequests = 0;
  await page.route("https://v1.hitokoto.cn/**", async (route) => {
    primaryRequests += 1;
    await route.fulfill({ status: 503, contentType: "application/json", body: "{}" });
  });
  await page.route("https://international.v1.hitokoto.cn/**", async (route) => {
    internationalRequests += 1;
    await route.fulfill({ status: 503, contentType: "application/json", body: "{}" });
  });
  await page.route("https://api.adviceslip.com/advice", async (route) => {
    adviceRequests += 1;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ slip: { id: 987, advice: "Take the next small step." } }),
    });
  });

  await page.goto("/");
  await enterStudyMode(page);

  const quoteButton = page.getByRole("button", { name: "刷新语录" });
  await expect(quoteButton).toContainText("Take the next small step.");
  await expect(quoteButton).toContainText("Advice Slip");
  expect(primaryRequests).toBeGreaterThan(0);
  expect(internationalRequests).toBeGreaterThan(0);
  expect(adviceRequests).toBeGreaterThan(0);
});

test("在线语录：三个服务均返回错误时保留本地兜底", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await useDeterministicRandom(page, 0.999);
  await seedQuoteSettings(page, allOnlineWithLocalFallback());

  let hitokotoRequests = 0;
  let internationalRequests = 0;
  let jinrishiciRequests = 0;
  let adviceRequests = 0;
  await page.route("https://v1.hitokoto.cn/**", async (route) => {
    hitokotoRequests += 1;
    await route.fulfill({ status: 503, contentType: "application/json", body: "{}" });
  });
  await page.route("https://international.v1.hitokoto.cn/**", async (route) => {
    internationalRequests += 1;
    await route.fulfill({ status: 503, contentType: "application/json", body: "{}" });
  });
  await page.route("https://sdk.jinrishici.com/v2/browser/jinrishici.js", async (route) => {
    jinrishiciRequests += 1;
    await route.fulfill({
      status: 200,
      contentType: "application/javascript",
      body: `window.jinrishici = {
        load(callback) { callback({ status: "error", statusCode: 503 }); }
      };`,
    });
  });
  await page.route("https://api.adviceslip.com/advice", async (route) => {
    adviceRequests += 1;
    await route.fulfill({ status: 503, contentType: "application/json", body: "{}" });
  });

  await page.goto("/");
  await enterStudyMode(page);

  const quoteButton = page.getByRole("button", { name: "刷新语录" });
  await expect(quoteButton).toContainText(LOCAL_FALLBACK_TEXT);
  await expect.poll(() => adviceRequests).toBeGreaterThan(0);
  await expect.poll(() => hitokotoRequests).toBeGreaterThan(0);
  await expect.poll(() => internationalRequests).toBeGreaterThan(0);
  await expect.poll(() => jinrishiciRequests).toBeGreaterThan(0);
  await expect(quoteButton).toContainText(LOCAL_FALLBACK_TEXT);
});

test("离线启动：应用可访问但外部语录服务断网时显示本地内容", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await useDeterministicRandom(page, 0.999);
  await seedQuoteSettings(page, allOnlineWithLocalFallback());

  let offlineRequests = 0;
  const abortAsOffline = async (route: Route) => {
    offlineRequests += 1;
    await route.abort("internetdisconnected");
  };
  await page.route("https://v1.hitokoto.cn/**", abortAsOffline);
  await page.route("https://international.v1.hitokoto.cn/**", abortAsOffline);
  await page.route("https://sdk.jinrishici.com/v2/browser/jinrishici.js", abortAsOffline);
  await page.route("https://api.adviceslip.com/advice", abortAsOffline);

  await page.goto("/");
  await enterStudyMode(page);

  const quoteButton = page.getByRole("button", { name: "刷新语录" });
  await expect(quoteButton).toContainText(LOCAL_FALLBACK_TEXT);
  await expect.poll(() => offlineRequests).toBeGreaterThanOrEqual(4);
  await expect(quoteButton).toContainText(LOCAL_FALLBACK_TEXT);
});

test("语录设置：三个在线频道可见且保存后保持启停与权重", async ({ page }) => {
  await seedQuoteSettings(page, [
    { id: "local-inspirational", enabled: true, weight: 40 },
    { id: "university-mottos", enabled: true, weight: 40 },
    { id: "hitokoto-api", enabled: false, weight: 20 },
    { id: "jinrishici-api", enabled: false, weight: 10 },
    { id: "advice-slip-api", enabled: false, weight: 10 },
  ]);

  await page.goto("/");
  const dialog = await openQuoteChannels(page);
  await expect(dialog.getByText("一言", { exact: true })).toBeVisible();
  await expect(dialog.getByText("今日诗词", { exact: true })).toBeVisible();
  await expect(dialog.getByText("Advice Slip", { exact: true })).toBeVisible();

  const adviceCard = dialog.locator("article").filter({ hasText: "Advice Slip" });
  await adviceCard.getByRole("switch", { name: "启用Advice Slip" }).click();
  await adviceCard.getByRole("spinbutton").fill("37");
  await dialog.getByRole("button", { name: "保存" }).click();

  const saved = await page.evaluate(() => {
    const raw = localStorage.getItem("AppSettings");
    const quote = raw ? JSON.parse(raw)?.general?.quote : null;
    return {
      advice: quote?.channels?.find((channel: { id?: string }) => channel.id === "advice-slip-api"),
      enabled: quote?.autoRefreshEnabled,
      interval: quote?.autoRefreshIntervalSec,
    };
  });
  expect(saved.advice).toMatchObject({ enabled: true, weight: 37 });
  expect(saved).toMatchObject({ enabled: false, interval: 600 });

  await page.reload();
  const reloadedDialog = await openQuoteChannels(page);
  const reloadedAdvice = reloadedDialog.locator("article").filter({ hasText: "Advice Slip" });
  await expect(reloadedAdvice.getByRole("switch", { name: "停用Advice Slip" })).toBeChecked();
  await expect(reloadedAdvice.getByRole("spinbutton")).toHaveValue("37");
});
