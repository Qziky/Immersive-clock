import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const runtimeMocks = vi.hoisted(() => ({
  coords: {
    lat: 31.2,
    lon: 121.5,
    source: "test",
    updatedAt: Date.parse("2026-03-07T10:00:00+08:00"),
  } as { lat: number; lon: number; source: string; updatedAt: number } | null,
  validData: null as null | {
    code?: string;
    updateTime?: string;
    minutely?: Array<{ fxTime?: string; precip?: string }>;
  },
  cache: {} as Record<string, unknown>,
  fetchMinutelyPrecip: vi.fn(),
  updateMinutelyCache: vi.fn(),
}));

vi.mock("../../utils/appSettings", () => ({
  getAppSettings: () => ({ general: { weather: { autoRefreshIntervalMin: 30 } } }),
}));

vi.mock("../../utils/timeSync", () => ({
  getAdjustedNowMs: () => Date.now(),
}));

vi.mock("../../utils/weatherStorage", () => ({
  getValidCoords: () => runtimeMocks.coords,
  getValidMinutely: () => runtimeMocks.validData,
  getWeatherCache: () => runtimeMocks.cache,
  updateMinutelyCache: runtimeMocks.updateMinutelyCache,
  updateMinutelyCriticalFetch: vi.fn(),
}));

vi.mock("../locationService", () => ({
  buildLocationFlow: vi.fn(async () => ({ coords: runtimeMocks.coords })),
}));

vi.mock("../weatherService", () => ({
  fetchMinutelyPrecip: runtimeMocks.fetchMinutelyPrecip,
}));

describe("minutelyWeatherRuntime", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-07T10:00:00+08:00"));
    runtimeMocks.coords = {
      lat: 31.2,
      lon: 121.5,
      source: "test",
      updatedAt: Date.now(),
    };
    runtimeMocks.validData = null;
    runtimeMocks.cache = {};
    runtimeMocks.fetchMinutelyPrecip.mockReset();
    runtimeMocks.updateMinutelyCache.mockReset();
    runtimeMocks.updateMinutelyCache.mockImplementation((_location, data, fetchedAt) => {
      runtimeMocks.validData = data;
      runtimeMocks.cache = {
        minutely: {
          data,
          location: "121.50,31.20",
          updatedAt: fetchedAt,
          lastApiFetchAt: fetchedAt,
        },
      };
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("有效缓存已过期时即使 lastFetchAt 小于 API 间隔也会重新请求", async () => {
    runtimeMocks.cache = {
      minutely: {
        data: { code: "200" },
        location: "121.50,31.20",
        updatedAt: Date.now() - 6 * 60 * 1000,
        lastApiFetchAt: Date.now() - 6 * 60 * 1000,
      },
    };
    runtimeMocks.fetchMinutelyPrecip.mockResolvedValue({
      code: "200",
      updateTime: new Date(Date.now()).toISOString(),
      minutely: [
        { fxTime: new Date(Date.now()).toISOString(), precip: "0" },
        { fxTime: new Date(Date.now() + 60 * 1000).toISOString(), precip: "0.2" },
        { fxTime: new Date(Date.now() + 2 * 60 * 1000).toISOString(), precip: "0" },
      ],
    });

    const runtime = await import("../minutelyWeatherRuntime");
    await runtime.refreshMinutelyWeather();

    expect(runtimeMocks.fetchMinutelyPrecip).toHaveBeenCalledOnce();
    expect(runtime.getMinutelyWeatherSnapshot()).toMatchObject({
      status: "ready",
      freshness: "fresh",
      stale: false,
      phase: "PRE_RAIN",
    });
  });

  it("没有 Weather 组件时，任一订阅者仍会启动共享刷新", async () => {
    runtimeMocks.fetchMinutelyPrecip.mockResolvedValue({
      code: "200",
      updateTime: new Date(Date.now()).toISOString(),
      minutely: [
        { fxTime: new Date(Date.now()).toISOString(), precip: "0" },
        { fxTime: new Date(Date.now() + 60 * 1000).toISOString(), precip: "0.2" },
        { fxTime: new Date(Date.now() + 2 * 60 * 1000).toISOString(), precip: "0" },
      ],
    });

    const runtime = await import("../minutelyWeatherRuntime");
    const listener = vi.fn();
    const unsubscribe = runtime.subscribeMinutelyWeather(listener);

    await vi.waitFor(() => {
      expect(runtimeMocks.fetchMinutelyPrecip).toHaveBeenCalledOnce();
      expect(runtime.getMinutelyWeatherSnapshot().freshness).toBe("fresh");
    });
    expect(listener).toHaveBeenCalled();
    unsubscribe();
  });

  it("可信时间轴缺失时 freshness 为 unknown 且不暴露 stats/phase", async () => {
    const data = {
      code: "200",
      minutely: [{ precip: "0.2" }, { precip: "0" }],
    };
    runtimeMocks.validData = data;
    runtimeMocks.cache = {
      minutely: {
        data,
        location: "121.50,31.20",
        updatedAt: Date.now(),
        lastApiFetchAt: Date.now(),
      },
    };

    const runtime = await import("../minutelyWeatherRuntime");
    const stop = runtime.startMinutelyWeatherRuntime({ localTickMs: 60 * 1000 });
    const snapshot = runtime.getMinutelyWeatherSnapshot();
    stop();

    expect(snapshot).toMatchObject({
      status: "ready",
      freshness: "unknown",
      stale: false,
      stats: null,
      phase: null,
      sourceUpdatedAt: null,
    });
    expect(runtimeMocks.fetchMinutelyPrecip).not.toHaveBeenCalled();
  });

  it("过期缓存只发布 stale 快照，不暴露旧降雨统计", async () => {
    runtimeMocks.cache = {
      minutely: {
        data: {
          code: "200",
          updateTime: new Date(Date.now() - 6 * 60 * 1000).toISOString(),
        },
        location: "121.50,31.20",
        updatedAt: Date.now() - 6 * 60 * 1000,
        lastApiFetchAt: Date.now() - 6 * 60 * 1000,
      },
    };
    runtimeMocks.fetchMinutelyPrecip.mockResolvedValue({ error: "offline" });

    const runtime = await import("../minutelyWeatherRuntime");
    await runtime.refreshMinutelyWeather();

    expect(runtime.getMinutelyWeatherSnapshot()).toMatchObject({
      status: "error",
      freshness: "error",
      stale: true,
      stats: null,
      phase: null,
    });
  });

  it("有效缓存存在时强制刷新失败，也会持续隐藏确定的降雨倒计时", async () => {
    const data = {
      code: "200",
      updateTime: new Date(Date.now()).toISOString(),
      minutely: [
        { fxTime: new Date(Date.now()).toISOString(), precip: "0" },
        { fxTime: new Date(Date.now() + 60 * 1000).toISOString(), precip: "0.2" },
        { fxTime: new Date(Date.now() + 2 * 60 * 1000).toISOString(), precip: "0" },
      ],
    };
    runtimeMocks.validData = data;
    runtimeMocks.cache = {
      minutely: {
        data,
        location: "121.50,31.20",
        updatedAt: Date.now(),
        lastApiFetchAt: Date.now(),
      },
    };
    runtimeMocks.fetchMinutelyPrecip.mockResolvedValue({ error: "offline" });

    const runtime = await import("../minutelyWeatherRuntime");
    await runtime.refreshMinutelyWeather({ force: true });

    expect(runtime.getMinutelyWeatherSnapshot()).toMatchObject({
      status: "error",
      freshness: "error",
      stale: true,
      stats: null,
      phase: null,
      error: "offline",
    });

    const stop = runtime.startMinutelyWeatherRuntime({ localTickMs: 5 * 1000 });
    await vi.advanceTimersByTimeAsync(5 * 1000);
    expect(runtime.getMinutelyWeatherSnapshot()).toMatchObject({
      status: "error",
      freshness: "error",
      stats: null,
      phase: null,
    });
    stop();
  });
});
