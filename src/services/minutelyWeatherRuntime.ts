import {
  computeMinutelyRainStats,
  resolveMinutelyRainPhase,
  type MinutelyPrecipCacheLike,
  type MinutelyRainPhase,
  type MinutelyRainStats,
} from "../utils/minutelyPrecipLogic";
import { getAdjustedNowMs } from "../utils/timeSync";
import {
  createWeatherLocationKey,
  getValidCoords,
  getValidMinutely,
  getWeatherCache,
} from "../utils/weatherStorage";

export type MinutelyWeatherRuntimeStatus = "idle" | "loading" | "ready" | "stale" | "error";
export type MinutelyWeatherFreshness = "fresh" | "stale" | "unknown" | "error";

export interface MinutelyWeatherSnapshot {
  cache: MinutelyPrecipCacheLike | null;
  stats: MinutelyRainStats | null;
  phase: MinutelyRainPhase | null;
  location: string | null;
  status: MinutelyWeatherRuntimeStatus;
  freshness: MinutelyWeatherFreshness;
  stale: boolean;
  fetchedAt: number | null;
  sourceUpdatedAt: number | null;
  updatedAt: number;
  error: string | null;
}

export interface MinutelyWeatherRuntimeOptions {
  /** Local countdown recompute interval. It never changes API frequency. */
  localTickMs?: number;
}

type SnapshotListener = () => void;

const DEFAULT_LOCAL_TICK_MS = 30 * 1000;

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
let lastRefreshError: string | null = null;
let stopRuntimeListeners: (() => void) | null = null;

function clampInterval(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.round(value)));
}

function resolveLocation(): { key: string; cache: MinutelyPrecipCacheLike | null } | null {
  const coords = getValidCoords();
  if (!coords) return null;
  const key = createWeatherLocationKey(coords.lat, coords.lon);
  const weatherCache = getWeatherCache();
  const entry = weatherCache.minutely?.location === key ? weatherCache.minutely : null;
  const data = getValidMinutely(key);
  if (!data) return { key, cache: null };
  return {
    key,
    cache: {
      updateTime: data.updateTime,
      summary: data.summary,
      minutely: data.minutely,
      provider: data.provider,
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
    window.dispatchEvent(new CustomEvent("minutelyWeatherSnapshot", { detail: snapshot }));
  }
}

function parseSourceUpdatedAt(cache: MinutelyPrecipCacheLike | null): number | null {
  if (!cache?.updateTime) return null;
  const parsed = Date.parse(cache.updateTime);
  return Number.isFinite(parsed) ? parsed : null;
}

export function recomputeMinutelyWeatherSnapshot(): void {
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

export function setMinutelyWeatherRuntimeError(error: string | null): void {
  lastRefreshError = error;
  recomputeMinutelyWeatherSnapshot();
}

/** Compatibility entry point. Network refreshes are owned by weatherCoordinator. */
export async function refreshMinutelyWeather(_options?: { force?: boolean }): Promise<void> {
  recomputeMinutelyWeatherSnapshot();
}

function attachRuntimeListeners(): () => void {
  if (typeof window === "undefined") return () => undefined;
  const onWeatherRefreshDone = () => recomputeMinutelyWeatherSnapshot();
  const onTimeSync = () => recomputeMinutelyWeatherSnapshot();
  window.addEventListener("weatherRefreshDone", onWeatherRefreshDone);
  window.addEventListener("timeSync:updated", onTimeSync);
  return () => {
    window.removeEventListener("weatherRefreshDone", onWeatherRefreshDone);
    window.removeEventListener("timeSync:updated", onTimeSync);
  };
}

export function startMinutelyWeatherRuntime(options?: MinutelyWeatherRuntimeOptions): () => void {
  if (runtimeStarted) return stopMinutelyWeatherRuntime;
  runtimeStarted = true;
  const localTickMs = clampInterval(
    options?.localTickMs ?? DEFAULT_LOCAL_TICK_MS,
    5 * 1000,
    5 * 60 * 1000
  );
  recomputeMinutelyWeatherSnapshot();
  runtimeTimer = setInterval(recomputeMinutelyWeatherSnapshot, localTickMs);
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

export function __resetMinutelyWeatherRuntimeForTests(): void {
  stopMinutelyWeatherRuntime();
  snapshot = EMPTY_SNAPSHOT;
  listeners.clear();
  lastRefreshError = null;
}
