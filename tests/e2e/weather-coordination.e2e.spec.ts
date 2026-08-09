import { expect, test } from "@playwright/test";

test("同设备双标签页只执行一次全量天气请求并同步缓存", async ({ context, page }) => {
  let allRequestCount = 0;
  let locationRequestCount = 0;
  let minutelyRequestCount = 0;

  await context.addInitScript(() => {
    (window as Window & { __weatherCrossTabSyncCount?: number }).__weatherCrossTabSyncCount = 0;
    window.addEventListener("storage", (event) => {
      if (event.key === "immersive-clock:weather-cache-sync-message:v1" && event.newValue) {
        const detail = JSON.parse(event.newValue);
        if (detail?.type !== "cache-updated" || detail?.target !== "all") return;
        const state = window as Window & { __weatherCrossTabSyncCount?: number };
        state.__weatherCrossTabSyncCount = (state.__weatherCrossTabSyncCount ?? 0) + 1;
      }
    });
    const now = Date.now();
    localStorage.setItem(
      "AppSettings",
      JSON.stringify({
        version: 8,
        general: {
          weather: {
            locationMode: "auto",
            manualLocation: { query: "", selected: null },
          },
        },
        noiseControl: {
          monitoringEnabled: false,
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
        coords: { accuracy: 18, lat: 31.2, lon: 121.5, source: "browser", updatedAt: now },
        details: {
          data: {
            alerts: [],
            brands: [],
            daily: [],
            hourly: [],
            indices: [],
            previousHours: [],
            raw: { status: 0 },
            technical: { channels: [], statuses: {}, units: {}, urls: {} },
            typhoons: [],
          },
          location: "121.5000,31.2000",
          updatedAt: now - 10 * 60 * 1000,
        },
        now: {
          data: { code: "200", now: { temp: "20", text: "旧天气" } },
          updatedAt: now - 10 * 60 * 1000,
        },
        xiaomiLocations: {
          "121.5000,31.2000": {
            data: {
              lat: 31.2,
              locationKey: "weathercn:101020100",
              lon: 121.5,
              name: "上海市",
            },
            updatedAt: now,
          },
        },
      })
    );
  });

  await context.route("**/api/xiaomi-weather/wtr-v3/**", async (route) => {
    const url = route.request().url();
    if (url.includes("/weather/all?")) {
      allRequestCount += 1;
      await new Promise((resolve) => setTimeout(resolve, 200));
      const now = Date.now();
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          alerts: [],
          aqi: { aqi: "42", pm25: "12", src: "E2E" },
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
            new: "cross-tab-e2e",
            precipitation: {
              fxTime: [new Date(now + 60_000).toISOString(), new Date(now + 120_000).toISOString()],
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
        status: 200,
      });
      return;
    }
    if (url.includes("/weather/xm/forecast/minutely?")) minutelyRequestCount += 1;
    if (url.includes("/location/city/")) locationRequestCount += 1;
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ status: 0 }),
      status: 200,
    });
  });

  const secondPage = await context.newPage();
  await Promise.all([page.goto("/"), secondPage.goto("/")]);

  await page.waitForTimeout(500);
  expect(allRequestCount).toBe(0);
  expect(locationRequestCount).toBe(0);
  expect(minutelyRequestCount).toBe(0);

  await Promise.all([page.goto("/study"), secondPage.goto("/study")]);

  await expect.poll(() => allRequestCount).toBe(1);
  await expect
    .poll(async () => {
      const counts = await Promise.all(
        [page, secondPage].map((targetPage) =>
          targetPage.evaluate(
            () =>
              (window as Window & { __weatherCrossTabSyncCount?: number })
                .__weatherCrossTabSyncCount ?? 0
          )
        )
      );
      return counts.reduce((sum, count) => sum + count, 0);
    })
    .toBeGreaterThanOrEqual(1);
  await page.waitForTimeout(500);

  expect(allRequestCount).toBe(1);
  expect(locationRequestCount).toBe(0);
  expect(minutelyRequestCount).toBe(0);
  for (const targetPage of [page, secondPage]) {
    await expect
      .poll(() =>
        targetPage.evaluate(() => {
          const cache = JSON.parse(localStorage.getItem("weather-cache") || "{}");
          return cache.now?.data?.now?.temp;
        })
      )
      .toBe("26");
  }
});
