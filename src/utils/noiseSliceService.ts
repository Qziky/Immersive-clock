import { DEFAULT_NOISE_REPORT_RETENTION_DAYS } from "../constants/noiseReport";
import type { NoiseSliceSummary } from "../types/noise";

import { getAppSettings } from "./appSettings";
import { noiseHistoryDb, type NoiseHistoryQuery, type NoiseHistoryRecord } from "./db";

const STORAGE_KEY = "noise-slices";
export const NOISE_SLICE_STORAGE_KEY = STORAGE_KEY;
export const NOISE_SLICES_UPDATED_EVENT = "noise-slices-updated";
const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_RETENTION_DAYS = DEFAULT_NOISE_REPORT_RETENTION_DAYS;

export interface NoiseSliceListOptions {
  endFrom?: number;
  endTo?: number;
  direction?: "asc" | "desc";
  limit?: number;
}

export interface NoiseSliceInspection {
  count: number;
  itemCount: number;
  bytes: number;
  updatedAt?: number;
}

interface StoredNoiseSlice extends NoiseSliceSummary, NoiseHistoryRecord {}

type NoiseHistoryBackend = "indexeddb" | "localStorage";

let backendPromise: Promise<NoiseHistoryBackend> | null = null;
let cachedQuotaBytes: number | null = null;
let quotaEstimateStarted = false;

function ensureQuotaEstimated(): void {
  if (quotaEstimateStarted) return;
  quotaEstimateStarted = true;
  try {
    if (!("storage" in navigator) || typeof navigator.storage.estimate !== "function") return;
    void navigator.storage
      .estimate()
      .then((estimate) => {
        const quota = typeof estimate.quota === "number" ? estimate.quota : undefined;
        if (typeof quota === "number" && Number.isFinite(quota) && quota > 0) {
          cachedQuotaBytes = quota;
        }
      })
      .catch(() => {});
  } catch {
    // StorageManager 在部分 WebView 中不可用，localStorage 回退仍可继续工作。
  }
}

function getRetentionMs(): number {
  try {
    const raw = getAppSettings().noiseControl.reportRetentionDays;
    const days =
      typeof raw === "number" && Number.isFinite(raw) && raw > 0
        ? Math.round(raw)
        : DEFAULT_RETENTION_DAYS;
    return Math.max(1, days) * DAY_MS;
  } catch {
    return DEFAULT_RETENTION_DAYS * DAY_MS;
  }
}

function getRetentionCutoff(): number {
  return Date.now() - getRetentionMs();
}

function estimateStringBytes(value: string): number {
  try {
    return new TextEncoder().encode(value).byteLength;
  } catch {
    return value.length * 2;
  }
}

function trimByMaxBytes(list: NoiseSliceSummary[], maxBytes: number): NoiseSliceSummary[] {
  if (!Number.isFinite(maxBytes) || maxBytes <= 0) return list;
  let trimmed = list;
  let serialized = JSON.stringify(trimmed);
  while (trimmed.length > 0 && estimateStringBytes(serialized) > maxBytes) {
    trimmed = trimmed.slice(1);
    serialized = JSON.stringify(trimmed);
  }
  return trimmed;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isOptionalFiniteNumber(value: unknown): boolean {
  return value === undefined || isFiniteNumber(value);
}

export function isNoiseSliceSummary(value: unknown): value is NoiseSliceSummary {
  if (!value || typeof value !== "object") return false;
  const slice = value as Partial<NoiseSliceSummary>;
  const raw = slice.raw as unknown;
  const display = slice.display as unknown;
  const detail = slice.scoreDetail as unknown;
  const rawObject = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : null;
  const displayObject =
    display && typeof display === "object" ? (display as Record<string, unknown>) : null;
  const detailObject =
    detail && typeof detail === "object" ? (detail as Record<string, unknown>) : null;
  const thresholds = detailObject?.thresholdsUsed;
  const thresholdObject =
    thresholds && typeof thresholds === "object" ? (thresholds as Record<string, unknown>) : null;

  return (
    isFiniteNumber(slice.start) &&
    isFiniteNumber(slice.end) &&
    slice.end >= slice.start &&
    isFiniteNumber(slice.frames) &&
    !!rawObject &&
    isFiniteNumber(rawObject.avgDbfs) &&
    isFiniteNumber(rawObject.maxDbfs) &&
    isFiniteNumber(rawObject.p50Dbfs) &&
    isFiniteNumber(rawObject.p95Dbfs) &&
    isFiniteNumber(rawObject.overRatioDbfs) &&
    isFiniteNumber(rawObject.segmentCount) &&
    isOptionalFiniteNumber(rawObject.sampledDurationMs) &&
    isOptionalFiniteNumber(rawObject.gapCount) &&
    isOptionalFiniteNumber(rawObject.maxGapMs) &&
    !!displayObject &&
    isFiniteNumber(displayObject.avgDb) &&
    isFiniteNumber(displayObject.p95Db) &&
    isFiniteNumber(slice.score) &&
    !!detailObject &&
    isFiniteNumber(detailObject.sustainedPenalty) &&
    isFiniteNumber(detailObject.timePenalty) &&
    isFiniteNumber(detailObject.segmentPenalty) &&
    isFiniteNumber(detailObject.sustainedLevelDbfs) &&
    isFiniteNumber(detailObject.overRatioDbfs) &&
    isFiniteNumber(detailObject.segmentCount) &&
    isFiniteNumber(detailObject.minutes) &&
    isOptionalFiniteNumber(detailObject.durationMs) &&
    isOptionalFiniteNumber(detailObject.sampledDurationMs) &&
    isOptionalFiniteNumber(detailObject.coverageRatio) &&
    !!thresholdObject &&
    isFiniteNumber(thresholdObject.scoreThresholdDbfs) &&
    isFiniteNumber(thresholdObject.segmentMergeGapMs) &&
    isFiniteNumber(thresholdObject.maxSegmentsPerMin)
  );
}

function round(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function normalizeSlice(slice: NoiseSliceSummary): NoiseSliceSummary {
  const sampledDurationMs = isFiniteNumber(slice.raw.sampledDurationMs)
    ? Math.max(0, Math.round(slice.raw.sampledDurationMs))
    : undefined;
  const gapCount = isFiniteNumber(slice.raw.gapCount)
    ? Math.max(0, Math.round(slice.raw.gapCount))
    : undefined;
  const maxGapMs = isFiniteNumber(slice.raw.maxGapMs)
    ? Math.max(0, Math.round(slice.raw.maxGapMs))
    : undefined;

  return {
    start: Math.round(slice.start),
    end: Math.round(slice.end),
    frames: Math.max(0, Math.round(slice.frames)),
    raw: {
      avgDbfs: round(slice.raw.avgDbfs, 3),
      maxDbfs: round(slice.raw.maxDbfs, 3),
      p50Dbfs: round(slice.raw.p50Dbfs, 3),
      p95Dbfs: round(slice.raw.p95Dbfs, 3),
      overRatioDbfs: round(slice.raw.overRatioDbfs, 4),
      segmentCount: Math.max(0, Math.round(slice.raw.segmentCount)),
      sampledDurationMs,
      gapCount,
      maxGapMs,
    },
    display: {
      avgDb: round(slice.display.avgDb, 2),
      p95Db: round(slice.display.p95Db, 2),
    },
    score: Math.max(0, Math.min(100, round(slice.score, 1))),
    scoreDetail: {
      ...slice.scoreDetail,
      thresholdsUsed: { ...slice.scoreDetail.thresholdsUsed },
    },
  };
}

function hashText(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function toStoredSlice(slice: NoiseSliceSummary): StoredNoiseSlice {
  const normalized = normalizeSlice(slice);
  return {
    ...normalized,
    id: `${normalized.start}:${normalized.end}:${hashText(JSON.stringify(normalized))}`,
  };
}

function fromStoredSlice(record: StoredNoiseSlice): NoiseSliceSummary {
  return normalizeSlice(record);
}

function dispatchUpdatedEvent(): void {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(NOISE_SLICES_UPDATED_EVENT));
  }
}

function readLegacyNoiseSlices(): NoiseSliceSummary[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const list: unknown = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(list)) return [];
    return list.filter(isNoiseSliceSummary).map(normalizeSlice);
  } catch {
    return [];
  }
}

function applyQuery(
  list: NoiseSliceSummary[],
  options: NoiseSliceListOptions
): NoiseSliceSummary[] {
  const endFrom = Number.isFinite(options.endFrom) ? options.endFrom : undefined;
  const endTo = Number.isFinite(options.endTo) ? options.endTo : undefined;
  const limit =
    typeof options.limit === "number" && Number.isFinite(options.limit)
      ? Math.max(0, Math.floor(options.limit))
      : Infinity;
  const sorted = list
    .filter(
      (slice) =>
        (endFrom === undefined || slice.end >= endFrom) &&
        (endTo === undefined || slice.end <= endTo)
    )
    .sort((first, second) =>
      options.direction === "desc" ? second.end - first.end : first.end - second.end
    );
  return sorted.slice(0, limit);
}

function writeLegacyNoiseSlices(list: NoiseSliceSummary[]): void {
  let remaining = list;
  while (remaining.length > 0) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(remaining));
      return;
    } catch {
      remaining = remaining.slice(1);
    }
  }
  localStorage.setItem(STORAGE_KEY, "[]");
}

function replaceLegacyNoiseSlices(list: NoiseSliceSummary[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
}

async function initializeBackend(): Promise<NoiseHistoryBackend> {
  try {
    await noiseHistoryDb.list({ limit: 0 });

    let legacyRaw: string | null = null;
    try {
      legacyRaw = localStorage.getItem(STORAGE_KEY);
    } catch {
      return "indexeddb";
    }

    if (legacyRaw !== null) {
      let parsed: unknown;
      try {
        parsed = JSON.parse(legacyRaw);
      } catch {
        return "indexeddb";
      }

      if (Array.isArray(parsed)) {
        const migrated = parsed.filter(isNoiseSliceSummary).map(toStoredSlice);
        await noiseHistoryDb.putAll(migrated);
        if (migrated.length > 0) {
          try {
            await noiseHistoryDb.deleteEndedBefore(getRetentionCutoff());
          } catch {
            // 迁移数据已提交，保留期裁剪可由下一次追加继续完成。
          }
        }
        try {
          localStorage.removeItem(STORAGE_KEY);
        } catch {
          // 数据已完成事务提交；残留旧键会在下一次启动时按稳定 id 幂等覆盖。
        }
      }
    }
    return "indexeddb";
  } catch {
    return "localStorage";
  }
}

function getBackend(): Promise<NoiseHistoryBackend> {
  if (!backendPromise) backendPromise = initializeBackend();
  return backendPromise;
}

/** 按结束时间读取噪音切片；默认升序，查询会使用 IndexedDB 的 end 索引。 */
export async function listNoiseSlices(
  options: NoiseSliceListOptions = {}
): Promise<NoiseSliceSummary[]> {
  const backend = await getBackend();
  if (backend === "localStorage") {
    return applyQuery(readLegacyNoiseSlices(), options);
  }

  const query: NoiseHistoryQuery = options;
  const records = await noiseHistoryDb.list<StoredNoiseSlice>(query);
  return records.filter(isNoiseSliceSummary).map(fromStoredSlice);
}

/** 兼容原调用名；接口现为异步。 */
export const readNoiseSlices = listNoiseSlices;

/** 追加单个切片，并按当前保留天数删除过期记录。 */
export async function appendNoiseSlice(slice: NoiseSliceSummary): Promise<NoiseSliceSummary> {
  if (!isNoiseSliceSummary(slice)) throw new TypeError("无效的噪音切片记录");
  const normalized = normalizeSlice(slice);
  const backend = await getBackend();

  if (backend === "localStorage") {
    ensureQuotaEstimated();
    const cutoff = getRetentionCutoff();
    const retained = [...readLegacyNoiseSlices(), normalized].filter((item) => item.end >= cutoff);
    retained.sort((first, second) => first.end - second.end);
    const maxBytes = cachedQuotaBytes ? cachedQuotaBytes * 0.9 : null;
    writeLegacyNoiseSlices(maxBytes ? trimByMaxBytes(retained, maxBytes) : retained);
    dispatchUpdatedEvent();
    return normalized;
  }

  await noiseHistoryDb.put(toStoredSlice(normalized));
  try {
    await noiseHistoryDb.deleteEndedBefore(getRetentionCutoff());
  } finally {
    dispatchUpdatedEvent();
  }
  return normalized;
}

/** 兼容原调用名；接口现为异步。 */
export const writeNoiseSlice = appendNoiseSlice;

/** 清空全部噪音切片历史。 */
export async function clearNoiseSlices(): Promise<void> {
  const backend = await getBackend();
  if (backend === "indexeddb") {
    await noiseHistoryDb.clear();
  }
  try {
    localStorage.removeItem(STORAGE_KEY);
  } finally {
    dispatchUpdatedEvent();
  }
}

/** 返回噪音历史的条数、序列化大小和最近更新时间。 */
export async function inspectNoiseSlices(): Promise<NoiseSliceInspection> {
  const slices = await listNoiseSlices();
  return {
    count: slices.length,
    itemCount: slices.length,
    bytes: estimateStringBytes(JSON.stringify(slices)),
    ...(slices.length > 0 ? { updatedAt: Math.max(...slices.map((slice) => slice.end)) } : {}),
  };
}

/** 导出不含 IndexedDB 内部 id 的规范化切片。 */
export async function exportNoiseSlices(): Promise<NoiseSliceSummary[]> {
  return listNoiseSlices();
}

export function validateNoiseSlicesForReplacement(value: unknown): NoiseSliceSummary[] {
  if (!Array.isArray(value) || !value.every(isNoiseSliceSummary)) {
    throw new TypeError("噪音历史必须是有效的切片数组");
  }

  const normalized = value.map(normalizeSlice);
  const stored = normalized.map(toStoredSlice);
  if (new Set(stored.map((slice) => slice.id)).size !== stored.length) {
    throw new TypeError("噪音历史包含重复切片");
  }
  return normalized;
}

/** 完整校验并原子替换噪音历史；任一记录无效时不会写入。 */
export async function replaceNoiseSlices(value: unknown): Promise<void> {
  const normalized = validateNoiseSlicesForReplacement(value);
  const stored = normalized.map(toStoredSlice);

  const backend = await getBackend();

  if (backend === "localStorage") {
    replaceLegacyNoiseSlices(normalized);
  } else {
    await noiseHistoryDb.replaceAll(stored);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // IndexedDB 已原子替换成功，旧键残留不影响当前后端。
    }
  }
  dispatchUpdatedEvent();
}

/** 订阅噪音切片更新事件。 */
export function subscribeNoiseSlicesUpdated(handler: () => void): () => void {
  window.addEventListener(NOISE_SLICES_UPDATED_EVENT, handler);
  return () => window.removeEventListener(NOISE_SLICES_UPDATED_EVENT, handler);
}
