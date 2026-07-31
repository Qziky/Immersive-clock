import type { AppearanceBundleV2 } from "../types/appearance";
import type {
  AppearanceBackupAsset,
  BackupDomainId,
  BackupManifestEntry,
  BackupPreview,
  BackupScope,
  BackupSourceFormat,
  ClearableDataScope,
  DataDomain,
  DataDomainId,
  DataDomainInspection,
  DataOperationResult,
  DataOverview,
  ImmersiveClockBackupV1,
  PreparedBackup,
  QuarantinedSettingsRecovery,
  RestoreBackupOptions,
  UnusedAssetInspection,
} from "../types/dataManagement";
import type { NoiseSliceSummary } from "../types/noise";
import {
  clearAppearanceAssets,
  exportAppearanceAssets,
  importAppearanceAssets,
  notifyAppearanceAssetsChanged,
} from "../utils/appearanceAssets";
import {
  APP_SETTINGS_KEY,
  APP_SETTINGS_QUARANTINE_KEY,
  CURRENT_SETTINGS_VERSION,
  clearQuarantinedAppSettings,
  getAppSettings,
  getQuarantinedAppSettings,
  normalizeAppSettings,
  resetAppSettingsPreservingUserContent,
} from "../utils/appSettings";
import { appearanceAssetDb, appearanceAssetMetadataDb, db } from "../utils/db";
import { clearErrorCenter, getErrorCenterRecords } from "../utils/errorCenter";
import {
  clearNoiseSlices,
  exportNoiseSlices,
  inspectNoiseSlices,
  replaceNoiseSlices,
  validateNoiseSlicesForReplacement,
} from "../utils/noiseSliceService";

import { inspectNoiseFeatureData } from "./noise/noiseFeatureRepository";
import {
  LEGACY_QUOTE_RUNTIME_STORAGE_KEYS,
  QUOTE_RUNTIME_STORAGE_KEY,
} from "./quotes/runtimeStorage";

export type {
  AppearanceBackupAsset,
  BackupDomainId,
  BackupManifestEntry,
  BackupPreview,
  BackupScope,
  BackupSourceFormat,
  ClearableDataScope,
  DataDomain,
  DataDomainId,
  DataDomainInspection,
  DataOperationResult,
  DataOverview,
  ImmersiveClockBackupV1,
  PreparedBackup,
  QuarantinedSettingsRecovery,
  RestoreBackupOptions,
  StorageEstimateSnapshot,
  UnusedAssetItem,
  UnusedAssetInspection,
} from "../types/dataManagement";

export type DataManagementErrorCode =
  | "INVALID_BACKUP"
  | "UNSUPPORTED_BACKUP_VERSION"
  | "BACKUP_TOO_LARGE"
  | "INVALID_RESOURCE"
  | "RESTORE_FAILED";

export class DataManagementError extends Error {
  public readonly cause?: unknown;

  constructor(
    public readonly code: DataManagementErrorCode,
    message: string,
    options?: { cause?: unknown }
  ) {
    super(message);
    this.name = "DataManagementError";
    this.cause = options?.cause;
  }
}

export const BACKUP_FORMAT = "immersive-clock-backup" as const;
export const BACKUP_VERSION = 1 as const;
export const MAX_BACKUP_BYTES = 150 * 1024 * 1024;
export const MAX_TOTAL_ASSET_BYTES = 100 * 1024 * 1024;
export const MAX_BACKGROUND_BYTES = 20 * 1024 * 1024;
export const MAX_FONT_BYTES = 50 * 1024 * 1024;

const SETTINGS_SCHEMA_VERSION = 1;
const ASSETS_SCHEMA_VERSION = 1;
const NOISE_HISTORY_SCHEMA_VERSION = 4;
const CACHE_SCHEMA_VERSION = 1;
const DIAGNOSTICS_SCHEMA_VERSION = 1;
const DEVICE_STATE_SCHEMA_VERSION = 1;

const WEATHER_CACHE_KEY = "weather-cache";
const ERROR_CENTER_STORAGE_KEY = "error-center.records";
const TOUR_STORAGE_KEY = "immersive-clock:has-seen-tour";
const LEGACY_FONT_STORAGE_KEY = "study-fonts";
const HITOKOTO_BLOCK_UNTIL_KEY = "api-governance.hitokoto.block-until";
const HITOKOTO_BACKOFF_LEVEL_KEY = "api-governance.hitokoto.backoff-level";
const HITOKOTO_DEVICE_SEED_KEY = "api-governance.hitokoto.device-seed";
const NOISE_REPORT_CHART_PREFERENCE_KEY = "noise-report.is-main-chart-combined";

const KNOWN_RUNTIME_CACHE_NAMES = new Set([
  "local-webfonts",
  "images-cache",
  "fonts-cache",
  "audio-cache",
  "docs-cache",
]);

const KNOWN_SESSION_CACHE_KEYS = new Set([
  "weather.minutely.popupOpen",
  "weather.minutely.popupDismissed",
  "weather.minutely.popupShown",
  "weather.minutely.preNotifiedStartAt",
  "weather.minutely.rainNotifiedStartAt",
]);

const KNOWN_SESSION_CACHE_PREFIXES = [
  "weather.airQuality.reminded.",
  "weather.sunrise.reminded.",
  "weather.sunset.reminded.",
];

const LEGACY_SETTINGS_KEYS = [
  "quote-auto-refresh-interval",
  "quote-channels",
  "immersive-clock-announcement",
  "study-target-year",
  "countdown-type",
  "custom-countdown-name",
  "custom-countdown-date",
  "study-display",
  "study-countdown-items",
  "study-carousel-interval",
  "study-digit-color",
  "study-digit-opacity",
  "study-message-popup-enabled",
  "study-weather-alert-enabled",
  "study-minutely-precip-enabled",
  "study-numeric-font",
  "study-text-font",
  "study-schedule",
  "studySchedule",
  "study-bg-type",
  "study-bg-color",
  "study-bg-color-alpha",
  "study-bg-image",
  "noise-control-max-level-db",
  "noise-control-baseline-db",
  "noise-control-show-realtime-db",
  "noise-control-avg-window-sec",
  "noise-monitor-baseline",
  "noise-monitor-baseline-rms",
  "noise-report-auto-popup",
  "countdown-mode",
] as const;

const LEGACY_WEATHER_CACHE_KEYS = [
  "weather.coords.lat",
  "weather.coords.lon",
  "weather.coords.source",
  "weather.coords.cachedAt",
  "weather.city",
  "weather.city.cachedAt",
  "weather.city.sig",
  "weather.locationId",
  "weather.address",
  "weather.address.source",
  "weather.address.cachedAt",
  "weather.address.sig",
  "weather.now.obsTime",
  "weather.now.text",
  "weather.now.temp",
  "weather.now.feelsLike",
  "weather.now.windDir",
  "weather.now.windScale",
  "weather.now.windSpeed",
  "weather.now.humidity",
  "weather.now.pressure",
  "weather.now.precip",
  "weather.now.vis",
  "weather.now.cloud",
  "weather.now.dew",
  "weather.refer.sources",
  "weather.refer.license",
  "weather.lastSuccessTs",
  "weather.refreshStatus",
  "weather.minutely.cache.v1",
  "weather.minutely.lastApiFetchAt",
  "weather.alert.lastTag",
] as const;

const BACKGROUND_MIME_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "image/avif",
  "image/bmp",
]);

const FONT_MIME_TYPES = new Set([
  "font/ttf",
  "font/otf",
  "font/woff",
  "font/woff2",
  "font/truetype",
  "font/opentype",
  "application/font-woff",
  "application/font-woff2",
  "application/x-font-ttf",
  "application/x-font-opentype",
  "application/octet-stream",
]);

const DOMAIN_LABELS: Record<DataDomainId, string> = {
  settings: "设置与用户内容",
  assets: "自定义资源",
  noiseHistory: "噪声历史",
  cache: "缓存",
  diagnostics: "诊断记录",
  deviceState: "设备状态",
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function utf8Bytes(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

function serializedBytes(value: unknown): number {
  try {
    return utf8Bytes(JSON.stringify(value));
  } catch {
    throw new DataManagementError("INVALID_BACKUP", "备份包含无法序列化的数据");
  }
}

function cloneJson<T>(value: T): T {
  try {
    return JSON.parse(JSON.stringify(value)) as T;
  } catch (error) {
    throw new DataManagementError("INVALID_BACKUP", "备份包含循环引用或非法数据", {
      cause: error,
    });
  }
}

function makeInspection(
  id: DataDomainId,
  schemaVersion: number,
  itemCount: number,
  bytes: number,
  includedInBackup: boolean,
  updatedAt?: number
): DataDomainInspection {
  return {
    id,
    label: DOMAIN_LABELS[id],
    schemaVersion,
    itemCount,
    bytes,
    includedInBackup,
    ...(updatedAt ? { updatedAt } : {}),
  };
}

function getStoredValueBytes(storage: Storage, key: string): number {
  const value = storage.getItem(key);
  return value === null ? 0 : utf8Bytes(key) + utf8Bytes(value);
}

function getKnownKeys(storage: Storage, exact: Set<string>, prefixes: readonly string[]): string[] {
  const keys: string[] = [];
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (key && (exact.has(key) || prefixes.some((prefix) => key.startsWith(prefix)))) {
      keys.push(key);
    }
  }
  return keys;
}

function removeKnownKeys(storage: Storage, keys: readonly string[]): void {
  for (const key of keys) storage.removeItem(key);
}

function sanitizeSettingsForBackup(): Record<string, unknown> {
  const settings = cloneJson(getAppSettings()) as unknown as Record<string, unknown>;
  return stripSettingsRuntimeState(settings);
}

function stripSettingsRuntimeState(settings: Record<string, unknown>): Record<string, unknown> {
  delete settings.modifiedAt;

  const general = isRecord(settings.general) ? settings.general : null;
  if (general) delete general.announcement;
  const timeSync = general && isRecord(general.timeSync) ? general.timeSync : null;
  if (timeSync) {
    timeSync.offsetMs = 0;
    timeSync.lastSyncAt = 0;
    delete timeSync.lastRttMs;
    delete timeSync.lastError;
  }
  removeRegenerableFields(settings);
  return settings;
}

function removeRegenerableFields(value: unknown): void {
  if (Array.isArray(value)) {
    value.forEach(removeRegenerableFields);
    return;
  }
  if (!isRecord(value)) return;
  for (const key of Object.keys(value)) {
    if (key === "lastUpdated" || key === "currentQuoteIndex") {
      delete value[key];
    } else {
      removeRegenerableFields(value[key]);
    }
  }
}

function validateConfiguredUrls(value: Record<string, unknown>): void {
  const urlKeys = new Set(["httpDateUrl", "timeApiUrl", "apiEndpoint"]);
  const visit = (candidate: unknown): void => {
    if (Array.isArray(candidate)) {
      candidate.forEach(visit);
      return;
    }
    if (!isRecord(candidate)) return;
    for (const [key, child] of Object.entries(candidate)) {
      if (urlKeys.has(key) && typeof child === "string" && child) {
        let parsed: URL;
        try {
          if (child.startsWith("//")) throw new TypeError("protocol-relative URL");
          parsed = new URL(child, "https://immersive-clock.invalid");
        } catch {
          throw new DataManagementError("INVALID_BACKUP", `设置中的 ${key} 不是有效 URL`);
        }
        if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
          throw new DataManagementError("INVALID_BACKUP", `设置中的 ${key} 使用了不安全协议`);
        }
      }
      visit(child);
    }
  };
  visit(value);
}

function validateLegacyInlineImages(value: Record<string, unknown>): void {
  const visit = (candidate: unknown): void => {
    if (Array.isArray(candidate)) {
      candidate.forEach(visit);
      return;
    }
    if (!isRecord(candidate)) return;
    for (const [key, child] of Object.entries(candidate)) {
      if (key === "imageDataUrl" && typeof child === "string" && child) {
        const parsed = parseDataUrl(child);
        if (!BACKGROUND_MIME_TYPES.has(parsed.mimeType)) {
          throw new DataManagementError("INVALID_RESOURCE", "设置包含不受支持的内嵌背景格式");
        }
        if (parsed.bytes > MAX_BACKGROUND_BYTES) {
          throw new DataManagementError("INVALID_RESOURCE", "设置中的内嵌背景超过 20MB");
        }
      }
      visit(child);
    }
  };
  visit(value);
}

function normalizeImportedSettings(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new DataManagementError("INVALID_BACKUP", "备份缺少有效的设置数据");
  }
  const candidate = cloneJson(value);
  if (
    !("version" in candidate) &&
    !("general" in candidate) &&
    !("study" in candidate) &&
    !("appearance" in candidate) &&
    !("noiseControl" in candidate)
  ) {
    throw new DataManagementError("INVALID_BACKUP", "无法识别旧版 AppSettings 数据");
  }
  const version = candidate.version;
  if (version !== undefined && (typeof version !== "number" || !Number.isInteger(version))) {
    throw new DataManagementError("INVALID_BACKUP", "设置版本号无效");
  }
  if (typeof version === "number" && version > CURRENT_SETTINGS_VERSION) {
    throw new DataManagementError(
      "UNSUPPORTED_BACKUP_VERSION",
      `设置由更高版本应用生成（v${version}）`
    );
  }

  validateConfiguredUrls(candidate);
  validateLegacyInlineImages(candidate);
  candidate.modifiedAt = Date.now();
  const normalized = cloneJson(normalizeAppSettings(candidate)) as unknown as Record<
    string,
    unknown
  >;
  return stripSettingsRuntimeState(normalized);
}

function parseDataUrl(dataUrl: string): { mimeType: string; bytes: number } {
  const match = /^data:([^;,]+);base64,([A-Za-z0-9+/]*={0,2})$/i.exec(dataUrl);
  if (!match || match[2].length % 4 !== 0) {
    throw new DataManagementError("INVALID_RESOURCE", "资源必须使用有效的 base64 Data URL");
  }
  const payload = match[2];
  const padding = payload.endsWith("==") ? 2 : payload.endsWith("=") ? 1 : 0;
  return {
    mimeType: match[1].toLowerCase(),
    bytes: Math.max(0, (payload.length / 4) * 3 - padding),
  };
}

function validateAssetShape(value: unknown): AppearanceBackupAsset {
  if (!isRecord(value)) {
    throw new DataManagementError("INVALID_RESOURCE", "备份包含无效资源记录");
  }
  const { id, kind, name, mimeType, dataUrl } = value;
  if (
    typeof id !== "string" ||
    !/^[A-Za-z0-9._:-]{1,160}$/.test(id) ||
    (kind !== "background" && kind !== "font") ||
    typeof name !== "string" ||
    !name.trim() ||
    name.length > 255 ||
    typeof mimeType !== "string" ||
    typeof dataUrl !== "string"
  ) {
    throw new DataManagementError("INVALID_RESOURCE", "备份包含字段不完整的资源");
  }
  const parsed = parseDataUrl(dataUrl);
  if (kind === "background") {
    if (!BACKGROUND_MIME_TYPES.has(parsed.mimeType)) {
      throw new DataManagementError("INVALID_RESOURCE", `背景 ${name} 的 MIME 类型不受支持`);
    }
    if (mimeType !== "image/*" && !BACKGROUND_MIME_TYPES.has(mimeType.toLowerCase())) {
      throw new DataManagementError("INVALID_RESOURCE", `背景 ${name} 声明了非法 MIME 类型`);
    }
    if (parsed.bytes > MAX_BACKGROUND_BYTES) {
      throw new DataManagementError("INVALID_RESOURCE", `背景 ${name} 超过 20MB`);
    }
    return { id, kind, name: name.trim(), mimeType: parsed.mimeType, dataUrl };
  }

  const family = value.family;
  const format = value.format;
  if (
    typeof family !== "string" ||
    !family.trim() ||
    family.length > 128 ||
    (format !== "truetype" && format !== "opentype" && format !== "woff" && format !== "woff2")
  ) {
    throw new DataManagementError("INVALID_RESOURCE", `字体 ${name} 的元数据无效`);
  }
  if (!FONT_MIME_TYPES.has(parsed.mimeType) || !FONT_MIME_TYPES.has(mimeType.toLowerCase())) {
    throw new DataManagementError("INVALID_RESOURCE", `字体 ${name} 的 MIME 类型不受支持`);
  }
  if (parsed.bytes > MAX_FONT_BYTES) {
    throw new DataManagementError("INVALID_RESOURCE", `字体 ${name} 超过 50MB`);
  }
  return {
    id,
    kind,
    name: name.trim(),
    mimeType: mimeType.toLowerCase(),
    dataUrl,
    family: family.trim(),
    format,
  };
}

async function validateAssets(value: unknown): Promise<AppearanceBackupAsset[]> {
  if (!Array.isArray(value)) {
    throw new DataManagementError("INVALID_RESOURCE", "备份的资源域不是数组");
  }
  const assets = value.map(validateAssetShape);
  const ids = new Set<string>();
  for (const asset of assets) {
    if (ids.has(asset.id)) {
      throw new DataManagementError("INVALID_RESOURCE", `资源 ID 重复：${asset.id}`);
    }
    ids.add(asset.id);
  }
  return assets;
}

function fingerprintAssetContent(value: string): string {
  let first = 0x811c9dc5;
  let second = 0x9e3779b9;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    first = Math.imul(first ^ code, 0x01000193);
    second = Math.imul(second ^ code, 0x85ebca6b);
  }
  return `fast-${value.length}-${(first >>> 0).toString(16)}-${(second >>> 0).toString(16)}`;
}

function rewriteAssetReferences(
  settings: Record<string, unknown>,
  replacements: ReadonlyMap<string, string>
): Record<string, unknown> {
  const normalizedSettings = cloneJson(settings);
  const rewriteReferences = (value: unknown): void => {
    if (Array.isArray(value)) {
      value.forEach(rewriteReferences);
      return;
    }
    if (!isRecord(value)) return;
    if (typeof value.assetId === "string" && replacements.has(value.assetId)) {
      value.assetId = replacements.get(value.assetId);
    }
    if (value.source === "imported" && typeof value.id === "string" && replacements.has(value.id)) {
      value.id = replacements.get(value.id);
    }
    Object.values(value).forEach(rewriteReferences);
  };
  rewriteReferences(normalizedSettings.appearance);
  return normalizedSettings;
}

function deduplicateAssets(
  settings: Record<string, unknown>,
  assets: readonly AppearanceBackupAsset[],
  resourceFingerprints?: ReadonlyMap<string, string>
): { settings: Record<string, unknown>; assets: AppearanceBackupAsset[] } {
  const canonicalByFingerprint = new Map<string, Array<{ id: string; content: string }>>();
  const replacements = new Map<string, string>();
  const canonicalAssets: AppearanceBackupAsset[] = [];

  for (const asset of assets) {
    const content = asset.dataUrl.slice(asset.dataUrl.indexOf(",") + 1);
    const fingerprint = resourceFingerprints?.get(asset.id) ?? fingerprintAssetContent(content);
    const identity =
      asset.kind === "background"
        ? `background:${fingerprint}`
        : `font:${JSON.stringify([asset.family, asset.format, fingerprint])}`;
    const candidates = canonicalByFingerprint.get(identity) ?? [];
    const existing = candidates.find((candidate) => candidate.content === content);
    if (existing) {
      replacements.set(asset.id, existing.id);
      continue;
    }
    candidates.push({ id: asset.id, content });
    canonicalByFingerprint.set(identity, candidates);
    canonicalAssets.push(asset);
  }

  const normalizedSettings = rewriteAssetReferences(settings, replacements);
  const totalBytes = canonicalAssets.reduce(
    (sum, asset) => sum + parseDataUrl(asset.dataUrl).bytes,
    0
  );
  if (totalBytes > MAX_TOTAL_ASSET_BYTES) {
    throw new DataManagementError("INVALID_RESOURCE", "备份资源总大小超过 100MB");
  }
  return { settings: normalizedSettings, assets: canonicalAssets };
}

function assetIdentity(asset: AppearanceBackupAsset, fingerprint?: string): string {
  const content = asset.dataUrl.slice(asset.dataUrl.indexOf(",") + 1);
  const contentFingerprint = fingerprint ?? fingerprintAssetContent(content);
  return asset.kind === "background"
    ? `background:${contentFingerprint}`
    : `font:${JSON.stringify([asset.family, asset.format, contentFingerprint])}`;
}

function assetsHaveSameContent(
  first: AppearanceBackupAsset,
  second: AppearanceBackupAsset
): boolean {
  return (
    first.kind === second.kind &&
    first.dataUrl === second.dataUrl &&
    (first.kind === "background" ||
      (second.kind === "font" && first.family === second.family && first.format === second.format))
  );
}

function createStagedAssetId(
  asset: AppearanceBackupAsset,
  occupiedIds: ReadonlySet<string>,
  fingerprint?: string
): string {
  const stagedFingerprint = fingerprintAssetContent(assetIdentity(asset, fingerprint))
    .split(":")
    .join("-");
  const base = `restored:${asset.kind}:${stagedFingerprint}`;
  let candidate = base;
  let suffix = 1;
  while (occupiedIds.has(candidate)) {
    candidate = `${base}:${suffix}`;
    suffix += 1;
  }
  return candidate;
}

function stageAssetsForRestore(
  settings: Record<string, unknown>,
  incomingAssets: readonly AppearanceBackupAsset[],
  existingAssets: readonly AppearanceBackupAsset[],
  resourceFingerprints?: ReadonlyMap<string, string>
): {
  settings: Record<string, unknown>;
  assets: AppearanceBackupAsset[];
  assetsToWrite: AppearanceBackupAsset[];
  contentHashes: Record<string, string>;
} {
  const existingByIdentity = new Map<string, AppearanceBackupAsset[]>();
  for (const asset of existingAssets) {
    const identity = assetIdentity(asset);
    const candidates = existingByIdentity.get(identity) ?? [];
    candidates.push(asset);
    existingByIdentity.set(identity, candidates);
  }

  const occupiedIds = new Set(existingAssets.map((asset) => asset.id));
  const replacements = new Map<string, string>();
  const stagedAssets: AppearanceBackupAsset[] = [];
  const assetsToWrite: AppearanceBackupAsset[] = [];
  const contentHashes: Record<string, string> = {};

  for (const asset of incomingAssets) {
    const content = asset.dataUrl.slice(asset.dataUrl.indexOf(",") + 1);
    const fingerprint = resourceFingerprints?.get(asset.id) ?? fingerprintAssetContent(content);
    const identity = assetIdentity(asset, fingerprint);
    const reusable = (existingByIdentity.get(identity) ?? []).find((candidate) =>
      assetsHaveSameContent(candidate, asset)
    );
    if (reusable) {
      replacements.set(asset.id, reusable.id);
      stagedAssets.push(reusable);
      occupiedIds.add(reusable.id);
      continue;
    }

    const collides = existingAssets.some((candidate) => candidate.id === asset.id);
    const nextId = collides ? createStagedAssetId(asset, occupiedIds, fingerprint) : asset.id;
    replacements.set(asset.id, nextId);
    occupiedIds.add(nextId);
    const stagedAsset = { ...asset, id: nextId };
    stagedAssets.push(stagedAsset);
    assetsToWrite.push(stagedAsset);
    contentHashes[nextId] = fingerprint;
  }

  return {
    settings: rewriteAssetReferences(settings, replacements),
    assets: stagedAssets,
    assetsToWrite,
    contentHashes,
  };
}

function validateNoiseHistory(value: unknown): NoiseSliceSummary[] {
  try {
    return validateNoiseSlicesForReplacement(value);
  } catch {
    throw new DataManagementError("INVALID_BACKUP", "备份包含无效的噪声历史");
  }
}

function collectReferencedAssetIds(settings: Record<string, unknown>): Set<string> {
  const ids = new Set<string>();
  const visit = (value: unknown): void => {
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (!isRecord(value)) return;
    if (typeof value.assetId === "string") ids.add(value.assetId);
    if (value.source === "imported" && typeof value.id === "string") ids.add(value.id);
    Object.values(value).forEach(visit);
  };
  visit(settings.appearance);
  return ids;
}

function ensureReferencesExist(
  settings: Record<string, unknown>,
  assets: readonly AppearanceBackupAsset[]
): void {
  const available = new Set(assets.map((asset) => asset.id));
  const missing = [...collectReferencedAssetIds(settings)].filter((id) => !available.has(id));
  if (missing.length > 0) {
    throw new DataManagementError(
      "INVALID_RESOURCE",
      `备份缺少设置引用的资源：${missing.slice(0, 3).join("、")}`
    );
  }
}

async function inspectRuntimeCaches(): Promise<{ itemCount: number; bytes: number }> {
  let itemCount = 0;
  let bytes = 0;
  if (typeof localStorage !== "undefined") {
    for (const key of [
      WEATHER_CACHE_KEY,
      QUOTE_RUNTIME_STORAGE_KEY,
      ...LEGACY_QUOTE_RUNTIME_STORAGE_KEYS,
      HITOKOTO_BLOCK_UNTIL_KEY,
      HITOKOTO_BACKOFF_LEVEL_KEY,
      ...LEGACY_WEATHER_CACHE_KEYS,
    ]) {
      const valueBytes = getStoredValueBytes(localStorage, key);
      if (valueBytes > 0) {
        itemCount += 1;
        bytes += valueBytes;
      }
    }
  }
  if (typeof sessionStorage !== "undefined") {
    const sessionKeys = getKnownKeys(
      sessionStorage,
      KNOWN_SESSION_CACHE_KEYS,
      KNOWN_SESSION_CACHE_PREFIXES
    );
    for (const key of sessionKeys) {
      itemCount += 1;
      bytes += getStoredValueBytes(sessionStorage, key);
    }
  }

  if (typeof caches !== "undefined") {
    try {
      const cacheNames = await caches.keys();
      for (const cacheName of cacheNames) {
        if (!KNOWN_RUNTIME_CACHE_NAMES.has(cacheName)) continue;
        const cache = await caches.open(cacheName);
        const requests = await cache.keys();
        itemCount += requests.length;
        for (const request of requests) {
          const response = await cache.match(request);
          if (response) bytes += (await response.clone().blob()).size;
        }
      }
    } catch {
      // CacheStorage may be unavailable in private browsing or Electron.
    }
  }
  return { itemCount, bytes };
}

async function clearRuntimeCaches(): Promise<DataOperationResult> {
  const before = await inspectRuntimeCaches();
  if (typeof localStorage !== "undefined") {
    removeKnownKeys(localStorage, [
      WEATHER_CACHE_KEY,
      QUOTE_RUNTIME_STORAGE_KEY,
      ...LEGACY_QUOTE_RUNTIME_STORAGE_KEYS,
      HITOKOTO_BLOCK_UNTIL_KEY,
      HITOKOTO_BACKOFF_LEVEL_KEY,
      ...LEGACY_WEATHER_CACHE_KEYS,
    ]);
  }
  if (typeof sessionStorage !== "undefined") {
    removeKnownKeys(
      sessionStorage,
      getKnownKeys(sessionStorage, KNOWN_SESSION_CACHE_KEYS, KNOWN_SESSION_CACHE_PREFIXES)
    );
  }
  if (typeof caches !== "undefined") {
    try {
      const names = await caches.keys();
      await Promise.all(
        names
          .filter((name) => KNOWN_RUNTIME_CACHE_NAMES.has(name))
          .map((name) => caches.delete(name))
      );
    } catch (error) {
      const detail = error instanceof Error ? `：${error.message}` : "";
      throw new Error(`本地键已清理，但浏览器运行时缓存删除失败${detail}`);
    }
  }
  return {
    affectedDomains: ["cache"],
    itemCount: before.itemCount,
    bytesFreed: before.bytes,
  };
}

async function replaceAllAssets(assets: readonly AppearanceBackupAsset[]): Promise<void> {
  await clearAppearanceAssets();
  await importAppearanceAssets(assets as AppearanceBundleV2["assets"]);
}

async function removeAssetsNotIn(nextAssets: readonly AppearanceBackupAsset[]): Promise<void> {
  const existing = await exportAppearanceAssets();
  const keepIds = new Set(nextAssets.map((asset) => `${asset.kind}:${asset.id}`));
  const removed = existing.filter((asset) => !keepIds.has(`${asset.kind}:${asset.id}`));
  await Promise.all(
    removed.flatMap((asset) => [
      asset.kind === "background" ? appearanceAssetDb.del(asset.id) : db.del(asset.id),
      appearanceAssetMetadataDb.del(asset.id),
    ])
  );
  if (removed.length > 0) notifyAppearanceAssetsChanged();
}

const settingsDomain: DataDomain<Record<string, unknown>> = {
  id: "settings",
  label: DOMAIN_LABELS.settings,
  schemaVersion: SETTINGS_SCHEMA_VERSION,
  includedInBackup: true,
  async inspect() {
    const raw = localStorage.getItem(APP_SETTINGS_KEY);
    let updatedAt: number | undefined;
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as { modifiedAt?: unknown };
        if (isFiniteNumber(parsed.modifiedAt)) updatedAt = parsed.modifiedAt;
      } catch {
        // Corrupt settings are counted by raw size and quarantined during app initialization.
      }
    }
    return makeInspection(
      this.id,
      this.schemaVersion,
      raw === null ? 0 : 1,
      raw === null ? 0 : utf8Bytes(raw),
      this.includedInBackup,
      updatedAt
    );
  },
  async export() {
    return sanitizeSettingsForBackup();
  },
  async validate(value) {
    return normalizeImportedSettings(value);
  },
  async replace(value) {
    localStorage.setItem(APP_SETTINGS_KEY, JSON.stringify({ ...value, modifiedAt: Date.now() }));
  },
  async clear() {
    const keys = [APP_SETTINGS_KEY, APP_SETTINGS_QUARANTINE_KEY, ...LEGACY_SETTINGS_KEYS];
    const existing = keys.filter((key) => localStorage.getItem(key) !== null);
    const bytes = existing.reduce((sum, key) => sum + getStoredValueBytes(localStorage, key), 0);
    removeKnownKeys(localStorage, keys);
    return { affectedDomains: [this.id], itemCount: existing.length, bytesFreed: bytes };
  },
  async migrate(value, fromSchemaVersion) {
    if (fromSchemaVersion > this.schemaVersion) {
      throw new DataManagementError("UNSUPPORTED_BACKUP_VERSION", "设置域版本过高");
    }
    return this.validate(value);
  },
};

const assetsDomain: DataDomain<AppearanceBackupAsset[]> = {
  id: "assets",
  label: DOMAIN_LABELS.assets,
  schemaVersion: ASSETS_SCHEMA_VERSION,
  includedInBackup: true,
  async inspect() {
    const assets = await exportAppearanceAssets();
    return makeInspection(
      this.id,
      this.schemaVersion,
      assets.length,
      assets.reduce((sum, asset) => sum + parseDataUrl(asset.dataUrl).bytes, 0),
      this.includedInBackup
    );
  },
  async export() {
    return cloneJson(await exportAppearanceAssets()) as AppearanceBackupAsset[];
  },
  async validate(value) {
    return validateAssets(value);
  },
  async replace(value) {
    await replaceAllAssets(value);
  },
  async clear() {
    const before = await this.inspect();
    await clearAppearanceAssets();
    localStorage.removeItem(LEGACY_FONT_STORAGE_KEY);
    return {
      affectedDomains: [this.id],
      itemCount: before.itemCount,
      bytesFreed: before.bytes,
    };
  },
  async migrate(value, fromSchemaVersion) {
    if (fromSchemaVersion > this.schemaVersion) {
      throw new DataManagementError("UNSUPPORTED_BACKUP_VERSION", "资源域版本过高");
    }
    return this.validate(value);
  },
};

const noiseHistoryDomain: DataDomain<NoiseSliceSummary[]> = {
  id: "noiseHistory",
  label: DOMAIN_LABELS.noiseHistory,
  schemaVersion: NOISE_HISTORY_SCHEMA_VERSION,
  includedInBackup: true,
  async inspect() {
    const [inspection, featureInspection] = await Promise.all([
      inspectNoiseSlices(),
      inspectNoiseFeatureData(),
    ]);
    return makeInspection(
      this.id,
      this.schemaVersion,
      inspection.count +
        featureInspection.sessionCount +
        featureInspection.chunkCount +
        featureInspection.frameCount,
      inspection.bytes + featureInspection.bytes,
      this.includedInBackup,
      Math.max(inspection.updatedAt ?? 0, featureInspection.newestAt ?? 0) || undefined
    );
  },
  async export() {
    return cloneJson(await exportNoiseSlices());
  },
  async validate(value) {
    return validateNoiseHistory(value);
  },
  async replace(value) {
    await replaceNoiseSlices(value);
  },
  async clear() {
    const before = await this.inspect();
    await clearNoiseSlices();
    return {
      affectedDomains: [this.id],
      itemCount: before.itemCount,
      bytesFreed: before.bytes,
    };
  },
  async migrate(value, fromSchemaVersion) {
    if (fromSchemaVersion !== this.schemaVersion) {
      throw new DataManagementError(
        "UNSUPPORTED_BACKUP_VERSION",
        `不支持噪声历史域版本 v${String(fromSchemaVersion)}，仅支持 v${this.schemaVersion}`
      );
    }
    return this.validate(value);
  },
};

const cacheDomain: DataDomain<null> = {
  id: "cache",
  label: DOMAIN_LABELS.cache,
  schemaVersion: CACHE_SCHEMA_VERSION,
  includedInBackup: false,
  async inspect() {
    const result = await inspectRuntimeCaches();
    return makeInspection(
      this.id,
      this.schemaVersion,
      result.itemCount,
      result.bytes,
      this.includedInBackup
    );
  },
  async export() {
    return null;
  },
  async validate(value) {
    if (value !== null) throw new DataManagementError("INVALID_BACKUP", "缓存域不可导入");
    return null;
  },
  async replace() {
    await clearRuntimeCaches();
  },
  async clear() {
    return clearRuntimeCaches();
  },
  async migrate(value, fromSchemaVersion) {
    if (fromSchemaVersion > this.schemaVersion) {
      throw new DataManagementError("UNSUPPORTED_BACKUP_VERSION", "缓存域版本过高");
    }
    return this.validate(value);
  },
};

function createLocalStorageOnlyDomain(
  id: "diagnostics" | "deviceState",
  schemaVersion: number,
  keys: readonly string[],
  clearInMemory?: () => void
): DataDomain<null> {
  return {
    id,
    label: DOMAIN_LABELS[id],
    schemaVersion,
    includedInBackup: false,
    async inspect() {
      const existing = keys.filter((key) => localStorage.getItem(key) !== null);
      const bytes = existing.reduce((sum, key) => sum + getStoredValueBytes(localStorage, key), 0);
      let itemCount = existing.length;
      if (id === "diagnostics" && existing.includes(ERROR_CENTER_STORAGE_KEY)) {
        try {
          const records = JSON.parse(localStorage.getItem(ERROR_CENTER_STORAGE_KEY) ?? "[]");
          itemCount = Array.isArray(records) ? records.length : 1;
        } catch {
          itemCount = 1;
        }
      }
      return makeInspection(id, schemaVersion, itemCount, bytes, false);
    },
    async export() {
      return null;
    },
    async validate(value) {
      if (value !== null) throw new DataManagementError("INVALID_BACKUP", `${this.label}不可导入`);
      return null;
    },
    async replace() {
      await this.clear();
    },
    async clear() {
      const before = await this.inspect();
      clearInMemory?.();
      removeKnownKeys(localStorage, keys);
      return {
        affectedDomains: [id],
        itemCount: before.itemCount,
        bytesFreed: before.bytes,
      };
    },
    async migrate(value, fromSchemaVersion) {
      if (fromSchemaVersion > schemaVersion) {
        throw new DataManagementError("UNSUPPORTED_BACKUP_VERSION", `${this.label}版本过高`);
      }
      return this.validate(value);
    },
  };
}

const diagnosticsStorageDomain = createLocalStorageOnlyDomain(
  "diagnostics",
  DIAGNOSTICS_SCHEMA_VERSION,
  [ERROR_CENTER_STORAGE_KEY],
  clearErrorCenter
);

const diagnosticsDomain: DataDomain<null> = {
  ...diagnosticsStorageDomain,
  async inspect() {
    const stored = await diagnosticsStorageDomain.inspect();
    const memoryRecords = getErrorCenterRecords();
    if (memoryRecords.length === 0) return stored;
    return {
      ...stored,
      itemCount: memoryRecords.length,
      bytes: Math.max(stored.bytes, serializedBytes(memoryRecords)),
      updatedAt: Math.max(...memoryRecords.map((record) => record.lastTs || record.ts)),
    };
  },
};

const deviceStateDomain = createLocalStorageOnlyDomain("deviceState", DEVICE_STATE_SCHEMA_VERSION, [
  TOUR_STORAGE_KEY,
  HITOKOTO_DEVICE_SEED_KEY,
  NOISE_REPORT_CHART_PREFERENCE_KEY,
  "immersive-clock:noise-device-profiles:v1",
]);

export const dataDomainRegistry: Readonly<Record<DataDomainId, DataDomain<unknown>>> = {
  settings: settingsDomain as DataDomain<unknown>,
  assets: assetsDomain as DataDomain<unknown>,
  noiseHistory: noiseHistoryDomain as DataDomain<unknown>,
  cache: cacheDomain as DataDomain<unknown>,
  diagnostics: diagnosticsDomain as DataDomain<unknown>,
  deviceState: deviceStateDomain as DataDomain<unknown>,
};

export async function inspectData(): Promise<DataOverview> {
  const domains = await Promise.all(
    Object.values(dataDomainRegistry).map((domain) => domain.inspect())
  );
  const byId = new Map(domains.map((domain) => [domain.id, domain]));
  const userDataBytes = ["settings", "assets", "noiseHistory"].reduce(
    (sum, id) => sum + (byId.get(id as DataDomainId)?.bytes ?? 0),
    0
  );
  const cacheBytes = byId.get("cache")?.bytes ?? 0;
  let storageEstimate: DataOverview["storageEstimate"] = { supported: false };
  try {
    if (typeof navigator !== "undefined" && typeof navigator.storage?.estimate === "function") {
      const estimate = await navigator.storage.estimate();
      storageEstimate = {
        supported: true,
        ...(typeof estimate.usage === "number" ? { usage: estimate.usage } : {}),
        ...(typeof estimate.quota === "number" ? { quota: estimate.quota } : {}),
      };
    }
  } catch {
    storageEstimate = { supported: false };
  }
  return {
    domains,
    appDataBytes: domains.reduce((sum, domain) => sum + domain.bytes, 0),
    userDataBytes,
    cacheBytes,
    storageEstimate,
  };
}

function createManifestEntry(
  id: BackupDomainId,
  schemaVersion: number,
  data: unknown
): BackupManifestEntry {
  return {
    id,
    schemaVersion,
    itemCount: Array.isArray(data) ? data.length : data == null ? 0 : 1,
    bytes: serializedBytes(data),
  };
}

export async function createBackup(scope: BackupScope = "full"): Promise<ImmersiveClockBackupV1> {
  const [exportedSettings, assets, noiseHistory] = await Promise.all([
    settingsDomain.export(),
    assetsDomain.export(),
    scope === "full" ? noiseHistoryDomain.export() : Promise.resolve(undefined),
  ]);
  const settings = await settingsDomain.validate(exportedSettings);
  const validatedAssets = await assetsDomain.validate(assets);
  const canonical = deduplicateAssets(settings, validatedAssets);
  ensureReferencesExist(canonical.settings, canonical.assets);
  const manifest = [
    createManifestEntry("settings", settingsDomain.schemaVersion, canonical.settings),
    createManifestEntry("assets", assetsDomain.schemaVersion, canonical.assets),
    ...(noiseHistory
      ? [
          createManifestEntry(
            "noiseHistory" as const,
            noiseHistoryDomain.schemaVersion,
            noiseHistory
          ),
        ]
      : []),
  ];
  const backup: ImmersiveClockBackupV1 = {
    format: BACKUP_FORMAT,
    backupVersion: BACKUP_VERSION,
    appVersion: import.meta.env.VITE_APP_VERSION || "0.0.0",
    exportedAt: new Date().toISOString(),
    scope,
    manifest,
    domains: {
      settings: { schemaVersion: settingsDomain.schemaVersion, data: canonical.settings },
      assets: { schemaVersion: assetsDomain.schemaVersion, data: canonical.assets },
      ...(noiseHistory
        ? {
            noiseHistory: {
              schemaVersion: noiseHistoryDomain.schemaVersion,
              data: noiseHistory,
            },
          }
        : {}),
    },
  };
  if (serializedBytes(backup) > MAX_BACKUP_BYTES) {
    throw new DataManagementError("BACKUP_TOO_LARGE", "当前数据超过 150MB，无法生成单个备份文件");
  }
  return backup;
}

async function readBackupSource(source: unknown): Promise<unknown> {
  let text: string | null = null;
  if (typeof Blob !== "undefined" && source instanceof Blob) {
    if (source.size > MAX_BACKUP_BYTES) {
      throw new DataManagementError("BACKUP_TOO_LARGE", "备份文件不能超过 150MB");
    }
    text = await source.text();
  } else if (typeof source === "string") {
    if (utf8Bytes(source) > MAX_BACKUP_BYTES) {
      throw new DataManagementError("BACKUP_TOO_LARGE", "备份文件不能超过 150MB");
    }
    text = source;
  } else {
    if (serializedBytes(source) > MAX_BACKUP_BYTES) {
      throw new DataManagementError("BACKUP_TOO_LARGE", "备份文件不能超过 150MB");
    }
    return cloneJson(source);
  }
  try {
    return JSON.parse(text) as unknown;
  } catch (error) {
    throw new DataManagementError("INVALID_BACKUP", "备份文件不是有效 JSON", { cause: error });
  }
}

function assertDomainPayload(
  value: unknown,
  domainName: string
): { schemaVersion: number; data: unknown } {
  if (
    !isRecord(value) ||
    !Number.isInteger(value.schemaVersion) ||
    (value.schemaVersion as number) < 1 ||
    !("data" in value)
  ) {
    throw new DataManagementError("INVALID_BACKUP", `${domainName}域结构无效`);
  }
  return { schemaVersion: value.schemaVersion as number, data: value.data };
}

function validateCurrentManifest(
  value: unknown[],
  scope: BackupScope,
  payloads: Readonly<Partial<Record<BackupDomainId, { schemaVersion: number; data: unknown }>>>
): void {
  const expectedIds: BackupDomainId[] = [
    "settings",
    "assets",
    ...(payloads.noiseHistory ? (["noiseHistory"] as const) : []),
  ];
  if (
    (scope === "full" && !payloads.noiseHistory) ||
    (scope === "settings-and-assets" && payloads.noiseHistory)
  ) {
    throw new DataManagementError("INVALID_BACKUP", "备份范围与所含数据域不一致");
  }
  if (value.length !== expectedIds.length) {
    throw new DataManagementError("INVALID_BACKUP", "备份 manifest 与数据域数量不一致");
  }
  const seen = new Set<BackupDomainId>();
  for (const candidate of value) {
    if (!isRecord(candidate) || !expectedIds.includes(candidate.id as BackupDomainId)) {
      throw new DataManagementError("INVALID_BACKUP", "备份 manifest 包含未知数据域");
    }
    const id = candidate.id as BackupDomainId;
    const payload = payloads[id];
    if (!payload || seen.has(id)) {
      throw new DataManagementError("INVALID_BACKUP", "备份 manifest 包含重复数据域");
    }
    const expectedCount = Array.isArray(payload.data) ? payload.data.length : 1;
    if (
      candidate.schemaVersion !== payload.schemaVersion ||
      candidate.itemCount !== expectedCount ||
      candidate.bytes !== serializedBytes(payload.data)
    ) {
      throw new DataManagementError("INVALID_BACKUP", `备份 manifest 中的 ${id} 摘要不一致`);
    }
    seen.add(id);
  }
}

async function normalizeCurrentBackup(
  candidate: Record<string, unknown>,
  resourceFingerprints?: ReadonlyMap<string, string>
): Promise<ImmersiveClockBackupV1> {
  if (candidate.backupVersion !== BACKUP_VERSION) {
    throw new DataManagementError(
      "UNSUPPORTED_BACKUP_VERSION",
      `不支持备份协议版本 ${String(candidate.backupVersion)}`
    );
  }
  if (
    typeof candidate.appVersion !== "string" ||
    typeof candidate.exportedAt !== "string" ||
    Number.isNaN(Date.parse(candidate.exportedAt)) ||
    (candidate.scope !== "full" && candidate.scope !== "settings-and-assets") ||
    !Array.isArray(candidate.manifest) ||
    !isRecord(candidate.domains)
  ) {
    throw new DataManagementError("INVALID_BACKUP", "备份协议头或 manifest 无效");
  }
  const domainKeys = Object.keys(candidate.domains);
  if (domainKeys.some((key) => key !== "settings" && key !== "assets" && key !== "noiseHistory")) {
    throw new DataManagementError("INVALID_BACKUP", "备份包含未知数据域");
  }
  const settingsPayload = assertDomainPayload(candidate.domains.settings, "设置");
  const assetsPayload = assertDomainPayload(candidate.domains.assets, "资源");
  const noisePayload = candidate.domains.noiseHistory
    ? assertDomainPayload(candidate.domains.noiseHistory, "噪声历史")
    : undefined;
  validateCurrentManifest(candidate.manifest, candidate.scope, {
    settings: settingsPayload,
    assets: assetsPayload,
    ...(noisePayload ? { noiseHistory: noisePayload } : {}),
  });
  const settings = await settingsDomain.migrate(
    settingsPayload.data,
    settingsPayload.schemaVersion
  );
  const assets = await assetsDomain.migrate(assetsPayload.data, assetsPayload.schemaVersion);
  const noiseHistory = noisePayload
    ? await noiseHistoryDomain.migrate(noisePayload.data, noisePayload.schemaVersion)
    : undefined;
  const canonical = deduplicateAssets(settings, assets, resourceFingerprints);
  ensureReferencesExist(canonical.settings, canonical.assets);
  const manifest = [
    createManifestEntry("settings", settingsDomain.schemaVersion, canonical.settings),
    createManifestEntry("assets", assetsDomain.schemaVersion, canonical.assets),
    ...(noiseHistory
      ? [createManifestEntry("noiseHistory", noiseHistoryDomain.schemaVersion, noiseHistory)]
      : []),
  ];
  return {
    format: BACKUP_FORMAT,
    backupVersion: BACKUP_VERSION,
    appVersion: candidate.appVersion,
    exportedAt: candidate.exportedAt,
    scope: noiseHistory ? "full" : "settings-and-assets",
    manifest,
    domains: {
      settings: { schemaVersion: settingsDomain.schemaVersion, data: canonical.settings },
      assets: { schemaVersion: assetsDomain.schemaVersion, data: canonical.assets },
      ...(noiseHistory
        ? {
            noiseHistory: {
              schemaVersion: noiseHistoryDomain.schemaVersion,
              data: noiseHistory,
            },
          }
        : {}),
    },
  };
}

async function normalizeLegacyBackup(
  candidate: Record<string, unknown>,
  resourceFingerprints?: ReadonlyMap<string, string>
): Promise<{
  backup: ImmersiveClockBackupV1;
  sourceFormat: BackupSourceFormat;
  warnings: string[];
}> {
  let settingsValue: unknown = candidate;
  let assetsValue: unknown = [];
  let sourceFormat: BackupSourceFormat = "legacy-app-settings";
  const warnings: string[] = [];
  if (candidate.format === "immersive-clock-settings") {
    if (candidate.version !== 2 || !("settings" in candidate) || !Array.isArray(candidate.assets)) {
      throw new DataManagementError(
        "UNSUPPORTED_BACKUP_VERSION",
        `不支持旧设置包版本 ${String(candidate.version)}`
      );
    }
    settingsValue = candidate.settings;
    assetsValue = candidate.assets;
    sourceFormat = "immersive-clock-settings-v2";
    warnings.push("已将旧版 v2 设置包迁移为当前备份格式");
  } else {
    warnings.push("旧版设置文件不包含噪声历史和独立资源");
  }
  const settings = await settingsDomain.validate(settingsValue);
  const assets = await assetsDomain.validate(assetsValue);
  const canonical = deduplicateAssets(settings, assets, resourceFingerprints);
  ensureReferencesExist(canonical.settings, canonical.assets);
  const exportedAt = new Date().toISOString();
  const backup: ImmersiveClockBackupV1 = {
    format: BACKUP_FORMAT,
    backupVersion: BACKUP_VERSION,
    appVersion: "legacy",
    exportedAt,
    scope: "settings-and-assets",
    manifest: [
      createManifestEntry("settings", settingsDomain.schemaVersion, canonical.settings),
      createManifestEntry("assets", assetsDomain.schemaVersion, canonical.assets),
    ],
    domains: {
      settings: { schemaVersion: settingsDomain.schemaVersion, data: canonical.settings },
      assets: { schemaVersion: assetsDomain.schemaVersion, data: canonical.assets },
    },
  };
  return { backup, sourceFormat, warnings };
}

function makePreview(backup: ImmersiveClockBackupV1, warnings: string[]): BackupPreview {
  const domains = backup.manifest.map(({ id, itemCount, bytes }) => ({ id, itemCount, bytes }));
  return {
    format: backup.format,
    backupVersion: backup.backupVersion,
    appVersion: backup.appVersion,
    exportedAt: backup.exportedAt,
    scope: backup.scope,
    domains,
    totalItems: domains.reduce((sum, domain) => sum + domain.itemCount, 0),
    totalBytes: serializedBytes(backup),
    hasNoiseHistory: Boolean(backup.domains.noiseHistory),
    containsSensitiveData: true,
    warnings,
  };
}

async function prepareParsedBackup(
  parsed: unknown,
  resourceFingerprints?: ReadonlyMap<string, string>
): Promise<PreparedBackup> {
  if (!isRecord(parsed)) {
    throw new DataManagementError("INVALID_BACKUP", "备份根节点必须是对象");
  }
  if (parsed.format === BACKUP_FORMAT) {
    const backup = await normalizeCurrentBackup(parsed, resourceFingerprints);
    return {
      backup,
      sourceFormat: "immersive-clock-backup-v1",
      preview: makePreview(backup, []),
      ...(resourceFingerprints
        ? { resourceFingerprints: Object.fromEntries(resourceFingerprints) }
        : {}),
    };
  }
  if ("format" in parsed && parsed.format !== "immersive-clock-settings") {
    throw new DataManagementError("INVALID_BACKUP", `无法识别备份格式 ${String(parsed.format)}`);
  }
  const legacy = await normalizeLegacyBackup(parsed, resourceFingerprints);
  return {
    backup: legacy.backup,
    sourceFormat: legacy.sourceFormat,
    preview: makePreview(legacy.backup, legacy.warnings),
    ...(resourceFingerprints
      ? { resourceFingerprints: Object.fromEntries(resourceFingerprints) }
      : {}),
  };
}

export async function prepareBackup(source: unknown): Promise<PreparedBackup> {
  return prepareParsedBackup(await readBackupSource(source));
}

type WorkerParseResponse =
  | { id: number; ok: true; value: unknown; resourceFingerprints: Record<string, string> }
  | {
      id: number;
      ok: false;
      code: "INVALID_BACKUP" | "INVALID_RESOURCE";
      error: string;
    };

async function parseBackupFileInWorker(
  file: File
): Promise<{ value: unknown; resourceFingerprints: Record<string, string> }> {
  const worker = new Worker(new URL("./dataBackup.worker.ts", import.meta.url), { type: "module" });
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (callback: () => void): void => {
      if (settled) return;
      settled = true;
      worker.terminate();
      callback();
    };
    worker.onmessage = (event: MessageEvent<WorkerParseResponse>) => {
      const response = event.data;
      if (response.id !== 1) return;
      if (response.ok) {
        const value = response.value;
        const resourceFingerprints = response.resourceFingerprints;
        finish(() => resolve({ value, resourceFingerprints }));
      } else {
        const errorMessage = response.error;
        finish(() => reject(new DataManagementError(response.code, errorMessage)));
      }
    };
    worker.onerror = (event) => {
      event.preventDefault();
      finish(() => reject(new Error(event.message || "备份解析 Worker 启动失败")));
    };
    worker.postMessage({ id: 1, file });
  });
}

/** 大文件入口：可用时在 Worker 中读取并解析 JSON，再在主线程执行纯校验。 */
export async function prepareBackupFile(file: File): Promise<PreparedBackup> {
  if (file.size > MAX_BACKUP_BYTES) {
    throw new DataManagementError("BACKUP_TOO_LARGE", "备份文件不能超过 150MB");
  }
  if (file.type && file.type !== "application/json" && file.type !== "text/json") {
    throw new DataManagementError("INVALID_BACKUP", "备份文件必须是 JSON 文件");
  }
  if (typeof Worker === "undefined") return prepareBackup(file);
  try {
    const parsed = await parseBackupFileInWorker(file);
    return prepareParsedBackup(parsed.value, new Map(Object.entries(parsed.resourceFingerprints)));
  } catch (error) {
    if (error instanceof DataManagementError) throw error;
    return prepareBackup(file);
  }
}

function restoreRawSettings(raw: string | null): void {
  if (raw === null) localStorage.removeItem(APP_SETTINGS_KEY);
  else localStorage.setItem(APP_SETTINGS_KEY, raw);
}

export async function restoreBackup(
  prepared: PreparedBackup,
  options: RestoreBackupOptions = {}
): Promise<DataOperationResult> {
  const resourceFingerprints = prepared.resourceFingerprints
    ? new Map(Object.entries(prepared.resourceFingerprints))
    : undefined;
  const verified = await prepareParsedBackup(prepared.backup, resourceFingerprints);
  const settings = verified.backup.domains.settings.data;
  const assets = verified.backup.domains.assets.data;
  const shouldRestoreNoise =
    options.includeNoiseHistory !== false && Boolean(verified.backup.domains.noiseHistory);
  const nextNoise = shouldRestoreNoise
    ? (verified.backup.domains.noiseHistory?.data as NoiseSliceSummary[])
    : undefined;

  const [previousAssets, previousNoise] = await Promise.all([
    assetsDomain.export(),
    shouldRestoreNoise ? noiseHistoryDomain.export() : Promise.resolve(undefined),
  ]);
  const staged = stageAssetsForRestore(settings, assets, previousAssets, resourceFingerprints);
  const previousRawSettings = localStorage.getItem(APP_SETTINGS_KEY);
  try {
    await importAppearanceAssets(
      staged.assetsToWrite as AppearanceBundleV2["assets"],
      staged.contentHashes
    );
    if (nextNoise) await noiseHistoryDomain.replace(nextNoise);
    await settingsDomain.replace(staged.settings);
    await removeAssetsNotIn(staged.assets);
  } catch (error) {
    const rollbackErrors: unknown[] = [];
    try {
      await replaceAllAssets(previousAssets);
    } catch (rollbackError) {
      rollbackErrors.push(rollbackError);
    }
    if (shouldRestoreNoise && previousNoise) {
      try {
        await noiseHistoryDomain.replace(previousNoise);
      } catch (rollbackError) {
        rollbackErrors.push(rollbackError);
      }
    }
    try {
      restoreRawSettings(previousRawSettings);
    } catch (rollbackError) {
      rollbackErrors.push(rollbackError);
    }
    const rollbackSuffix =
      rollbackErrors.length > 0 ? `；另有 ${rollbackErrors.length} 项回滚失败` : "";
    throw new DataManagementError("RESTORE_FAILED", `恢复失败，已尝试回滚${rollbackSuffix}`, {
      cause: error,
    });
  }

  return {
    affectedDomains: [
      "settings",
      "assets",
      ...(shouldRestoreNoise ? (["noiseHistory"] as const) : []),
    ],
    itemCount: verified.backup.manifest
      .filter((entry) => entry.id !== "noiseHistory" || shouldRestoreNoise)
      .reduce((sum, entry) => sum + entry.itemCount, 0),
  };
}

export async function inspectUnusedAssets(): Promise<UnusedAssetInspection> {
  const [settings, assets] = await Promise.all([settingsDomain.export(), assetsDomain.export()]);
  const referencedAssetIds = collectReferencedAssetIds(settings);
  const unused = assets.filter((asset) => !referencedAssetIds.has(asset.id));
  return {
    assets: unused.map((asset) => ({
      id: asset.id,
      kind: asset.kind,
      name: asset.name,
      mimeType: asset.mimeType,
      bytes: parseDataUrl(asset.dataUrl).bytes,
      status: "unused" as const,
    })),
    itemCount: unused.length,
    bytes: unused.reduce((sum, asset) => sum + parseDataUrl(asset.dataUrl).bytes, 0),
    referencedAssetIds: [...referencedAssetIds].sort(),
  };
}

export async function clearUnusedAssets(): Promise<DataOperationResult> {
  const inspection = await inspectUnusedAssets();
  await Promise.all(
    inspection.assets.flatMap((asset) => [
      asset.kind === "background" ? appearanceAssetDb.del(asset.id) : db.del(asset.id),
      appearanceAssetMetadataDb.del(asset.id),
    ])
  );
  if (inspection.itemCount > 0) notifyAppearanceAssetsChanged();
  return {
    affectedDomains: ["assets"],
    itemCount: inspection.itemCount,
    bytesFreed: inspection.bytes,
  };
}

export async function clearDataScope(scope: ClearableDataScope): Promise<DataOperationResult> {
  if (scope === "unusedAssets") return clearUnusedAssets();
  if (scope === "noiseHistory") return noiseHistoryDomain.clear();
  if (scope === "diagnostics") return diagnosticsDomain.clear();
  return cacheDomain.clear();
}

export async function resetPreferences(): Promise<DataOperationResult> {
  resetAppSettingsPreservingUserContent();
  return { affectedDomains: ["settings"], itemCount: 1 };
}

export function getQuarantinedSettingsRecovery(): QuarantinedSettingsRecovery | null {
  const record = getQuarantinedAppSettings();
  if (!record) return null;
  const timestamp = new Date(record.createdAt).toISOString().replace(/[:.]/g, "-");
  return {
    ...record,
    fileName: `immersive-clock-quarantined-settings-${timestamp}.json`,
  };
}

export function discardQuarantinedSettingsRecovery(): void {
  clearQuarantinedAppSettings();
}

export async function eraseAllData(): Promise<DataOperationResult> {
  const before = await inspectData();
  const domains: DataDomainId[] = [
    "settings",
    "assets",
    "noiseHistory",
    "cache",
    "diagnostics",
    "deviceState",
  ];
  for (const domainId of domains) await dataDomainRegistry[domainId].clear();
  return {
    affectedDomains: domains,
    itemCount: before.domains.reduce((sum, domain) => sum + domain.itemCount, 0),
    bytesFreed: before.appDataBytes,
  };
}
