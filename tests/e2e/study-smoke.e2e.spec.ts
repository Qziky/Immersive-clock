import { expect, test, type Locator, type Page } from "@playwright/test";

import { showHud } from "./e2eUtils";

async function openStudyDisplaySettings(page: Page) {
  await showHud(page);
  const tablist = page.getByRole("tablist", { name: "选择时钟模式" });
  await tablist.getByRole("tab", { name: /自习/ }).click();
  await page.getByRole("button", { name: "打开设置" }).click();
  const dialog = page.getByRole("dialog", { name: "设置" });
  await dialog.getByRole("button", { name: "自习显示" }).click();
  return dialog;
}

async function expectStatusColumnsDoNotOverlap(statusRoot: Locator) {
  const left = await statusRoot.locator('[class*="statusText"]').first().boundingBox();
  const center = await statusRoot.locator('[class*="progressRhythm"]').first().boundingBox();
  const right = await statusRoot.locator('[class*="progressMeta"]').first().boundingBox();
  expect(left).not.toBeNull();
  expect(center).not.toBeNull();
  expect(right).not.toBeNull();
  expect((left?.x ?? 0) + (left?.width ?? 0)).toBeLessThanOrEqual((center?.x ?? 0) + 1);
  expect((center?.x ?? 0) + (center?.width ?? 0)).toBeLessThanOrEqual((right?.x ?? 0) + 1);
}

async function expectInfoContentIsCentered(statusRoot: Locator) {
  const contentLocator = statusRoot.locator('[class*="infoContent"]').first();
  await contentLocator.evaluate(async (node) => {
    await Promise.all(node.getAnimations().map((animation) => animation.finished));
  });
  const track = await statusRoot.locator('[class*="progressRhythm"]').first().boundingBox();
  const content = await contentLocator.boundingBox();
  const icon = await statusRoot.locator('[class*="infoIcon"]').first().boundingBox();
  const copy = await statusRoot.locator('[class*="infoCopy"]').first().boundingBox();
  const root = await statusRoot.boundingBox();
  expect(track).not.toBeNull();
  expect(content).not.toBeNull();
  expect(icon).not.toBeNull();
  expect(copy).not.toBeNull();
  expect(root).not.toBeNull();
  expect(
    Math.abs(
      (content?.x ?? 0) + (content?.width ?? 0) / 2 - ((track?.x ?? 0) + (track?.width ?? 0) / 2)
    )
  ).toBeLessThan(1);
  expect(
    Math.abs(
      (content?.y ?? 0) + (content?.height ?? 0) / 2 - ((root?.y ?? 0) + (root?.height ?? 0) / 2)
    )
  ).toBeLessThan(1);
  expect(
    Math.abs((icon?.y ?? 0) + (icon?.height ?? 0) / 2 - ((copy?.y ?? 0) + (copy?.height ?? 0) / 2))
  ).toBeLessThan(1);
}

/** 端到端用例：验证自习模式关键入口可见（函数级注释） */
test("自习模式：面板与设置入口可见", async ({ page }) => {
  await page.goto("/");

  await showHud(page);
  const tablist = page.getByRole("tablist", { name: "选择时钟模式" });
  await tablist.getByRole("tab", { name: /自习/ }).click();

  await expect(page.locator("#study-panel")).toBeVisible();
  await expect(page.getByRole("button", { name: "打开设置" })).toBeVisible();
});

test("中央信息：取消不保存，自定义消息保存后可重载", async ({ page }) => {
  await page.goto("/");

  let dialog = await openStudyDisplaySettings(page);
  await dialog.getByRole("button", { name: "添加消息" }).click();
  await dialog.getByLabel("消息内容").fill("这条消息不应保存");
  await dialog.getByRole("button", { name: "取消" }).click();
  await expect(dialog).toBeHidden();

  dialog = await openStudyDisplaySettings(page);
  await expect(dialog.getByLabel("消息内容")).toHaveCount(0);
  await dialog.getByRole("switch", { name: "启用当前进度" }).click();
  await dialog.getByRole("switch", { name: "启用下一课时" }).click();
  await dialog.getByRole("switch", { name: "启用短时降雨" }).click();
  await dialog.getByRole("button", { name: "添加消息" }).click();
  await dialog.getByLabel("消息内容").fill("记得完成今日复盘");
  await dialog.getByRole("button", { name: "保存" }).click();

  const statusRoot = page.getByRole("progressbar", { name: "今日进度" }).locator("..");
  await expect(
    statusRoot.locator('[class*="stageText"]', { hasText: "记得完成今日复盘" })
  ).toBeVisible();

  expect(
    await page.evaluate(() => {
      const raw = localStorage.getItem("AppSettings");
      const items = raw ? JSON.parse(raw)?.study?.infoCarousel?.items : [];
      return items?.find((item: { source?: string }) => item.source === "custom")?.text;
    })
  ).toBe("记得完成今日复盘");

  await page.reload();
  dialog = await openStudyDisplaySettings(page);
  await expect(dialog.getByLabel("消息内容")).toHaveValue("记得完成今日复盘");
});

test("中央信息：隐藏天气组件后仍显示共享快照中的降雨主次信息", async ({ page }) => {
  await page.addInitScript(() => {
    const now = Date.now();
    const rainStartAt = now + 8 * 60 * 1000;
    const rainEndAt = rainStartAt + 10 * 60 * 1000;
    localStorage.setItem("immersive-clock:has-seen-tour", "true");
    localStorage.setItem(
      "AppSettings",
      JSON.stringify({
        version: 3,
        study: {
          display: {
            showStatusBar: true,
            showWeather: false,
            showNoiseMonitor: false,
            showCountdown: false,
          },
          infoCarousel: {
            autoRotate: false,
            intervalSec: 6,
            items: [
              { id: "progress-default", source: "progress", enabled: false, order: 0 },
              {
                id: "next-schedule-default",
                source: "nextSchedule",
                enabled: false,
                order: 1,
              },
              { id: "rain-default", source: "rain", enabled: true, order: 2 },
            ],
          },
        },
      })
    );
    localStorage.setItem(
      "weather-cache",
      JSON.stringify({
        coords: { lat: 31.2, lon: 121.5, source: "e2e", updatedAt: now },
        minutely: {
          data: {
            code: "200",
            updateTime: new Date(now).toISOString(),
            summary: "短时有雨",
            minutely: [
              { fxTime: new Date(now).toISOString(), precip: "0" },
              { fxTime: new Date(rainStartAt).toISOString(), precip: "0.2" },
              { fxTime: new Date(rainEndAt).toISOString(), precip: "0" },
            ],
          },
          location: "121.50,31.20",
          updatedAt: now,
          lastApiFetchAt: now,
        },
      })
    );
  });
  await page.goto("/");
  await showHud(page);
  await page
    .getByRole("tablist", { name: "选择时钟模式" })
    .getByRole("tab", { name: /自习/ })
    .click();

  const statusRoot = page.getByRole("progressbar", { name: "今日进度" }).locator("..");
  await expect(page.getByLabel("天气")).toHaveCount(0);
  await expect(statusRoot.locator('[class*="stageText"]')).toHaveText(/预计 \d+ 分钟后下雨/);
  await expect(statusRoot.locator('[class*="remainingTime"]')).toHaveText("预计持续 10 分钟");
  await expectStatusColumnsDoNotOverlap(statusRoot);
  await expectInfoContentIsCentered(statusRoot);
});

for (const viewport of [
  { width: 1440, height: 900 },
  { width: 390, height: 844 },
]) {
  test(`中央信息：${viewport.width}px 长文案省略且切换不改变状态栏高度`, async ({ page }) => {
    const firstText =
      "这是一条用于验证顶部中央信息区域在较长内容下仍然保持左右进度信息稳定可见并正确省略的自定义消息文本"
        .repeat(2)
        .slice(0, 80);
    const secondText =
      "第二条轮播内容用于确认点击切换之后状态栏高度不会变化且页面不会产生任何横向滚动或内容重叠问题"
        .repeat(2)
        .slice(0, 80);
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.setViewportSize(viewport);
    await page.addInitScript(
      ({ first, second }) => {
        localStorage.setItem("immersive-clock:has-seen-tour", "true");
        localStorage.setItem(
          "AppSettings",
          JSON.stringify({
            version: 3,
            study: {
              display: {
                showStatusBar: true,
                showWeather: false,
                showNoiseMonitor: false,
                showCountdown: false,
              },
              infoCarousel: {
                autoRotate: false,
                intervalSec: 6,
                items: [
                  {
                    id: "progress-default",
                    source: "progress",
                    enabled: false,
                    order: 0,
                  },
                  {
                    id: "next-schedule-default",
                    source: "nextSchedule",
                    enabled: false,
                    order: 1,
                  },
                  { id: "rain-default", source: "rain", enabled: false, order: 2 },
                  {
                    id: "custom-long-first",
                    source: "custom",
                    enabled: true,
                    order: 3,
                    text: first,
                  },
                  {
                    id: "custom-long-second",
                    source: "custom",
                    enabled: true,
                    order: 4,
                    text: second,
                  },
                ],
              },
            },
          })
        );
      },
      { first: firstText, second: secondText }
    );
    await page.goto("/");

    await showHud(page);
    await page
      .getByRole("tablist", { name: "选择时钟模式" })
      .getByRole("tab", { name: /自习/ })
      .click();

    const progressbar = page.getByRole("progressbar", { name: "今日进度" });
    const statusRoot = progressbar.locator("..");
    const firstMessage = page.getByRole("button", { name: firstText });
    await expect(firstMessage).toBeVisible();
    await expect(statusRoot.getByText("今日进度", { exact: true })).toBeVisible();
    await expect(statusRoot.getByText(/^\d+%$/)).toBeVisible();
    await expectStatusColumnsDoNotOverlap(statusRoot);
    await expectInfoContentIsCentered(statusRoot);

    const before = await statusRoot.boundingBox();
    const textMetrics = await firstMessage
      .getByText(firstText, { exact: true })
      .evaluate((node) => {
        const element = node as HTMLElement;
        const style = getComputedStyle(element);
        return {
          clientWidth: element.clientWidth,
          scrollWidth: element.scrollWidth,
          overflow: style.overflow,
          textOverflow: style.textOverflow,
        };
      });
    expect(textMetrics.overflow).toBe("hidden");
    expect(textMetrics.textOverflow).toBe("ellipsis");
    expect(textMetrics.scrollWidth).toBeGreaterThan(textMetrics.clientWidth);

    const restingStyle = await firstMessage.evaluate((node) => {
      const style = getComputedStyle(node);
      return { backgroundColor: style.backgroundColor, color: style.color };
    });
    await firstMessage.hover();
    const hoveredStyle = await firstMessage.evaluate((node) => {
      const style = getComputedStyle(node);
      return { backgroundColor: style.backgroundColor, color: style.color };
    });
    expect(hoveredStyle).toEqual(restingStyle);

    await firstMessage.click();
    const secondMessage = page.getByRole("button", { name: secondText });
    await expect(secondMessage).toBeVisible();
    const animatedContent = secondMessage.locator('[class*="infoContent"]');
    expect(await animatedContent.evaluate((node) => getComputedStyle(node).animationName)).not.toBe(
      "none"
    );
    expect(await animatedContent.evaluate((node) => node.getAnimations().length)).toBeGreaterThan(
      0
    );
    await expectStatusColumnsDoNotOverlap(statusRoot);
    const after = await statusRoot.boundingBox();
    expect(before).not.toBeNull();
    expect(after).not.toBeNull();
    expect(Math.abs((before?.height ?? 0) - (after?.height ?? 0))).toBeLessThan(0.5);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)
    ).toBe(true);

    await page.emulateMedia({ reducedMotion: "reduce" });
    await secondMessage.click();
    const reducedMotionMessage = page.getByRole("button", { name: firstText });
    await expect(reducedMotionMessage).toBeVisible();
    const reducedMotionContent = reducedMotionMessage.locator('[class*="infoContent"]');
    await expect(reducedMotionContent).toHaveCSS("animation-name", "none");
    expect(await reducedMotionContent.evaluate((node) => node.getAnimations().length)).toBe(0);
  });
}
