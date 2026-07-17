import { beforeEach, describe, expect, it, vi } from "vitest";

import type { WeatherFlowResult } from "../weatherService";

const mocks = vi.hoisted(() => ({
  buildWeatherFlow: vi.fn(),
  getWeatherCache: vi.fn(),
  updateAirQualityCache: vi.fn(),
  updateAstronomySunCache: vi.fn(),
  updateDaily3dCache: vi.fn(),
  updateMinutelyCache: vi.fn(),
  updateWeatherDetailsCache: vi.fn(),
  updateWeatherNowSnapshot: vi.fn(),
}));

vi.mock("../weatherService", () => ({
  buildWeatherFlow: mocks.buildWeatherFlow,
}));

vi.mock("../../utils/timeSync", () => ({
  getAdjustedDate: () => new Date("2026-07-17T10:00:00+08:00"),
}));

vi.mock("../../utils/weatherStorage", () => ({
  createWeatherLocationKey: (lat: number, lon: number) => `${lon.toFixed(4)},${lat.toFixed(4)}`,
  getWeatherCache: mocks.getWeatherCache,
  updateAirQualityCache: mocks.updateAirQualityCache,
  updateAstronomySunCache: mocks.updateAstronomySunCache,
  updateDaily3dCache: mocks.updateDaily3dCache,
  updateMinutelyCache: mocks.updateMinutelyCache,
  updateWeatherDetailsCache: mocks.updateWeatherDetailsCache,
  updateWeatherNowSnapshot: mocks.updateWeatherNowSnapshot,
}));

function weatherFlowResult(): WeatherFlowResult {
  return {
    addressInfo: { address: "上海市测试路 1 号", source: "Amap" },
    airQuality: { indexes: [{ aqi: 50, category: "优", name: "AQI" }] },
    astronomySun: { code: "200", sunrise: "05:01", sunset: "18:59" },
    coords: { lat: 31.2, lon: 121.5 },
    coordsSource: "geolocation",
    daily3d: { code: "200", daily: [{ fxDate: "2026-07-17" }] },
    details: {
      alerts: [],
      brands: [],
      daily: [],
      hourly: [],
      indices: [],
      previousHours: [],
      raw: { sourceMaps: { rawSentinel: "weather-all" }, status: 0 },
      technical: {
        channels: [],
        sourceMaps: { rawSentinel: "weather-all" },
        statuses: { response: 0 },
        units: {},
        urls: {},
      },
      typhoons: [],
    },
    weather: {
      code: "200",
      now: { obsTime: "2026-07-17T10:00:00+08:00", temp: "28", text: "多云" },
    },
  };
}

describe("refreshWeatherBundle", () => {
  beforeEach(() => {
    vi.resetModules();
    Object.values(mocks).forEach((mock) => mock.mockReset());
    mocks.getWeatherCache.mockReturnValue({
      geolocation: { diagnostics: { permissionState: "granted" } },
    });
  });

  it("并发调用复用同一次全量天气流并缓存完整详情", async () => {
    let resolveFlow: ((value: WeatherFlowResult) => void) | undefined;
    mocks.buildWeatherFlow.mockReturnValue(
      new Promise<WeatherFlowResult>((resolve) => {
        resolveFlow = resolve;
      })
    );
    const received: Array<Record<string, unknown>> = [];
    const listener = (event: Event) => {
      received.push((event as CustomEvent<Record<string, unknown>>).detail);
    };
    window.addEventListener("weatherRefreshDone", listener);
    const { refreshWeatherBundle } = await import("../weatherRefresh");

    const first = refreshWeatherBundle();
    const second = refreshWeatherBundle();
    expect(first).toBe(second);
    expect(mocks.buildWeatherFlow).toHaveBeenCalledTimes(1);

    resolveFlow?.(weatherFlowResult());
    await Promise.all([first, second]);
    window.removeEventListener("weatherRefreshDone", listener);

    expect(mocks.buildWeatherFlow).toHaveBeenCalledWith({
      fetchAirQuality: true,
      fetchAstronomySun: true,
      fetchDaily3d: true,
    });
    expect(mocks.updateWeatherDetailsCache).toHaveBeenCalledWith(
      "121.5000,31.2000",
      expect.objectContaining({
        raw: expect.objectContaining({ sourceMaps: { rawSentinel: "weather-all" } }),
      })
    );
    expect(mocks.updateWeatherNowSnapshot).toHaveBeenCalledTimes(1);
    expect(mocks.updateDaily3dCache).toHaveBeenCalledWith(
      "121.5000,31.2000",
      expect.objectContaining({ code: "200" })
    );
    expect(mocks.updateAstronomySunCache).toHaveBeenCalledWith(
      "121.5000,31.2000",
      "20260717",
      expect.objectContaining({ sunrise: "05:01" })
    );
    expect(received).toHaveLength(1);
    expect(received[0]).toMatchObject({
      details: expect.objectContaining({
        raw: expect.objectContaining({ sourceMaps: { rawSentinel: "weather-all" } }),
      }),
      status: "成功",
    });
  });

  it("刷新失败发送失败状态且不覆盖上次缓存", async () => {
    mocks.buildWeatherFlow.mockRejectedValue(new Error("接口暂时不可用"));
    mocks.getWeatherCache.mockReturnValue({
      coords: { lat: 31.2, lon: 121.5, source: "cache", updatedAt: 1 },
      location: {
        address: "上次地址",
        signature: "31.2000,121.5000",
        updatedAt: 1,
      },
    });
    let received: Record<string, unknown> | undefined;
    const listener = (event: Event) => {
      received = (event as CustomEvent<Record<string, unknown>>).detail;
    };
    window.addEventListener("weatherRefreshDone", listener);
    const { refreshWeatherBundle } = await import("../weatherRefresh");

    await expect(refreshWeatherBundle()).rejects.toThrow("接口暂时不可用");
    window.removeEventListener("weatherRefreshDone", listener);

    expect(mocks.updateWeatherNowSnapshot).not.toHaveBeenCalled();
    expect(mocks.updateWeatherDetailsCache).not.toHaveBeenCalled();
    expect(received).toMatchObject({
      address: "上次地址",
      coords: { lat: 31.2, lon: 121.5 },
      errorMessage: "接口暂时不可用",
      status: "失败",
    });
  });

  it("内嵌分钟状态或样本无效时不覆盖现有分钟缓存", async () => {
    mocks.buildWeatherFlow.mockResolvedValue({
      ...weatherFlowResult(),
      embeddedMinutely: {
        code: "200",
        minutely: [{ precip: "" }],
        provider: {
          flags: { precipitationStatus: 1, responseStatus: 0 },
          raw: { status: 0 },
        },
      },
    });
    const { refreshWeatherBundle } = await import("../weatherRefresh");

    await refreshWeatherBundle();

    expect(mocks.updateMinutelyCache).not.toHaveBeenCalled();
  });
});
