import { HttpRequestError } from "./httpClient";
import { withWeatherCrossTabLock, __resetWeatherCrossTabLockForTests } from "./weatherCrossTabLock";

const STORAGE_KEY = "immersive-clock:weather-request-guard:v1";
const WINDOW_MS = 60 * 60 * 1000;
const RATE_LIMIT_FALLBACK_MS = 30 * 60 * 1000;
const FORBIDDEN_COOLDOWN_MS = 2 * 60 * 60 * 1000;

export type WeatherRequestKind = "all" | "citySearch" | "geoResolve" | "minutely" | "other";

const ENDPOINT_MIN_GAP_MS: Record<WeatherRequestKind, number> = {
  all: 60 * 1000,
  citySearch: 1000,
  geoResolve: 1000,
  minutely: 60 * 1000,
  other: 0,
};

const FIXED_SAFETY_SETTINGS = {
  maxRequestsPerHour: 120,
  minRequestGapSec: 2,
} as const;

interface StoredWeatherRequestGuardState {
  cooldownUntil: number;
  endpointLastAttemptAt: Record<WeatherRequestKind, number>;
  endpointLastSuccessAt: Record<WeatherRequestKind, number>;
  lastAttemptAt: number;
  lastSuccessAt: number;
  nextAllowedAt: number;
  requestTimestamps: number[];
  version: 2;
}

export interface WeatherRequestGuardSnapshot {
  cooldownUntil: number | null;
  lastAttemptAt: number | null;
  lastRequestAt: number | null;
  lastSuccessAt: number | null;
  nextAllowedAt: number;
  requestsThisHour: number;
}

export class WeatherRequestDeferredError extends Error {
  constructor(
    public readonly retryAt: number,
    message = "天气请求正在等待本设备请求保护"
  ) {
    super(message);
    this.name = "WeatherRequestDeferredError";
  }
}

function emptyEndpointTimestamps(): Record<WeatherRequestKind, number> {
  return { all: 0, citySearch: 0, geoResolve: 0, minutely: 0, other: 0 };
}

const EMPTY_STATE: StoredWeatherRequestGuardState = {
  cooldownUntil: 0,
  endpointLastAttemptAt: emptyEndpointTimestamps(),
  endpointLastSuccessAt: emptyEndpointTimestamps(),
  lastAttemptAt: 0,
  lastSuccessAt: 0,
  nextAllowedAt: 0,
  requestTimestamps: [],
  version: 2,
};

let memoryState: StoredWeatherRequestGuardState = structuredClone(EMPTY_STATE);
let requestQueue: Promise<void> = Promise.resolve();

function getNow(): number {
  return Date.now();
}

function normalizeTimestamp(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : 0;
}

function normalizeEndpointTimestamps(value: unknown): Record<WeatherRequestKind, number> {
  const source =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  return {
    all: normalizeTimestamp(source.all),
    citySearch: normalizeTimestamp(source.citySearch ?? source.location),
    geoResolve: normalizeTimestamp(source.geoResolve ?? source.location),
    minutely: normalizeTimestamp(source.minutely),
    other: normalizeTimestamp(source.other),
  };
}

function normalizeState(value: unknown, now = getNow()): StoredWeatherRequestGuardState {
  const source =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  const legacyLastRequestAt = normalizeTimestamp(source.lastRequestAt);
  const requestTimestamps = Array.isArray(source.requestTimestamps)
    ? source.requestTimestamps
        .map(normalizeTimestamp)
        .filter((timestamp) => timestamp > now - WINDOW_MS && timestamp <= now)
        .sort((left, right) => left - right)
    : [];
  return {
    cooldownUntil: normalizeTimestamp(source.cooldownUntil),
    endpointLastAttemptAt: normalizeEndpointTimestamps(source.endpointLastAttemptAt),
    endpointLastSuccessAt: normalizeEndpointTimestamps(source.endpointLastSuccessAt),
    lastAttemptAt: normalizeTimestamp(source.lastAttemptAt) || legacyLastRequestAt,
    lastSuccessAt: normalizeTimestamp(source.lastSuccessAt),
    nextAllowedAt: normalizeTimestamp(source.nextAllowedAt),
    requestTimestamps,
    version: 2,
  };
}

function readState(now = getNow()): StoredWeatherRequestGuardState {
  if (typeof localStorage === "undefined") return normalizeState(memoryState, now);
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const state = normalizeState(raw ? JSON.parse(raw) : null, now);
    memoryState = state;
    return state;
  } catch {
    return normalizeState(memoryState, now);
  }
}

function writeState(state: StoredWeatherRequestGuardState): void {
  memoryState = state;
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // The in-memory state still protects this application instance.
  }
}

function getSafetySettings() {
  return FIXED_SAFETY_SETTINGS;
}

function calculateHourlyAllowedAt(
  state: StoredWeatherRequestGuardState,
  maxRequestsPerHour: number,
  now: number
): number {
  return state.requestTimestamps.length >= maxRequestsPerHour
    ? state.requestTimestamps[state.requestTimestamps.length - maxRequestsPerHour] + WINDOW_MS
    : now;
}

function calculateNextAllowedAt(
  state: StoredWeatherRequestGuardState,
  kind: WeatherRequestKind,
  minRequestGapMs: number,
  maxRequestsPerHour: number,
  now: number
): number {
  const globalAllowedAt = state.lastAttemptAt > 0 ? state.lastAttemptAt + minRequestGapMs : now;
  const endpointAllowedAt =
    state.endpointLastAttemptAt[kind] > 0
      ? state.endpointLastAttemptAt[kind] + ENDPOINT_MIN_GAP_MS[kind]
      : now;
  return Math.max(
    now,
    globalAllowedAt,
    endpointAllowedAt,
    calculateHourlyAllowedAt(state, maxRequestsPerHour, now),
    state.cooldownUntil
  );
}

function waitFor(durationMs: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, durationMs)));
}

function parseCooldown(error: unknown, now: number): number | null {
  if (!(error instanceof HttpRequestError)) return null;
  if (error.status === 429) return now + (error.retryAfterMs ?? RATE_LIMIT_FALLBACK_MS);
  if (error.status === 403) return now + FORBIDDEN_COOLDOWN_MS;
  return null;
}

function createDeferredError(
  state: StoredWeatherRequestGuardState,
  kind: WeatherRequestKind,
  now: number
): WeatherRequestDeferredError {
  const safety = getSafetySettings();
  return new WeatherRequestDeferredError(
    calculateNextAllowedAt(
      state,
      kind,
      safety.minRequestGapSec * 1000,
      safety.maxRequestsPerHour,
      now
    )
  );
}

async function runGuardedRequest<T>(
  runner: () => Promise<T>,
  kind: WeatherRequestKind
): Promise<T> {
  const safety = getSafetySettings();
  const minRequestGapMs = safety.minRequestGapSec * 1000;
  let now = getNow();
  let state = readState(now);
  const endpointAllowedAt =
    state.endpointLastAttemptAt[kind] > 0
      ? state.endpointLastAttemptAt[kind] + ENDPOINT_MIN_GAP_MS[kind]
      : now;
  const blockedByCooldown = state.cooldownUntil > now;
  const blockedByHourlyLimit = state.requestTimestamps.length >= safety.maxRequestsPerHour;
  if (blockedByCooldown || blockedByHourlyLimit || endpointAllowedAt > now) {
    throw createDeferredError(state, kind, now);
  }

  const globalAllowedAt = state.lastAttemptAt > 0 ? state.lastAttemptAt + minRequestGapMs : now;
  if (globalAllowedAt > now) {
    await waitFor(globalAllowedAt - now);
    now = getNow();
    state = readState(now);
    const nextAllowedAt = calculateNextAllowedAt(
      state,
      kind,
      minRequestGapMs,
      safety.maxRequestsPerHour,
      now
    );
    if (nextAllowedAt > now) throw new WeatherRequestDeferredError(nextAllowedAt);
  }

  const requestStartedAt = getNow();
  const reservedState: StoredWeatherRequestGuardState = {
    ...state,
    endpointLastAttemptAt: {
      ...state.endpointLastAttemptAt,
      [kind]: requestStartedAt,
    },
    lastAttemptAt: requestStartedAt,
    requestTimestamps: [...state.requestTimestamps, requestStartedAt].filter(
      (timestamp) => timestamp > requestStartedAt - WINDOW_MS
    ),
    version: 2,
  };
  reservedState.nextAllowedAt = calculateNextAllowedAt(
    reservedState,
    kind,
    minRequestGapMs,
    safety.maxRequestsPerHour,
    requestStartedAt
  );
  writeState(reservedState);

  try {
    const result = await runner();
    const succeededAt = getNow();
    const succeededState: StoredWeatherRequestGuardState = {
      ...readState(succeededAt),
      endpointLastSuccessAt: {
        ...reservedState.endpointLastSuccessAt,
        [kind]: succeededAt,
      },
      lastSuccessAt: succeededAt,
      version: 2,
    };
    succeededState.nextAllowedAt = calculateNextAllowedAt(
      succeededState,
      kind,
      minRequestGapMs,
      safety.maxRequestsPerHour,
      succeededAt
    );
    writeState(succeededState);
    return result;
  } catch (error: unknown) {
    const failedAt = getNow();
    const cooldownUntil = parseCooldown(error, failedAt);
    const failedState = {
      ...readState(failedAt),
      ...(cooldownUntil == null ? {} : { cooldownUntil }),
    };
    failedState.nextAllowedAt = calculateNextAllowedAt(
      failedState,
      kind,
      minRequestGapMs,
      safety.maxRequestsPerHour,
      failedAt
    );
    writeState(failedState);
    throw error;
  }
}

export function executeWeatherRequest<T>(
  runner: () => Promise<T>,
  kind: WeatherRequestKind = "other",
  requestKey: string = kind
): Promise<T> {
  const task = requestQueue.then(
    () => withWeatherCrossTabLock(() => runGuardedRequest(runner, kind), requestKey),
    () => withWeatherCrossTabLock(() => runGuardedRequest(runner, kind), requestKey)
  );
  requestQueue = task.then(
    () => undefined,
    () => undefined
  );
  return task;
}

export function getWeatherRequestGuardSnapshot(
  now = getNow(),
  kind: WeatherRequestKind = "other"
): WeatherRequestGuardSnapshot {
  const safety = getSafetySettings();
  const state = readState(now);
  return {
    cooldownUntil: state.cooldownUntil > now ? state.cooldownUntil : null,
    lastAttemptAt: state.lastAttemptAt || null,
    lastRequestAt: state.lastAttemptAt || null,
    lastSuccessAt: state.lastSuccessAt || null,
    nextAllowedAt: calculateNextAllowedAt(
      state,
      kind,
      safety.minRequestGapSec * 1000,
      safety.maxRequestsPerHour,
      now
    ),
    requestsThisHour: state.requestTimestamps.length,
  };
}

export function __resetWeatherRequestGuardForTests(): void {
  memoryState = structuredClone(EMPTY_STATE);
  requestQueue = Promise.resolve();
  __resetWeatherCrossTabLockForTests();
  if (typeof localStorage !== "undefined") localStorage.removeItem(STORAGE_KEY);
}
