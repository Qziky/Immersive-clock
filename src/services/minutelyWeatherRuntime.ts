import { getAppSettings } from "../utils/appSettings";
import {
  computeMinutelyRainStats,
  resolveMinutelyRainPhase,
  type MinutelyPrecipCacheLike,
  type MinutelyRainPhase,
  type MinutelyRainStats,
} from "../utils/minutelyPrecipLogic";
import { getAdjustedNowMs } from "../utils/timeSync";
import {
  getValidCoords,
  getValidMinutely,
  getWeatherCache,
  updateMinutelyCache,
  updateMinutelyCriticalFetch,
} from "../utils/weatherStorage";

import { buildLocationFlow } from "./locationService";
import { fetchMinutelyPrecip } from "./weatherService";

export type MinutelyWeatherRuntimeStatus = "idle" | "loading" | "ready" | "stale" | "error";
export type MinutelyWeatherFreshness = "fresh" | "stale" | "unknown" | "error";

/**
 * 共享分钟降水快照。Weather 展示组件和自习信息区都订阅此快照，避免各自
 * 维护请求、缓存和本地倒计时状态。
 */
export interface MinutelyWeatherSnapshot {
  cache: MinutelyPrecipCacheLike | null;
  stats: MinutelyRainStats | null;
  phase: MinutelyRainPhase | null;
  location: string | null;
  status: MinutelyWeatherRuntimeStatus;
  /** 只有 fresh 才可向信息区提供确定的降雨倒计时。 */
  freshness: MinutelyWeatherFreshness;
  stale: boolean;
  fetchedAt: number | null;
  /** 服务端发布时间；缺失时为 null，不以客户端时间代替。 */
  sourceUpdatedAt: number | null;
  updatedAt: number;
  error: string | null;
}

export interface MinutelyWeatherRuntimeOptions {
  /** 本地重算间隔，默认 30 秒；只影响倒计时，不改变 API 频率。 */
  localTickMs?: number;
  /** API 最小请求间隔；未提供时读取天气设置（15–180 分钟）。 */
  apiIntervalMs?: number;
}

type SnapshotListener = () => void;

const DEFAULT_LOCAL_TICK_MS = 30 * 1000;
const DEFAULT_API_INTERVAL_MS = 30 * 60 * 1000;
const MIN_REQUEST_ATTEMPT_GAP_MS = 60 * 1000;

const EMPTY_SNAPSHOT: MinutelyWeatherSnapshot = {
  cache: null,
  stats: null,
  phase: null,
  location: null,
  status: "idle",
  freshness: "unknown",
  stale: false,
  fetchedAt: null,
  sourceUpdatedAt: null,
  updatedAt: 0,
  error: null,
};

let snapshot: MinutelyWeatherSnapshot = EMPTY_SNAPSHOT;
const listeners = new Set<SnapshotListener>();
let runtimeTimer: ReturnType<typeof setInterval> | null = null;
let runtimeStarted = false;
let refreshPromise: Promise<void> | null = null;
let lastRequestAttemptAt = 0;
let lastRefreshError: string | null = null;
let stopRuntimeListeners: (() => void) | null = null;
let runtimeOptions: Required<MinutelyWeatherRuntimeOptions> = {
  localTickMs: DEFAULT_LOCAL_TICK_MS,
  apiIntervalMs: 0,
};

function clampInterval(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.round(value)));
}

function resolveLocation(): { key: string; cache: MinutelyPrecipCacheLike | null } | null {
  const coords = getValidCoords();
  if (!coords) return null;
  const key = `${coords.lon.toFixed(2)},${coords.lat.toFixed(2)}`;
  const weatherCache = getWeatherCache();
  const entry = weatherCache.minutely?.location === key ? weatherCache.minutely : null;
  const data = getValidMinutely(key);
  if (!data) {
    return {
      key,
      cache: null,
    };
  }
  return {
    key,
    cache: {
      updateTime: data.updateTime,
      summary: data.summary,
      minutely: data.minutely,
      fetchedAt: entry?.lastApiFetchAt ?? entry?.updatedAt ?? Date.now(),
    },
  };
}

function publish(next: Partial<MinutelyWeatherSnapshot>): void {
  snapshot = {
    ...snapshot,
    ...next,
    updatedAt: Date.now(),
  };
  listeners.forEach((listener) => listener());
  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent("minutelyWeatherSnapshot", {
        detail: snapshot,
      })
    );
  }
}

function parseSourceUpdatedAt(cache: MinutelyPrecipCacheLike | null): number | null {
  if (!cache?.updateTime) return null;
  const parsed = Date.parse(cache.updateTime);
  return Number.isFinite(parsed) ? parsed : null;
}

/** 仅使用当前有效缓存重算状态；过期缓存不会产生降雨信号。 */
function recomputeFromCache(): void {
  const resolved = resolveLocation();
  if (!resolved) {
    publish({
      cache: null,
      stats: null,
      phase: null,
      location: null,
      status: "idle",
      freshness: "unknown",
      stale: false,
      fetchedAt: null,
      sourceUpdatedAt: null,
      error: null,
    });
    return;
  }

  if (!resolved.cache) {
    const raw = getWeatherCache().minutely;
    const hasMatchingCache = raw?.location === resolved.key;
    publish({
      cache: null,
      stats: null,
      phase: null,
      location: resolved.key,
      status: lastRefreshError ? "error" : hasMatchingCache ? "stale" : "idle",
      freshness: lastRefreshError ? "error" : hasMatchingCache ? "stale" : "unknown",
      stale: Boolean(lastRefreshError || hasMatchingCache),
      fetchedAt: raw?.lastApiFetchAt ?? raw?.updatedAt ?? null,
      sourceUpdatedAt: raw?.data.updateTime ? Date.parse(raw.data.updateTime) || null : null,
      error: lastRefreshError,
    });
    return;
  }

  const computedStats = computeMinutelyRainStats(resolved.cache, getAdjustedNowMs());
  // 无法追溯到服务端时间轴时，不向消费者暴露确定的降雨倒计时。
  const stats = computedStats.hasReliableTimestamps === false ? null : computedStats;
  if (lastRefreshError) {
    publish({
      cache: resolved.cache,
      stats: null,
      phase: null,
      location: resolved.key,
      status: "error",
      freshness: "error",
      stale: true,
      fetchedAt: resolved.cache.fetchedAt,
      sourceUpdatedAt: parseSourceUpdatedAt(resolved.cache),
      error: lastRefreshError,
    });
    return;
  }
  const phase = stats ? resolveMinutelyRainPhase(stats, snapshot.phase) : null;
  publish({
    cache: resolved.cache,
    stats,
    phase,
    location: resolved.key,
    status: "ready",
    freshness: stats ? "fresh" : "unknown",
    stale: false,
    fetchedAt: resolved.cache.fetchedAt,
    sourceUpdatedAt: parseSourceUpdatedAt(resolved.cache),
    error: null,
  });
}

function readConfiguredApiIntervalMs(): number {
  try {
    const configured = Number(getAppSettings().general.weather.autoRefreshIntervalMin);
    if (Number.isFinite(configured)) {
      return clampInterval(configured, 15, 180) * 60 * 1000;
    }
  } catch {
    // 配置读取失败时使用保守默认值，不能阻塞中央信息区。
  }
  return DEFAULT_API_INTERVAL_MS;
}

/**
 * 请求一次分钟预报。该函数只更新共享缓存和快照，不触发弹窗；弹窗仍由
 * Weather 组件根据 minutelyPrecipEnabled 独立决定。
 */
export async function refreshMinutelyWeather(options?: {
  force?: boolean;
  markCritical?: boolean;
}): Promise<void> {
  if (refreshPromise) return refreshPromise;

  const run = async () => {
    let coords = getValidCoords();
    if (!coords) {
      try {
        const locationResult = await buildLocationFlow();
        coords = locationResult.coords
          ? {
              ...locationResult.coords,
              source: locationResult.coordsSource || "runtime",
              updatedAt: Date.now(),
            }
          : null;
      } catch {
        coords = null;
      }
      if (!coords) {
        recomputeFromCache();
        return;
      }
    }
    const location = `${coords.lon.toFixed(2)},${coords.lat.toFixed(2)}`;
    const weatherCache = getWeatherCache();
    const hasValidCache = getValidMinutely(location) != null;
    const lastFetchAt =
      weatherCache.minutely?.location === location
        ? (weatherCache.minutely.lastApiFetchAt ?? weatherCache.minutely.updatedAt ?? 0)
        : 0;
    const nowWallMs = Date.now();
    const apiIntervalMs =
      runtimeOptions.apiIntervalMs > 0
        ? runtimeOptions.apiIntervalMs
        : readConfiguredApiIntervalMs();
    if (
      !options?.force &&
      !lastRefreshError &&
      hasValidCache &&
      lastFetchAt > 0 &&
      nowWallMs - lastFetchAt < apiIntervalMs
    ) {
      recomputeFromCache();
      return;
    }
    if (!options?.force && nowWallMs - lastRequestAttemptAt < MIN_REQUEST_ATTEMPT_GAP_MS) {
      recomputeFromCache();
      return;
    }

    publish({ status: "loading", location, error: null });
    lastRequestAttemptAt = nowWallMs;
    try {
      const result = await fetchMinutelyPrecip(location);
      if (result.error || result.code !== "200") {
        throw new Error(result.error || `分钟级降水接口状态异常：${result.code || "unknown"}`);
      }
      lastRefreshError = null;
      updateMinutelyCache(location, result, nowWallMs);
      if (options?.markCritical) updateMinutelyCriticalFetch(nowWallMs);
      recomputeFromCache();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      lastRefreshError = message;
      // 缓存仍保留给后续成功刷新使用，但失败期间不再暴露确定的降雨倒计时。
      recomputeFromCache();
    }
  };

  refreshPromise = run().finally(() => {
    refreshPromise = null;
  });
  return refreshPromise;
}

function attachRuntimeListeners(): () => void {
  if (typeof window === "undefined") return () => undefined;
  const onWeatherRefresh = () => {
    recomputeFromCache();
    void refreshMinutelyWeather({ force: true });
  };
  const onWeatherRefreshDone = () => {
    recomputeFromCache();
    void refreshMinutelyWeather();
  };
  const onTimeSync = () => recomputeFromCache();
  window.addEventListener("weatherRefresh", onWeatherRefresh);
  window.addEventListener("weatherRefreshDone", onWeatherRefreshDone);
  window.addEventListener("timeSync:updated", onTimeSync);
  return () => {
    window.removeEventListener("weatherRefresh", onWeatherRefresh);
    window.removeEventListener("weatherRefreshDone", onWeatherRefreshDone);
    window.removeEventListener("timeSync:updated", onTimeSync);
  };
}

export function startMinutelyWeatherRuntime(options?: MinutelyWeatherRuntimeOptions): () => void {
  if (runtimeStarted) return stopMinutelyWeatherRuntime;
  runtimeStarted = true;
  runtimeOptions = {
    localTickMs: clampInterval(
      options?.localTickMs ?? DEFAULT_LOCAL_TICK_MS,
      5 * 1000,
      5 * 60 * 1000
    ),
    apiIntervalMs: options?.apiIntervalMs && options.apiIntervalMs > 0 ? options.apiIntervalMs : 0,
  };
  recomputeFromCache();
  void refreshMinutelyWeather();
  runtimeTimer = setInterval(() => {
    recomputeFromCache();
    void refreshMinutelyWeather();
  }, runtimeOptions.localTickMs);
  stopRuntimeListeners = attachRuntimeListeners();
  return stopMinutelyWeatherRuntime;
}

export function stopMinutelyWeatherRuntime(): void {
  if (runtimeTimer) {
    clearInterval(runtimeTimer);
    runtimeTimer = null;
  }
  stopRuntimeListeners?.();
  stopRuntimeListeners = null;
  runtimeStarted = false;
}

export function getMinutelyWeatherSnapshot(): MinutelyWeatherSnapshot {
  return snapshot;
}

export function subscribeMinutelyWeather(listener: SnapshotListener): () => void {
  listeners.add(listener);
  if (!runtimeStarted) startMinutelyWeatherRuntime();
  listener();
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) stopMinutelyWeatherRuntime();
  };
}
