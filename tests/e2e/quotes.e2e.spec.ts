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
  typewriterBackspaceEnabled?: boolean;
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
              typewriterBackspaceEnabled: quoteAnimation.typewriterBackspaceEnabled ?? true,
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

async function expectQuoteChannelGeometry(dialog: Locator) {
  const channelCards = dialog.locator("article");
  await expect(channelCards).toHaveCount(5);

  const layout = await channelCards.evaluateAll((cards) =>
    cards.map((card, cardIndex) => {
      const cardBounds = card.getBoundingClientRect();
      const controls = Array.from(
        card.querySelectorAll<HTMLElement>(
          'input[type="number"], button[aria-expanded], [role="switch"]'
        )
      )
        .filter((control) => control.closest("article") === card)
        .filter((control) => {
          const bounds = control.getBoundingClientRect();
          const style = window.getComputedStyle(control);
          return bounds.width > 0 && bounds.height > 0 && style.visibility !== "hidden";
        })
        .map((control) => {
          const bounds = control.getBoundingClientRect();
          return {
            name: control.getAttribute("aria-label") ?? control.getAttribute("type") ?? "control",
            bottom: bounds.bottom,
            left: bounds.left,
            right: bounds.right,
            top: bounds.top,
          };
        });

      const overlappingControls: string[] = [];
      controls.forEach((control, controlIndex) => {
        controls.slice(controlIndex + 1).forEach((otherControl) => {
          const overlapWidth =
            Math.min(control.right, otherControl.right) - Math.max(control.left, otherControl.left);
          const overlapHeight =
            Math.min(control.bottom, otherControl.bottom) - Math.max(control.top, otherControl.top);
          if (overlapWidth > 1 && overlapHeight > 1) {
            overlappingControls.push(`${control.name}/${otherControl.name}`);
          }
        });
      });

      const nextCardBounds = cards[cardIndex + 1]?.getBoundingClientRect();
      return {
        cardFitsHorizontally:
          controls.every(
            (control) =>
              control.left >= cardBounds.left - 1 && control.right <= cardBounds.right + 1
          ) && card.scrollWidth <= card.clientWidth + 1,
        controlCount: controls.length,
        doesNotOverlapNextCard: !nextCardBounds || cardBounds.bottom <= nextCardBounds.top + 1,
        overlappingControls,
      };
    })
  );

  for (const cardLayout of layout) {
    expect(cardLayout.cardFitsHorizontally).toBe(true);
    expect(cardLayout.controlCount).toBeGreaterThanOrEqual(2);
    expect(cardLayout.doesNotOverlapNextCard).toBe(true);
    expect(cardLayout.overlappingControls).toEqual([]);
  }
}

async function expectExpandedDetailsContained(card: Locator, details: Locator, nextCard: Locator) {
  const layout = await Promise.all([
    card.boundingBox(),
    details.boundingBox(),
    nextCard.boundingBox(),
  ]);
  const [cardBounds, detailsBounds, nextCardBounds] = layout;

  expect(cardBounds).not.toBeNull();
  expect(detailsBounds).not.toBeNull();
  expect(nextCardBounds).not.toBeNull();
  expect((detailsBounds?.x ?? 0) + 1).toBeGreaterThanOrEqual(cardBounds?.x ?? 0);
  expect((detailsBounds?.x ?? 0) + (detailsBounds?.width ?? 0)).toBeLessThanOrEqual(
    (cardBounds?.x ?? 0) + (cardBounds?.width ?? 0) + 1
  );
  expect((detailsBounds?.y ?? 0) + (detailsBounds?.height ?? 0)).toBeLessThanOrEqual(
    (cardBounds?.y ?? 0) + (cardBounds?.height ?? 0) + 1
  );
  expect((cardBounds?.y ?? 0) + (cardBounds?.height ?? 0)).toBeLessThanOrEqual(
    (nextCardBounds?.y ?? 0) + 1
  );
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

for (const viewport of [
  { width: 1440, height: 900 },
  { width: 720, height: 900 },
  { width: 390, height: 844 },
]) {
  test(`语录渠道：${viewport.width}px 下控件与展开区保持在卡片内`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await seedQuoteSettings(page, [
      { id: "local-inspirational", enabled: true, weight: 40 },
      { id: "university-mottos", enabled: true, weight: 40 },
      { id: "hitokoto-api", enabled: true, weight: 20, hitokotoCategories: ["d", "i", "k"] },
      { id: "jinrishici-api", enabled: true, weight: 10 },
      { id: "advice-slip-api", enabled: true, weight: 10 },
    ]);

    await page.goto("/");
    const dialog = await openQuoteChannels(page);
    await expectSettingsWithoutHorizontalOverflow(page, dialog);
    await expectQuoteChannelGeometry(dialog);

    const channelCards = dialog.locator("article");
    const localCard = channelCards.filter({ hasText: "本地励志语录" });
    const localEditorButton = localCard.getByRole("button", { name: "编辑语录" });
    const localDetails = dialog.locator(
      `#${await localEditorButton.getAttribute("aria-controls")}`
    );
    await expect(localEditorButton).toHaveAttribute("aria-expanded", "false");
    await expect(localDetails).toHaveAttribute("aria-hidden", "true");
    await expect(localDetails).toHaveAttribute("inert", "");

    await localEditorButton.click();
    await expect(localEditorButton).toHaveAttribute("aria-expanded", "true");
    await expect(localDetails).toHaveAttribute("aria-hidden", "false");
    expect(await localDetails.getAttribute("inert")).toBeNull();
    await expectQuoteChannelGeometry(dialog);
    await expectExpandedDetailsContained(localCard, localDetails, channelCards.nth(1));

    await localEditorButton.click();
    await expect(localDetails).toHaveAttribute("aria-hidden", "true");

    const hitokotoCard = channelCards.filter({ hasText: "一言" });
    const categoryButton = hitokotoCard.getByRole("button", { name: "分类设置" });
    const categoryDetails = dialog.locator(
      `#${await categoryButton.getAttribute("aria-controls")}`
    );
    await expect(categoryButton).toHaveAttribute("aria-expanded", "false");
    await expect(categoryDetails).toHaveAttribute("aria-hidden", "true");
    await expect(categoryDetails).toHaveAttribute("inert", "");

    await categoryButton.click();
    await expect(categoryButton).toHaveAttribute("aria-expanded", "true");
    await expect(categoryDetails).toHaveAttribute("aria-hidden", "false");
    expect(await categoryDetails.getAttribute("inert")).toBeNull();
    await expectQuoteChannelGeometry(dialog);
    await expectExpandedDetailsContained(hitokotoCard, categoryDetails, channelCards.nth(3));
    await expectSettingsWithoutHorizontalOverflow(page, dialog);
  });
}

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
  let backspaceSwitch = dialog.getByRole("switch", { name: "切换时回删" });
  await expect(backspaceSwitch).toBeChecked();
  await backspaceSwitch.click();
  await expect(backspaceSwitch).not.toBeChecked();
  await dialog.getByRole("radio", { name: "快速" }).click();
  await dialog.getByRole("radio", { name: "平滑显示" }).click();

  await expect(dialog.getByRole("radio", { name: "快速" })).toBeChecked();
  await expect(dialog.getByRole("radio", { name: "快速" })).toBeDisabled();
  await expect(backspaceSwitch).not.toBeChecked();
  await expect(backspaceSwitch).toBeDisabled();
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
        return `${quote?.animationMode}:${quote?.typingSpeed}:${String(
          quote?.typewriterBackspaceEnabled
        )}`;
      })
    )
    .toBe("crossfade:fast:false");

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
  backspaceSwitch = dialog.getByRole("switch", { name: "切换时回删" });
  await expect(backspaceSwitch).not.toBeChecked();
  await expect(backspaceSwitch).toBeDisabled();
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
  const quoteStatus = page.getByRole("status").filter({ hasText: fullQuote });
  await expect(quoteStatus).toContainText(fullQuote);
  await expect(reveal).toHaveAttribute("data-quote-animation", "typewriter");
  await expect(reveal.locator("[data-quote-unrevealed-text]")).toHaveCount(1);

  await page.emulateMedia({ reducedMotion: "reduce" });

  await expect(reveal).toHaveAttribute("data-quote-animation", "none");
  await expect(reveal.locator("[data-quote-unrevealed-text]")).toHaveCount(0);
  await expect(reveal.locator('[data-quote-visible-text="true"]')).toHaveText(fullQuote);
  await expect(reveal.locator("[class*='cursor']")).toHaveCount(0);
});
