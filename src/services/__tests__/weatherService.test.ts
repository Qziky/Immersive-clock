import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

function xiaomiCity() {
  return [{ name: "上海市", locationKey: "weathercn:101020100", latitude: "31.2", longitude: "121.5" }];
}

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
      temperature: { value: [{ from: "30", to: "22" }, { from: "29", to: "21" }, { from: "28", to: "20" }] },
      weather: { value: [{ from: "0", to: "1" }, { from: "1", to: "2" }, { from: "7", to: "8" }] },
      sunRiseSet: { value: [{ from: "05:30", to: "18:55" }, { from: "05:31", to: "18:56" }, { from: "05:32", to: "18:57" }] },
    },
    forecastHourly: {
      temperature: { value: [{ value: "25" }, { value: "24" }], pubTime: 1781856000000 },
      weather: { value: ["0", "1"] },
    },
    aqi: { aqi: "42", pm25: "12", primary: "pm25", src: "Xiaomi" },
    alerts: [{ alertId: "a1", title: "暴雨蓝色预警", type: "暴雨", level: "蓝色", detail: "注意防范" }],
  };
}

function formatDateFromOffset(offset: number): string {
  const date = new Date();
  date.setDate(date.getDate() + offset);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

describe("weatherService", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    vi.resetModules();
    vi.stubEnv("VITE_XIAOMI_WEATHER_API_HOST", "api.example.com");
    vi.stubEnv("VITE_AMAP_API_KEY", "test-amap-key");
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("fetchWeatherNow 正常返回小米天气适配数据", async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/wtr-v3/location/city/geo?")) {
        return Promise.resolve({ ok: true, status: 200, statusText: "OK", text: async () => JSON.stringify(xiaomiCity()) });
      }
      if (url.includes("/wtr-v3/weather/all?")) {
        return Promise.resolve({ ok: true, status: 200, statusText: "OK", text: async () => JSON.stringify(xiaomiWeatherAll()) });
      }
      return Promise.reject(new Error(`unexpected url: ${url}`));
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const { fetchWeatherNow } = await import("../weatherService");
    const res = await fetchWeatherNow("121.5,31.2");

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(res.now?.text).toBe("晴");
    expect(res.now?.temp).toBe("25");
  });

  it("fetchWeatherHourly72h 正常返回小时预报适配数据", async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/wtr-v3/location/city/geo?")) {
        return Promise.resolve({ ok: true, status: 200, statusText: "OK", text: async () => JSON.stringify(xiaomiCity()) });
      }
      if (url.includes("/wtr-v3/weather/all?")) {
        return Promise.resolve({ ok: true, status: 200, statusText: "OK", text: async () => JSON.stringify(xiaomiWeatherAll()) });
      }
      return Promise.reject(new Error(`unexpected url: ${url}`));
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const { fetchWeatherHourly72h } = await import("../weatherService");
    const res = await fetchWeatherHourly72h("121.5,31.2");

    expect(res.code).toBe("200");
    expect(res.hourly?.[0]?.temp).toBe("25");
    expect(res.hourly?.[0]?.text).toBe("晴");
  });

  it("fetchAstronomySun 根据 date 返回对应日期的日出日落", async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/wtr-v3/location/city/geo?")) {
        return Promise.resolve({ ok: true, status: 200, statusText: "OK", text: async () => JSON.stringify(xiaomiCity()) });
      }
      if (url.includes("/wtr-v3/weather/all?")) {
        return Promise.resolve({ ok: true, status: 200, statusText: "OK", text: async () => JSON.stringify(xiaomiWeatherAll()) });
      }
      return Promise.reject(new Error(`unexpected url: ${url}`));
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const { fetchAstronomySun } = await import("../weatherService");
    const res = await fetchAstronomySun("121.5,31.2", formatDateFromOffset(1));

    expect(res.code).toBe("200");
    expect(res.sunrise).toBe("05:31");
    expect(res.sunset).toBe("18:56");
  });

  it("fetchWeatherNow 捕获 HTTP 错误并返回 error 字段", async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/wtr-v3/location/city/geo?")) {
        return Promise.resolve({ ok: true, status: 200, statusText: "OK", text: async () => JSON.stringify(xiaomiCity()) });
      }
      return Promise.resolve({
        ok: false,
        status: 500,
        statusText: "Internal Server Error",
        text: async () => JSON.stringify({ message: "server error" }),
      });
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const { fetchWeatherNow } = await import("../weatherService");
    const res = await fetchWeatherNow("121.5,31.2");

    expect(res.error).toContain("HTTP 500");
  });

  it("getCoordsViaIP 能从不同数据源解析坐标", async () => {
    const responses: Record<string, unknown> = {
      "https://ipapi.co/json/": { latitude: 31.2, longitude: 121.5 },
    };

    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      const data = responses[url];
      if (!data) return Promise.reject(new Error(`unexpected url: ${url}`));
      return Promise.resolve({ ok: true, status: 200, statusText: "OK", text: async () => JSON.stringify(data) });
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const { getCoordsViaIP } = await import("../locationService");
    const coords = await getCoordsViaIP();

    expect(coords).not.toBeNull();
    expect(coords?.lat).toBeCloseTo(31.2);
    expect(coords?.lon).toBeCloseTo(121.5);
  });

  it("buildWeatherFlow 不再请求和风 GeoAPI，并可从反编码提取城市名", async () => {
    if (!globalThis.localStorage) {
      const store = new Map<string, string>();
      globalThis.localStorage = {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => void store.set(key, value),
        removeItem: (key: string) => void store.delete(key),
        clear: () => void store.clear(),
        key: (index: number) => Array.from(store.keys())[index] ?? null,
        get length() {
          return store.size;
        },
      } as unknown as Storage;
    }

    localStorage.setItem(
      "weather-cache",
      JSON.stringify({ coords: { lat: 31.2, lon: 121.5, source: "geolocation", updatedAt: Date.now() } })
    );

    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/geo/v2/")) return Promise.reject(new Error(`GeoAPI should not be called: ${url}`));
      if (url.startsWith("https://restapi.amap.com/v3/geocode/regeo?")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          statusText: "OK",
          text: async () =>
            JSON.stringify({
              status: "1",
              regeocode: { formatted_address: "中国 上海市 浦东新区", addressComponent: { city: "上海市" } },
            }),
        });
      }
      if (url.includes("/wtr-v3/location/city/geo?")) {
        return Promise.resolve({ ok: true, status: 200, statusText: "OK", text: async () => JSON.stringify(xiaomiCity()) });
      }
      if (url.includes("/wtr-v3/weather/all?")) {
        return Promise.resolve({ ok: true, status: 200, statusText: "OK", text: async () => JSON.stringify(xiaomiWeatherAll()) });
      }
      return Promise.reject(new Error(`unexpected url: ${url}`));
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const { buildWeatherFlow } = await import("../weatherService");
    const result = await buildWeatherFlow();

    expect(result.coords).not.toBeNull();
    expect(result.city).toBe("上海市");
    expect(result.weather?.code).toBe("200");

    const calledUrls = fetchMock.mock.calls.map((c) => String(c[0]));
    expect(calledUrls.some((u) => u.includes("/geo/v2/"))).toBe(false);
    expect(calledUrls.some((u) => u.includes("/wtr-v3/weather/all"))).toBe(true);
    expect(calledUrls.some((u) => u.includes("locationKey=weathercn%3A101020100"))).toBe(true);
  });
});
