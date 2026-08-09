import type { WeatherCitySelection, WeatherLocation } from "../types/weather";
import { getAppSettings } from "../utils/appSettings";
import { reportWeatherRuntimeError } from "../utils/errorCenter";
import { isUsableMinutelyResponse } from "../utils/minutelyPrecipLogic";
import { subscribeSettingsEvent, SETTINGS_EVENTS } from "../utils/settingsEvents";
import { getAdjustedDate } from "../utils/timeSync";
import {
  createWeatherLocationKey,
  getWeatherCache,
  updateGeolocationDiagnostics,
  updateMinutelyCache,
  updateWeatherRuntimeBundle,
  type WeatherCache,
} from "../utils/weatherStorage";

import { resolveWeatherLocation, searchWeatherCities as searchCities } from "./locationService";
import {
  getMinutelyWeatherSnapshot,
  recomputeMinutelyWeatherSnapshot,
  setMinutelyWeatherRuntimeError,
} from "./minutelyWeatherRuntime";
import { ingestWeatherAlertResponse } from "./weatherAlertRuntime";
import { processWeatherNotifications } from "./weatherNotificationRuntime";
import { getWeatherRequestGuardSnapshot, WeatherRequestDeferredError } from "./weatherRequestGuard";
import { buildWeatherFlow, fetchMinutelyPrecip, type WeatherFlowResult } from "./weatherService";
import { broadcastWeatherCacheUpdate, subscribeWeatherCacheSync } from "./weatherSyncChannel";

const FULL_FOREGROUND_MS = 10 * 60 * 1000;
const FULL_BACKGROUND_MS = 30 * 60 * 1000;
const MINUTELY_RAIN_MS = 2 * 60 * 1000;
const MINUTELY_DRY_MS = 10 * 60 * 1000;
const MINUTELY_BACKGROUND_MS = 30 * 60 * 1000;
const FAILURE_BACKOFF_MS = [60_000, 2 * 60_000, 5 * 60_000, 10 * 60_000, 30 * 60_000] as const;

export type WeatherRuntimeStatus =
  | "idle"
  | "locating"
  | "loading"
  | "ready"
  | "refreshing"
  | "stale"
  | "offline"
  | "rate_limited"
  | "error";

export type WeatherDataFreshness = "missing" | "fresh" | "stale";

export interface WeatherRuntimeFreshness {
  full: WeatherDataFreshness;
  fullUpdatedAt: number | null;
  minutely: WeatherDataFreshness;
  minutelyUpdatedAt: number | null;
}

export interface WeatherRuntimeSnapshot {
  cache: WeatherCache;
  error: string | null;
  freshness: WeatherRuntimeFreshness;
  lastSuccessAt: number | null;
  location: WeatherLocation | null;
  nextRefreshAt: number | null;
  requestsThisHour: number;
  status: WeatherRuntimeStatus;
  updatedAt: number;
}

export interface WeatherRefreshOptions {
  force?: boolean;
  forceLocation?: boolean;
  reason?: "startup" | "scheduled" | "manual" | "location" | "settings" | "online" | "visibility";
}

type Listener = () => void;

const initialCache = typeof localStorage === "undefined" ? {} : getWeatherCache();
let snapshot: WeatherRuntimeSnapshot = {
  cache: initialCache,
  error: null,
  freshness: {
    full: "missing",
    fullUpdatedAt: null,
    minutely: "missing",
    minutelyUpdatedAt: null,
  },
  lastSuccessAt: initialCache.details?.updatedAt ?? initialCache.now?.updatedAt ?? null,
  location: initialCache.version === 2 ? (initialCache.activeLocation ?? null) : null,
  nextRefreshAt: null,
  requestsThisHour: 0,
  status: "idle",
  updatedAt: 0,
};
const listeners = new Set<Listener>();
let inFlight: Promise<WeatherRuntimeSnapshot> | null = null;
let pending: WeatherRefreshOptions | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;
let notificationTimer: ReturnType<typeof setInterval> | null = null;
let runtimeStarted = false;
let runtimeConsumers = 0;
let failureCount = 0;
let stopListeners: (() => void) | null = null;

function isOnline(): boolean {
  return typeof navigator === "undefined" || navigator.onLine !== false;
}

function isBackground(): boolean {
  return typeof document !== "undefined" && document.visibilityState === "hidden";
}

function deriveFreshness(
  cache: WeatherCache,
  location: WeatherLocation | null,
  now = Date.now()
): WeatherRuntimeFreshness {
  const fullUpdatedAt = cache.details?.updatedAt ?? cache.now?.updatedAt ?? null;
  const minutelyUpdatedAt = cache.minutely?.lastApiFetchAt ?? cache.minutely?.updatedAt ?? null;
  return {
    full:
      fullUpdatedAt == null
        ? "missing"
        : now - fullUpdatedAt < fullIntervalMs()
          ? "fresh"
          : "stale",
    fullUpdatedAt,
    minutely:
      location == null || minutelyUpdatedAt == null
        ? "missing"
        : now - minutelyUpdatedAt < minutelyIntervalMs()
          ? "fresh"
          : "stale",
    minutelyUpdatedAt,
  };
}

function publish(next: Partial<WeatherRuntimeSnapshot>): void {
  const guard = getWeatherRequestGuardSnapshot();
  const merged = {
    ...snapshot,
    ...next,
    requestsThisHour: guard.requestsThisHour,
    updatedAt: Date.now(),
  };
  snapshot = {
    ...merged,
    freshness: deriveFreshness(merged.cache, merged.location),
  };
  reportWeatherRuntimeError({
    coords: snapshot.location?.coords,
    error: snapshot.error,
    source: snapshot.location?.source,
    status: snapshot.status,
  });
  listeners.forEach((listener) => listener());
}

function fullIntervalMs(): number {
  return isBackground() ? FULL_BACKGROUND_MS : FULL_FOREGROUND_MS;
}

function minutelyIntervalMs(): number {
  if (isBackground()) return MINUTELY_BACKGROUND_MS;
  const phase = getMinutelyWeatherSnapshot().phase;
  return phase === "PRE_RAIN" || phase === "RAINING" ? MINUTELY_RAIN_MS : MINUTELY_DRY_MS;
}

function currentFullAt(): number {
  return snapshot.cache.details?.updatedAt ?? snapshot.cache.now?.updatedAt ?? 0;
}

function currentMinutelyAt(): number {
  return snapshot.cache.minutely?.lastApiFetchAt ?? snapshot.cache.minutely?.updatedAt ?? 0;
}

function nextDueAt(): number {
  const now = Date.now();
  const fullAt = currentFullAt();
  const minutelyAt = currentMinutelyAt();
  const nextFull = fullAt > 0 ? fullAt + fullIntervalMs() : now;
  const nextMinutely =
    snapshot.location && minutelyAt > 0
      ? minutelyAt + minutelyIntervalMs()
      : Number.POSITIVE_INFINITY;
  return Math.min(nextFull, nextMinutely);
}

function clearTimer(): void {
  if (timer) clearTimeout(timer);
  timer = null;
}

function schedule(at = nextDueAt()): void {
  clearTimer();
  if (!runtimeStarted || !isOnline()) return;
  const delay = Math.max(0, at - Date.now());
  publish({ nextRefreshAt: at });
  timer = setTimeout(() => {
    timer = null;
    void runDueRefresh("scheduled");
  }, delay);
}

function astronomyDate(): string {
  const date = getAdjustedDate();
  return `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, "0")}${String(
    date.getDate()
  ).padStart(2, "0")}`;
}

function validateWeatherResult(result: WeatherFlowResult): void {
  if (!result.weather) throw new Error("天气获取失败：无天气响应");
  if (result.weather.error) throw new Error(`天气获取失败：${result.weather.error}`);
  if (result.weather.code !== "200" || !result.weather.now) {
    throw new Error(`天气获取失败：${result.weather.code || "响应缺少实时数据"}`);
  }
}

async function runFullRefresh(options: WeatherRefreshOptions): Promise<WeatherRuntimeSnapshot> {
  const settingsMode = getAppSettings().general.weather.locationMode;
  const lastAutoLocationAttemptAt =
    snapshot.location?.source === "public_ip"
      ? (snapshot.cache.geolocation?.updatedAt ?? snapshot.location.resolvedAt)
      : (snapshot.location?.resolvedAt ?? 0);
  const shouldLocate =
    options.forceLocation ||
    !snapshot.location ||
    snapshot.location.mode !== settingsMode ||
    (snapshot.location.mode === "auto" && Date.now() - lastAutoLocationAttemptAt >= 30 * 60 * 1000);
  publish({
    error: null,
    nextRefreshAt: null,
    status: shouldLocate ? "locating" : currentFullAt() > 0 ? "refreshing" : "loading",
  });

  const resolved =
    !shouldLocate && snapshot.location
      ? { diagnostics: null, location: snapshot.location }
      : await resolveWeatherLocation({
          cachedLocation: snapshot.location,
          forceGeolocation: Boolean(options.forceLocation),
        });
  if (resolved.diagnostics) updateGeolocationDiagnostics(resolved.diagnostics);
  const location = resolved.location;
  publish({ location, status: currentFullAt() > 0 ? "refreshing" : "loading" });

  const result = await buildWeatherFlow({
    fetchAirQuality: true,
    fetchAstronomySun: true,
    fetchDaily3d: true,
    location,
  });
  validateWeatherResult(result);
  const hasEmbeddedMinutely = isUsableMinutelyResponse(result.embeddedMinutely);
  const cache = updateWeatherRuntimeBundle(
    {
      airQuality: result.airQuality,
      astronomySun: result.astronomySun,
      daily3d: result.daily3d,
      details: result.details,
      location,
      minutely: hasEmbeddedMinutely ? result.embeddedMinutely : null,
      weather: result.weather!,
    },
    astronomyDate()
  );
  if (result.alerts) ingestWeatherAlertResponse(result.alerts, location.coords);
  recomputeMinutelyWeatherSnapshot();
  setMinutelyWeatherRuntimeError(null);
  processWeatherNotifications(cache, result.alerts);
  failureCount = 0;
  const lastSuccessAt = cache.details?.updatedAt ?? cache.now?.updatedAt ?? Date.now();
  publish({ cache, error: null, lastSuccessAt, location, status: "ready" });
  broadcastWeatherCacheUpdate(
    "all",
    createWeatherLocationKey(location.coords.lat, location.coords.lon)
  );
  if (!hasEmbeddedMinutely) return runMinutelyRefresh();
  schedule();
  return snapshot;
}

async function runMinutelyRefresh(): Promise<WeatherRuntimeSnapshot> {
  const location = snapshot.location;
  if (!location) return runFullRefresh({ reason: "scheduled" });
  publish({ error: null, nextRefreshAt: null, status: "refreshing" });
  const key = createWeatherLocationKey(location.coords.lat, location.coords.lon);
  const result = await fetchMinutelyPrecip(key, {
    lat: location.coords.lat,
    locationKey: location.city.locationKey,
    lon: location.coords.lon,
    name: location.city.name,
  });
  if (!isUsableMinutelyResponse(result)) {
    throw new Error(result.error || `分钟级降水接口状态异常：${result.code || "unknown"}`);
  }
  updateMinutelyCache(key, result, Date.now());
  const cache = getWeatherCache();
  recomputeMinutelyWeatherSnapshot();
  setMinutelyWeatherRuntimeError(null);
  failureCount = 0;
  publish({ cache, error: null, status: "ready" });
  broadcastWeatherCacheUpdate("minutely", key);
  schedule();
  return snapshot;
}

function hasMatchingStaleCache(): boolean {
  const mode = getAppSettings().general.weather.locationMode;
  return Boolean(snapshot.location?.mode === mode && currentFullAt() > 0);
}

function handleRefreshFailure(error: unknown): WeatherRuntimeSnapshot {
  const message = error instanceof Error ? error.message : String(error);
  if (error instanceof WeatherRequestDeferredError) {
    publish({ error: message, nextRefreshAt: error.retryAt, status: "rate_limited" });
    schedule(error.retryAt);
    return snapshot;
  }
  const guard = getWeatherRequestGuardSnapshot();
  if (guard.cooldownUntil != null) {
    publish({ error: message, nextRefreshAt: guard.cooldownUntil, status: "rate_limited" });
    schedule(guard.cooldownUntil);
    return snapshot;
  }
  failureCount += 1;
  const retryAt =
    Date.now() + FAILURE_BACKOFF_MS[Math.min(failureCount - 1, FAILURE_BACKOFF_MS.length - 1)];
  setMinutelyWeatherRuntimeError(message);
  publish({
    cache: getWeatherCache(),
    error: message,
    nextRefreshAt: retryAt,
    status: hasMatchingStaleCache() ? "stale" : "error",
  });
  schedule(retryAt);
  return snapshot;
}

async function performRefresh(options: WeatherRefreshOptions): Promise<WeatherRuntimeSnapshot> {
  if (!isOnline()) {
    publish({ error: "当前处于离线状态", nextRefreshAt: null, status: "offline" });
    return snapshot;
  }
  try {
    return await runFullRefresh(options);
  } catch (error: unknown) {
    return handleRefreshFailure(error);
  }
}

function mergePending(current: WeatherRefreshOptions | null, incoming: WeatherRefreshOptions) {
  if (!current) return incoming;
  return {
    ...current,
    ...incoming,
    force: Boolean(current.force || incoming.force),
    forceLocation: Boolean(current.forceLocation || incoming.forceLocation),
  };
}

export function refreshWeather(
  options: WeatherRefreshOptions = { reason: "manual" }
): Promise<WeatherRuntimeSnapshot> {
  const normalized = { ...options, reason: options.reason ?? "manual" };
  if (inFlight) {
    if (normalized.force || normalized.forceLocation) {
      pending = mergePending(pending, normalized);
    }
    return inFlight;
  }
  clearTimer();
  inFlight = (async () => {
    let current: WeatherRefreshOptions | null = normalized;
    let result = snapshot;
    while (current) {
      pending = null;
      result = await performRefresh(current);
      current = pending;
    }
    return result;
  })().finally(() => {
    inFlight = null;
    pending = null;
  });
  return inFlight;
}

export function refreshLocation(): Promise<WeatherRuntimeSnapshot> {
  return refreshWeather({ force: true, forceLocation: true, reason: "location" });
}

export function searchWeatherCities(query: string): Promise<WeatherCitySelection[]> {
  return searchCities(query);
}

async function runDueRefresh(reason: WeatherRefreshOptions["reason"]): Promise<void> {
  const now = Date.now();
  const fullDue = currentFullAt() === 0 || currentFullAt() + fullIntervalMs() <= now;
  if (fullDue) {
    await refreshWeather({ reason });
    return;
  }
  const minutelyDue =
    snapshot.location != null &&
    currentMinutelyAt() > 0 &&
    currentMinutelyAt() + minutelyIntervalMs() <= now;
  if (minutelyDue) {
    try {
      await runMinutelyRefresh();
    } catch (error: unknown) {
      handleRefreshFailure(error);
    }
    return;
  }
  schedule();
}

function attachRuntimeListeners(): () => void {
  if (typeof window === "undefined") return () => undefined;
  const onVisibility = () => {
    if (document.visibilityState === "visible") void runDueRefresh("visibility");
    else schedule();
  };
  const onOnline = () => void runDueRefresh("online");
  const onOffline = () => {
    clearTimer();
    publish({ error: "当前处于离线状态", nextRefreshAt: null, status: "offline" });
  };
  document.addEventListener("visibilitychange", onVisibility);
  window.addEventListener("online", onOnline);
  window.addEventListener("offline", onOffline);
  const offSettings = subscribeSettingsEvent(SETTINGS_EVENTS.WeatherSettingsUpdated, () => {
    void refreshWeather({ force: true, forceLocation: true, reason: "settings" });
  });
  const offSync = subscribeWeatherCacheSync(() => {
    const cache = getWeatherCache();
    const location =
      cache.version === 2 ? (cache.activeLocation ?? snapshot.location) : snapshot.location;
    publish({
      cache,
      lastSuccessAt: cache.details?.updatedAt ?? snapshot.lastSuccessAt,
      location,
      status: "ready",
    });
    recomputeMinutelyWeatherSnapshot();
    schedule();
  });
  return () => {
    document.removeEventListener("visibilitychange", onVisibility);
    window.removeEventListener("online", onOnline);
    window.removeEventListener("offline", onOffline);
    offSettings();
    offSync();
  };
}

export function startWeatherRuntime(): () => void {
  if (runtimeStarted) return stopWeatherRuntime;
  runtimeStarted = true;
  stopListeners = attachRuntimeListeners();
  recomputeMinutelyWeatherSnapshot();
  notificationTimer = setInterval(() => processWeatherNotifications(getWeatherCache()), 60_000);
  const due = nextDueAt();
  if (!snapshot.location || due <= Date.now()) void refreshWeather({ reason: "startup" });
  else {
    publish({ status: "ready" });
    schedule(due);
  }
  return stopWeatherRuntime;
}

export function stopWeatherRuntime(): void {
  clearTimer();
  if (notificationTimer) clearInterval(notificationTimer);
  notificationTimer = null;
  stopListeners?.();
  stopListeners = null;
  runtimeStarted = false;
}

/**
 * 获取天气运行时的使用权。最后一个使用者释放后，停止自动定位与天气刷新。
 */
export function acquireWeatherRuntime(): () => void {
  runtimeConsumers += 1;
  if (runtimeConsumers === 1) startWeatherRuntime();

  let released = false;
  return () => {
    if (released) return;
    released = true;
    runtimeConsumers = Math.max(0, runtimeConsumers - 1);
    if (runtimeConsumers === 0) stopWeatherRuntime();
  };
}

export function getWeatherRuntimeSnapshot(): WeatherRuntimeSnapshot {
  return snapshot;
}

export function subscribeWeatherRuntime(listener: Listener): () => void {
  listeners.add(listener);
  listener();
  return () => listeners.delete(listener);
}

export function __resetWeatherRuntimeForTests(): void {
  stopWeatherRuntime();
  runtimeConsumers = 0;
  snapshot = {
    cache: {},
    error: null,
    freshness: {
      full: "missing",
      fullUpdatedAt: null,
      minutely: "missing",
      minutelyUpdatedAt: null,
    },
    lastSuccessAt: null,
    location: null,
    nextRefreshAt: null,
    requestsThisHour: 0,
    status: "idle",
    updatedAt: 0,
  };
  failureCount = 0;
  inFlight = null;
  pending = null;
  listeners.clear();
}
