import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { MinutelyPrecipResponse } from "../../types/weather";
import type { WeatherFlowResult } from "../weatherService";

const NOW = Date.parse("2026-07-17T10:00:00+08:00");
const LOCATION = "121.5000,31.2000";

interface CoordinatorTestCache {
  coords?: { lat: number; lon: number; source: string; updatedAt: number } | null;
  details?: {
    data: Record<string, unknown>;
    location: string;
    updatedAt: number;
  };
  minutely?: {
    data: MinutelyPrecipResponse;
    lastApiFetchAt?: number;
    location: string;
    updatedAt: number;
  };
}

const mocks = vi.hoisted(() => ({
  broadcastWeatherCacheUpdate: vi.fn(),
  cache: {} as CoordinatorTestCache,
  cooldownUntil: null as number | null,
  coords: {
    lat: 31.2,
    lon: 121.5,
    source: "test",
    updatedAt: 0,
  } as { lat: number; lon: number; source: string; updatedAt: number } | null,
  embeddedMinutely: null as MinutelyPrecipResponse | null,
  fetchMinutelyPrecip: vi.fn(),
  guardNextAllowedAt: 0,
  online: true,
  phase: "DRY" as "DRY" | "PRE_RAIN" | "RAINING" | "POST_RAIN" | null,
  recomputeMinutelyWeatherSnapshot: vi.fn(),
  refreshWeatherBundle: vi.fn(),
  requestsThisHour: 0,
  setMinutelyWeatherRuntimeError: vi.fn(),
  syncListener: null as
    | null
    | ((message: {
        id: string;
        location: string | null;
        sentAt: number;
        target: "all" | "minutely";
        type: "cache-updated";
      }) => void),
  updateMinutelyCache: vi.fn(),
  visibility: "visible" as DocumentVisibilityState,
}));

vi.mock("../../utils/appSettings", () => ({
  getAppSettings: () => ({
    general: {
      weather: {
        schedule: {
          profile: "balanced",
          custom: {
            allForegroundMin: 5,
            allBackgroundMin: 15,
            minutelyDryMin: 5,
            minutelyRainMin: 2,
            minutelyBackgroundMin: 15,
          },
          safety: {
            maxRequestsPerHour: 60,
            minRequestGapSec: 2,
          },
        },
      },
    },
  }),
}));

vi.mock("../../utils/settingsEvents", () => ({
  SETTINGS_EVENTS: {
    SettingsSaved: "settings-saved",
    WeatherSettingsUpdated: "weather-settings-updated",
  },
  subscribeSettingsEvent: () => () => undefined,
}));

vi.mock("../../utils/weatherStorage", () => ({
  createWeatherLocationKey: (lat: number, lon: number) => `${lon.toFixed(4)},${lat.toFixed(4)}`,
  getValidCoords: () => mocks.coords,
  getValidMinutely: (location: string) => {
    const entry = mocks.cache.minutely;
    if (entry?.location === location && Date.now() - entry.updatedAt < 5 * 60 * 1000) {
      return entry.data;
    }
    return null;
  },
  getWeatherCache: () => mocks.cache,
  updateMinutelyCache: (
    location: string,
    data: MinutelyPrecipResponse,
    lastApiFetchAt?: number
  ) => {
    mocks.updateMinutelyCache(location, data, lastApiFetchAt);
    mocks.cache.minutely = {
      data,
      lastApiFetchAt,
      location,
      updatedAt: Date.now(),
    };
  },
}));

vi.mock("../minutelyWeatherRuntime", () => ({
  getMinutelyWeatherSnapshot: () => ({ phase: mocks.phase }),
  recomputeMinutelyWeatherSnapshot: mocks.recomputeMinutelyWeatherSnapshot,
  setMinutelyWeatherRuntimeError: mocks.setMinutelyWeatherRuntimeError,
}));

vi.mock("../weatherRefresh", () => ({
  refreshWeatherBundle: mocks.refreshWeatherBundle,
}));

vi.mock("../weatherService", () => ({
  fetchMinutelyPrecip: mocks.fetchMinutelyPrecip,
}));

vi.mock("../weatherRequestGuard", () => {
  class WeatherRequestDeferredError extends Error {
    constructor(public readonly retryAt: number) {
      super("deferred");
      this.name = "WeatherRequestDeferredError";
    }
  }

  return {
    getWeatherRequestGuardSnapshot: (now = Date.now()) => ({
      cooldownUntil: mocks.cooldownUntil,
      lastRequestAt: null,
      nextAllowedAt: Math.max(now, mocks.guardNextAllowedAt),
      requestsThisHour: mocks.requestsThisHour,
    }),
    WeatherRequestDeferredError,
  };
});

vi.mock("../weatherSyncChannel", () => ({
  __resetWeatherSyncChannelForTests: vi.fn(),
  broadcastWeatherCacheUpdate: mocks.broadcastWeatherCacheUpdate,
  subscribeWeatherCacheSync: (listener: typeof mocks.syncListener) => {
    mocks.syncListener = listener;
    return () => {
      mocks.syncListener = null;
    };
  },
}));

function validMinutely(): MinutelyPrecipResponse {
  return {
    code: "200",
    minutely: [
      { fxTime: "2026-07-17T10:01:00+08:00", precip: "0", type: "rain" },
      { fxTime: "2026-07-17T10:02:00+08:00", precip: "0.2", type: "rain" },
    ],
    provider: {
      flags: { precipitationStatus: 0, responseStatus: 0 },
      raw: { status: 0 },
    },
    updateTime: "2026-07-17T10:00:00+08:00",
  };
}

function weatherFlowResult(): WeatherFlowResult {
  return {
    coords: { lat: 31.2, lon: 121.5 },
    embeddedMinutely: mocks.embeddedMinutely,
    providerLocation: {
      lat: 31.2,
      locationKey: "weathercn:101020100",
      lon: 121.5,
    },
    weather: { code: "200", now: { temp: "28", text: "多云" } },
  };
}

function setFreshCache(options: { allAgeMin?: number; minutelyAgeMin?: number } = {}) {
  const allUpdatedAt = NOW - (options.allAgeMin ?? 0) * 60 * 1000;
  const minutelyUpdatedAt = NOW - (options.minutelyAgeMin ?? 0) * 60 * 1000;
  mocks.cache = {
    coords: mocks.coords,
    details: {
      data: { raw: {} },
      location: LOCATION,
      updatedAt: allUpdatedAt,
    },
    minutely: {
      data: validMinutely(),
      location: LOCATION,
      updatedAt: minutelyUpdatedAt,
    },
  };
}

describe("weatherCoordinator", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    vi.resetModules();
    localStorage.clear();

    mocks.cooldownUntil = null;
    mocks.broadcastWeatherCacheUpdate.mockReset();
    mocks.coords = {
      lat: 31.2,
      lon: 121.5,
      source: "test",
      updatedAt: NOW,
    };
    mocks.embeddedMinutely = validMinutely();
    mocks.guardNextAllowedAt = NOW;
    mocks.online = true;
    mocks.phase = "DRY";
    mocks.requestsThisHour = 0;
    mocks.visibility = "visible";
    mocks.fetchMinutelyPrecip.mockReset();
    mocks.recomputeMinutelyWeatherSnapshot.mockReset();
    mocks.refreshWeatherBundle.mockReset();
    mocks.setMinutelyWeatherRuntimeError.mockReset();
    mocks.updateMinutelyCache.mockReset();

    setFreshCache();
    mocks.fetchMinutelyPrecip.mockResolvedValue(validMinutely());
    mocks.refreshWeatherBundle.mockImplementation(async () => {
      mocks.cache.details = {
        data: { raw: {} },
        location: LOCATION,
        updatedAt: Date.now(),
      };
      if (mocks.embeddedMinutely?.minutely?.length) {
        mocks.cache.minutely = {
          data: mocks.embeddedMinutely,
          location: LOCATION,
          updatedAt: Date.now(),
        };
      }
      return weatherFlowResult();
    });

    vi.spyOn(document, "visibilityState", "get").mockImplementation(() => mocks.visibility);
    vi.spyOn(navigator, "onLine", "get").mockImplementation(() => mocks.online);
  });

  afterEach(async () => {
    const coordinator = await import("../weatherCoordinator");
    coordinator.__resetWeatherCoordinatorForTests();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("新鲜缓存只保留一个自适应计时器，不立即请求", async () => {
    const coordinator = await import("../weatherCoordinator");
    coordinator.startWeatherCoordinator();
    await vi.advanceTimersByTimeAsync(0);

    expect(mocks.refreshWeatherBundle).not.toHaveBeenCalled();
    expect(mocks.fetchMinutelyPrecip).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(1);
    expect(coordinator.getWeatherCoordinatorSnapshot()).toMatchObject({
      nextRefreshAt: NOW + 5 * 60 * 1000,
      status: "idle",
    });
  });

  it("全量缓存过期时只执行一次主刷新", async () => {
    setFreshCache({ allAgeMin: 6 });
    const coordinator = await import("../weatherCoordinator");
    coordinator.startWeatherCoordinator();
    await vi.advanceTimersByTimeAsync(0);

    expect(mocks.refreshWeatherBundle).toHaveBeenCalledTimes(1);
    expect(mocks.fetchMinutelyPrecip).not.toHaveBeenCalled();
    expect(mocks.broadcastWeatherCacheUpdate).toHaveBeenCalledWith("all", LOCATION);
    expect(coordinator.getWeatherCoordinatorSnapshot()).toMatchObject({
      lastSuccessAt: NOW,
      status: "ready",
    });
  });

  it("并发调用复用当前 Promise，后续重复意图只执行一次", async () => {
    let finishFirst: ((value: WeatherFlowResult) => void) | undefined;
    mocks.refreshWeatherBundle
      .mockImplementationOnce(
        () =>
          new Promise<WeatherFlowResult>((resolve) => {
            finishFirst = resolve;
          })
      )
      .mockResolvedValue(weatherFlowResult());
    const coordinator = await import("../weatherCoordinator");

    const first = coordinator.requestWeatherRefresh({ force: true, reason: "manual" });
    const second = coordinator.requestWeatherRefresh({ force: true, reason: "manual" });
    const third = coordinator.requestWeatherRefresh({ force: true, reason: "manual" });

    expect(second).toBe(first);
    expect(third).toBe(first);
    expect(mocks.refreshWeatherBundle).toHaveBeenCalledTimes(1);

    finishFirst?.(weatherFlowResult());
    await first;
    await vi.advanceTimersByTimeAsync(0);

    expect(mocks.refreshWeatherBundle).toHaveBeenCalledTimes(2);
  });

  it("手动刷新在请求保护期显示已排队，并在到点后保留强制刷新意图", async () => {
    const coordinator = await import("../weatherCoordinator");
    coordinator.startWeatherCoordinator();
    await vi.advanceTimersByTimeAsync(0);
    mocks.guardNextAllowedAt = NOW + 2_000;

    await coordinator.requestWeatherRefresh({
      force: true,
      reason: "manual",
      target: "all",
    });

    expect(mocks.refreshWeatherBundle).not.toHaveBeenCalled();
    expect(coordinator.getWeatherCoordinatorSnapshot()).toMatchObject({
      nextRefreshAt: NOW + 2_000,
      reason: "manual",
      status: "rate-limited",
    });

    await vi.advanceTimersByTimeAsync(1_999);
    expect(mocks.refreshWeatherBundle).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(mocks.refreshWeatherBundle).toHaveBeenCalledTimes(1);
  });

  it("后台使用 15 分钟间隔，回到前台后立即补齐已到期全量刷新", async () => {
    setFreshCache({ allAgeMin: 6 });
    mocks.visibility = "hidden";
    const coordinator = await import("../weatherCoordinator");
    coordinator.startWeatherCoordinator();
    await vi.advanceTimersByTimeAsync(0);

    expect(mocks.refreshWeatherBundle).not.toHaveBeenCalled();
    expect(coordinator.getWeatherCoordinatorSnapshot().nextRefreshAt).toBe(NOW + 9 * 60 * 1000);

    mocks.visibility = "visible";
    document.dispatchEvent(new Event("visibilitychange"));
    await vi.advanceTimersByTimeAsync(0);
    expect(mocks.refreshWeatherBundle).toHaveBeenCalledTimes(1);
  });

  it("离线时暂停并保留到期请求，网络恢复后执行", async () => {
    setFreshCache({ allAgeMin: 6 });
    mocks.online = false;
    const coordinator = await import("../weatherCoordinator");
    coordinator.startWeatherCoordinator();
    await vi.advanceTimersByTimeAsync(0);

    expect(mocks.refreshWeatherBundle).not.toHaveBeenCalled();
    expect(coordinator.getWeatherCoordinatorSnapshot()).toMatchObject({
      nextRefreshAt: null,
      status: "offline",
    });

    mocks.online = true;
    window.dispatchEvent(new Event("online"));
    await vi.advanceTimersByTimeAsync(0);
    expect(mocks.refreshWeatherBundle).toHaveBeenCalledTimes(1);
  });

  it("内嵌分钟数据无效时排队独立分钟请求", async () => {
    setFreshCache({ allAgeMin: 6 });
    mocks.embeddedMinutely = { code: "200", minutely: [] };
    mocks.refreshWeatherBundle.mockImplementation(async () => {
      mocks.cache.details!.updatedAt = Date.now();
      mocks.guardNextAllowedAt = Date.now() + 2_000;
      return weatherFlowResult();
    });
    const coordinator = await import("../weatherCoordinator");
    coordinator.startWeatherCoordinator();
    await vi.advanceTimersByTimeAsync(0);

    expect(mocks.refreshWeatherBundle).toHaveBeenCalledTimes(1);
    expect(mocks.fetchMinutelyPrecip).not.toHaveBeenCalled();
    expect(coordinator.getWeatherCoordinatorSnapshot()).toMatchObject({
      nextRefreshAt: NOW + 2_000,
      status: "ready",
    });

    await vi.advanceTimersByTimeAsync(2_000);
    expect(mocks.fetchMinutelyPrecip).toHaveBeenCalledTimes(1);
    expect(mocks.updateMinutelyCache).toHaveBeenCalledWith(
      LOCATION,
      expect.objectContaining({ code: "200" }),
      NOW + 2_000
    );
    expect(mocks.broadcastWeatherCacheUpdate).toHaveBeenCalledWith("minutely", LOCATION);
  });

  it("收到其他标签页缓存更新后重读缓存且不重复请求", async () => {
    const coordinator = await import("../weatherCoordinator");
    const refreshDone = vi.fn();
    window.addEventListener("weatherRefreshDone", refreshDone);
    coordinator.startWeatherCoordinator();
    await vi.advanceTimersByTimeAsync(0);

    mocks.cache.details!.updatedAt = NOW + 30_000;
    mocks.syncListener?.({
      id: "remote:1",
      location: LOCATION,
      sentAt: NOW + 30_000,
      target: "all",
      type: "cache-updated",
    });

    expect(mocks.refreshWeatherBundle).not.toHaveBeenCalled();
    expect(mocks.recomputeMinutelyWeatherSnapshot).toHaveBeenCalled();
    expect(coordinator.getWeatherCoordinatorSnapshot()).toMatchObject({
      lastSuccessAt: NOW + 30_000,
      status: "ready",
    });
    expect(refreshDone).toHaveBeenCalledTimes(1);
    expect((refreshDone.mock.calls[0][0] as CustomEvent).detail).toMatchObject({
      source: "cross-tab",
      status: "成功",
    });
    window.removeEventListener("weatherRefreshDone", refreshDone);
  });

  it("普通定时请求被其他标签页抢先完成后不会在硬间隔结束时重放", async () => {
    setFreshCache({ allAgeMin: 6 });
    const { WeatherRequestDeferredError } = await import("../weatherRequestGuard");
    mocks.refreshWeatherBundle.mockImplementationOnce(async () => {
      mocks.guardNextAllowedAt = NOW + 60_000;
      throw new WeatherRequestDeferredError(NOW + 60_000);
    });
    const coordinator = await import("../weatherCoordinator");
    coordinator.startWeatherCoordinator();
    await vi.advanceTimersByTimeAsync(0);
    expect(mocks.refreshWeatherBundle).toHaveBeenCalledTimes(1);

    mocks.cache.details!.updatedAt = NOW + 30_000;
    mocks.syncListener?.({
      id: "remote:deduplicated",
      location: LOCATION,
      sentAt: NOW + 30_000,
      target: "all",
      type: "cache-updated",
    });
    await vi.advanceTimersByTimeAsync(60_000);

    expect(mocks.refreshWeatherBundle).toHaveBeenCalledTimes(1);
    expect(coordinator.getWeatherCoordinatorSnapshot().nextRefreshAt).toBe(
      NOW + 5 * 60_000 + 30_000
    );
  });

  it("降雨阶段从新鲜内嵌数据起等待两分钟再请求独立分钟接口", async () => {
    setFreshCache({ allAgeMin: 6 });
    mocks.phase = "PRE_RAIN";
    const coordinator = await import("../weatherCoordinator");
    coordinator.startWeatherCoordinator();
    await vi.advanceTimersByTimeAsync(0);

    expect(mocks.refreshWeatherBundle).toHaveBeenCalledTimes(1);
    expect(coordinator.getWeatherCoordinatorSnapshot().nextRefreshAt).toBe(NOW + 2 * 60 * 1000);

    await vi.advanceTimersByTimeAsync(2 * 60 * 1000 - 1);
    expect(mocks.fetchMinutelyPrecip).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(mocks.fetchMinutelyPrecip).toHaveBeenCalledTimes(1);
  });

  it("供应商保护期明确显示冷却状态", async () => {
    mocks.cooldownUntil = NOW + 30 * 60 * 1000;
    mocks.guardNextAllowedAt = NOW + 30 * 60 * 1000;
    const coordinator = await import("../weatherCoordinator");
    coordinator.startWeatherCoordinator();
    await vi.advanceTimersByTimeAsync(0);

    await coordinator.requestWeatherRefresh({ force: true, reason: "manual" });

    expect(mocks.refreshWeatherBundle).not.toHaveBeenCalled();
    expect(coordinator.getWeatherCoordinatorSnapshot()).toMatchObject({
      cooldownUntil: NOW + 30 * 60 * 1000,
      nextRefreshAt: NOW + 30 * 60 * 1000,
      status: "cooldown",
    });
  });

  it("网络失败按 1、2、5、10 分钟退避，成功后清零", async () => {
    mocks.refreshWeatherBundle
      .mockRejectedValueOnce(new Error("network-1"))
      .mockRejectedValueOnce(new Error("network-2"))
      .mockRejectedValueOnce(new Error("network-3"))
      .mockRejectedValueOnce(new Error("network-4"));
    const coordinator = await import("../weatherCoordinator");
    coordinator.startWeatherCoordinator();
    await vi.advanceTimersByTimeAsync(0);

    await coordinator.requestWeatherRefresh({ force: true, reason: "manual" });
    expect(coordinator.getWeatherCoordinatorSnapshot()).toMatchObject({
      nextRefreshAt: NOW + 60_000,
      status: "error-with-cache",
    });

    await vi.advanceTimersByTimeAsync(60_000);
    expect(mocks.refreshWeatherBundle).toHaveBeenCalledTimes(2);
    expect(coordinator.getWeatherCoordinatorSnapshot().nextRefreshAt).toBe(NOW + 3 * 60_000);

    await vi.advanceTimersByTimeAsync(2 * 60_000);
    expect(mocks.refreshWeatherBundle).toHaveBeenCalledTimes(3);
    expect(coordinator.getWeatherCoordinatorSnapshot().nextRefreshAt).toBe(NOW + 8 * 60_000);

    await vi.advanceTimersByTimeAsync(5 * 60_000);
    expect(mocks.refreshWeatherBundle).toHaveBeenCalledTimes(4);
    expect(coordinator.getWeatherCoordinatorSnapshot().nextRefreshAt).toBe(NOW + 18 * 60_000);

    await vi.advanceTimersByTimeAsync(10 * 60_000);
    expect(mocks.refreshWeatherBundle).toHaveBeenCalledTimes(5);
    expect(coordinator.getWeatherCoordinatorSnapshot()).toMatchObject({
      error: null,
      status: "ready",
    });
  });

  it("首次刷新失败且没有同地点缓存时保留无缓存错误状态", async () => {
    mocks.cache = { coords: mocks.coords };
    mocks.refreshWeatherBundle.mockRejectedValueOnce(new Error("network-without-cache"));
    const coordinator = await import("../weatherCoordinator");

    await coordinator.requestWeatherRefresh({ force: true, reason: "manual" });

    expect(coordinator.getWeatherCoordinatorSnapshot()).toMatchObject({
      error: "network-without-cache",
      status: "error",
    });
  });
});
