import { expect, test, type Locator, type Page } from "@playwright/test";

import { showHud } from "./e2eUtils";

async function openStudySettings(page: Parameters<typeof showHud>[0]) {
  await showHud(page);
  const tablist = page.getByRole("tablist", { name: "选择时钟模式" });
  await tablist.getByRole("tab", { name: /自习/ }).click();

  const automaticReport = page.getByRole("dialog", { name: /统计报告/ });
  try {
    await automaticReport.waitFor({ state: "visible", timeout: 1000 });
    await page.keyboard.press("Escape");
    await expect(automaticReport).toBeHidden();
  } catch {
    // 当前时间不在课时结算点时不会出现自动报告。
  }

  await page.getByRole("button", { name: "打开设置" }).click();

  const dialog = page.getByRole("dialog", { name: "设置" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("button", { name: "常用工作台" })).toBeVisible();
  if ((page.viewportSize()?.width ?? 1280) <= 720) {
    await expect(dialog.getByRole("navigation", { name: "设置紧凑导航" })).toBeVisible();
    await expect(dialog.getByRole("heading", { name: "启动页面", level: 2 })).toBeVisible();
  } else {
    await expect(dialog.getByRole("button", { name: "启动页面" })).toBeVisible();
  }

  return dialog;
}

async function addStudyInfo(page: Page, dialog: Locator, optionName: string) {
  await dialog.getByRole("button", { name: "添加信息" }).click();
  await page.getByRole("option", { name: optionName, exact: false }).click();
}

async function openEnvironmentSettingsPage(page: Page, dialog: Locator, pageName: string) {
  if ((page.viewportSize()?.width ?? 1280) <= 720) {
    const compactNavigation = dialog.getByRole("navigation", { name: "设置紧凑导航" });
    await compactNavigation.getByRole("button", { name: "环境提醒" }).click();
    await dialog
      .getByRole("navigation", { name: "环境提醒子分类" })
      .getByRole("button", { name: pageName })
      .click();
    await expect(dialog.locator("#settings-compact-submenu")).toHaveCount(0);
    return;
  }

  const sectionButton = dialog.getByRole("button", { name: pageName });
  if (!(await sectionButton.isVisible())) {
    await dialog.getByRole("button", { name: "环境提醒" }).click();
  }
  await sectionButton.click();
}

async function waitForAnimations(locator: Locator) {
  await locator.evaluate(async (element) => {
    await Promise.all(
      element
        .getAnimations({ subtree: true })
        .map((animation) => animation.finished.catch(() => undefined))
    );
  });
}

async function expectSettingsFooterDocked(dialog: Locator) {
  const geometry = await dialog.locator("#settings-panel-container").evaluate((shell) => {
    const footer = shell.querySelector("footer");
    const body = footer?.previousElementSibling;
    const main = footer?.parentElement;
    if (!(footer instanceof HTMLElement) || !(body instanceof HTMLElement) || !main) return null;

    const footerRect = footer.getBoundingClientRect();
    const bodyRect = body.getBoundingClientRect();
    const mainRect = main.getBoundingClientRect();
    return {
      bodyBottom: bodyRect.bottom,
      footerBottomGap: mainRect.bottom - footerRect.bottom,
      footerHeight: footerRect.height,
      footerTop: footerRect.top,
    };
  });

  expect(geometry).not.toBeNull();
  expect(geometry?.footerHeight ?? Number.POSITIVE_INFINITY).toBeLessThanOrEqual(96);
  expect(Math.abs(geometry?.footerBottomGap ?? Number.POSITIVE_INFINITY)).toBeLessThanOrEqual(1);
  expect(geometry?.bodyBottom ?? Number.POSITIVE_INFINITY).toBeLessThanOrEqual(
    (geometry?.footerTop ?? Number.NEGATIVE_INFINITY) + 1
  );
}

async function mockExternalQuoteRequests(page: Page) {
  const hitokotoBody = JSON.stringify({
    uuid: "settings-e2e-quote",
    hitokoto: "专注当下，稳步前行。",
    from_who: "测试作者",
    from: "设置页测试",
  });
  await page.route("https://v1.hitokoto.cn/**", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: hitokotoBody })
  );
  await page.route("https://international.v1.hitokoto.cn/**", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: hitokotoBody })
  );
  await page.route("https://sdk.jinrishici.com/v2/browser/jinrishici.js", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/javascript",
      body: `window.jinrishici = {
        load(callback) {
          callback({
            status: "success",
            data: {
              id: "settings-e2e-poem",
              content: "行到水穷处，坐看云起时。",
              origin: { dynasty: "唐", author: "王维", title: "终南别业" }
            }
          });
        }
      };`,
    })
  );
  await page.route("https://api.adviceslip.com/advice", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ slip: { id: 1, advice: "Take the next small step." } }),
    })
  );
}

async function seedMinutelyWeatherSettings(page: Page) {
  await page.addInitScript(() => {
    if (sessionStorage.getItem("weather-settings-e2e-seeded") === "1") return;
    sessionStorage.setItem("weather-settings-e2e-seeded", "1");
    const now = Date.now();
    const rainStartAt = now + 15 * 60 * 1000;
    const rainEndAt = rainStartAt + 20 * 60 * 1000;
    localStorage.setItem(
      "AppSettings",
      JSON.stringify({
        version: 4,
        study: {
          alerts: { minutelyPrecip: true },
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
                backgroundProgressKind: "schedule",
                leadMinutes: 60,
                enabled: false,
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
            affiliation: "上海市",
            lat: 31.2,
            locationKey: "weathercn:101020100",
            lon: 121.5,
            name: "上海市",
          },
          coords: { accuracy: 18, lat: 31.2, lon: 121.5 },
          mode: "auto",
          resolvedAt: now,
          source: "browser",
        },
        coords: { lat: 31.2, lon: 121.5, source: "e2e", updatedAt: now },
        now: {
          data: {
            code: "200",
            now: {
              feelsLike: "30",
              humidity: "0",
              obsTime: new Date(now).toISOString(),
              pressure: "1008",
              temp: "28",
              text: "多云",
              uvIndex: "0",
              vis: "",
              wind360: "188",
              windDir: "南风",
              windSpeed: "2",
            },
          },
          updatedAt: now,
        },
        details: {
          data: {
            airQuality: {
              aqi: "50",
              category: "优",
              pollutants: [
                { code: "pm25", description: "细颗粒物", unit: "μg/m3", value: "0" },
                { code: "pm10", description: "可吸入颗粒物", unit: "μg/m3", value: "40" },
                { code: "so2", description: "二氧化硫", unit: "μg/m3", value: "6" },
                { code: "no2", description: "二氧化氮", unit: "μg/m3", value: "19" },
                { code: "o3", description: "臭氧", unit: "μg/m3", value: "140" },
                { code: "co", description: "一氧化碳", unit: "mg/m3", value: "0.5" },
              ],
              primary: "pm25",
              publishedAt: new Date(now - 60 * 60 * 1000).toISOString(),
              source: "E2E 监测站",
              suggestion: "适宜户外活动",
            },
            alerts: [
              {
                defenses: [{ icon: "shield", text: "减少外出" }],
                detail: "注意防范短时强降水",
                id: "e2e-alert",
                images: ["alert-icon.png", "alert-notice.png"],
                level: "蓝色",
                locationKey: "weathercn:101020100",
                publishedAt: new Date(now - 30 * 60 * 1000).toISOString(),
                title: "暴雨蓝色预警",
                type: "暴雨",
              },
            ],
            brands: [
              {
                brandId: "weathercn",
                logo: "weathercn.png",
                names: { zh_CN: "中国天气" },
                url: "https://example.com/weathercn",
              },
            ],
            code: "200",
            current: {
              feelsLike: { unit: "℃", value: "30" },
              humidity: { unit: "%", value: "0" },
              observationTime: new Date(now).toISOString(),
              pressure: { unit: "hPa", value: "1008" },
              temperature: { unit: "℃", value: "28" },
              uvIndex: "0",
              visibility: { unit: "km", value: "" },
              weatherCode: "1",
              weatherText: "多云",
              windDirection: { unit: "°", value: "188" },
              windDirectionText: "南风",
              windSpeed: { unit: "km/h", value: "2" },
            },
            daily: [
              {
                aqi: "45",
                date: "2026-07-17",
                precipitationProbability: "0",
                sunrise: "2026-07-17T05:01:00+08:00",
                sunset: "2026-07-17T18:59:00+08:00",
                temperatureMax: { unit: "℃", value: "35" },
                temperatureMin: { unit: "℃", value: "27" },
                weatherCodeDay: "1",
                weatherCodeNight: "2",
                weatherTextDay: "多云",
                weatherTextNight: "阴",
                windDirectionDay: { unit: "°", value: "90" },
                windDirectionDayText: "东风",
                windDirectionNight: { unit: "°", value: "180" },
                windDirectionNightText: "南风",
                windSpeedDay: { unit: "km/h", value: "5" },
                windSpeedNight: { unit: "km/h", value: "8" },
              },
              {
                aqi: "46",
                date: "2026-07-18",
                precipitationProbability: "80",
                temperatureMax: { unit: "℃", value: "34" },
                temperatureMin: { unit: "℃", value: "26" },
                weatherTextDay: "小雨",
                weatherTextNight: "中雨",
              },
              {
                aqi: "47",
                date: "2026-07-19",
                precipitationProbability: "20",
                temperatureMax: { unit: "℃", value: "33" },
                temperatureMin: { unit: "℃", value: "25" },
                weatherTextDay: "阴",
                weatherTextNight: "多云",
              },
            ],
            embeddedMinutely: {
              new: "embedded-v2",
              precipitation: {
                description: "全量接口分钟回退",
                probability: [30, 70],
                pubTime: new Date(now).toISOString(),
                status: 0,
                value: [0, 0.3],
              },
              status: 0,
            },
            hourly: [
              {
                aqi: "40",
                forecastTime: "2026-07-17T10:00:00+08:00",
                temperature: { unit: "℃", value: "28" },
                weatherText: "多云",
                windDirectionText: "南风",
                windSpeed: { unit: "km/h", value: "2" },
              },
              {
                aqi: "41",
                forecastTime: "2026-07-17T11:00:00+08:00",
                temperature: { unit: "℃", value: "29" },
                weatherText: "阴",
              },
              {
                aqi: "42",
                forecastTime: "2026-07-17T12:00:00+08:00",
                temperature: { unit: "℃", value: "30" },
                weatherText: "小雨",
              },
              {
                aqi: "43",
                forecastTime: "2026-07-17T13:00:00+08:00",
                temperature: { unit: "℃", value: "31" },
                weatherText: "中雨",
              },
            ],
            indices: [
              { type: "uvIndex", value: "0" },
              { type: "carWash", value: "" },
              { type: "sports", value: "较适宜" },
            ],
            previousHours: [
              {
                observationTime: new Date(now - 60 * 60 * 1000).toISOString(),
                temperature: { unit: "℃", value: "27" },
                weatherText: "晴",
              },
            ],
            raw: {
              minutely: {
                new: "embedded-v2",
                precipitation: { status: 0, value: [0, 0.3] },
                status: 0,
              },
              sourceMaps: {
                current: { temperature: "weathercn" },
                rawSentinel: "weather-all-e2e",
              },
              status: 0,
              updateTime: new Date(now).toISOString(),
            },
            technical: {
              channels: [{ type: "CWA6" }],
              sourceMaps: {
                current: { temperature: "weathercn" },
                rawSentinel: "weather-all-e2e",
              },
              statuses: { airQuality: 0, daily: 0, hourly: 0, response: 0 },
              units: { currentTemperature: "℃", dailyWindSpeed: "km/h" },
              urls: {
                caiyun: "https://example.com/caiyun",
                weathercn: "https://example.com/weathercn",
              },
            },
            typhoons: [{ name: "测试台风", status: "active" }],
            updateTime: new Date(now).toISOString(),
            yesterday: {
              aqi: "46",
              date: "2026-07-16",
              temperatureMax: { unit: "℃", value: "36" },
              temperatureMin: { unit: "℃", value: "28" },
              weatherTextEnd: "阴",
              weatherTextStart: "晴",
            },
          },
          location: "121.5000,31.2000",
          updatedAt: now,
        },
        minutely: {
          data: {
            code: "200",
            updateTime: new Date(now).toISOString(),
            summary: "即将有雨",
            minutely: [
              { fxTime: new Date(now + 60 * 1000).toISOString(), precip: "0" },
              { fxTime: new Date(rainStartAt).toISOString(), precip: "0.2" },
              { fxTime: new Date(rainStartAt + 10 * 60 * 1000).toISOString(), precip: "0.3" },
              { fxTime: new Date(rainEndAt).toISOString(), precip: "0" },
            ],
            provider: {
              description: "分钟接口完整描述",
              flags: {
                isModify: false,
                isShow: true,
                precipitationStatus: 0,
                responseStatus: 0,
                version: "minute-e2e-v1",
              },
              headDescription: "十五分钟后有小雨",
              interval: 1,
              probability: [20, 80],
              rainRemainingMinutes: 8,
              raw: {
                new: "minute-raw-e2e",
                precipitation: {
                  description: "分钟接口完整描述",
                  status: 0,
                  value: [0, 0.2, 0.3, 0],
                },
                status: 0,
              },
              shortDescription: "即将有雨",
              subtitle: "出门请带伞",
              weatherCode: "7",
            },
          },
          location: "121.5000,31.2000",
          updatedAt: now,
          lastApiFetchAt: now,
        },
      })
    );
  });
}

/** 端到端用例：验证设置保存后写入本地存储且刷新后仍生效（函数级注释） */
test("设置持久化：修改目标年份并保存", async ({ page }) => {
  await page.goto("/");

  const dialog = await openStudySettings(page);
  await dialog.getByRole("button", { name: "倒计时", exact: true }).click();

  await dialog.getByRole("radio", { name: "高考" }).check({ force: true });

  const targetYearInput = dialog.getByLabel("年份");
  await targetYearInput.fill("2029");

  await dialog.getByRole("button", { name: "保存" }).click();

  const storedYear = await page.evaluate(() => {
    const raw = localStorage.getItem("AppSettings");
    if (!raw) return null;
    try {
      return JSON.parse(raw)?.study?.targetYear ?? null;
    } catch {
      return null;
    }
  });
  expect(storedYear).toBe(2029);

  await page.reload();
  const storedYearAfterReload = await page.evaluate(() => {
    const raw = localStorage.getItem("AppSettings");
    if (!raw) return null;
    try {
      return JSON.parse(raw)?.study?.targetYear ?? null;
    } catch {
      return null;
    }
  });
  expect(storedYearAfterReload).toBe(2029);
});

test("自习显示：进度信息与天气可独立控制并持久化", async ({ page }) => {
  await page.goto("/");
  const studyMain = page.getByRole("main", { name: "时钟应用主界面" });
  const weatherDisplay = studyMain.getByLabel("天气", { exact: true });

  let dialog = await openStudySettings(page);
  await dialog.getByRole("button", { name: "自习显示" }).click();

  const weatherSwitch = dialog.getByRole("switch", { name: "天气" });
  const removeDayProgress = dialog.getByRole("button", { name: "移出24 小时进度" });
  await expect(removeDayProgress).toBeVisible();
  await expect(weatherSwitch).toBeChecked();
  await removeDayProgress.click();
  await dialog.getByRole("button", { name: "保存" }).click();

  await expect(page.getByRole("progressbar")).toHaveCount(0);
  await expect(weatherDisplay).toBeVisible();

  await page.reload();
  dialog = await openStudySettings(page);
  await dialog.getByRole("button", { name: "自习显示" }).click();
  await expect(dialog.getByRole("button", { name: "移出24 小时进度" })).toHaveCount(0);
  await expect(dialog.getByRole("switch", { name: "天气" })).toBeChecked();
  await addStudyInfo(page, dialog, "24 小时进度");
  await dialog.getByRole("switch", { name: "天气" }).click();
  await dialog.getByRole("button", { name: "保存" }).click();

  await expect(page.getByRole("progressbar")).toBeVisible();
  await expect(weatherDisplay).toBeHidden();
});

test("自习显示：进度条目取消不保存并可持久化课时进度", async ({ page }) => {
  await page.goto("/");

  let dialog = await openStudySettings(page);
  await dialog.getByRole("button", { name: "自习显示" }).click();
  await expect(dialog.getByRole("button", { name: "移出24 小时进度" })).toBeVisible();
  await addStudyInfo(page, dialog, "课时/课间进度");
  await dialog.getByRole("button", { name: "移出24 小时进度" }).click();
  await dialog.getByRole("button", { name: "取消" }).click();

  expect(
    await page.evaluate(() => {
      const raw = localStorage.getItem("AppSettings");
      const items = raw ? (JSON.parse(raw)?.study?.infoCarousel?.items ?? []) : [];
      return items
        .filter(
          (item: { source?: string; enabled?: boolean }) =>
            item.source === "progress" && item.enabled
        )
        .map((item: { progressKind?: string }) => item.progressKind);
    })
  ).toEqual(["day"]);

  dialog = await openStudySettings(page);
  await dialog.getByRole("button", { name: "自习显示" }).click();
  await expect(dialog.getByRole("button", { name: "移出24 小时进度" })).toBeVisible();
  await addStudyInfo(page, dialog, "课时/课间进度");
  await dialog.getByRole("button", { name: "移出24 小时进度" }).click();
  await dialog.getByRole("button", { name: "保存" }).click();

  await expect(page.getByRole("progressbar", { name: "课时进度" })).toBeVisible();

  expect(
    await page.evaluate(() => {
      const raw = localStorage.getItem("AppSettings");
      const items = raw ? (JSON.parse(raw)?.study?.infoCarousel?.items ?? []) : [];
      return items
        .filter(
          (item: { source?: string; enabled?: boolean }) =>
            item.source === "progress" && item.enabled
        )
        .map((item: { progressKind?: string }) => item.progressKind);
    })
  ).toEqual(["schedule"]);

  await page.reload();
  dialog = await openStudySettings(page);
  await dialog.getByRole("button", { name: "自习显示" }).click();
  await expect(dialog.getByRole("button", { name: "移出课时/课间进度" })).toBeVisible();
});

test("自习显示：天气预警独立添加、取消和保存背景进度", async ({ page }) => {
  await page.goto("/");

  let dialog = await openStudySettings(page);
  await dialog.getByRole("button", { name: "自习显示" }).click();
  await addStudyInfo(page, dialog, "天气预警");
  await dialog.getByRole("button", { name: "配置天气预警" }).click();
  await dialog.getByRole("button", { name: "背景进度" }).click();
  await page.getByRole("option", { name: "课时/课间进度", exact: true }).last().click();
  await dialog.getByRole("button", { name: "取消" }).click();

  expect(
    await page.evaluate(() => {
      const raw = localStorage.getItem("AppSettings");
      const items = raw ? (JSON.parse(raw)?.study?.infoCarousel?.items ?? []) : [];
      return items.find((item: { source?: string }) => item.source === "weatherAlert")?.enabled;
    })
  ).not.toBe(true);

  dialog = await openStudySettings(page);
  await dialog.getByRole("button", { name: "自习显示" }).click();
  await addStudyInfo(page, dialog, "天气预警");
  await dialog.getByRole("button", { name: "配置天气预警" }).click();
  await dialog.getByRole("button", { name: "背景进度" }).click();
  await page.getByRole("option", { name: "课时/课间进度", exact: true }).last().click();
  await dialog.getByRole("button", { name: "保存" }).click();

  expect(
    await page.evaluate(() => {
      const raw = localStorage.getItem("AppSettings");
      const items = raw ? (JSON.parse(raw)?.study?.infoCarousel?.items ?? []) : [];
      return items.find((item: { source?: string }) => item.source === "weatherAlert");
    })
  ).toMatchObject({
    enabled: true,
    backgroundProgressKind: "schedule",
  });

  await page.reload();
  dialog = await openStudySettings(page);
  await dialog.getByRole("button", { name: "自习显示" }).click();
  await expect(dialog.getByRole("button", { name: "移出天气预警" })).toBeVisible();
});

test("天气设置：移除分钟降水弹窗并在天气数据保留完整数据", async ({ page }) => {
  await seedMinutelyWeatherSettings(page);
  await page.goto("/");

  const dialog = await openStudySettings(page);
  await openEnvironmentSettingsPage(page, dialog, "天气服务");
  await expect(dialog.getByRole("switch", { name: "分钟级降水提醒" })).toHaveCount(0);

  const migrated = await page.evaluate(() => {
    const raw = localStorage.getItem("AppSettings");
    const settings = raw ? JSON.parse(raw) : null;
    return {
      version: settings?.version,
      hasSchedule: Object.prototype.hasOwnProperty.call(
        settings?.general?.weather ?? {},
        "schedule"
      ),
      hasLegacyField: Object.prototype.hasOwnProperty.call(
        settings?.study?.alerts ?? {},
        "minutelyPrecip"
      ),
      rain: settings?.study?.infoCarousel?.items?.find(
        (item: { source?: string }) => item.source === "rain"
      ),
    };
  });
  expect(migrated).toMatchObject({
    version: 10,
    hasSchedule: false,
    hasLegacyField: false,
    rain: {
      backgroundProgressKind: "schedule",
      leadMinutes: 60,
      enabled: false,
      order: 0,
    },
  });

  await dialog
    .getByRole("tablist", { name: "天气服务分类" })
    .getByRole("tab", { name: "数据" })
    .click();
  const weatherTabs = dialog.getByRole("tablist", { name: "天气数据分类" });
  await expect(weatherTabs.getByRole("tab")).toHaveCount(7);
  await weatherTabs.getByRole("tab", { name: "分钟" }).click();
  await expect(dialog.locator("#weather-live-panel-minutely")).toHaveAttribute(
    "aria-labelledby",
    "weather-live-tabs-tab-minutely"
  );
  await expect(dialog.getByText("十五分钟后有小雨")).toBeVisible();
  await expect(dialog.getByText("20 / 80")).toBeVisible();
  await expect(dialog.getByText("50%")).toBeVisible();
  await expect(dialog.getByText("20 分钟")).toBeVisible();
  await expect(dialog.getByText("0.5 mm")).toBeVisible();
  await expect(dialog.getByRole("region", { name: "全部分钟降水样本" })).toContainText("0.3 mm");
});

test("天气设置：更新状态只读并使用固定自适应调度", async ({ page }) => {
  await seedMinutelyWeatherSettings(page);
  await page.goto("/");

  const dialog = await openStudySettings(page);
  await openEnvironmentSettingsPage(page, dialog, "天气服务");
  await dialog
    .getByRole("tablist", { name: "天气服务分类" })
    .getByRole("tab", { name: "更新" })
    .click();
  await expect(dialog.getByRole("heading", { name: "天气更新" })).toBeVisible();
  await expect(dialog.getByText(/前台全量天气每 10 分钟/)).toBeVisible();
  await expect(dialog.getByText("内部请求保护已启用")).toBeVisible();
  await expect(dialog.getByRole("button", { name: "刷新天气" })).toBeVisible();
  await expect(dialog.getByRole("radiogroup", { name: "刷新档位" })).toHaveCount(0);
  await expect(dialog.getByLabel("最小请求间隔")).toHaveCount(0);
  expect(
    await page.evaluate(() => {
      const raw = localStorage.getItem("AppSettings");
      return raw ? JSON.parse(raw)?.general?.weather?.schedule : undefined;
    })
  ).toBeUndefined();
});

test("定位设置：手动城市必须搜索并选择小米候选", async ({ page }) => {
  await seedMinutelyWeatherSettings(page);
  await page.route("**/api/xiaomi-weather/wtr-v3/**", async (route) => {
    const url = route.request().url();
    if (url.includes("/location/city/search?")) {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify([
          {
            affiliation: "浙江省",
            latitude: "30.2741",
            locationKey: "weathercn:101210101",
            longitude: "120.1551",
            name: "杭州市",
          },
          {
            affiliation: "湖北省",
            latitude: "30.3000",
            locationKey: "weathercn:101200101",
            longitude: "120.2000",
            name: "杭州区",
          },
        ]),
      });
      return;
    }
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        alerts: [],
        current: { pubTime: Date.now(), temperature: { value: "26" }, weather: "0" },
        forecastDaily: { sunRiseSet: { value: [{ from: "05:00", to: "19:00" }] } },
        status: 0,
        updateTime: Date.now(),
      }),
    });
  });
  await page.goto("/");

  const dialog = await openStudySettings(page);
  await openEnvironmentSettingsPage(page, dialog, "定位服务");
  await dialog.getByRole("radio", { name: "手动城市" }).click();
  await dialog.getByLabel("城市名称").fill("杭州");
  await dialog.getByRole("button", { name: "保存" }).click();
  await expect(dialog.getByText("手动定位必须搜索并选择一个城市")).toBeVisible();

  await dialog.getByRole("button", { name: "搜索城市" }).click();
  await dialog.getByRole("button", { name: "搜索结果" }).click();
  await page
    .getByRole("listbox")
    .getByRole("option", { name: /杭州市/ })
    .click();
  await dialog.getByRole("button", { name: "保存" }).click();

  await expect
    .poll(() =>
      page.evaluate(() => {
        const raw = localStorage.getItem("AppSettings");
        return raw ? JSON.parse(raw)?.general?.weather : null;
      })
    )
    .toMatchObject({
      locationMode: "manual",
      manualLocation: {
        query: "杭州",
        selected: {
          affiliation: "浙江省",
          lat: 30.2741,
          locationKey: "weathercn:101210101",
          lon: 120.1551,
          name: "杭州市",
        },
      },
    });
});

test("噪音设置：选择麦克风只在保存后持久化，并在重开后恢复", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("immersive-clock:has-seen-tour", "true");
    localStorage.setItem(
      "AppSettings",
      JSON.stringify({
        version: 10,
        general: {
          announcement: {
            hideUntil: Date.now() + 7 * 24 * 60 * 60 * 1000,
            version: "3.13.3",
          },
        },
        noiseControl: {
          monitoringEnabled: false,
          preferredInputDevice: null,
        },
      })
    );
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: {
        enumerateDevices: async () => [
          { kind: "audioinput", deviceId: "default", label: "默认设备", groupId: "" },
          { kind: "audioinput", deviceId: "built-in", label: "内置麦克风", groupId: "" },
          { kind: "audioinput", deviceId: "usb-mic", label: "USB 麦克风", groupId: "" },
          { kind: "videoinput", deviceId: "camera", label: "摄像头", groupId: "" },
        ],
      },
    });
  });
  await page.goto("/");

  let dialog = await openStudySettings(page);
  await openEnvironmentSettingsPage(page, dialog, "噪音监测");
  const microphoneDropdown = dialog.getByRole("button", {
    name: "麦克风设备",
    exact: true,
  });
  await expect(microphoneDropdown).toContainText("系统默认");
  await microphoneDropdown.click();
  const microphoneOptions = page.getByRole("listbox").getByRole("option");
  await expect(microphoneOptions).toHaveText(["系统默认", "内置麦克风", "USB 麦克风"]);

  await page.getByRole("option", { name: "USB 麦克风" }).click();
  expect(
    await page.evaluate(() => JSON.parse(localStorage.getItem("AppSettings") ?? "{}").noiseControl)
  ).toMatchObject({ preferredInputDevice: null });

  await dialog.getByRole("button", { name: "保存" }).click();
  await expect(dialog).toBeHidden();
  expect(
    await page.evaluate(() => {
      const settings = JSON.parse(localStorage.getItem("AppSettings") ?? "{}");
      return { version: settings.version, preference: settings.noiseControl?.preferredInputDevice };
    })
  ).toEqual({
    version: 10,
    preference: { deviceId: "usb-mic", label: "USB 麦克风" },
  });

  dialog = await openStudySettings(page);
  await openEnvironmentSettingsPage(page, dialog, "噪音监测");
  await expect(dialog.getByRole("button", { name: "麦克风设备", exact: true })).toContainText(
    "USB 麦克风"
  );
});

for (const viewport of [
  { width: 1440, height: 900 },
  { width: 390, height: 844 },
  { width: 320, height: 568 },
]) {
  test(`环境设置：${viewport.width}x${viewport.height} 三分类隔离且布局无溢出`, async ({
    page,
  }, testInfo) => {
    const consoleErrors: string[] = [];
    page.on("console", (message) => {
      if (message.type() !== "error") return;
      const sourceUrl = message.location().url;
      consoleErrors.push(sourceUrl ? `${message.text()} (${sourceUrl})` : message.text());
    });
    page.on("requestfailed", (request) => {
      consoleErrors.push(
        `请求失败：${request.url()} (${request.failure()?.errorText ?? "未知错误"})`
      );
    });
    page.on("pageerror", (error) => consoleErrors.push(error.message));

    await page.setViewportSize(viewport);
    await mockExternalQuoteRequests(page);
    await seedMinutelyWeatherSettings(page);
    await page.goto("/");

    const dialog = await openStudySettings(page);
    if (viewport.width <= 720) {
      const compactNavigation = dialog.getByRole("navigation", { name: "设置紧凑导航" });
      await compactNavigation.getByRole("button", { name: "环境提醒" }).click();
      const environmentNavigation = dialog.getByRole("navigation", {
        name: "环境提醒子分类",
      });
      await expect(environmentNavigation.getByRole("button")).toHaveText([
        "噪音监测",
        "天气服务",
        "定位服务",
      ]);
      await environmentNavigation.getByRole("button", { name: "噪音监测" }).click();
    } else {
      await dialog.getByRole("button", { name: "环境提醒" }).click();
      const environmentNavigation = dialog.getByRole("group", { name: "环境提醒" });
      await expect(environmentNavigation.getByRole("button")).toHaveText([
        "噪音监测",
        "天气服务",
        "定位服务",
      ]);
      await environmentNavigation.getByRole("button", { name: "噪音监测" }).click();
    }

    await expect(dialog.getByRole("heading", { name: "噪音监测", level: 2 })).toHaveCount(0);
    const noiseTabs = dialog.getByRole("tablist", { name: "噪音设置分类" });
    await expect(noiseTabs.getByRole("tab")).toHaveText(["控制", "校准", "报告", "监测"]);
    await expect(dialog.getByRole("heading", { name: "噪音控制" })).toBeVisible();
    await expectSettingsFooterDocked(dialog);
    for (const heading of ["校准与修正", "噪音报告", "实时监控", "统计数据"]) {
      await expect(dialog.getByRole("heading", { name: heading })).toHaveCount(0);
    }
    await expect(dialog.getByRole("radiogroup", { name: "刷新档位" })).toHaveCount(0);
    await expect(dialog.getByRole("radiogroup", { name: "定位方式" })).toHaveCount(0);
    if (viewport.width <= 390) {
      expect(
        await dialog.locator("#study-panel").evaluate((element) => {
          const controlHeading = Array.from(element.querySelectorAll("h3")).find(
            (heading) => heading.textContent?.trim() === "噪音控制"
          );
          const grid = controlHeading?.closest("section")?.querySelector('[class*="settingGrid"]');
          return grid ? getComputedStyle(grid).gridTemplateColumns.split(" ").length : 0;
        })
      ).toBe(1);
    }

    for (const [tabName, heading] of [
      ["校准", "校准与修正"],
      ["报告", "噪音报告"],
    ] as const) {
      await noiseTabs.getByRole("tab", { name: tabName }).click();
      await expect(dialog.getByRole("heading", { name: heading })).toBeVisible();
      await expect(dialog.getByRole("heading", { name: "噪音控制" })).toHaveCount(0);
    }

    await noiseTabs.getByRole("tab", { name: "监测" }).click();
    await expect(dialog.getByRole("heading", { name: "实时监控" })).toBeVisible();
    await expect(dialog.getByRole("heading", { name: "统计数据" })).toBeVisible();
    await expect(dialog.getByRole("heading", { name: "噪音控制" })).toHaveCount(0);

    await openEnvironmentSettingsPage(page, dialog, "天气服务");
    await expect(dialog.getByRole("heading", { name: "天气服务", level: 2 })).toHaveCount(0);
    const weatherServiceTabs = dialog.getByRole("tablist", { name: "天气服务分类" });
    await expect(weatherServiceTabs.getByRole("tab")).toHaveText(["提醒", "更新", "数据"]);
    await expect(dialog.getByRole("switch", { name: "天气预警弹窗" })).toBeVisible();
    await expectSettingsFooterDocked(dialog);
    await expect(dialog.getByRole("heading", { name: "天气刷新" })).toHaveCount(0);
    await expect(dialog.getByRole("tablist", { name: "天气数据分类" })).toHaveCount(0);
    await expect(dialog.getByRole("radiogroup", { name: "定位方式" })).toHaveCount(0);
    await expect(dialog.getByRole("heading", { name: "噪音控制" })).toHaveCount(0);
    if (viewport.width <= 390) {
      expect(
        await dialog.locator("#weather-panel").evaluate((element) => {
          const alertsHeading = Array.from(element.querySelectorAll("h3")).find(
            (heading) => heading.textContent?.trim() === "提醒开关"
          );
          const grid = alertsHeading?.closest("section")?.querySelector('[class*="settingGrid"]');
          return grid ? getComputedStyle(grid).gridTemplateColumns.split(" ").length : 0;
        })
      ).toBe(1);
    }

    await weatherServiceTabs.getByRole("tab", { name: "更新" }).click();
    await expect(dialog.getByRole("heading", { name: "天气更新" })).toBeVisible();
    await expect(dialog.getByRole("switch", { name: "天气预警弹窗" })).toHaveCount(0);
    await expect(dialog.getByRole("tablist", { name: "天气数据分类" })).toHaveCount(0);

    await weatherServiceTabs.getByRole("tab", { name: "数据" }).click();
    await expect(dialog.getByRole("heading", { name: "天气数据" })).toBeVisible();
    await expect(dialog.getByRole("heading", { name: "天气刷新" })).toHaveCount(0);
    expect(await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(
      true
    );

    let tablist = dialog.getByRole("tablist", { name: "天气数据分类" });
    await tablist.scrollIntoViewIfNeeded();
    await tablist.getByRole("tab", { name: "分钟" }).click();
    await dialog.getByRole("region", { name: "全部分钟降水样本" }).scrollIntoViewIfNeeded();
    await expect
      .poll(() =>
        dialog
          .locator("#weather-panel")
          .locator("xpath=../..")
          .evaluate((element) => element.scrollTop)
      )
      .toBeGreaterThan(0);

    await openEnvironmentSettingsPage(page, dialog, "定位服务");
    await expect(dialog.getByRole("heading", { name: "定位服务", level: 2 })).toHaveCount(0);
    await expect(dialog.getByRole("tablist", { name: "定位服务分类" })).toHaveCount(0);
    await expect(dialog.getByRole("heading", { name: "定位设置" })).toBeVisible();
    await expect(dialog.getByRole("heading", { name: "定位状态" })).toBeVisible();
    await expect(dialog.getByRole("radiogroup", { name: "定位方式" })).toBeVisible();
    await expect(dialog.getByText("当前坐标", { exact: true })).toBeVisible();
    await expectSettingsFooterDocked(dialog);
    await expect(dialog.getByRole("switch", { name: "天气预警弹窗" })).toHaveCount(0);
    await expect(dialog.getByRole("radiogroup", { name: "刷新档位" })).toHaveCount(0);
    await expect(dialog.getByRole("tablist", { name: "天气数据分类" })).toHaveCount(0);
    await expect(dialog.getByRole("heading", { name: "噪音控制" })).toHaveCount(0);

    await expect
      .poll(() =>
        dialog
          .locator("#weather-panel")
          .locator("xpath=../..")
          .evaluate((element) => element.scrollTop)
      )
      .toBe(0);
    expect(await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(
      true
    );

    await openEnvironmentSettingsPage(page, dialog, "天气服务");
    await expect(dialog.getByRole("switch", { name: "分钟级降水提醒" })).toHaveCount(0);
    await expect(dialog.getByRole("tab", { name: "数据" })).toHaveAttribute(
      "aria-selected",
      "true"
    );
    await expect(dialog.getByRole("tab", { name: "分钟" })).toHaveAttribute(
      "aria-selected",
      "true"
    );
    await waitForAnimations(dialog);
    const weatherServiceScreenshotPath = testInfo.outputPath("weather-service.png");
    await page.screenshot({ path: weatherServiceScreenshotPath });
    await testInfo.attach("weather-service", {
      path: weatherServiceScreenshotPath,
      contentType: "image/png",
    });

    await waitForAnimations(dialog);

    tablist = dialog.getByRole("tablist", { name: "天气数据分类" });
    const tabNames = ["概览", "分钟", "逐时", "逐日", "空气", "预警", "接口"];
    await expect(tablist.getByRole("tab")).toHaveCount(tabNames.length);
    for (const tabName of tabNames) {
      await expect(tablist.getByRole("tab", { name: tabName })).toBeVisible();
    }
    if (viewport.width <= 390) {
      expect(await tablist.evaluate((element) => element.scrollWidth > element.clientWidth)).toBe(
        true
      );
    }

    const tabChecks = [
      { name: "概览", text: "当前观测" },
      { name: "分钟", text: "分钟接口完整描述" },
      { name: "逐时", text: "逐时预报 · 4 条" },
      { name: "逐日", text: "逐日预报 · 3 天" },
      { name: "空气", text: "E2E 监测站" },
      { name: "预警", text: "暴雨蓝色预警" },
      { name: "接口", text: "weather-all-e2e" },
    ];
    for (const check of tabChecks) {
      const tab = tablist.getByRole("tab", { name: check.name });
      await tab.click();
      const panelId = await tab.getAttribute("aria-controls");
      expect(panelId).not.toBeNull();
      const panel = dialog.locator(`#${panelId}`);
      await expect(panel).toHaveAttribute("aria-labelledby", await tab.getAttribute("id"));
      await expect(panel.getByText(check.text, { exact: false }).first()).toBeVisible();
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)
      ).toBe(true);
      expect(await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(
        true
      );
    }

    await tablist.getByRole("tab", { name: "逐日" }).click();
    const dailyTable = dialog.getByRole("region", { name: "全部逐日天气预报" });
    await expect(dailyTable).toBeVisible();
    expect(await dailyTable.evaluate((element) => getComputedStyle(element).overflowX)).toBe(
      "auto"
    );
    if (viewport.width <= 390) {
      expect(
        await dailyTable.evaluate((element) => element.scrollWidth > element.clientWidth)
      ).toBe(true);
    }

    const screenshotPath = testInfo.outputPath("weather-live.png");
    await page.screenshot({ path: screenshotPath });
    await testInfo.attach("weather-live", { path: screenshotPath, contentType: "image/png" });

    await tablist.getByRole("tab", { name: "分钟" }).click();
    await dialog.getByRole("region", { name: "全部分钟降水样本" }).scrollIntoViewIfNeeded();
    const precipitationScreenshotPath = testInfo.outputPath("weather-precipitation.png");
    await page.screenshot({ path: precipitationScreenshotPath });
    await testInfo.attach("weather-precipitation", {
      path: precipitationScreenshotPath,
      contentType: "image/png",
    });
    expect(consoleErrors).toEqual([]);
  });
}

test("组件外观：实时预览、取消回滚并在保存后持久化", async ({ page }) => {
  await page.goto("/");
  let dialog = await openStudySettings(page);
  await dialog.getByRole("button", { name: "视觉外观" }).click();
  await dialog.getByRole("button", { name: "时间显示", exact: true }).click();
  const timeViews = dialog.getByRole("radiogroup", { name: "时间显示类型" });
  await timeViews.getByRole("radio", { name: "时钟" }).click();

  const objectTabs = dialog.getByRole("tablist", { name: "时钟调整对象" });
  const preview = dialog.getByLabel("时钟外观预览");
  const previewTime = preview.getByText("12:45:09");
  const previewDate = preview.getByText("2026年7月13日星期一");
  await expect(previewTime).toHaveAttribute("data-preview-highlighted", "true");
  await objectTabs.getByRole("tab", { name: "日期" }).hover();
  await expect(previewTime).toHaveAttribute("data-preview-highlighted", "true");
  await expect(previewDate).not.toHaveAttribute("data-preview-highlighted");
  await dialog.getByRole("heading", { name: "时钟", level: 3, exact: true }).hover();
  await expect(previewTime).toHaveAttribute("data-preview-highlighted", "true");

  await objectTabs.getByRole("tab", { name: "日期" }).click();
  await expect(previewDate).toHaveAttribute("data-preview-highlighted", "true");
  await expect(previewTime).not.toHaveAttribute("data-preview-highlighted");
  await expect(dialog.getByLabel("颜色代码")).toHaveValue("#bbbbbb");
  await expect(dialog.getByText("使用整体样式")).toBeVisible();
  await objectTabs.getByRole("tab", { name: "主时间" }).click();

  const colorCode = dialog.getByLabel("颜色代码");
  await colorCode.fill("#ff3366");
  await expect(previewTime).toHaveCSS("color", "rgb(255, 51, 102)");
  await expect(dialog.getByText("已单独调整 1 项")).toBeVisible();

  await dialog.getByRole("button", { name: "取消" }).click();
  expect(
    await page.evaluate(() => {
      const raw = localStorage.getItem("AppSettings");
      return raw ? JSON.parse(raw)?.appearance?.scenes?.clock?.components?.clock : null;
    })
  ).toBeFalsy();

  dialog = await openStudySettings(page);
  await dialog.getByRole("button", { name: "视觉外观" }).click();
  await dialog.getByRole("button", { name: "时间显示", exact: true }).click();
  await dialog
    .getByRole("radiogroup", { name: "时间显示类型" })
    .getByRole("radio", { name: "时钟" })
    .click();
  await dialog.getByLabel("颜色代码").fill("#ff3366");
  await dialog.getByRole("button", { name: "保存" }).click();

  expect(
    await page.evaluate(() => {
      const raw = localStorage.getItem("AppSettings");
      return raw
        ? JSON.parse(raw)?.appearance?.scenes?.clock?.components?.clock?.slots?.time?.color
        : null;
    })
  ).toBe("#ff3366");
});

test("页面背景：可在整体背景和应用预设之间切换", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem(
      "AppSettings",
      JSON.stringify({
        appearance: {
          global: {
            background: { type: "color", color: "#123456", colorAlpha: 1 },
          },
        },
      })
    );
  });
  await page.goto("/");

  let dialog = await openStudySettings(page);
  await dialog.getByRole("button", { name: "视觉外观" }).click();
  await dialog.getByRole("button", { name: "时间显示", exact: true }).click();
  let previewStage = dialog.getByLabel("时钟外观预览").locator('[data-preview-stage="clock"]');
  await expect(previewStage).toHaveCSS("background-color", "rgb(18, 52, 86)");

  await dialog.getByRole("radio", { name: "应用预设" }).check({ force: true });
  await dialog.getByRole("button", { name: "保存" }).click();
  expect(
    await page.evaluate(() => {
      const raw = localStorage.getItem("AppSettings");
      return raw ? JSON.parse(raw)?.appearance?.scenes?.clock?.background?.type : null;
    })
  ).toBe("builtin");

  await page.getByRole("button", { name: "打开设置" }).click();
  dialog = page.getByRole("dialog", { name: "设置" });
  await dialog.getByRole("button", { name: "视觉外观" }).click();
  await dialog.getByRole("button", { name: "时间显示", exact: true }).click();
  previewStage = dialog.getByLabel("时钟外观预览").locator('[data-preview-stage="clock"]');
  await dialog.getByRole("radio", { name: "跟随整体" }).check({ force: true });
  await expect(previewStage).toHaveCSS("background-color", "rgb(18, 52, 86)");
  await dialog.getByRole("button", { name: "保存" }).click();

  expect(
    await page.evaluate(() => {
      const raw = localStorage.getItem("AppSettings");
      return raw ? JSON.parse(raw)?.appearance?.scenes?.clock?.background?.type : null;
    })
  ).toBe("inherit");
});

test("组件外观：多事件倒计时可按实例保存覆盖", async ({ page }) => {
  await page.goto("/");
  let dialog = await openStudySettings(page);
  await dialog.getByRole("button", { name: "倒计时", exact: true }).click();
  await dialog.getByRole("radio", { name: "高考" }).check({ force: true });
  await dialog.getByRole("button", { name: "保存" }).click();

  await page.evaluate(() => {
    const raw = localStorage.getItem("AppSettings");
    if (!raw) return;
    const settings = JSON.parse(raw);
    settings.study.countdownItems.push({
      id: "exam-other",
      kind: "custom",
      name: "期末考试",
      targetDate: "2026-12-31",
      order: 1,
    });
    localStorage.setItem("AppSettings", JSON.stringify(settings));
  });
  await page.reload();

  dialog = await openStudySettings(page);
  await dialog.getByRole("button", { name: "视觉外观" }).click();
  await dialog.getByRole("button", { name: "顶部信息栏", exact: true }).click();
  await dialog
    .getByRole("radiogroup", { name: "顶部信息栏内容" })
    .getByRole("radio", { name: "事件倒计时", exact: true })
    .click();
  await dialog.getByRole("radio", { name: "指定事件" }).check({ force: true });
  await dialog.getByRole("button", { name: "指定事件" }).click();
  await page.getByRole("option", { name: "高考倒计时" }).click();
  await dialog
    .getByRole("tablist", { name: "事件倒计时调整对象" })
    .getByRole("tab", { name: "天数" })
    .click();
  await expect(dialog.getByText("使用所有事件的样式")).toBeVisible();
  await dialog.getByLabel("颜色代码").fill("#33cc88");
  await dialog.getByRole("button", { name: "保存" }).click();

  const storedStyles = await page.evaluate(() => {
    const raw = localStorage.getItem("AppSettings");
    if (!raw) return null;
    const appearance = JSON.parse(raw)?.appearance;
    return {
      selected: appearance?.instances?.studyCountdown?.["gaokao-default"]?.slots?.digit?.color,
      other: appearance?.instances?.studyCountdown?.["exam-other"]?.slots?.digit?.color,
      allEvents: appearance?.scenes?.study?.components?.studyCountdown?.slots?.digit?.color,
    };
  });
  expect(storedStyles).toEqual({
    selected: "#33cc88",
    other: undefined,
    allEvents: undefined,
  });
});

/** 端到端用例：验证设置页一级/二级导航只展示当前任务域（函数级注释） */
test("设置导航：一级分类切换后只显示当前二级分区", async ({ page }) => {
  await page.goto("/");

  const dialog = await openStudySettings(page);

  const viewport = page.viewportSize();
  await page.mouse.click((viewport?.width ?? 1280) - 4, Math.round((viewport?.height ?? 720) / 2));
  await expect(dialog).toBeVisible();

  await expect(dialog.getByRole("button", { name: "启动页面" })).toBeVisible();
  await expect(dialog.getByRole("button", { name: "自习显示" })).toBeVisible();
  await expect(dialog.getByRole("button", { name: "整体样式", exact: true })).toBeHidden();

  await dialog.getByRole("button", { name: "视觉外观" }).click();
  const settingsNavigation = dialog.getByRole("navigation", { name: "设置分组" });
  await expect(
    settingsNavigation.getByRole("button", { name: "整体样式", exact: true })
  ).toBeVisible();
  await expect(
    settingsNavigation.getByRole("button", { name: "时间显示", exact: true })
  ).toBeVisible();
  await expect(
    settingsNavigation.getByRole("button", { name: "自习时间", exact: true })
  ).toHaveCount(0);
  await expect(settingsNavigation.getByRole("button", { name: "语录", exact: true })).toBeVisible();
  await expect(
    settingsNavigation.getByRole("button", { name: "顶部信息栏", exact: true })
  ).toBeVisible();
  await expect(settingsNavigation.getByRole("button", { name: "天气", exact: true })).toHaveCount(
    0
  );
  await expect(
    settingsNavigation.getByRole("button", { name: "事件倒计时", exact: true })
  ).toHaveCount(0);
  await expect(dialog.getByRole("button", { name: "启动页面" })).toBeHidden();

  await dialog.getByRole("button", { name: "环境提醒" }).click();
  const environmentNavigation = dialog.getByRole("group", { name: "环境提醒" });
  await expect(environmentNavigation.getByRole("button")).toHaveText([
    "噪音监测",
    "天气服务",
    "定位服务",
  ]);
  await expect(dialog.getByRole("button", { name: "语录渠道" })).toBeHidden();

  await dialog.getByRole("button", { name: "内容语录" }).click();
  await expect(dialog.getByRole("button", { name: "刷新策略" })).toBeVisible();
  await expect(dialog.getByRole("button", { name: "语录渠道" })).toBeVisible();
  await expect(dialog.getByRole("button", { name: "天气服务" })).toBeHidden();

  await dialog.getByRole("button", { name: "系统数据" }).click();
  await expect(dialog.getByRole("button", { name: "时间校准" })).toBeVisible();
  await expect(dialog.getByRole("button", { name: "设置数据" })).toBeVisible();
  await expect(dialog.getByRole("button", { name: "错误与调试" })).toBeVisible();
  await expect(dialog.getByRole("button", { name: "启动页面" })).toBeHidden();
});

/** 端到端用例：课程表作为设置草稿参与统一保存，取消后重新读取已保存数据。 */
test("课程表：随设置统一保存并在取消时丢弃草稿", async ({ page }) => {
  await page.goto("/");

  const dialog = await openStudySettings(page);
  await dialog.getByRole("button", { name: "课程表" }).click();

  const firstCourseName = dialog.getByLabel("课程名称").first();
  await firstCourseName.fill("晨间数学");
  await dialog.getByRole("button", { name: "保存" }).click();

  const savedName = await page.evaluate(() => {
    const raw = localStorage.getItem("AppSettings");
    if (!raw) return null;
    return JSON.parse(raw)?.study?.schedule?.[0]?.name ?? null;
  });
  expect(savedName).toBe("晨间数学");

  await page.getByRole("button", { name: "打开设置" }).click();
  const secondDialog = page.getByRole("dialog", { name: "设置" });
  await secondDialog.getByRole("button", { name: "课程表" }).click();
  await secondDialog.getByLabel("课程名称").first().fill("未保存课程");
  await secondDialog.getByRole("button", { name: "取消" }).click();
  await expect(secondDialog).toBeHidden();

  await page.getByRole("button", { name: "打开设置" }).click();
  const reopenedDialog = page.getByRole("dialog", { name: "设置" });
  await reopenedDialog.getByRole("button", { name: "课程表" }).click();
  await expect(reopenedDialog.getByLabel("课程名称").first()).toHaveValue("晨间数学");
});

/** 端到端用例：切换“错误与调试-记录方式”时不应在保存前清空持久化记录（函数级注释） */
test("错误与调试：记录方式切换延迟到保存", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem(
      "AppSettings",
      JSON.stringify({
        study: {
          alerts: {
            errorCenterMode: "persist",
            errorPopup: true,
          },
        },
      })
    );
    localStorage.setItem(
      "error-center.records",
      JSON.stringify([
        {
          id: "e2e-1",
          ts: Date.now(),
          lastTs: Date.now(),
          level: "error",
          source: "e2e",
          title: "e2e",
          message: "e2e",
          count: 1,
        },
      ])
    );
  });

  await page.goto("/");

  const dialog = await openStudySettings(page);
  await dialog.getByRole("button", { name: "系统数据" }).click();
  await dialog.getByRole("button", { name: "错误与调试" }).click();

  const beforeSwitch = await page.evaluate(() => localStorage.getItem("error-center.records"));
  expect(beforeSwitch).not.toBeNull();

  const recordModeGroup = dialog.getByRole("radiogroup", { name: "记录方式" });
  await recordModeGroup.locator("label").filter({ hasText: "关闭" }).click();

  const afterSwitchBeforeSave = await page.evaluate(() =>
    localStorage.getItem("error-center.records")
  );
  expect(afterSwitchBeforeSave).not.toBeNull();

  await dialog.getByRole("button", { name: "取消" }).click();
  await expect(dialog).toBeHidden();

  const afterCancel = await page.evaluate(() => localStorage.getItem("error-center.records"));
  expect(afterCancel).not.toBeNull();

  await page.getByRole("button", { name: "打开设置" }).click();
  const dialog2 = page.getByRole("dialog", { name: "设置" });
  await expect(dialog2).toBeVisible();
  await dialog2.getByRole("button", { name: "系统数据" }).click();
  await dialog2.getByRole("button", { name: "错误与调试" }).click();

  const recordModeGroup2 = dialog2.getByRole("radiogroup", { name: "记录方式" });
  await expect(recordModeGroup2.getByRole("radio", { name: "持久化" })).toBeChecked();

  await recordModeGroup2.locator("label").filter({ hasText: "关闭" }).click();
  await dialog2.getByRole("button", { name: "保存" }).click();
  await expect(dialog2).toBeHidden();

  const afterSave = await page.evaluate(() => localStorage.getItem("error-center.records"));
  expect(afterSave).toBeNull();
});

test.describe("移动端设置抽屉", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("外观组件二级菜单可滚动且项目不横向截断", async ({ page }) => {
    await page.goto("/");
    const dialog = await openStudySettings(page);
    await dialog.getByRole("button", { name: "视觉外观" }).click();

    const componentMenu = dialog.getByRole("navigation", { name: "视觉外观子分类" });
    await expect(componentMenu).toBeVisible();
    expect(await componentMenu.getByRole("button").count()).toBe(4);

    const lastItem = componentMenu.getByRole("button", { name: "顶部信息栏" });
    await lastItem.scrollIntoViewIfNeeded();
    await expect(lastItem).toBeInViewport();
    expect(
      await componentMenu.evaluate((element) => element.scrollWidth <= element.clientWidth)
    ).toBe(true);

    await componentMenu.getByRole("button", { name: "时间显示" }).click();
    const timeViews = dialog.getByRole("radiogroup", { name: "时间显示类型" });
    await timeViews.getByRole("radio", { name: "秒表" }).click();
    const objectTabs = dialog.getByRole("tablist", { name: "秒表调整对象" });
    const objectTabLayout = await objectTabs.evaluate((element) => ({
      clientWidth: element.clientWidth,
      scrollWidth: element.scrollWidth,
      labelsFit: Array.from(element.querySelectorAll<HTMLElement>("[role='tab']")).every(
        (tab) => tab.scrollWidth <= tab.clientWidth
      ),
    }));
    expect(objectTabLayout.scrollWidth).toBeGreaterThan(objectTabLayout.clientWidth);
    expect(objectTabLayout.labelsFit).toBe(true);

    const lastObject = objectTabs.getByRole("tab", { name: "里程碑" });
    await lastObject.scrollIntoViewIfNeeded();
    await expect(lastObject).toBeInViewport();
    expect(await objectTabs.evaluate((element) => element.scrollLeft)).toBeGreaterThan(0);
  });

  test("全屏展示纵向紧凑导航并将当前分组滚动入视口", async ({ page }) => {
    await page.goto("/");
    const dialog = await openStudySettings(page);

    await expect
      .poll(async () => {
        const dialogBox = await dialog.boundingBox();
        return Boolean(
          dialogBox && Math.abs(dialogBox.x) < 0.01 && Math.abs(dialogBox.width - 390) < 0.01
        );
      })
      .toBe(true);

    const groupRail = dialog.getByRole("navigation", { name: "设置紧凑导航" });
    await groupRail.getByRole("button", { name: "系统数据" }).click();
    await dialog.getByRole("button", { name: "错误与调试" }).click();
    await expect(dialog.getByRole("heading", { name: "错误与调试", level: 2 })).toBeVisible();

    await expect
      .poll(() =>
        groupRail.evaluate((element) => {
          const current = element.querySelector<HTMLElement>("[aria-current='page']");
          if (!current) return false;
          const railRect = element.getBoundingClientRect();
          const currentRect = current.getBoundingClientRect();
          return currentRect.left >= railRect.left && currentRect.right <= railRect.right;
        })
      )
      .toBe(true);

    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)
    ).toBe(true);
  });
});
