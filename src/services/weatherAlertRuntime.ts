import type { WeatherAlertResponse } from "../types/weather";
import { buildAlertSignature } from "../utils/weatherAlert";

export type WeatherAlertRuntimeStatus = "idle" | "ready" | "error";
export type WeatherAlertItem = NonNullable<WeatherAlertResponse["alerts"]>[number];

export interface ActiveWeatherAlert {
  alert: WeatherAlertItem;
  expiresAt: number;
  publishedAt: number | null;
  severityRank: number;
  signature: string;
}

export interface WeatherAlertSnapshot {
  alerts: ActiveWeatherAlert[];
  coords: { lat: number; lon: number } | null;
  error: string | null;
  fetchedAt: number | null;
  metadata: WeatherAlertResponse["metadata"] | null;
  revision: number;
  status: WeatherAlertRuntimeStatus;
}

export interface WeatherAlertRuntimeOptions {
  /** Deprecated compatibility field. API scheduling is owned by WeatherRuntime. */
  apiIntervalMs?: number;
  localTickMs?: number;
}

type SnapshotListener = () => void;

const DEFAULT_LOCAL_TICK_MS = 60 * 1000;
const FALLBACK_ALERT_TTL_MS = 12 * 60 * 60 * 1000;

const EMPTY_SNAPSHOT: WeatherAlertSnapshot = {
  alerts: [],
  coords: null,
  error: null,
  fetchedAt: null,
  metadata: null,
  revision: 0,
  status: "idle",
};

let snapshot: WeatherAlertSnapshot = EMPTY_SNAPSHOT;
const listeners = new Set<SnapshotListener>();
let runtimeStarted = false;
let runtimeTimer: ReturnType<typeof setInterval> | null = null;

function clampInterval(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.round(value)));
}

function parseTimestamp(value?: string | null): number | null {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function resolveSeverityRank(alert: WeatherAlertItem): number {
  const value = [alert.color?.code, alert.severity, alert.headline, alert.eventType?.name]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  if (value.includes("红") || value.includes("red")) return 5;
  if (value.includes("橙") || value.includes("orange")) return 4;
  if (value.includes("黄") || value.includes("yellow")) return 3;
  if (value.includes("蓝") || value.includes("blue")) return 2;
  if (value.includes("白") || value.includes("white")) return 1;
  return 0;
}

function resolveExpiry(alert: WeatherAlertItem, fetchedAt: number): number {
  const explicitExpiry = parseTimestamp(alert.expireTime);
  if (explicitExpiry != null) return explicitExpiry;
  const baseTime =
    parseTimestamp(alert.issuedTime) ?? parseTimestamp(alert.effectiveTime) ?? fetchedAt;
  return baseTime + FALLBACK_ALERT_TTL_MS;
}

export function normalizeActiveWeatherAlerts(
  alerts: WeatherAlertItem[],
  fetchedAt: number,
  nowMs = fetchedAt
): ActiveWeatherAlert[] {
  const seen = new Set<string>();
  return alerts
    .map((alert) => ({
      alert,
      expiresAt: resolveExpiry(alert, fetchedAt),
      publishedAt: parseTimestamp(alert.issuedTime) ?? parseTimestamp(alert.effectiveTime),
      severityRank: resolveSeverityRank(alert),
      signature: buildAlertSignature(alert),
    }))
    .filter((item) => item.expiresAt > nowMs)
    .filter((item) => {
      if (seen.has(item.signature)) return false;
      seen.add(item.signature);
      return true;
    })
    .sort(
      (left, right) =>
        right.severityRank - left.severityRank ||
        (right.publishedAt ?? 0) - (left.publishedAt ?? 0) ||
        left.signature.localeCompare(right.signature)
    );
}

function publish(next: Partial<WeatherAlertSnapshot>): void {
  snapshot = { ...snapshot, ...next };
  listeners.forEach((listener) => listener());
}

function pruneExpiredAlerts(nowMs = Date.now()): void {
  const alerts = snapshot.alerts.filter((item) => item.expiresAt > nowMs);
  if (alerts.length !== snapshot.alerts.length) publish({ alerts });
}

export function ingestWeatherAlertResponse(
  response: WeatherAlertResponse,
  coords?: { lat: number; lon: number } | null,
  fetchedAt = Date.now()
): void {
  if (response.error) {
    pruneExpiredAlerts(fetchedAt);
    publish({
      coords: coords ?? snapshot.coords,
      error: response.error,
      status: "error",
    });
    return;
  }

  snapshot = {
    alerts: normalizeActiveWeatherAlerts(response.alerts ?? [], fetchedAt),
    coords: coords ?? snapshot.coords,
    error: null,
    fetchedAt,
    metadata: response.metadata ?? null,
    revision: snapshot.revision + 1,
    status: "ready",
  };
  listeners.forEach((listener) => listener());
}

/** Compatibility entry point. Network refreshes are owned by WeatherRuntime. */
export async function refreshWeatherAlerts(): Promise<void> {
  pruneExpiredAlerts();
}

export function startWeatherAlertRuntime(options?: WeatherAlertRuntimeOptions): () => void {
  if (runtimeStarted) return stopWeatherAlertRuntime;
  runtimeStarted = true;
  const localTickMs = clampInterval(
    options?.localTickMs ?? DEFAULT_LOCAL_TICK_MS,
    5 * 1000,
    5 * 60 * 1000
  );
  pruneExpiredAlerts();
  runtimeTimer = setInterval(pruneExpiredAlerts, localTickMs);
  return stopWeatherAlertRuntime;
}

export function stopWeatherAlertRuntime(): void {
  if (runtimeTimer) {
    clearInterval(runtimeTimer);
    runtimeTimer = null;
  }
  runtimeStarted = false;
}

export function getWeatherAlertSnapshot(): WeatherAlertSnapshot {
  return snapshot;
}

export function subscribeWeatherAlerts(listener: SnapshotListener): () => void {
  listeners.add(listener);
  if (!runtimeStarted) startWeatherAlertRuntime();
  listener();
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) stopWeatherAlertRuntime();
  };
}

export function __resetWeatherAlertRuntimeForTests(): void {
  stopWeatherAlertRuntime();
  snapshot = EMPTY_SNAPSHOT;
  listeners.clear();
}
