import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  fetchMinutelyPrecip: vi.fn(),
  validMinutely: null as null | {
    code: string;
    minutely: Array<{ fxTime: string; precip: string; type: string }>;
    summary: string;
    updateTime: string;
  },
  weatherCache: {} as Record<string, unknown>,
}));

vi.mock("../weatherService", () => ({
  fetchMinutelyPrecip: mocks.fetchMinutelyPrecip,
}));

vi.mock("../../utils/timeSync", () => ({
  getAdjustedNowMs: () => Date.parse("2026-07-17T10:00:00+08:00"),
}));

vi.mock("../../utils/weatherStorage", () => ({
  createWeatherLocationKey: (lat: number, lon: number) => `${lon.toFixed(4)},${lat.toFixed(4)}`,
  getValidCoords: () => ({
    lat: 31.2,
    lon: 121.5,
    source: "test",
    updatedAt: Date.now(),
  }),
  getValidMinutely: () => mocks.validMinutely,
  getWeatherCache: () => mocks.weatherCache,
}));

function validMinutely() {
  return {
    code: "200",
    minutely: [
      { fxTime: "2026-07-17T10:01:00+08:00", precip: "0", type: "rain" },
      { fxTime: "2026-07-17T10:02:00+08:00", precip: "0.2", type: "rain" },
    ],
    summary: "稍后有雨",
    updateTime: "2026-07-17T10:00:00+08:00",
  };
}

describe("minutelyWeatherRuntime", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.resetModules();
    mocks.fetchMinutelyPrecip.mockReset();
    mocks.validMinutely = validMinutely();
    mocks.weatherCache = {
      minutely: {
        data: mocks.validMinutely,
        lastApiFetchAt: Date.parse("2026-07-17T09:59:00+08:00"),
        location: "121.5000,31.2000",
        updatedAt: Date.parse("2026-07-17T09:59:00+08:00"),
      },
    };
  });

  afterEach(async () => {
    const runtime = await import("../minutelyWeatherRuntime");
    runtime.__resetMinutelyWeatherRuntimeForTests();
    vi.useRealTimers();
  });

  it("订阅只启动本地重算，不访问分钟接口", async () => {
    const runtime = await import("../minutelyWeatherRuntime");
    const listener = vi.fn();
    const unsubscribe = runtime.subscribeMinutelyWeather(listener);

    await vi.advanceTimersByTimeAsync(5 * 60 * 1000);

    expect(listener).toHaveBeenCalled();
    expect(mocks.fetchMinutelyPrecip).not.toHaveBeenCalled();
    expect(runtime.getMinutelyWeatherSnapshot()).toMatchObject({
      freshness: "fresh",
      phase: "PRE_RAIN",
      status: "ready",
    });
    unsubscribe();
  });

  it("可信缓存会计算降雨阶段和统计", async () => {
    const runtime = await import("../minutelyWeatherRuntime");
    runtime.recomputeMinutelyWeatherSnapshot();

    expect(runtime.getMinutelyWeatherSnapshot()).toMatchObject({
      freshness: "fresh",
      phase: "PRE_RAIN",
      stale: false,
      stats: {
        hasRain: true,
        hasReliableTimestamps: true,
      },
    });
  });

  it("过期缓存只发布 stale，不暴露旧统计", async () => {
    mocks.validMinutely = null;
    const runtime = await import("../minutelyWeatherRuntime");
    runtime.recomputeMinutelyWeatherSnapshot();

    expect(runtime.getMinutelyWeatherSnapshot()).toMatchObject({
      freshness: "stale",
      phase: null,
      stale: true,
      stats: null,
      status: "stale",
    });
  });

  it("协调器标记失败后保留缓存但隐藏确定倒计时", async () => {
    const runtime = await import("../minutelyWeatherRuntime");
    runtime.setMinutelyWeatherRuntimeError("offline");

    expect(runtime.getMinutelyWeatherSnapshot()).toMatchObject({
      error: "offline",
      freshness: "error",
      phase: null,
      stale: true,
      stats: null,
      status: "error",
    });
    expect(mocks.fetchMinutelyPrecip).not.toHaveBeenCalled();
  });
});
