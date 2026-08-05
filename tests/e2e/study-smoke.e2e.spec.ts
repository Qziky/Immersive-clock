import { expect, test, type Locator, type Page } from "@playwright/test";

import { CURRENT_APP_VERSION, showHud } from "./e2eUtils";

async function openStudyDisplaySettings(page: Page) {
  await showHud(page);
  const tablist = page.getByRole("tablist", { name: "选择时钟模式" });
  await tablist.getByRole("tab", { name: /自习/ }).click();
  await page.getByRole("button", { name: "打开设置" }).click();
  const dialog = page.getByRole("dialog", { name: "设置" });
  await dialog.getByRole("button", { name: "自习显示" }).click();
  return dialog;
}

async function addStudyInfo(page: Page, dialog: Locator, optionName: string) {
  await dialog.getByRole("button", { name: "添加信息" }).click();
  await page.getByRole("option", { name: optionName, exact: false }).click();
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

async function expectInfoTextFitsVertically(statusRoot: Locator) {
  const textMetrics = await statusRoot.evaluate((root) =>
    ['[class*="stageText"]', '[class*="remainingTime"]'].map((selector) => {
      const element = root.querySelector<HTMLElement>(selector);
      if (!element) return null;

      const textNode = Array.from(element.childNodes).find((node) => node.nodeType === 3);
      if (!textNode) return null;

      const elementRect = element.getBoundingClientRect();
      const textRange = document.createRange();
      textRange.selectNodeContents(textNode);
      const textRect = textRange.getBoundingClientRect();

      return {
        elementBottom: elementRect.bottom,
        elementHeight: elementRect.height,
        elementTop: elementRect.top,
        scrollHeight: element.scrollHeight,
        selector,
        textBottom: textRect.bottom,
        textTop: textRect.top,
      };
    })
  );

  for (const metrics of textMetrics) {
    expect(metrics).not.toBeNull();
    if (!metrics) continue;

    expect(metrics.textTop, `${metrics.selector} 顶部字形不应被裁切`).toBeGreaterThanOrEqual(
      metrics.elementTop - 0.5
    );
    expect(metrics.textBottom, `${metrics.selector} 底部字形不应被裁切`).toBeLessThanOrEqual(
      metrics.elementBottom + 0.5
    );
    expect(metrics.scrollHeight, `${metrics.selector} 应有足够的垂直行盒`).toBeLessThanOrEqual(
      Math.ceil(metrics.elementHeight)
    );
  }
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

test.describe("中央信息字体度量", () => {
  test.use({ deviceScaleFactor: 1.5 });

  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 390, height: 844 },
    { width: 320, height: 568 },
  ]) {
    test(`中央信息：DPR 1.5 的 ${viewport.width}×${viewport.height} 混合字体不被垂直裁切`, async ({
      page,
    }) => {
      await page.emulateMedia({ reducedMotion: "reduce" });
      await page.setViewportSize(viewport);
      await page.addInitScript(() => {
        localStorage.setItem("immersive-clock:has-seen-tour", "true");
      });
      await page.goto("/study");

      const statusRoot = page.getByRole("progressbar", { name: "今日进度" }).locator("..");
      await expect(statusRoot.locator('[class*="stageText"]')).toBeVisible();
      await expect(statusRoot.locator('[class*="remainingTime"]')).toBeVisible();

      await expectInfoTextFitsVertically(statusRoot);
      await expectStatusColumnsDoNotOverlap(statusRoot);
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)
      ).toBe(true);
    });
  }
});

test("中央信息：取消不保存，自定义消息保存后可重载", async ({ page }) => {
  await page.goto("/");

  let dialog = await openStudyDisplaySettings(page);
  await addStudyInfo(page, dialog, "新建自定义文案");
  await dialog.getByLabel("文案内容").fill("这条消息不应保存");
  await dialog.getByRole("button", { name: "取消" }).click();
  await expect(dialog).toBeHidden();

  dialog = await openStudyDisplaySettings(page);
  await expect(dialog.getByLabel("文案内容")).toHaveCount(0);
  await dialog.getByRole("button", { name: "移出24 小时进度" }).click();
  await addStudyInfo(page, dialog, "新建自定义文案");
  await dialog.getByLabel("文案内容").fill("记得完成今日复盘");
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
  await dialog.getByRole("button", { name: "配置记得完成今日复盘" }).click();
  await expect(dialog.getByLabel("文案内容")).toHaveValue("记得完成今日复盘");
});

test("中央信息：隐藏天气组件后仍显示共享快照中的降雨主次信息", async ({ page }) => {
  await page.addInitScript((appVersion) => {
    const now = Date.now();
    const rainStartAt = now + 8 * 60 * 1000;
    const rainEndAt = rainStartAt + 10 * 60 * 1000;
    localStorage.setItem("immersive-clock:has-seen-tour", "true");
    localStorage.setItem(
      "AppSettings",
      JSON.stringify({
        version: 4,
        general: {
          announcement: {
            hideUntil: now + 7 * 24 * 60 * 60 * 1000,
            version: appVersion,
          },
        },
        study: {
          display: {
            showWeather: false,
            showNoiseMonitor: false,
            showCountdown: false,
          },
          infoCarousel: {
            intervalSec: 6,
            items: [
              {
                id: "rain-default",
                source: "rain",
                backgroundProgressKind: "day",
                leadMinutes: 30,
                enabled: true,
                order: 0,
              },
            ],
          },
        },
      })
    );
    localStorage.setItem(
      "weather-cache",
      JSON.stringify({
        version: 2,
        activeLocation: {
          city: {
            lat: 31.2,
            locationKey: "weathercn:101020100",
            lon: 121.5,
            name: "上海市",
          },
          coords: { lat: 31.2, lon: 121.5 },
          mode: "auto",
          resolvedAt: now,
          source: "browser",
        },
        coords: { lat: 31.2, lon: 121.5, source: "e2e", updatedAt: now },
        now: {
          data: { code: "200", now: { temp: "26", text: "多云" } },
          updatedAt: now,
        },
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
          location: "121.5000,31.2000",
          updatedAt: now,
          lastApiFetchAt: now,
        },
      })
    );
  }, CURRENT_APP_VERSION);
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

test("中央信息：隐藏天气组件后天气预警逐条轮播且不打断当前信息", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.setViewportSize({ width: 320, height: 568 });
  const now = Date.now();
  await page.route("**/api/xiaomi-weather/wtr-v3/location/city/geo?*", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify([{ locationKey: "weathercn:101270101", name: "成都" }]),
    });
  });
  await page.route("**/api/xiaomi-weather/wtr-v3/weather/all?*", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        alerts: [
          {
            alertId: "orange-alert",
            detail: "请注意防范短时强降水。",
            level: "橙色",
            pubTime: now - 20 * 60 * 1000,
            title: "青羊区暴雨橙色预警",
            type: "暴雨",
          },
          {
            alertId: "yellow-alert",
            detail: "请注意防范雷电活动。",
            level: "黄色",
            pubTime: now - 5 * 60 * 1000,
            title: "青羊区雷电黄色预警",
            type: "雷电",
          },
        ],
        current: {
          feelsLike: { unit: "℃", value: "27" },
          humidity: { unit: "%", value: "60" },
          pressure: { unit: "hPa", value: "1008" },
          pubTime: now,
          temperature: { unit: "℃", value: "26" },
          visibility: { unit: "km", value: "10" },
          weather: "0",
          wind: {
            direction: { unit: "°", value: "90" },
            speed: { unit: "km/h", value: "4" },
          },
        },
        forecastDaily: {
          sunRiseSet: { value: [{ from: "05:01", to: "18:59" }] },
          temperature: { value: [{ from: "30", to: "22" }] },
          weather: { value: [{ from: "0", to: "1" }] },
        },
        minutely: {
          new: "study-alerts-e2e",
          precipitation: {
            fxTime: [
              new Date(now + 60_000).toISOString(),
              new Date(now + 120_000).toISOString(),
            ],
            interval: 1,
            pubTime: new Date(now).toISOString(),
            status: 0,
            value: [0, 0],
          },
          status: 0,
        },
        status: 0,
        updateTime: now,
      }),
    });
  });
  await page.addInitScript(
    ({ appVersion, seededAt }) => {
      localStorage.setItem("immersive-clock:has-seen-tour", "true");
      localStorage.setItem(
        "AppSettings",
        JSON.stringify({
          version: 5,
          general: {
            announcement: {
              hideUntil: seededAt + 7 * 24 * 60 * 60 * 1000,
              version: appVersion,
            },
            weather: {
              locationMode: "manual",
              manualLocation: {
                query: "成都",
                selected: {
                  affiliation: "四川省",
                  lat: 30.67,
                  locationKey: "weathercn:101270101",
                  lon: 104.06,
                  name: "成都市",
                },
              },
            },
          },
          study: {
            display: {
              showWeather: false,
              showNoiseMonitor: false,
              showCountdown: false,
            },
            infoCarousel: {
              intervalSec: 30,
              items: [
                {
                  id: "custom-before-alerts",
                  source: "custom",
                  backgroundProgressKind: "day",
                  enabled: true,
                  order: 0,
                  text: "继续专注",
                },
                {
                  id: "weather-alert-default",
                  source: "weatherAlert",
                  backgroundProgressKind: "day",
                  enabled: true,
                  order: 1,
                },
              ],
            },
          },
        })
      );
      localStorage.setItem(
        "weather-cache",
        JSON.stringify({
          version: 2,
          activeLocation: {
            city: {
              affiliation: "四川省",
              lat: 30.67,
              locationKey: "weathercn:101270101",
              lon: 104.06,
              name: "成都市",
            },
            coords: { lat: 30.67, lon: 104.06 },
            mode: "manual",
            resolvedAt: seededAt,
            source: "manual_city",
          },
          coords: { lat: 30.67, lon: 104.06, source: "manual_city", updatedAt: seededAt },
        })
      );
    },
    { appVersion: CURRENT_APP_VERSION, seededAt: now }
  );

  await page.goto("/study");
  await showHud(page);

  const statusRoot = page.getByRole("progressbar", { name: "今日进度" }).locator("..");
  await expect(page.getByLabel("天气")).toHaveCount(0);
  await expect(statusRoot.locator('[class*="stageText"]')).toHaveText("继续专注");
  await expect(page.getByRole("button", { name: "继续专注" })).toBeVisible();

  await page.getByRole("button", { name: "继续专注" }).click();
  const orangeAlert = page.getByRole("button", { name: /青羊区暴雨橙色预警/ });
  await expect(orangeAlert).toBeVisible();
  await expect(orangeAlert).toContainText("短时强降水，注意防范");
  await orangeAlert.click();
  const yellowAlert = page.getByRole("button", { name: /青羊区雷电黄色预警/ });
  await expect(yellowAlert).toBeVisible();
  await expect(yellowAlert).toContainText("雷电活动，注意防范");
  await expectStatusColumnsDoNotOverlap(statusRoot);
});

test("中央信息：正在下雨打断后继续轮播普通信息", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.addInitScript((appVersion) => {
    const now = Date.now();
    const rainEndAt = now + 10 * 60 * 1000;
    localStorage.setItem("immersive-clock:has-seen-tour", "true");
    localStorage.setItem(
      "AppSettings",
      JSON.stringify({
        version: 4,
        general: {
          announcement: {
            hideUntil: now + 7 * 24 * 60 * 60 * 1000,
            version: appVersion,
          },
        },
        study: {
          display: {
            showWeather: false,
            showNoiseMonitor: false,
            showCountdown: false,
          },
          infoCarousel: {
            intervalSec: 3,
            items: [
              {
                id: "rain-active",
                source: "rain",
                backgroundProgressKind: "day",
                leadMinutes: 30,
                enabled: true,
                order: 0,
              },
              {
                id: "custom-after-rain",
                source: "custom",
                backgroundProgressKind: "day",
                enabled: true,
                order: 1,
                text: "继续专注",
              },
            ],
          },
        },
      })
    );
    localStorage.setItem(
      "weather-cache",
      JSON.stringify({
        version: 2,
        activeLocation: {
          city: {
            lat: 31.2,
            locationKey: "weathercn:101020100",
            lon: 121.5,
            name: "上海市",
          },
          coords: { lat: 31.2, lon: 121.5 },
          mode: "auto",
          resolvedAt: now,
          source: "browser",
        },
        coords: { lat: 31.2, lon: 121.5, source: "e2e", updatedAt: now },
        now: {
          data: { code: "200", now: { temp: "26", text: "中雨" } },
          updatedAt: now,
        },
        minutely: {
          data: {
            code: "200",
            updateTime: new Date(now).toISOString(),
            summary: "正在下雨",
            minutely: [
              { fxTime: new Date(now).toISOString(), precip: "0.2" },
              { fxTime: new Date(now + 5 * 60 * 1000).toISOString(), precip: "0.2" },
              { fxTime: new Date(rainEndAt).toISOString(), precip: "0" },
            ],
          },
          location: "121.5000,31.2000",
          updatedAt: now,
          lastApiFetchAt: now,
        },
      })
    );
  }, CURRENT_APP_VERSION);

  await page.goto("/study");

  const statusRoot = page.getByRole("progressbar", { name: "今日进度" }).locator("..");
  const stageText = statusRoot.locator('[class*="stageText"]');
  await expect(stageText).toHaveText("正在中雨");
  await expect(page.locator('[class*="liveRegion"]')).toHaveText("继续专注", { timeout: 10000 });
});

test("中央信息：到达降雨开始时间后立即切换为正在下雨", async ({ page }) => {
  await page.addInitScript((appVersion) => {
    const now = Date.now();
    const rainStartAt = now + 4 * 1000;
    const rainEndAt = rainStartAt + 10 * 60 * 1000;
    localStorage.setItem("immersive-clock:has-seen-tour", "true");
    localStorage.setItem(
      "AppSettings",
      JSON.stringify({
        version: 4,
        general: {
          announcement: {
            hideUntil: now + 7 * 24 * 60 * 60 * 1000,
            version: appVersion,
          },
        },
        study: {
          display: {
            showWeather: false,
            showNoiseMonitor: false,
            showCountdown: false,
          },
          infoCarousel: {
            intervalSec: 6,
            items: [
              {
                id: "rain-boundary",
                source: "rain",
                backgroundProgressKind: "day",
                leadMinutes: 30,
                enabled: true,
                order: 0,
              },
            ],
          },
        },
      })
    );
    localStorage.setItem(
      "weather-cache",
      JSON.stringify({
        version: 2,
        activeLocation: {
          city: {
            lat: 31.2,
            locationKey: "weathercn:101020100",
            lon: 121.5,
            name: "上海市",
          },
          coords: { lat: 31.2, lon: 121.5 },
          mode: "auto",
          resolvedAt: now,
          source: "browser",
        },
        coords: { lat: 31.2, lon: 121.5, source: "e2e", updatedAt: now },
        now: {
          data: { code: "200", now: { temp: "26", text: "多云" } },
          updatedAt: now,
        },
        minutely: {
          data: {
            code: "200",
            updateTime: new Date(now).toISOString(),
            summary: "即将有雨",
            minutely: [
              { fxTime: new Date(now).toISOString(), precip: "0" },
              { fxTime: new Date(rainStartAt).toISOString(), precip: "0.2" },
              { fxTime: new Date(rainEndAt).toISOString(), precip: "0" },
            ],
          },
          location: "121.5000,31.2000",
          updatedAt: now,
          lastApiFetchAt: now,
        },
      })
    );
  }, CURRENT_APP_VERSION);

  await page.goto("/study");

  const statusRoot = page.getByRole("progressbar", { name: "今日进度" }).locator("..");
  const stageText = statusRoot.locator('[class*="stageText"]');
  await expect(stageText).toHaveText("预计 1 分钟后下雨");
  await expect(page.getByText("正在中雨", { exact: true })).toBeVisible({ timeout: 7000 });
});

for (const viewport of [
  { width: 1440, height: 900 },
  { width: 390, height: 844 },
  { width: 320, height: 568 },
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
            version: 4,
            study: {
              display: {
                showWeather: false,
                showNoiseMonitor: false,
                showCountdown: false,
              },
              infoCarousel: {
                intervalSec: 6,
                items: [
                  {
                    id: "custom-long-first",
                    source: "custom",
                    backgroundProgressKind: "day",
                    enabled: true,
                    order: 0,
                    text: first,
                  },
                  {
                    id: "custom-long-second",
                    source: "custom",
                    backgroundProgressKind: "day",
                    enabled: true,
                    order: 1,
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
