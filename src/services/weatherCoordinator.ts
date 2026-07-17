import { getAppSettings } from "../utils/appSettings";
import { isUsableMinutelyResponse } from "../utils/minutelyPrecipLogic";
import { subscribeSettingsEvent, SETTINGS_EVENTS } from "../utils/settingsEvents";
import { resolveEffectiveWeatherSchedule } from "../utils/weatherSchedule";
import {
  createWeatherLocationKey,
  getValidCoords,
  getValidMinutely,
  getWeatherCache,
  updateMinutelyCache,
} from "../utils/weatherStorage";

import {
  getMinutelyWeatherSnapshot,
  recomputeMinutelyWeatherSnapshot,
  setMinutelyWeatherRuntimeError,
} from "./minutelyWeatherRuntime";
import { refreshWeatherBundle } from "./weatherRefresh";
import {
  getWeatherRequestGuardSnapshot,
  type WeatherRequestKind,
  WeatherRequestDeferredError,
} from "./weatherRequestGuard";
import {
  fetchMinutelyPrecip,
  type WeatherFlowOptions,
  type XiaomiResolvedLocation,
} from "./weatherService";
import {
  __resetWeatherSyncChannelForTests,
  broadcastWeatherCacheUpdate,
  subscribeWeatherCacheSync,
  type WeatherCacheSyncMessage,
} from "./weatherSyncChannel";

const BACKOFF_STORAGE_KEY = "immersive-clock:weather-coordinator-backoff:v1";
const FAILURE_BACKOFF_MS = [60_000, 2 * 60_000, 5 * 60_000, 10 * 60_000] as const;
const MAX_TIMER_DELAY_MS = 2_147_000_000;

export type WeatherCoordinatorStatus =
  | "idle"
  | "rate-limited"
  | "cooldown"
  | "refreshing"
  | "ready"
  | "offline"
  | "error-with-cache"
  | "error";
export type WeatherRefreshReason =
  | "startup"
  | "scheduled"
  | "manual"
  | "visibility"
  | "online"
  | "location"
  | "settings";
export type WeatherRefreshTarget = "all" | "minutely";

export interface WeatherCoordinatorSnapshot {
  activeTarget: WeatherRefreshTarget | null;
  cooldownUntil: number | null;
  error: string | null;
  lastSuccessAt: number | null;
  nextRefreshAt: number | null;
  reason: WeatherRefreshReason | null;
  requestsThisHour: number;
  status: WeatherCoordinatorStatus;
  updatedAt: number;
}

export interface WeatherRefreshRequest extends WeatherFlowOptions {
  force?: boolean;
  reason?: WeatherRefreshReason;
  target?: WeatherRefreshTarget;
}

interface StoredBackoffState {
  failureCount: number;
  retryAt: number;
  version: 1;
}

type SnapshotListener = () => void;

const EMPTY_BACKOFF: StoredBackoffState = {
  failureCount: 0,
  retryAt: 0,
  version: 1,
};

const initialCache = typeof localStorage === "undefined" ? {} : getWeatherCache();
let snapshot: WeatherCoordinatorSnapshot = {
  activeTarget: null,
  cooldownUntil: null,
  error: null,
  lastSuccessAt: initialCache.details?.updatedAt ?? initialCache.now?.updatedAt ?? null,
  nextRefreshAt: null,
  reason: null,
  requestsThisHour: 0,
  status: "idle",
  updatedAt: 0,
};
let backoffMemory: StoredBackoffState = { ...EMPTY_BACKOFF };
let inFlight: Promise<WeatherCoordinatorSnapshot> | null = null;
let lastProviderLocation: XiaomiResolvedLocation | null = null;
let minutelyFallbackLocation: string | null = null;
const listeners = new Set<SnapshotListener>();
let deferredRequest: WeatherRefreshRequest | null = null;
let pendingRequest: WeatherRefreshRequest | null = null;
let runtimeStarted = false;
let runtimeTimer: ReturnType<typeof setTimeout> | null = null;
let stopRuntimeListeners: (() => void) | null = null;

function nowMs(): number {
  return Date.now();
}

function isOnline(): boolean {
  return typeof navigator === "undefined" || navigator.onLine !== false;
}

function isBackground(): boolean {
  return typeof document !== "undefined" && document.visibilityState === "hidden";
}

function readBackoff(): StoredBackoffState {
  if (typeof localStorage === "undefined") return backoffMemory;
  try {
    const raw = localStorage.getItem(BACKOFF_STORAGE_KEY);
    if (!raw) return { ...EMPTY_BACKOFF };
    const value = JSON.parse(raw) as Partial<StoredBackoffState>;
    const state = {
      failureCount:
        typeof value.failureCount === "number" && Number.isFinite(value.failureCount)
          ? Math.max(0, Math.round(value.failureCount))
          : 0,
      retryAt:
        typeof value.retryAt === "number" && Number.isFinite(value.retryAt)
          ? Math.max(0, value.retryAt)
          : 0,
      version: 1 as const,
    };
    backoffMemory = state;
    return state;
  } catch {
    return backoffMemory;
  }
}

function writeBackoff(state: StoredBackoffState): void {
  backoffMemory = state;
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(BACKOFF_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // The in-memory state still prevents a retry loop in this application session.
  }
}

function clearBackoff(): void {
  writeBackoff({ ...EMPTY_BACKOFF });
}

function recordFailure(): number {
  const current = readBackoff();
  const failureCount = current.failureCount + 1;
  const delay = FAILURE_BACKOFF_MS[Math.min(failureCount - 1, FAILURE_BACKOFF_MS.length - 1)];
  const retryAt = nowMs() + delay;
  writeBackoff({ failureCount, retryAt, version: 1 });
  return retryAt;
}

function publish(next: Partial<WeatherCoordinatorSnapshot>): void {
  const guard = getWeatherRequestGuardSnapshot();
  snapshot = {
    ...snapshot,
    ...next,
    cooldownUntil: guard.cooldownUntil,
    requestsThisHour: guard.requestsThisHour,
    updatedAt: nowMs(),
  };
  listeners.forEach((listener) => listener());
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("weatherCoordinatorChange", { detail: snapshot }));
  }
}

function getEffectiveSchedule() {
  return resolveEffectiveWeatherSchedule(getAppSettings().general.weather.schedule);
}

function getMatchingLocationKey(): string | null {
  const coords = getValidCoords();
  return coords ? createWeatherLocationKey(coords.lat, coords.lon) : null;
}

function getLastAllSuccessAt(): number {
  const cache = getWeatherCache();
  const location = getMatchingLocationKey();
  if (!location || cache.details?.location !== location) return 0;
  return cache.details.updatedAt;
}

function hasMatchingWeatherCache(): boolean {
  const cache = getWeatherCache();
  const location = getMatchingLocationKey();
  if (!location) return false;
  return cache.details?.location === location || cache.minutely?.location === location;
}

function getAllIntervalMs(): number {
  const schedule = getEffectiveSchedule();
  return (isBackground() ? schedule.allBackgroundMin : schedule.allForegroundMin) * 60_000;
}

function getMinutelyIntervalMs(): number {
  const schedule = getEffectiveSchedule();
  if (isBackground()) return schedule.minutelyBackgroundMin * 60_000;
  const phase = getMinutelyWeatherSnapshot().phase;
  return (
    (phase === "PRE_RAIN" || phase === "RAINING"
      ? schedule.minutelyRainMin
      : schedule.minutelyDryMin) * 60_000
  );
}

function getNextAllAt(now: number): number {
  const lastSuccessAt = getLastAllSuccessAt();
  return lastSuccessAt > 0 ? lastSuccessAt + getAllIntervalMs() : now;
}

function getNextMinutelyAt(now: number): number {
  const coords = getValidCoords();
  if (!coords) return Number.POSITIVE_INFINITY;
  const location = createWeatherLocationKey(coords.lat, coords.lon);
  const cache = getWeatherCache();
  const entry = cache.minutely?.location === location ? cache.minutely : null;
  if (minutelyFallbackLocation === location) return now;
  const validData = getValidMinutely(location);
  const phase = getMinutelyWeatherSnapshot().phase;
  const criticalPhase = phase === "PRE_RAIN" || phase === "RAINING";

  if (criticalPhase) {
    const latestMinutelyAt = Math.max(entry?.lastApiFetchAt ?? 0, entry?.updatedAt ?? 0);
    return latestMinutelyAt > 0 ? latestMinutelyAt + getMinutelyIntervalMs() : now;
  }
  if (validData) return entry!.updatedAt + getMinutelyIntervalMs();
  return entry?.updatedAt ? entry.updatedAt + getMinutelyIntervalMs() : now;
}

function getRequestKind(target: WeatherRefreshTarget): WeatherRequestKind {
  return target === "minutely" ? "minutely" : "all";
}

function getProtectionRetryAt(now: number, target: WeatherRefreshTarget): number {
  const guard = getWeatherRequestGuardSnapshot(now, getRequestKind(target));
  const backoff = readBackoff();
  return Math.max(now, guard.nextAllowedAt, guard.cooldownUntil ?? 0, backoff.retryAt);
}

function getProtectionStatus(
  now: number,
  target: WeatherRefreshTarget
): Extract<WeatherCoordinatorStatus, "rate-limited" | "cooldown"> | null {
  const guard = getWeatherRequestGuardSnapshot(now, getRequestKind(target));
  const backoff = readBackoff();
  if ((guard.cooldownUntil ?? 0) > now || backoff.retryAt > now) return "cooldown";
  if (guard.nextAllowedAt > now) return "rate-limited";
  return null;
}

function calculateNextRefreshAt(now = nowMs()): number {
  if (deferredRequest) {
    return getProtectionRetryAt(now, deferredRequest.target ?? "all");
  }
  return Math.min(
    Math.max(getNextAllAt(now), getProtectionRetryAt(now, "all")),
    Math.max(getNextMinutelyAt(now), getProtectionRetryAt(now, "minutely"))
  );
}

function clearTimer(): void {
  if (runtimeTimer) {
    clearTimeout(runtimeTimer);
    runtimeTimer = null;
  }
}

function scheduleTimer(at = calculateNextRefreshAt()): void {
  clearTimer();
  if (!runtimeStarted || !isOnline() || !Number.isFinite(at)) {
    publish({ nextRefreshAt: null });
    return;
  }
  const now = nowMs();
  const delay = Math.min(MAX_TIMER_DELAY_MS, Math.max(0, at - now));
  publish({
    nextRefreshAt: at,
    status: snapshot.status,
  });
  runtimeTimer = setTimeout(() => {
    runtimeTimer = null;
    void runScheduledRefresh("scheduled");
  }, delay);
}

function mergePendingRequest(
  current: WeatherRefreshRequest | null,
  incoming: WeatherRefreshRequest
): WeatherRefreshRequest {
  if (!current) return incoming;
  return {
    ...current,
    ...incoming,
    force: Boolean(current.force || incoming.force),
    forceGeolocation: Boolean(current.forceGeolocation || incoming.forceGeolocation),
    target: current.target === "all" || incoming.target === "all" ? "all" : "minutely",
  };
}

function isRequestDeferred(error: unknown): error is WeatherRequestDeferredError {
  return error instanceof WeatherRequestDeferredError;
}

function dispatchLocationRefreshDone(status: "成功" | "失败", errorMessage = ""): void {
  if (typeof window === "undefined") return;
  const cache = getWeatherCache();
  window.dispatchEvent(
    new CustomEvent("weatherLocationRefreshDone", {
      detail: {
        address: cache.location?.address || "",
        coords: cache.coords ? { lat: cache.coords.lat, lon: cache.coords.lon } : null,
        coordsSource: cache.coords?.source || null,
        errorMessage,
        geolocationDiagnostics: cache.geolocation?.diagnostics || null,
        status,
        ts: nowMs(),
      },
    })
  );
}

async function performAllRefresh(
  request: WeatherRefreshRequest
): Promise<WeatherCoordinatorSnapshot> {
  publish({
    activeTarget: "all",
    error: null,
    nextRefreshAt: null,
    reason: request.reason ?? "manual",
    status: "refreshing",
  });
  const result = await refreshWeatherBundle({
    forceGeolocation: request.forceGeolocation,
    preferredLocationMode: request.preferredLocationMode,
  });
  lastProviderLocation = result.providerLocation ?? null;
  if (result.coords) {
    const location = createWeatherLocationKey(result.coords.lat, result.coords.lon);
    minutelyFallbackLocation = isUsableMinutelyResponse(result.embeddedMinutely) ? null : location;
  }
  clearBackoff();
  setMinutelyWeatherRuntimeError(null);
  recomputeMinutelyWeatherSnapshot();
  const successAt = nowMs();
  publish({
    activeTarget: null,
    error: null,
    lastSuccessAt: successAt,
    reason: request.reason ?? "manual",
    status: "ready",
  });
  broadcastWeatherCacheUpdate(
    "all",
    result.coords ? createWeatherLocationKey(result.coords.lat, result.coords.lon) : null
  );
  if (request.reason === "location") dispatchLocationRefreshDone("成功");
  return snapshot;
}

async function performMinutelyRefresh(
  request: WeatherRefreshRequest
): Promise<WeatherCoordinatorSnapshot> {
  const coords = getValidCoords();
  if (!coords) return performAllRefresh({ ...request, target: "all" });
  const location = createWeatherLocationKey(coords.lat, coords.lon);
  const reusableProviderLocation =
    lastProviderLocation &&
    createWeatherLocationKey(lastProviderLocation.lat, lastProviderLocation.lon) === location
      ? lastProviderLocation
      : undefined;

  publish({
    activeTarget: "minutely",
    error: null,
    nextRefreshAt: null,
    reason: request.reason ?? "scheduled",
    status: "refreshing",
  });
  const result = await fetchMinutelyPrecip(location, reusableProviderLocation);
  if (!isUsableMinutelyResponse(result)) {
    throw new Error(result.error || `分钟级降水接口状态异常：${result.code || "unknown"}`);
  }
  updateMinutelyCache(location, result, nowMs());
  minutelyFallbackLocation = null;
  clearBackoff();
  setMinutelyWeatherRuntimeError(null);
  recomputeMinutelyWeatherSnapshot();
  publish({
    activeTarget: null,
    error: null,
    reason: request.reason ?? "scheduled",
    status: "ready",
  });
  broadcastWeatherCacheUpdate("minutely", location);
  return snapshot;
}

async function performRequest(request: WeatherRefreshRequest): Promise<WeatherCoordinatorSnapshot> {
  const now = nowMs();
  if (!isOnline()) {
    if (request.force) deferredRequest = mergePendingRequest(deferredRequest, request);
    publish({
      activeTarget: null,
      error: "当前处于离线状态",
      nextRefreshAt: null,
      reason: request.reason ?? "manual",
      status: "offline",
    });
    return snapshot;
  }

  const protectedUntil = getProtectionRetryAt(now, request.target ?? "all");
  if (protectedUntil > now) {
    if (request.force) deferredRequest = mergePendingRequest(deferredRequest, request);
    publish({
      activeTarget: null,
      error: null,
      nextRefreshAt: protectedUntil,
      reason: request.reason ?? "manual",
      status: getProtectionStatus(now, request.target ?? "all") ?? "rate-limited",
    });
    scheduleTimer(protectedUntil);
    return snapshot;
  }

  try {
    return request.target === "minutely"
      ? await performMinutelyRefresh(request)
      : await performAllRefresh(request);
  } catch (error: unknown) {
    if (isRequestDeferred(error)) {
      if (request.force) deferredRequest = mergePendingRequest(deferredRequest, request);
      publish({
        activeTarget: null,
        error: null,
        nextRefreshAt: error.retryAt,
        reason: request.reason ?? "manual",
        status: getProtectionStatus(nowMs(), request.target ?? "all") ?? "rate-limited",
      });
      scheduleTimer(error.retryAt);
      return snapshot;
    }

    const message = error instanceof Error ? error.message : String(error);
    const guard = getWeatherRequestGuardSnapshot();
    const retryAt = guard.cooldownUntil ?? recordFailure();
    if (request.force) deferredRequest = mergePendingRequest(deferredRequest, request);
    if (request.target === "minutely") setMinutelyWeatherRuntimeError(message);
    publish({
      activeTarget: null,
      error: message,
      nextRefreshAt: retryAt,
      reason: request.reason ?? "manual",
      status:
        guard.cooldownUntil != null
          ? "cooldown"
          : hasMatchingWeatherCache()
            ? "error-with-cache"
            : "error",
    });
    if (request.reason === "location") dispatchLocationRefreshDone("失败", message);
    scheduleTimer(retryAt);
    return snapshot;
  }
}

async function runDueRefresh(reason: WeatherRefreshReason): Promise<WeatherCoordinatorSnapshot> {
  const now = nowMs();
  const allAt = getNextAllAt(now);
  const minutelyAt = getNextMinutelyAt(now);
  const nextAt = Math.min(allAt, minutelyAt);
  if (nextAt > now) {
    scheduleTimer(nextAt);
    return snapshot;
  }
  const target: WeatherRefreshTarget = allAt <= minutelyAt ? "all" : "minutely";
  return requestWeatherRefresh({ reason, target });
}

function toCachedAlertResponse(cache: ReturnType<typeof getWeatherCache>) {
  const details = cache.details?.data;
  if (!details) return null;
  const alerts = Array.isArray(details.alerts) ? details.alerts : [];
  return {
    alerts: alerts.map((alert) => ({
      color: alert.level ? { code: alert.level } : undefined,
      defenses: alert.defenses,
      description: alert.detail,
      eventType: alert.type ? { name: alert.type } : undefined,
      headline: alert.title,
      id: alert.id,
      issuedTime: alert.publishedAt,
      severity: alert.level,
    })),
    metadata: {
      tag: cache.alertMetadata?.lastTag,
      zeroResult: alerts.length === 0,
    },
  };
}

function handleCrossTabCacheUpdate(message: WeatherCacheSyncMessage): void {
  const cache = getWeatherCache();
  const coords = cache.coords ? { lat: cache.coords.lat, lon: cache.coords.lon } : null;
  const location = coords ? createWeatherLocationKey(coords.lat, coords.lon) : null;
  if (message.location && location && message.location !== location) return;

  if (message.target === "minutely") {
    minutelyFallbackLocation = null;
  } else if (location && cache.details?.location === location) {
    const minutelyIsFromSameRefresh =
      cache.minutely?.location === location && cache.minutely.updatedAt >= cache.details.updatedAt;
    minutelyFallbackLocation = minutelyIsFromSameRefresh ? null : location;
  }
  setMinutelyWeatherRuntimeError(null);
  recomputeMinutelyWeatherSnapshot();
  publish({
    activeTarget: inFlight ? snapshot.activeTarget : null,
    error: null,
    lastSuccessAt:
      message.target === "all" && cache.details?.location === location
        ? cache.details.updatedAt
        : snapshot.lastSuccessAt,
    reason: snapshot.reason,
    status: inFlight ? snapshot.status : "ready",
  });

  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent("weatherRefreshDone", {
        detail: {
          address: cache.location?.address || "",
          airQuality: cache.airQuality?.data || null,
          alerts: toCachedAlertResponse(cache),
          astronomySun: cache.astronomySun?.data || null,
          coords,
          coordsSource: cache.coords?.source || null,
          daily3d: cache.daily3d?.data || null,
          details: cache.details?.data || null,
          now: cache.now?.data.now || null,
          source: "cross-tab",
          status: "成功",
          ts: message.sentAt,
        },
      })
    );
  }
  if (!inFlight) scheduleTimer();
}

function runScheduledRefresh(reason: WeatherRefreshReason): Promise<WeatherCoordinatorSnapshot> {
  const queued = deferredRequest;
  if (queued) {
    deferredRequest = null;
    return requestWeatherRefresh(queued);
  }
  return runDueRefresh(reason);
}

function attachRuntimeListeners(): () => void {
  if (typeof window === "undefined") return () => undefined;
  const onVisibilityChange = () => {
    if (document.visibilityState === "visible") {
      void runDueRefresh("visibility");
    } else {
      scheduleTimer();
    }
  };
  const onOnline = () => void runScheduledRefresh("online");
  const onOffline = () => {
    clearTimer();
    publish({
      activeTarget: null,
      error: "当前处于离线状态",
      nextRefreshAt: null,
      status: "offline",
    });
  };
  const onWeatherRefresh = (event: Event) => {
    const detail = (event as CustomEvent).detail ?? {};
    void requestWeatherRefresh({
      force: true,
      preferredLocationMode:
        detail.preferredLocationMode === "manual"
          ? "manual"
          : detail.preferredLocationMode === "auto"
            ? "auto"
            : undefined,
      reason: "manual",
      target: "all",
    });
  };
  const onLocationRefresh = (event: Event) => {
    const detail = (event as CustomEvent).detail ?? {};
    void requestWeatherRefresh({
      force: true,
      forceGeolocation: true,
      preferredLocationMode: detail.preferredLocationMode === "manual" ? "manual" : "auto",
      reason: "location",
      target: "all",
    });
  };
  document.addEventListener("visibilitychange", onVisibilityChange);
  window.addEventListener("online", onOnline);
  window.addEventListener("offline", onOffline);
  window.addEventListener("weatherRefresh", onWeatherRefresh);
  window.addEventListener("weatherLocationRefresh", onLocationRefresh);
  const offSettingsSaved = subscribeSettingsEvent(SETTINGS_EVENTS.SettingsSaved, () => {
    void runDueRefresh("settings");
  });
  const offWeatherSettings = subscribeSettingsEvent(SETTINGS_EVENTS.WeatherSettingsUpdated, () => {
    void runDueRefresh("settings");
  });
  const offCacheSync = subscribeWeatherCacheSync(handleCrossTabCacheUpdate);
  return () => {
    document.removeEventListener("visibilitychange", onVisibilityChange);
    window.removeEventListener("online", onOnline);
    window.removeEventListener("offline", onOffline);
    window.removeEventListener("weatherRefresh", onWeatherRefresh);
    window.removeEventListener("weatherLocationRefresh", onLocationRefresh);
    offSettingsSaved();
    offWeatherSettings();
    offCacheSync();
  };
}

export function requestWeatherRefresh(
  request: WeatherRefreshRequest = {}
): Promise<WeatherCoordinatorSnapshot> {
  const normalizedRequest: WeatherRefreshRequest = {
    ...request,
    force: request.force ?? (request.reason === "manual" || request.reason === "location"),
    reason: request.reason ?? "manual",
    target: request.target ?? "all",
  };

  if (inFlight) {
    pendingRequest = mergePendingRequest(pendingRequest, normalizedRequest);
    return inFlight;
  }

  const requestToRun = deferredRequest
    ? mergePendingRequest(deferredRequest, normalizedRequest)
    : normalizedRequest;
  deferredRequest = null;
  clearTimer();
  inFlight = performRequest(requestToRun).finally(() => {
    inFlight = null;
    const queued = pendingRequest;
    pendingRequest = null;
    if (queued) {
      if (queued.force) {
        void requestWeatherRefresh(queued);
      } else {
        void runDueRefresh(queued.reason ?? "scheduled");
      }
    } else {
      scheduleTimer();
    }
  });
  return inFlight;
}

export function startWeatherCoordinator(): () => void {
  if (runtimeStarted) return stopWeatherCoordinator;
  runtimeStarted = true;
  stopRuntimeListeners = attachRuntimeListeners();
  recomputeMinutelyWeatherSnapshot();
  publish({
    lastSuccessAt: getLastAllSuccessAt() || snapshot.lastSuccessAt,
    status: isOnline() ? "idle" : "offline",
  });
  void runDueRefresh("startup");
  return stopWeatherCoordinator;
}

export function stopWeatherCoordinator(): void {
  clearTimer();
  stopRuntimeListeners?.();
  stopRuntimeListeners = null;
  runtimeStarted = false;
}

export function getWeatherCoordinatorSnapshot(): WeatherCoordinatorSnapshot {
  return snapshot;
}

export function subscribeWeatherCoordinator(listener: SnapshotListener): () => void {
  listeners.add(listener);
  listener();
  return () => listeners.delete(listener);
}

export function __resetWeatherCoordinatorForTests(): void {
  stopWeatherCoordinator();
  snapshot = {
    activeTarget: null,
    cooldownUntil: null,
    error: null,
    lastSuccessAt: null,
    nextRefreshAt: null,
    reason: null,
    requestsThisHour: 0,
    status: "idle",
    updatedAt: 0,
  };
  backoffMemory = { ...EMPTY_BACKOFF };
  inFlight = null;
  lastProviderLocation = null;
  minutelyFallbackLocation = null;
  deferredRequest = null;
  listeners.clear();
  pendingRequest = null;
  __resetWeatherSyncChannelForTests();
  if (typeof localStorage !== "undefined") localStorage.removeItem(BACKOFF_STORAGE_KEY);
}
