import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

vi.mock("../weatherRequestGuard", () => ({
  executeWeatherRequest: <T>(runner: () => Promise<T>) => runner(),
}));

function xiaomiWeatherAll() {
  return {
    status: 0,
    updateTime: 1781856000000,
    current: {
      temperature: { value: "25", unit: "℃" },
      weather: "0",
      humidity: { value: "60" },
      pubTime: 1781856000000,
    },
    forecastDaily: {
      temperature: {
        value: [
          { from: "30", to: "22" },
          { from: "29", to: "21" },
          { from: "28", to: "20" },
        ],
      },
      weather: {
        value: [
          { from: "0", to: "1" },
          { from: "1", to: "2" },
          { from: "7", to: "8" },
        ],
      },
      sunRiseSet: {
        value: [
          { from: "05:30", to: "18:55" },
          { from: "05:31", to: "18:56" },
          { from: "05:32", to: "18:57" },
        ],
      },
    },
    forecastHourly: {
      temperature: { value: [{ value: "25" }, { value: "24" }], pubTime: 1781856000000 },
      weather: { value: ["0", "1"] },
    },
    aqi: { aqi: "42", pm25: "12", primary: "pm25", src: "Xiaomi" },
    alerts: [
      { alertId: "a1", title: "暴雨蓝色预警", type: "暴雨", level: "蓝色", detail: "注意防范" },
    ],
  };
}

describe("weatherService", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("adaptWeatherDetails 保留完整响应并对齐真实逐时逐日结构", async () => {
    const raw = {
      status: 0,
      updateTime: 1781856000000,
      current: {
        feelsLike: { unit: "℃", value: "31" },
        humidity: { unit: "%", value: "0" },
        pressure: { unit: "hPa", value: "1008" },
        pubTime: "2026-07-17T10:00:00+08:00",
        temperature: { unit: "℃", value: "28" },
        uvIndex: "0",
        visibility: { unit: "km", value: "" },
        weather: "1",
        wind: {
          direction: { unit: "°", value: "188" },
          speed: { unit: "km/h", value: "2" },
        },
      },
      forecastHourly: {
        status: 0,
        temperature: {
          pubTime: "2026-07-17T10:00:00+08:00",
          unit: "℃",
          value: [28, 29],
        },
        weather: { value: [1, 2, 7] },
        aqi: { value: [40, 41, 42] },
        wind: {
          value: [{ datetime: "2026-07-17T10:00:00+08:00", direction: "188", speed: "2" }],
        },
      },
      forecastDaily: {
        status: 0,
        precipitationProbability: { value: ["0", "20", "80"] },
        temperature: {
          unit: "℃",
          value: [
            { from: "35", to: "27" },
            { from: "34", to: "26" },
          ],
        },
        weather: {
          value: [
            { from: "1", to: "2" },
            { from: "7", to: "8" },
          ],
        },
        sunRiseSet: {
          value: [
            {
              from: "2026-07-17T05:01:00+08:00",
              to: "2026-07-17T18:59:00+08:00",
            },
          ],
        },
        aqi: { value: [45, 46, 47] },
        wind: {
          direction: {
            unit: "°",
            value: [{ from: "90", to: "180" }],
          },
          speed: {
            unit: "km/h",
            value: [{ from: "5", to: "8" }],
          },
        },
      },
      indices: {
        status: 0,
        indices: [
          { type: "uvIndex", value: "0" },
          { type: "carWash", value: "0" },
        ],
      },
      aqi: {
        aqi: "50",
        co: "0.5",
        no2: "19",
        o3: "140",
        pm10: "47",
        pm25: "29",
        primary: "pm25",
        pubTime: "2026-07-17T09:00:00+08:00",
        so2: "6",
        src: "测试监测站",
        status: 0,
        suggest: "适宜户外活动",
        pm25Desc: "细颗粒物说明",
      },
      alerts: [
        {
          alertId: "a1",
          defense: [{ defenseIcon: "shield", defenseText: "减少外出" }],
          detail: "注意防范",
          images: { icon: "icon.png", notice: "notice.png" },
          level: "蓝色",
          locationKey: "weathercn:101020100",
          pubTime: "2026-07-17T09:30:00+08:00",
          title: "暴雨蓝色预警",
          type: "暴雨",
        },
      ],
      chs: [{ type: "CWA6" }],
      sourceMaps: { current: { temperature: "weatherbj" } },
      typhoon: [{ name: "测试台风" }],
      url: { caiyun: "https://example.com/caiyun", weathercn: "" },
    };

    const { adaptWeatherDetails } = await import("../weatherService");
    const details = adaptWeatherDetails(raw);

    expect(details.raw).toBe(raw);
    expect(details.current).toMatchObject({
      humidity: { value: "0" },
      uvIndex: "0",
      weatherText: "多云",
      windDirectionText: "南风",
    });
    expect(details.hourly).toHaveLength(3);
    expect(details.hourly[0]).toMatchObject({
      aqi: "40",
      temperature: { value: "28" },
      windDirection: { value: "188" },
    });
    expect(details.hourly[2].temperature?.value).toBeUndefined();
    expect(details.daily).toHaveLength(3);
    expect(details.daily[0]).toMatchObject({
      date: "2026-07-17",
      precipitationProbability: "0",
      windDirectionDay: { value: "90" },
    });
    expect(details.airQuality?.pollutants.find((item) => item.code === "pm25")).toMatchObject({
      description: "细颗粒物说明",
      value: "29",
    });
    expect(details.alerts[0]).toMatchObject({
      defenses: [{ icon: "shield", text: "减少外出" }],
      images: ["icon.png", "notice.png"],
    });
    expect(details.technical.sourceMaps).toEqual(raw.sourceMaps);
    expect(details.typhoons).toEqual([{ name: "测试台风" }]);
  });

  it("getCoordsViaIP 能从不同数据源解析坐标", async () => {
    const responses: Record<string, unknown> = {
      "https://ipapi.co/json/": { latitude: 31.2, longitude: 121.5 },
    };

    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      const data = responses[url];
      if (!data) return Promise.reject(new Error(`unexpected url: ${url}`));
      return Promise.resolve({
        ok: true,
        status: 200,
        statusText: "OK",
        text: async () => JSON.stringify(data),
      });
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const { getCoordsViaIP } = await import("../locationService");
    const coords = await getCoordsViaIP();

    expect(coords).not.toBeNull();
    expect(coords?.lat).toBeCloseTo(31.2);
    expect(coords?.lon).toBeCloseTo(121.5);
  });

  it("buildWeatherFlow 使用已解析小米位置且不请求额外城市或地址接口", async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/wtr-v3/weather/all?")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          statusText: "OK",
          text: async () => JSON.stringify(xiaomiWeatherAll()),
        });
      }
      return Promise.reject(new Error(`unexpected url: ${url}`));
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const { buildWeatherFlow } = await import("../weatherService");
    const result = await buildWeatherFlow({
      location: {
        city: {
          affiliation: "上海市",
          lat: 31.2,
          locationKey: "weathercn:101020100",
          lon: 121.5,
          name: "上海市",
        },
        coords: { accuracy: 20, lat: 31.2, lon: 121.5 },
        mode: "auto",
        resolvedAt: Date.now(),
        source: "browser",
      },
    });

    expect(result.coords).not.toBeNull();
    expect(result.city).toBe("上海市");
    expect(result.weather?.code).toBe("200");

    const calledUrls = fetchMock.mock.calls.map((c) => String(c[0]));
    expect(calledUrls.some((u) => u.includes("/location/city/"))).toBe(false);
    expect(calledUrls.some((u) => u.includes("/wtr-v3/weather/all"))).toBe(true);
    expect(calledUrls.some((u) => u.includes("locationKey=weathercn%3A101020100"))).toBe(true);
  });
});
