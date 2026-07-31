import { DEFAULT_NOISE_REPORT_RETENTION_DAYS } from "../constants/noiseReport";
import {
  clearNoiseCaptureData,
  deleteNoiseCaptureDataBefore,
  listNoiseCaptureSessions,
} from "../services/noise/noiseFeatureRepository";
import { withNoiseHistoryWriteLock } from "../services/noise/noiseHistoryLock";
import {
  NOISE_SCORE_MODEL_VERSION,
  NOISE_SCORE_SCHEMA_VERSION,
  type NoiseConfidence,
  type NoiseScoreQuality,
  type NoiseSignalHealth,
  type NoiseSliceSummary,
  NoiseCaptureSession,
} from "../types/noise";

import { noiseHistoryDb, noiseRescoreStateDb, type NoiseHistoryQuery } from "./db";
import { pushErrorCenterRecord } from "./errorCenter";

const HISTORY_CHANNEL_NAME = "immersive-clock:noise-history:v4";
const HISTORY_SYNC_STORAGE_KEY = "immersive-clock:noise-history-message:v4";
const DAY_MS = 24 * 60 * 60 * 1000;
const EXTREME_SESSION_OVERLAP_RATIO = 0.8;

export const NOISE_SLICES_UPDATED_EVENT = "noise-slices-updated";

export interface NoiseSliceListOptions extends NoiseHistoryQuery {}
export interface NoiseSliceInspection {
  count: number;
  itemCount: number;
  bytes: number;
  updatedAt?: number;
}

let historyChannel: BroadcastChannel | null = null;
let historyListenerCount = 0;
const reportedOverlapGroups = new Set<string>();
const healthValues = new Set<NoiseSignalHealth>([
  "warming-up",
  "healthy",
  "below-range",
  "signal-anomaly",
  "track-muted",
  "track-ended",
  "audio-context-suspended",
  "insufficient-coverage",
]);
const confidenceValues = new Set<NoiseConfidence>(["high", "medium", "low", "none"]);
const qualityValues = new Set<NoiseScoreQuality>(["high", "medium", "low", "insufficient"]);

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function object(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isPersistedNoiseSliceSummary(value: unknown): value is NoiseSliceSummary {
  if (!object(value)) return false;
  const slice = value as Partial<NoiseSliceSummary>;
  const validHealth =
    typeof slice.signalHealth === "string" &&
    healthValues.has(slice.signalHealth as NoiseSignalHealth);
  return (
    slice.schemaVersion === NOISE_SCORE_SCHEMA_VERSION &&
    slice.modelVersion === NOISE_SCORE_MODEL_VERSION &&
    typeof slice.id === "string" &&
    typeof slice.captureSessionId === "string" &&
    typeof slice.leaderEpoch === "string" &&
    finite(slice.start) &&
    finite(slice.end) &&
    (slice.score === null || finite(slice.score)) &&
    object(slice.detail) &&
    finite(slice.detail.activityMean) &&
    finite(slice.detail.activityFloor) &&
    finite(slice.detail.eventFactor) &&
    finite(slice.detail.eventCount) &&
    finite(slice.detail.coverageRatio) &&
    Boolean(slice.detail.quality && qualityValues.has(slice.detail.quality)) &&
    validHealth &&
    Boolean(slice.confidence && confidenceValues.has(slice.confidence))
  );
}

export function isNoiseSliceSummary(value: unknown): value is NoiseSliceSummary {
  return isPersistedNoiseSliceSummary(value);
}

function normalize(slice: NoiseSliceSummary): NoiseSliceSummary {
  const detail = structuredClone(slice.detail);
  return {
    ...structuredClone(slice),
    score:
      slice.score === null ? null : Math.max(0, Math.min(100, Math.round(slice.score * 10) / 10)),
    detail,
    signalHealth: slice.signalHealth,
    coverageRatio: Math.max(0, Math.min(1, detail.coverageRatio)),
  };
}

function retentionCutoff(): number {
  return Date.now() - DEFAULT_NOISE_REPORT_RETENTION_DAYS * DAY_MS;
}

function estimateBytes(value: unknown): number {
  return new Blob([JSON.stringify(value)]).size;
}

function dispatchLocalUpdate(): void {
  window.dispatchEvent(new CustomEvent(NOISE_SLICES_UPDATED_EVENT));
}

function broadcastUpdate(): void {
  dispatchLocalUpdate();
  const message = JSON.stringify({ id: crypto.randomUUID?.() ?? Date.now(), sentAt: Date.now() });
  historyChannel?.postMessage(message);
  try {
    localStorage.setItem(HISTORY_SYNC_STORAGE_KEY, message);
  } catch {
    // IndexedDB is authoritative; cross-tab notification failure is non-fatal.
  }
}

function ensureHistoryChannel(): void {
  if (historyChannel || typeof BroadcastChannel === "undefined") return;
  historyChannel = new BroadcastChannel(HISTORY_CHANNEL_NAME);
  historyChannel.addEventListener("message", dispatchLocalUpdate);
}

function onHistoryStorage(event: StorageEvent): void {
  if (event.key === HISTORY_SYNC_STORAGE_KEY && event.newValue) dispatchLocalUpdate();
}

interface SessionCandidate {
  session: NoiseCaptureSession;
  slices: NoiseSliceSummary[];
  coverage: number;
  quality: number;
}

export interface NoiseSessionOverlapWarning {
  selectedSessionId: string;
  ignoredSessionIds: string[];
}

const QUALITY_RANK: Record<NoiseScoreQuality, number> = {
  high: 3,
  medium: 2,
  low: 1,
  insufficient: 0,
};

function average(values: readonly number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function overlapsExtremely(left: NoiseCaptureSession, right: NoiseCaptureSession): boolean {
  const leftEnd = left.endedAt ?? left.startedAt;
  const rightEnd = right.endedAt ?? right.startedAt;
  const leftDuration = Math.max(0, leftEnd - left.startedAt);
  const rightDuration = Math.max(0, rightEnd - right.startedAt);
  const shorterDuration = Math.min(leftDuration, rightDuration);
  if (shorterDuration <= 0) return false;
  const overlap = Math.max(
    0,
    Math.min(leftEnd, rightEnd) - Math.max(left.startedAt, right.startedAt)
  );
  return overlap / shorterDuration >= EXTREME_SESSION_OVERLAP_RATIO;
}

function compareCandidates(left: SessionCandidate, right: SessionCandidate): number {
  if (left.coverage !== right.coverage) return right.coverage - left.coverage;
  if (left.quality !== right.quality) return right.quality - left.quality;
  if (left.session.startedAt !== right.session.startedAt) {
    return left.session.startedAt - right.session.startedAt;
  }
  return left.session.captureSessionId.localeCompare(right.session.captureSessionId);
}

export function resolveOverlappingNoiseSessions(
  slices: readonly NoiseSliceSummary[],
  sessions: readonly NoiseCaptureSession[]
): { slices: NoiseSliceSummary[]; warnings: NoiseSessionOverlapWarning[] } {
  const slicesBySession = new Map<string, NoiseSliceSummary[]>();
  slices.forEach((slice) => {
    const sessionSlices = slicesBySession.get(slice.captureSessionId) ?? [];
    sessionSlices.push(slice);
    slicesBySession.set(slice.captureSessionId, sessionSlices);
  });
  const candidates = sessions
    .filter((session) => slicesBySession.has(session.captureSessionId))
    .map((session): SessionCandidate => {
      const sessionSlices = slicesBySession.get(session.captureSessionId)!;
      return {
        session,
        slices: sessionSlices,
        coverage: average(sessionSlices.map((slice) => slice.coverageRatio)),
        quality: average(sessionSlices.map((slice) => QUALITY_RANK[slice.detail.quality])),
      };
    });
  const visited = new Set<string>();
  const ignored = new Set<string>();
  const warnings: NoiseSessionOverlapWarning[] = [];

  for (const candidate of candidates) {
    const candidateId = candidate.session.captureSessionId;
    if (visited.has(candidateId)) continue;
    const component: SessionCandidate[] = [];
    const queue = [candidate];
    visited.add(candidateId);
    while (queue.length > 0) {
      const current = queue.shift()!;
      component.push(current);
      for (const other of candidates) {
        const otherId = other.session.captureSessionId;
        if (visited.has(otherId) || !overlapsExtremely(current.session, other.session)) continue;
        visited.add(otherId);
        queue.push(other);
      }
    }
    if (component.length < 2) continue;
    const ranked = component.slice().sort(compareCandidates);
    const selected = ranked[0]!;
    const ignoredSessionIds = ranked
      .slice(1)
      .map((item) => item.session.captureSessionId)
      .sort();
    ignoredSessionIds.forEach((sessionId) => ignored.add(sessionId));
    warnings.push({
      selectedSessionId: selected.session.captureSessionId,
      ignoredSessionIds,
    });
  }

  return {
    slices: slices.filter((slice) => !ignored.has(slice.captureSessionId)),
    warnings,
  };
}

function reportOverlapWarnings(warnings: readonly NoiseSessionOverlapWarning[]): void {
  warnings.forEach((warning) => {
    const fingerprint = `${warning.selectedSessionId}:${warning.ignoredSessionIds.join(",")}`;
    if (reportedOverlapGroups.has(fingerprint)) return;
    reportedOverlapGroups.add(fingerprint);
    pushErrorCenterRecord({
      level: "warn",
      source: "noise",
      title: "检测到重叠的音频采集会话",
      message: `报告采用会话 ${warning.selectedSessionId}，忽略 ${warning.ignoredSessionIds.length} 个重复来源。`,
      extra: { ...warning },
    });
  });
}

export async function listNoiseSlices(
  options: NoiseSliceListOptions = {}
): Promise<NoiseSliceSummary[]> {
  const [records, sessions] = await Promise.all([
    noiseHistoryDb.list<NoiseSliceSummary>(options),
    listNoiseCaptureSessions(),
  ]);
  const normalized = records.filter(isPersistedNoiseSliceSummary).map(normalize);
  const resolved = resolveOverlappingNoiseSessions(normalized, sessions);
  reportOverlapWarnings(resolved.warnings);
  return resolved.slices;
}

export const readNoiseSlices = listNoiseSlices;

export async function appendNoiseSlice(slice: NoiseSliceSummary): Promise<NoiseSliceSummary> {
  if (!isNoiseSliceSummary(slice)) throw new TypeError("无效的 spectral-activity-v2 评分记录");
  const normalized = normalize(slice);
  await withNoiseHistoryWriteLock(async () => {
    await noiseHistoryDb.put(normalized);
    await noiseHistoryDb.deleteEndedBefore(retentionCutoff());
  });
  await deleteNoiseCaptureDataBefore(retentionCutoff());
  broadcastUpdate();
  return normalized;
}

export const writeNoiseSlice = appendNoiseSlice;

export async function clearNoiseSlices(): Promise<void> {
  await withNoiseHistoryWriteLock(async () => {
    await noiseHistoryDb.clear();
    await noiseRescoreStateDb.clear();
  });
  await clearNoiseCaptureData();
  broadcastUpdate();
}

export async function inspectNoiseSlices(): Promise<NoiseSliceInspection> {
  const slices = await listNoiseSlices();
  return {
    count: slices.length,
    itemCount: slices.length,
    bytes: estimateBytes(slices),
    ...(slices.length > 0 ? { updatedAt: Math.max(...slices.map((slice) => slice.end)) } : {}),
  };
}

export async function exportNoiseSlices(): Promise<NoiseSliceSummary[]> {
  return listNoiseSlices();
}

export function validateNoiseSlicesForReplacement(value: unknown): NoiseSliceSummary[] {
  if (!Array.isArray(value) || !value.every(isPersistedNoiseSliceSummary)) {
    throw new TypeError("评分历史必须是有效的 spectral-activity-v2 记录数组");
  }
  const normalized = value.map((slice) => normalize({ ...slice, sourceAvailable: false }));
  if (new Set(normalized.map((slice) => slice.id)).size !== normalized.length) {
    throw new TypeError("评分历史包含重复记录");
  }
  return normalized;
}

export async function replaceNoiseSlices(value: unknown): Promise<void> {
  const normalized = validateNoiseSlicesForReplacement(value);
  await withNoiseHistoryWriteLock(async () => {
    await noiseHistoryDb.replaceAll(normalized);
  });
  broadcastUpdate();
}

export function subscribeNoiseSlicesUpdated(handler: () => void): () => void {
  historyListenerCount += 1;
  ensureHistoryChannel();
  if (historyListenerCount === 1) window.addEventListener("storage", onHistoryStorage);
  window.addEventListener(NOISE_SLICES_UPDATED_EVENT, handler);
  return () => {
    window.removeEventListener(NOISE_SLICES_UPDATED_EVENT, handler);
    historyListenerCount = Math.max(0, historyListenerCount - 1);
    if (historyListenerCount > 0) return;
    window.removeEventListener("storage", onHistoryStorage);
    historyChannel?.close();
    historyChannel = null;
  };
}
