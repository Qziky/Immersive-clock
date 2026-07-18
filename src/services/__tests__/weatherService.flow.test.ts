import { beforeEach, describe, expect, it, vi } from "vitest";

import type { WeatherLocation } from "../../types/weather";
import { APP_SETTINGS_KEY } from "../../utils/appSettings";

vi.mock("../weatherRequestGuard", () => ({
  executeWeatherRequest: <T>(runner: () => Promise<T>) => runner(),
}));

function response(data: unknown): Response {
  return new Response(JSON.stringify(data), {
    headers: { "content-type": "application/json" },
    status: 200,
  });
}

function browserLocation(): WeatherLocation {
  return {
    city: {
      affiliation: "上海市",
      lat: 31.2,
      locationKey: "weathercn:101020100",
      lon: 121.5,
      name: "上海市",
    },
    coords: { accuracy: 28, lat: 31.2, lon: 121.5 },
    mode: "auto",
    resolvedAt: Date.now(),
    source: "browser",
  };
}

describe("weather and location flow", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
    Object.defineProperty(window, "isSecureContext", { configurable: true, value: true });
    Object.defineProperty(navigator, "permissions", {
      configurable: true,
      value: { query: vi.fn().mockResolvedValue({ state: "granted" }) },
    });
  });

  it("固定使用高精度新坐标且不执行低精度重试", async () => {
    const getCurrentPosition = vi.fn(
      (
        success: PositionCallback,
        _error?: PositionErrorCallback | null,
        _options?: PositionOptions
      ) =>
        success({
          coords: {
            accuracy: 18,
            altitude: null,
            altitudeAccuracy: null,
            heading: null,
            latitude: 31.2,
            longitude: 121.5,
            speed: null,
            toJSON: () => ({}),
          },
          timestamp: Date.now(),
          toJSON: () => ({}),
        })
    );
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: { getCurrentPosition },
    });

    const { getGeolocationResult } = await import("../locationService");
    const result = await getGeolocationResult();

    expect(result.coords).toEqual({ accuracy: 18, lat: 31.2, lon: 121.5 });
    expect(getCurrentPosition).toHaveBeenCalledTimes(1);
    expect(getCurrentPosition.mock.calls[0]?.[2]).toEqual({
      enableHighAccuracy: true,
      maximumAge: 0,
      timeout: 20_000,
    });
  });

  it("浏览器定位失败后使用公共 IP，再由小米解析城市", async () => {
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: {
        getCurrentPosition: (_success: PositionCallback, error: PositionErrorCallback) =>
          error({
            code: 2,
            message: "unavailable",
            PERMISSION_DENIED: 1,
            POSITION_UNAVAILABLE: 2,
            TIMEOUT: 3,
          }),
      },
    });
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "https://ipapi.co/json/")
        return Promise.resolve(response({ latitude: 30.2, longitude: 120.1 }));
      if (url.includes("/location/city/geo?")) {
        return Promise.resolve(
          response([
            {
              affiliation: "浙江省",
              latitude: "30.2",
              locationKey: "weathercn:101210101",
              longitude: "120.1",
              name: "杭州市",
            },
          ])
        );
      }
      return Promise.reject(new Error(`unexpected ${url}`));
    });
    vi.stubGlobal("fetch", fetchMock);

    const { resolveWeatherLocation } = await import("../locationService");
    const result = await resolveWeatherLocation();

    expect(result.location.source).toBe("public_ip");
    expect(result.location.city).toMatchObject({
      locationKey: "weathercn:101210101",
      name: "杭州市",
    });
  });

  it("自动模式不会复用旧手动位置", async () => {
    const cachedManual: WeatherLocation = {
      ...browserLocation(),
      mode: "manual",
      source: "manual_city",
    };
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: {
        getCurrentPosition: (_success: PositionCallback, error: PositionErrorCallback) =>
          error({
            code: 2,
            message: "unavailable",
            PERMISSION_DENIED: 1,
            POSITION_UNAVAILABLE: 2,
            TIMEOUT: 3,
          }),
      },
    });
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL) => {
        const url = String(input);
        if (url === "https://ipapi.co/json/")
          return Promise.resolve(response({ latitude: 39.9, longitude: 116.4 }));
        if (url.includes("/location/city/geo?")) {
          return Promise.resolve(
            response([
              {
                latitude: "39.9",
                locationKey: "weathercn:101010100",
                longitude: "116.4",
                name: "北京市",
              },
            ])
          );
        }
        return Promise.reject(new Error(`unexpected ${url}`));
      })
    );

    const { resolveWeatherLocation } = await import("../locationService");
    const result = await resolveWeatherLocation({ cachedLocation: cachedManual });
    expect(result.location.mode).toBe("auto");
    expect(result.location.city.name).toBe("北京市");
  });

  it("城市搜索返回全部候选并缓存同一查询", async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve(
        response([
          {
            affiliation: "吉林省",
            latitude: "43.8",
            locationKey: "weathercn:1",
            longitude: "126.5",
            name: "吉林市",
          },
          {
            affiliation: "吉林省",
            latitude: "43.9",
            locationKey: "weathercn:2",
            longitude: "125.3",
            name: "长春市",
          },
        ])
      )
    );
    vi.stubGlobal("fetch", fetchMock);
    const { searchWeatherCities } = await import("../locationService");

    const first = await searchWeatherCities("吉林");
    const second = await searchWeatherCities(" 吉林 ");

    expect(first).toHaveLength(2);
    expect(first[0]).toMatchObject({ affiliation: "吉林省", locationKey: "weathercn:1" });
    expect(second).toEqual(first);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("坐标城市解析按坐标签名缓存 24 小时", async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve(
        response([
          {
            affiliation: "浙江省",
            latitude: "30.2",
            locationKey: "weathercn:101210101",
            longitude: "120.1",
            name: "杭州市",
          },
        ])
      )
    );
    vi.stubGlobal("fetch", fetchMock);
    const { resolveCityByCoords } = await import("../locationService");

    const first = await resolveCityByCoords(30.2, 120.1);
    const second = await resolveCityByCoords(30.2, 120.1);

    expect(first).toMatchObject({ affiliation: "浙江省", locationKey: "weathercn:101210101" });
    expect(second).toEqual(first);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("手动城市选择直接携带 locationKey，天气刷新不再搜索城市", async () => {
    const location: WeatherLocation = {
      ...browserLocation(),
      mode: "manual",
      source: "manual_city",
    };
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (!url.includes("/weather/all?")) return Promise.reject(new Error(`unexpected ${url}`));
      return Promise.resolve(
        response({
          alerts: [],
          current: { pubTime: Date.now(), temperature: { value: "26" }, weather: "0" },
          forecastDaily: { sunRiseSet: { value: [{ from: "05:00", to: "19:00" }] } },
          status: 0,
          updateTime: Date.now(),
        })
      );
    });
    vi.stubGlobal("fetch", fetchMock);
    const { buildWeatherFlow } = await import("../weatherService");

    const result = await buildWeatherFlow({ location });

    expect(result.location).toEqual(location);
    expect(result.weather?.now?.temp).toBe("26");
    const urls = fetchMock.mock.calls.map(([input]) => String(input));
    expect(urls.filter((url) => url.includes("/weather/all?"))).toHaveLength(1);
    expect(urls.some((url) => url.includes("/location/city/"))).toBe(false);
  });

  it("旧手动坐标可经小米 geo 一次性迁移为已选城市", async () => {
    localStorage.setItem(
      APP_SETTINGS_KEY,
      JSON.stringify({
        version: 7,
        general: {
          weather: {
            locationMode: "manual",
            manualLocation: { lat: 30.2, lon: 120.1, type: "coords" },
          },
        },
      })
    );
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(
          response([
            {
              latitude: "30.2",
              locationKey: "weathercn:101210101",
              longitude: "120.1",
              name: "杭州市",
            },
          ])
        )
      )
    );
    const { resolveWeatherLocation } = await import("../locationService");
    const result = await resolveWeatherLocation();

    expect(result.location.city.locationKey).toBe("weathercn:101210101");
    const stored = JSON.parse(localStorage.getItem(APP_SETTINGS_KEY) || "{}");
    expect(stored.general.weather.manualLocation.selected.locationKey).toBe("weathercn:101210101");
  });
});
