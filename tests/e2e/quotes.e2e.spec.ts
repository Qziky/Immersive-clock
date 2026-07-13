import { expect, test, type Locator, type Page, type Route } from "@playwright/test";

import { showHud } from "./e2eUtils";

type QuotePreferenceSeed = {
  id: string;
  enabled: boolean;
  weight: number;
  hitokotoCategories?: string[];
  orderMode?: "random" | "sequential";
  quotesOverride?: string[];
};

type QuoteAnimationSeed = {
  animationMode?: "typewriter" | "crossfade" | "none";
  typingSpeed?: "slow" | "normal" | "fast";
};

const LOCAL_FALLBACK_TEXT = "外部服务不可用时显示本地句子。";

async function seedQuoteSettings(
  page: Page,
  channels: QuotePreferenceSeed[],
  animation: QuoteAnimationSeed = {}
) {
  await page.addInitScript(
    ({ quoteAnimation, quoteChannels }) => {
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
              animationMode: quoteAnimation.animationMode ?? "typewriter",
              typingSpeed: quoteAnimation.typingSpeed ?? "normal",
              channels: quoteChannels,
              customChannels: [],
            },
          },
        })
      );
      sessionStorage.setItem("quote-e2e-seeded", "true");
    },
    { quoteAnimation: animation, quoteChannels: channels }
  );
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

async function openQuoteEffects(page: Page) {
  await enterStudyMode(page);
  await page.getByRole("button", { name: "打开设置" }).click();
  const dialog = page.getByRole("dialog", { name: "设置" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "内容语录" }).click();
  await dialog.getByRole("button", { name: "显示效果" }).click();
  await expect(dialog.getByRole("heading", { name: "语录显示效果" })).toBeVisible();
  return dialog;
}

async function expectOneOrTwoRevealLayers(reveal: Locator) {
  const layerCount = await reveal.locator("[data-quote-reveal-layer]").count();
  expect(layerCount).toBeGreaterThanOrEqual(1);
  expect(layerCount).toBeLessThanOrEqual(2);
}

async function expectSettingsWithoutHorizontalOverflow(page: Page, dialog: Locator) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true
  );
  const settingsContainer = dialog.locator("#settings-panel-container");
  await expect(settingsContainer).toBeVisible();
  expect(
    await settingsContainer.evaluate((element) => element.scrollWidth <= element.clientWidth)
  ).toBe(true);
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

test("语录设置：显示效果在移动与桌面端可预览、保存并重载", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await seedQuoteSettings(page, [
    {
      id: "local-inspirational",
      enabled: true,
      weight: 100,
      orderMode: "sequential",
      quotesOverride: ["把注意力放回当下这一刻。", "一次只做一件事，也是在前进。"],
    },
    { id: "university-mottos", enabled: false, weight: 1 },
    { id: "hitokoto-api", enabled: false, weight: 1 },
    { id: "jinrishici-api", enabled: false, weight: 1 },
    { id: "advice-slip-api", enabled: false, weight: 1 },
  ]);

  await page.goto("/");
  let dialog = await openQuoteEffects(page);
  await dialog.getByRole("radio", { name: "快速" }).click();
  await dialog.getByRole("radio", { name: "平滑显示" }).click();

  await expect(dialog.getByRole("radio", { name: "快速" })).toBeChecked();
  await expect(dialog.getByRole("radio", { name: "快速" })).toBeDisabled();
  let preview = dialog.getByTestId("quote-animation-preview");
  const reveal = preview.locator('[data-quote-animation="crossfade"]');
  await expect(reveal).toBeVisible();

  let replayButton = dialog.getByRole("button", { name: "重播语录动画预览" });
  for (let replay = 0; replay < 4; replay += 1) {
    await replayButton.click();
    await expectOneOrTwoRevealLayers(reveal);
  }

  const previewBoxBefore = await preview.boundingBox();
  await replayButton.click();
  const previewBoxAfter = await preview.boundingBox();
  expect(Math.abs((previewBoxAfter?.height ?? 0) - (previewBoxBefore?.height ?? 0))).toBeLessThan(
    2
  );
  await expectSettingsWithoutHorizontalOverflow(page, dialog);

  await dialog.getByRole("button", { name: "保存" }).click();
  await expect
    .poll(() =>
      page.evaluate(() => {
        const raw = localStorage.getItem("AppSettings");
        const quote = raw ? JSON.parse(raw)?.general?.quote : null;
        return `${quote?.animationMode}:${quote?.typingSpeed}`;
      })
    )
    .toBe("crossfade:fast");

  const quoteButton = page.getByRole("button", { name: "刷新语录" });
  const mainReveal = quoteButton.locator('[data-quote-reveal="true"]');
  await expect(mainReveal).toHaveAttribute("data-quote-animation", "crossfade");
  await quoteButton.click();
  await expect(quoteButton).toContainText("一次只做一件事，也是在前进。");
  await expectOneOrTwoRevealLayers(mainReveal);

  await page.setViewportSize({ width: 1280, height: 800 });
  await page.reload();
  dialog = await openQuoteEffects(page);
  await expect(dialog.getByRole("radio", { name: "平滑显示" })).toBeChecked();
  await expect(dialog.getByRole("radio", { name: "快速" })).toBeChecked();
  await expectSettingsWithoutHorizontalOverflow(page, dialog);

  preview = dialog.getByTestId("quote-animation-preview");
  replayButton = dialog.getByRole("button", { name: "重播语录动画预览" });
  await replayButton.click();
  await expectOneOrTwoRevealLayers(preview.locator('[data-quote-animation="crossfade"]'));
});

test("语录显示：打字过程中启用减少动效会立即显示完整内容", async ({ page }) => {
  const fullQuote = "把每一次专注都留给此刻，慢慢积累，终会抵达想去的地方。";
  await seedQuoteSettings(
    page,
    [
      {
        id: "local-inspirational",
        enabled: true,
        weight: 100,
        orderMode: "sequential",
        quotesOverride: [fullQuote],
      },
      { id: "university-mottos", enabled: false, weight: 1 },
      { id: "hitokoto-api", enabled: false, weight: 1 },
      { id: "jinrishici-api", enabled: false, weight: 1 },
      { id: "advice-slip-api", enabled: false, weight: 1 },
    ],
    { animationMode: "typewriter", typingSpeed: "slow" }
  );

  await page.goto("/");
  await enterStudyMode(page);

  const quoteButton = page.getByRole("button", { name: "刷新语录" });
  const reveal = quoteButton.locator('[data-quote-reveal="true"]');
  await expect(page.getByRole("status")).toContainText(fullQuote);
  await expect(reveal).toHaveAttribute("data-quote-animation", "typewriter");
  await expect(reveal.locator("[data-quote-unrevealed-text]")).toHaveCount(1);

  await page.emulateMedia({ reducedMotion: "reduce" });

  await expect(reveal).toHaveAttribute("data-quote-animation", "none");
  await expect(reveal.locator("[data-quote-unrevealed-text]")).toHaveCount(0);
  await expect(reveal.locator('[data-quote-visible-text="true"]')).toHaveText(fullQuote);
  await expect(reveal.locator("[class*='cursor']")).toHaveCount(0);
});
