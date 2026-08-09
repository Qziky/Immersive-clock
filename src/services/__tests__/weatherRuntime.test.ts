import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { MinutelyPrecipResponse, WeatherLocation, WeatherNow } from "../../types/weather";
import type { WeatherCache } from "../../utils/weatherStorage";
import type { WeatherFlowResult } from "../weatherService";

const mocks = vi.hoisted(() => ({
  buildWeatherFlow: vi.fn(),
  cache: {} as WeatherCache,
  fetchMinutelyPrecip: vi.fn(),
  guard: { cooldownUntil: null as number | null, requestsThisHour: 0 },
  ingestAlerts: vi.fn(),
  minutelyError: vi.fn(),
  minutelyPhase: "DRY",
  notifications: vi.fn(),
  recomputeMinutely: vi.fn(),
  reportError: vi.fn(),
  resolveLocation: vi.fn(),
  settingsListener: null as (() => void) | null,
  settingsMode: "auto" as "auto" | "manual",
  syncListener: null as (() => void) | null,
}));

vi.mock("../../utils/appSettings", () => ({
  getAppSettings: () => ({
    general: { weather: { locationMode: mocks.settingsMode } },
  }),
}));

vi.mock("../../utils/errorCenter", () => ({
  reportWeatherRuntimeError: mocks.reportError,
}));

vi.mock("../../utils/minutelyPrecipLogic", () => ({
  isUsableMinutelyResponse: (value: MinutelyPrecipResponse | null | undefined) =>
    value?.code === "200",
}));

vi.mock("../../utils/settingsEvents", () => ({
  SETTINGS_EVENTS: { WeatherSettingsUpdated: "weatherSettingsUpdated" },
  subscribeSettingsEvent: (_event: string, listener: () => void) => {
    mocks.settingsListener = listener;
    return () => {
      mocks.settingsListener = null;
    };
  },
}));

vi.mock("../../utils/timeSync", () => ({
  getAdjustedDate: () => new Date(Date.now()),
}));

vi.mock("../../utils/weatherStorage", () => ({
  createWeatherLocationKey: (lat: number, lon: number) => `${lon.toFixed(4)},${lat.toFixed(4)}`,
  getWeatherCache: () => mocks.cache,
  updateGeolocationDiagnostics: (diagnostics: unknown) => {
    mocks.cache = {
      ...mocks.cache,
      geolocation: { diagnostics, updatedAt: Date.now() },
    } as WeatherCache;
  },
  updateMinutelyCache: (location: string, data: MinutelyPrecipResponse, updatedAt: number) => {
    mocks.cache = {
      ...mocks.cache,
      minutely: { data, lastApiFetchAt: updatedAt, location, updatedAt },
    };
  },
  updateWeatherRuntimeBundle: (input: {
    location: WeatherLocation;
    minutely?: MinutelyPrecipResponse | null;
    weather: WeatherNow;
  }) => {
    const updatedAt = Date.now();
    const location = `${input.location.coords.lon.toFixed(4)},${input.location.coords.lat.toFixed(4)}`;
    mocks.cache = {
      version: 2,
      activeLocation: input.location,
      geolocation: mocks.cache.geolocation,
      details: { data: {}, location, updatedAt },
      now: { data: input.weather, updatedAt },
      ...(input.minutely
        ? { minutely: { data: input.minutely, lastApiFetchAt: updatedAt, location, updatedAt } }
        : {}),
    } as WeatherCache;
    return mocks.cache;
  },
}));

vi.mock("../locationService", () => ({
  resolveWeatherLocation: mocks.resolveLocation,
  searchWeatherCities: vi.fn(),
}));

vi.mock("../minutelyWeatherRuntime", () => ({
  getMinutelyWeatherSnapshot: () => ({ phase: mocks.minutelyPhase }),
  recomputeMinutelyWeatherSnapshot: mocks.recomputeMinutely,
  setMinutelyWeatherRuntimeError: mocks.minutelyError,
}));

vi.mock("../weatherAlertRuntime", () => ({
  ingestWeatherAlertResponse: mocks.ingestAlerts,
}));

vi.mock("../weatherNotificationRuntime", () => ({
  processWeatherNotifications: mocks.notifications,
}));

vi.mock("../weatherRequestGuard", () => {
  class WeatherRequestDeferredError extends Error {
    retryAt: number;

    constructor(retryAt: number) {
      super("天气请求已推迟");
      this.name = "WeatherRequestDeferredError";
      this.retryAt = retryAt;
    }
  }
  return {
    getWeatherRequestGuardSnapshot: () => mocks.guard,
    WeatherRequestDeferredError,
  };
});

vi.mock("../weatherService", () => ({
  buildWeatherFlow: mocks.buildWeatherFlow,
  fetchMinutelyPrecip: mocks.fetchMinutelyPrecip,
}));

vi.mock("../weatherSyncChannel", () => ({
  broadcastWeatherCacheUpdate: vi.fn(),
  subscribeWeatherCacheSync: (listener: () => void) => {
    mocks.syncListener = listener;
    return () => {
      mocks.syncListener = null;
    };
  },
}));

function createLocation(overrides: Partial<WeatherLocation> = {}): WeatherLocation {
  return {
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
    ...overrides,
  };
}

function createFlow(
  location: WeatherLocation,
  embeddedMinutely: MinutelyPrecipResponse | null = { code: "200" }
): WeatherFlowResult {
  return {
    airQuality: {},
    alerts: { alerts: [] },
    astronomySun: {},
    coords: location.coords,
    daily3d: {},
    details: {} as NonNullable<WeatherFlowResult["details"]>,
    embeddedMinutely,
    location,
    weather: { code: "200", now: { temp: "26", text: "晴" } },
  };
}

function seedFreshCache(location: WeatherLocation): void {
  const updatedAt = Date.now();
  const key = `${location.coords.lon.toFixed(4)},${location.coords.lat.toFixed(4)}`;
  mocks.cache = {
    version: 2,
    activeLocation: location,
    details: { data: {}, location: key, updatedAt },
    minutely: {
      data: { code: "200" },
      lastApiFetchAt: updatedAt,
      location: key,
      updatedAt,
    },
    now: { data: { code: "200", now: { temp: "25" } }, updatedAt },
  } as WeatherCache;
}

describe("WeatherRuntime", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime("2026-07-18T10:00:00+08:00");
    vi.resetModules();
    localStorage.clear();
    mocks.cache = {};
    mocks.guard = { cooldownUntil: null, requestsThisHour: 0 };
    mocks.minutelyPhase = "DRY";
    mocks.settingsListener = null;
    mocks.settingsMode = "auto";
    mocks.syncListener = null;
    vi.clearAllMocks();
    Object.defineProperty(navigator, "onLine", { configurable: true, value: true });
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
    const location = createLocation();
    mocks.resolveLocation.mockResolvedValue({ diagnostics: null, location });
    mocks.buildWeatherFlow.mockResolvedValue(createFlow(location));
    mocks.fetchMinutelyPrecip.mockResolvedValue({ code: "200" });
  });

  afterEach(async () => {
    const runtime = await import("../weatherRuntime");
    runtime.__resetWeatherRuntimeForTests();
    vi.useRealTimers();
  });

  it("一次全量刷新只请求一次 /weather/all，并优先使用内嵌分钟数据", async () => {
    const runtime = await import("../weatherRuntime");

    const result = await runtime.refreshWeather({ reason: "manual" });

    expect(mocks.buildWeatherFlow).toHaveBeenCalledTimes(1);
    expect(mocks.fetchMinutelyPrecip).not.toHaveBeenCalled();
    expect(mocks.ingestAlerts).toHaveBeenCalledTimes(1);
    expect(mocks.notifications).toHaveBeenCalledTimes(1);
    expect(result.status).toBe("ready");
    expect(result.freshness).toMatchObject({ full: "fresh", minutely: "fresh" });
    expect(result.cache.minutely?.data.code).toBe("200");
  });

  it("内嵌分钟数据缺失时改用独立分钟接口", async () => {
    const location = createLocation();
    mocks.resolveLocation.mockResolvedValue({ diagnostics: null, location });
    mocks.buildWeatherFlow.mockResolvedValue(createFlow(location, null));
    const runtime = await import("../weatherRuntime");

    const result = await runtime.refreshWeather({ reason: "manual" });

    expect(mocks.buildWeatherFlow).toHaveBeenCalledTimes(1);
    expect(mocks.fetchMinutelyPrecip).toHaveBeenCalledTimes(1);
    expect(result.status).toBe("ready");
    expect(result.cache.minutely?.data.code).toBe("200");
  });

  it("相同并发刷新复用单飞，强制刷新会排队执行", async () => {
    const location = createLocation();
    let releaseFirst: ((value: WeatherFlowResult) => void) | null = null;
    mocks.buildWeatherFlow
      .mockImplementationOnce(
        () =>
          new Promise<WeatherFlowResult>((resolve) => {
            releaseFirst = resolve;
          })
      )
      .mockResolvedValue(createFlow(location));
    const runtime = await import("../weatherRuntime");

    const first = runtime.refreshWeather({ reason: "scheduled" });
    const duplicate = runtime.refreshWeather({ reason: "visibility" });
    const forced = runtime.refreshWeather({ force: true, reason: "manual" });

    expect(duplicate).toBe(first);
    expect(forced).toBe(first);
    await vi.waitFor(() => expect(releaseFirst).not.toBeNull());
    (releaseFirst as ((value: WeatherFlowResult) => void) | null)?.(createFlow(location));
    await forced;

    expect(mocks.buildWeatherFlow).toHaveBeenCalledTimes(2);
  });

  it("公共 IP 降级位置只在距上次浏览器尝试满 30 分钟后重新定位", async () => {
    const location = createLocation({
      coords: { lat: 30.2, lon: 120.1 },
      resolvedAt: Date.now() - 4 * 60 * 60 * 1000,
      source: "public_ip",
    });
    seedFreshCache(location);
    mocks.cache.geolocation = {
      diagnostics: {
        attemptedAt: Date.now() - 10 * 60 * 1000,
        isSecureContext: true,
        isSupported: true,
        maximumAgeMs: 0,
        permissionState: "granted",
        timeoutMs: 20_000,
        usedHighAccuracy: true,
      },
      updatedAt: Date.now() - 10 * 60 * 1000,
    };
    const runtime = await import("../weatherRuntime");

    await runtime.refreshWeather({ reason: "manual" });
    expect(mocks.resolveLocation).not.toHaveBeenCalled();

    vi.setSystemTime(Date.now() + 21 * 60 * 1000);
    await runtime.refreshWeather({ reason: "manual" });
    expect(mocks.resolveLocation).toHaveBeenCalledTimes(1);
  });

  it("有同模式旧天气时刷新失败进入 stale 并按一分钟退避", async () => {
    const location = createLocation();
    seedFreshCache(location);
    mocks.buildWeatherFlow.mockRejectedValue(new Error("network down"));
    const runtime = await import("../weatherRuntime");
    const now = Date.now();

    const result = await runtime.refreshWeather({ reason: "manual" });

    expect(result.status).toBe("stale");
    expect(result.error).toBe("network down");
    expect(result.nextRefreshAt).toBe(now + 60_000);
  });

  it("独立分钟接口被延迟时保留全量成功快照并进入 rate_limited", async () => {
    const location = createLocation();
    mocks.resolveLocation.mockResolvedValue({ diagnostics: null, location });
    mocks.buildWeatherFlow.mockResolvedValue(createFlow(location, null));
    const { WeatherRequestDeferredError } = await import("../weatherRequestGuard");
    const retryAt = Date.now() + 90_000;
    mocks.fetchMinutelyPrecip.mockRejectedValue(new WeatherRequestDeferredError(retryAt));
    const runtime = await import("../weatherRuntime");

    const result = await runtime.refreshWeather({ reason: "manual" });

    expect(result.status).toBe("rate_limited");
    expect(result.lastSuccessAt).toBe(Date.now());
    expect(result.nextRefreshAt).toBe(retryAt);
    expect(result.cache.now?.data.now?.temp).toBe("26");
  });

  it("离线时不发请求，并在跨标签页通知后原子重读快照", async () => {
    const location = createLocation();
    seedFreshCache(location);
    const runtime = await import("../weatherRuntime");
    const stop = runtime.startWeatherRuntime();
    Object.defineProperty(navigator, "onLine", { configurable: true, value: false });

    const offline = await runtime.refreshWeather({ reason: "manual" });
    expect(offline.status).toBe("offline");
    expect(mocks.buildWeatherFlow).not.toHaveBeenCalled();

    const syncedLocation = createLocation({
      city: {
        lat: 30.2,
        locationKey: "weathercn:101210101",
        lon: 120.1,
        name: "杭州市",
      },
      coords: { lat: 30.2, lon: 120.1 },
    });
    seedFreshCache(syncedLocation);
    mocks.syncListener?.();

    expect(runtime.getWeatherRuntimeSnapshot()).toMatchObject({
      location: { city: { name: "杭州市" } },
      status: "ready",
    });
    stop();
  });

  it("多个使用者共享天气运行时，最后释放后才停止", async () => {
    const runtime = await import("../weatherRuntime");

    const releaseFirst = runtime.acquireWeatherRuntime();
    const releaseSecond = runtime.acquireWeatherRuntime();
    await vi.waitFor(() => expect(mocks.settingsListener).not.toBeNull());

    releaseFirst();
    expect(mocks.settingsListener).not.toBeNull();

    releaseSecond();
    expect(mocks.settingsListener).toBeNull();
  });
});
