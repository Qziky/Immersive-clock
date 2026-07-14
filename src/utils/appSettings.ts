import {
  NOISE_ANALYSIS_FRAME_MS,
  NOISE_ANALYSIS_SLICE_SEC,
  NOISE_SCORE_MAX_SEGMENTS_PER_MIN,
  NOISE_SCORE_SEGMENT_MERGE_GAP_MS,
  NOISE_SCORE_THRESHOLD_DBFS,
} from "../constants/noise";
import { DEFAULT_NOISE_REPORT_RETENTION_DAYS } from "../constants/noiseReport";
import {
  getDefaultQuoteChannels,
  resolveQuoteChannels,
  serializeQuoteChannels,
} from "../services/quotes/quoteRegistry";
import { QuoteRuntimeStore } from "../services/quotes/runtimeStorage";
import {
  StudyDisplaySettings,
  CountdownItem,
  AppMode,
  type StudyInfoCarouselSettings,
  type StudyInfoItemConfig,
  type StudyInfoSource,
  type StudyTimeProgressMode,
} from "../types";
import type { AppearanceSettingsV2 } from "../types/appearance";
import type {
  CustomQuoteChannel,
  HitokotoCategory,
  PersistedQuoteSettings,
  QuoteAnimationMode,
  QuoteChannel,
  QuoteChannelPreference,
  QuoteSettingsState,
  QuoteTypingSpeed,
} from "../types/quote";
import { HITOKOTO_CATEGORY_LIST } from "../types/quote";
import { DEFAULT_SCHEDULE, type StudyPeriod } from "../types/studySchedule";
import { DeepPartial } from "../types/utilityTypes";

import {
  createDefaultAppearance,
  migrateV1Appearance,
  normalizeAppearance,
} from "./appearanceModel";
import { logger } from "./logger";
import { StudyBackgroundType } from "./studyBackgroundStorage";

export interface AppSettings {
  version: number;
  modifiedAt: number;
  appearance: AppearanceSettingsV2;

  general: {
    startup: {
      initialMode: AppMode;
    };
    quote: PersistedQuoteSettings;
    announcement: {
      hideUntil: number;
      version: string; // 存储版本号，用于与当前应用版本进行比对
    };
    weather: {
      autoRefreshIntervalMin: number;
      locationMode: "auto" | "manual";
      manualLocation: {
        type: "city" | "coords";
        cityName?: string;
        lat?: number;
        lon?: number;
        resolved?: { city?: string; lat: number; lon: number };
      };
    };
    timeSync: {
      enabled: boolean;
      provider: "httpDate" | "timeApi" | "ntp";
      httpDateUrl: string;
      timeApiUrl: string;
      ntpHost: string;
      ntpPort: number;
      manualOffsetMs: number;
      offsetMs: number;
      autoSyncEnabled: boolean;
      autoSyncIntervalSec: number;
      lastSyncAt: number;
      lastRttMs?: number;
      lastError?: string;
    };
    background: {
      type: StudyBackgroundType;
      color?: string;
      colorAlpha?: number;
      imageDataUrl?: string;
    };
  };

  study: {
    targetYear: number;
    countdownType: "gaokao" | "custom";
    countdownMode: "gaokao" | "single" | "multi"; // 新增
    customCountdown: { name: string; date: string };
    display: StudyDisplaySettings;
    countdownItems: CountdownItem[];
    carouselIntervalSec?: number;
    infoCarousel: StudyInfoCarouselSettings;
    style: {
      digitColor?: string;
      digitOpacity: number;
      numericFontFamily?: string;
      textFontFamily?: string;
      timeColor?: string;
      dateColor?: string;
    };
    alerts: {
      weatherAlert: boolean;
      minutelyPrecip: boolean;
      errorPopup: boolean;
      errorCenterMode: "off" | "memory" | "persist";
      airQuality: boolean;
      sunriseSunset: boolean;
    };
    schedule: StudyPeriod[];
    background: {
      type: StudyBackgroundType;
      color?: string;
      colorAlpha?: number;
      imageDataUrl?: string;
    };
  };

  noiseControl: {
    maxLevelDb: number;
    baselineDb: number;
    showRealtimeDb: boolean;
    avgWindowSec: number;
    sliceSec: number;
    frameMs: number;
    scoreThresholdDbfs: number;
    segmentMergeGapMs: number;
    maxSegmentsPerMin: number;
    // 新增字段
    baselineDisplayDb: number;
    baselineRms: number;
    reportAutoPopup: boolean;
    reportRetentionDays: number;
    alertSoundEnabled: boolean;
  };
}

export const APP_SETTINGS_KEY = "AppSettings";
export const APP_SETTINGS_QUARANTINE_KEY = "immersive-clock:quarantine:app-settings";
export const CURRENT_SETTINGS_VERSION = 3;

/** 中央信息轮播的硬上限，配置与运行时都应遵守该值。 */
export const MAX_STUDY_INFO_ITEMS = 20;
export const MIN_STUDY_INFO_INTERVAL_SEC = 3;
export const MAX_STUDY_INFO_INTERVAL_SEC = 30;
export const DEFAULT_STUDY_INFO_INTERVAL_SEC = 6;
export const MAX_STUDY_INFO_TEXT_LENGTH = 80;

export const STUDY_INFO_BUILTIN_IDS = {
  progress: "progress-default",
  nextSchedule: "next-schedule-default",
  rain: "rain-default",
} as const;

let studyInfoLimitAdjustedSinceLoad = false;

/** 设置页读取一次后即清除，避免同一轮迁移反复提示。 */
export function consumeStudyInfoLimitAdjustedNotice(): boolean {
  const adjusted = studyInfoLimitAdjustedSinceLoad;
  studyInfoLimitAdjustedSinceLoad = false;
  return adjusted;
}

export interface QuarantinedAppSettings {
  createdAt: number;
  reason: "invalid-json" | "unsupported-version";
  raw: string;
}

export class UnsupportedSettingsVersionError extends Error {
  constructor(public readonly storedVersion: number) {
    super(`设置文件版本 ${storedVersion} 高于当前支持版本 ${CURRENT_SETTINGS_VERSION}`);
    this.name = "UnsupportedSettingsVersionError";
  }
}

const DEFAULT_QUOTE_REFRESH_INTERVAL_SEC = 600;
const MIN_QUOTE_REFRESH_INTERVAL_SEC = 30;
const MAX_QUOTE_REFRESH_INTERVAL_SEC = 1800;
const DEFAULT_QUOTE_ANIMATION_MODE: QuoteAnimationMode = "typewriter";
const DEFAULT_QUOTE_TYPING_SPEED: QuoteTypingSpeed = "normal";
const DEFAULT_TYPEWRITER_BACKSPACE_ENABLED = true;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isErrorCenterMode(value: unknown): value is "off" | "memory" | "persist" {
  return value === "off" || value === "memory" || value === "persist";
}

function normalizeStudyTimeProgressMode(value: unknown): StudyTimeProgressMode {
  return value === "schedule" ? "schedule" : "day";
}

function parseStoredNumber(value: unknown): number {
  if (typeof value === "number") return value;
  if (typeof value === "string" && value.trim()) return Number(value);
  return Number.NaN;
}

function isStudyInfoSource(value: unknown): value is StudyInfoSource {
  return value === "progress" || value === "nextSchedule" || value === "rain" || value === "custom";
}

function createDefaultStudyInfoItems(): StudyInfoItemConfig[] {
  return [
    {
      id: STUDY_INFO_BUILTIN_IDS.progress,
      source: "progress",
      enabled: true,
      order: 0,
    },
    {
      id: STUDY_INFO_BUILTIN_IDS.nextSchedule,
      source: "nextSchedule",
      enabled: true,
      order: 1,
    },
    {
      id: STUDY_INFO_BUILTIN_IDS.rain,
      source: "rain",
      enabled: true,
      order: 2,
    },
  ];
}

/** 返回新对象，避免调用方修改全局默认值。 */
export function getDefaultStudyInfoCarousel(): StudyInfoCarouselSettings {
  return {
    autoRotate: true,
    intervalSec: DEFAULT_STUDY_INFO_INTERVAL_SEC,
    items: createDefaultStudyInfoItems(),
  };
}

function normalizeStudyInfoInterval(value: unknown): number {
  const parsed = parseStoredNumber(value);
  if (!Number.isFinite(parsed)) return DEFAULT_STUDY_INFO_INTERVAL_SEC;
  return Math.max(
    MIN_STUDY_INFO_INTERVAL_SEC,
    Math.min(MAX_STUDY_INFO_INTERVAL_SEC, Math.round(parsed))
  );
}

function normalizeStudyInfoItem(value: unknown, fallbackOrder: number): StudyInfoItemConfig | null {
  if (!isRecord(value) || typeof value.id !== "string" || !isStudyInfoSource(value.source)) {
    return null;
  }
  const id = value.id.trim();
  if (!id) return null;

  const orderValue = parseStoredNumber(value.order);
  const order = Number.isFinite(orderValue) ? Math.round(orderValue) : fallbackOrder;
  const item: StudyInfoItemConfig = {
    id,
    source: value.source,
    enabled: typeof value.enabled === "boolean" ? value.enabled : true,
    order,
  };

  if (value.source === "custom") {
    if (typeof value.text !== "string") return null;
    const text = value.text.trim().slice(0, MAX_STUDY_INFO_TEXT_LENGTH);
    if (!text) return null;
    item.text = text;
  }
  return item;
}

interface StudyInfoCarouselNormalizationResult {
  settings: StudyInfoCarouselSettings;
  limitAdjusted: boolean;
}

/**
 * 归一化中央信息配置：过滤非法条目、去重，并将启用的有效条目限制为 20。
 * 超额条目会被禁用而非删除；内置来源优先，其次按用户 order 与原始顺序选择。
 */
function normalizeStudyInfoCarouselWithMetadata(
  value: unknown
): StudyInfoCarouselNormalizationResult {
  const defaults = getDefaultStudyInfoCarousel();
  const source = isRecord(value) ? value : {};
  const rawItems = Array.isArray(source.items) ? source.items : null;
  const parsedItems: Array<{ item: StudyInfoItemConfig; index: number }> = [];
  const seenIds = new Set<string>();
  const seenBuiltinSources = new Set<Exclude<StudyInfoSource, "custom">>();

  if (rawItems) {
    rawItems.forEach((candidate, index) => {
      const item = normalizeStudyInfoItem(candidate, index);
      if (!item || seenIds.has(item.id)) return;
      if (item.source !== "custom") {
        if (seenBuiltinSources.has(item.source)) return;
        seenBuiltinSources.add(item.source);
      }
      seenIds.add(item.id);
      parsedItems.push({ item, index });
    });
  } else {
    defaults.items.forEach((item, index) => parsedItems.push({ item, index }));
  }

  // 配置文件可能来自早期版本或手工编辑：保证三个内置来源始终有一个可配置开关。
  // 已存在的来源（即使被禁用）会原样保留，避免迁移时意外重新启用。
  const existingSources = new Set(parsedItems.map(({ item }) => item.source));
  const maxOrder = parsedItems.reduce((maximum, entry) => Math.max(maximum, entry.item.order), -1);
  defaults.items.forEach((defaultItem, index) => {
    if (existingSources.has(defaultItem.source)) return;
    let id = defaultItem.id;
    if (seenIds.has(id)) id = `${id}-${index}`;
    const item = { ...defaultItem, id, order: maxOrder + index + 1 };
    seenIds.add(id);
    parsedItems.push({ item, index: parsedItems.length + index });
  });

  const limitAdjusted =
    parsedItems.filter(({ item }) => item.enabled).length > MAX_STUDY_INFO_ITEMS;

  const enabledItemIds = new Set(
    parsedItems
      .filter(({ item }) => item.enabled)
      .sort((left, right) => {
        const leftBuiltin = left.item.source === "custom" ? 1 : 0;
        const rightBuiltin = right.item.source === "custom" ? 1 : 0;
        return (
          leftBuiltin - rightBuiltin ||
          left.item.order - right.item.order ||
          left.index - right.index
        );
      })
      .slice(0, MAX_STUDY_INFO_ITEMS)
      .map(({ item }) => item.id)
  );

  const normalizedItems = parsedItems
    .slice()
    .sort((left, right) => left.item.order - right.item.order || left.index - right.index)
    .map(({ item }) => ({
      ...item,
      enabled: item.enabled && enabledItemIds.has(item.id),
    }));

  return {
    settings: {
      autoRotate: typeof source.autoRotate === "boolean" ? source.autoRotate : defaults.autoRotate,
      intervalSec: normalizeStudyInfoInterval(source.intervalSec),
      items: normalizedItems,
    },
    limitAdjusted,
  };
}

/** 纯配置归一化入口；迁移提示由启动迁移单独记录。 */
export function normalizeStudyInfoCarousel(value: unknown): StudyInfoCarouselSettings {
  return normalizeStudyInfoCarouselWithMetadata(value).settings;
}

function normalizeQuoteRefreshInterval(value: unknown): number {
  const parsed = parseStoredNumber(value);
  if (!Number.isFinite(parsed)) return DEFAULT_QUOTE_REFRESH_INTERVAL_SEC;
  return Math.max(
    MIN_QUOTE_REFRESH_INTERVAL_SEC,
    Math.min(MAX_QUOTE_REFRESH_INTERVAL_SEC, Math.round(parsed))
  );
}

function normalizeQuoteAnimationMode(value: unknown): QuoteAnimationMode {
  return value === "typewriter" || value === "crossfade" || value === "none"
    ? value
    : DEFAULT_QUOTE_ANIMATION_MODE;
}

function normalizeQuoteTypingSpeed(value: unknown): QuoteTypingSpeed {
  return value === "slow" || value === "normal" || value === "fast"
    ? value
    : DEFAULT_QUOTE_TYPING_SPEED;
}

function normalizeTypewriterBackspaceEnabled(value: unknown): boolean {
  return typeof value === "boolean" ? value : DEFAULT_TYPEWRITER_BACKSPACE_ENABLED;
}

function createDefaultQuoteSettings(): PersistedQuoteSettings {
  const serialized = serializeQuoteChannels(getDefaultQuoteChannels());
  return {
    autoRefreshEnabled: true,
    autoRefreshIntervalSec: DEFAULT_QUOTE_REFRESH_INTERVAL_SEC,
    animationMode: DEFAULT_QUOTE_ANIMATION_MODE,
    typingSpeed: DEFAULT_QUOTE_TYPING_SPEED,
    typewriterBackspaceEnabled: DEFAULT_TYPEWRITER_BACKSPACE_ENABLED,
    channels: serialized.channels,
    customChannels: serialized.customChannels,
  };
}

function normalizeStoredWeight(value: unknown, fallback: number): number {
  const parsed = parseStoredNumber(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(1, Math.min(9999, Math.round(parsed)));
}

function normalizeStoredQuotes(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value
    .filter((quote): quote is string => typeof quote === "string")
    .map((quote) => quote.trim())
    .filter(Boolean)
    .slice(0, 1000);
}

function normalizeQuotePreference(
  value: unknown,
  defaultChannel: QuoteChannel
): QuoteChannelPreference | null {
  if (!isRecord(value) || value.id !== defaultChannel.id) return null;

  const preference: QuoteChannelPreference = {
    id: defaultChannel.id,
    enabled: typeof value.enabled === "boolean" ? value.enabled : defaultChannel.enabled,
    weight: normalizeStoredWeight(value.weight, defaultChannel.weight),
  };

  if (defaultChannel.kind === "local") {
    preference.orderMode = value.orderMode === "sequential" ? "sequential" : "random";
    const quotesOverride = normalizeStoredQuotes(value.quotesOverride ?? value.quotes);
    if (quotesOverride) preference.quotesOverride = quotesOverride;
  } else if (defaultChannel.providerId === "hitokoto" && Array.isArray(value.hitokotoCategories)) {
    const allowedCategories = new Set(HITOKOTO_CATEGORY_LIST.map((category) => category.key));
    preference.hitokotoCategories = value.hitokotoCategories.filter(
      (category): category is HitokotoCategory =>
        allowedCategories.has(category as HitokotoCategory)
    );
  }

  return preference;
}

function normalizeCustomQuoteChannel(value: unknown): CustomQuoteChannel | null {
  if (!isRecord(value) || typeof value.id !== "string") return null;
  const id = value.id.trim();
  const quotes = normalizeStoredQuotes(value.quotes);
  if (!id || !quotes?.length) return null;

  return {
    id,
    name: typeof value.name === "string" && value.name.trim() ? value.name.trim() : "自定义语录",
    enabled: typeof value.enabled === "boolean" ? value.enabled : true,
    weight: normalizeStoredWeight(value.weight, 10),
    quotes,
    orderMode: value.orderMode === "sequential" ? "sequential" : "random",
  };
}

function isLegacyRemoteChannel(value: Record<string, unknown>): boolean {
  return (
    value.onlineFetch === true ||
    value.kind === "remote" ||
    typeof value.providerId === "string" ||
    typeof value.apiEndpoint === "string"
  );
}

function migrateLegacyQuoteCursors(value: unknown, storedVersion: number): void {
  if (storedVersion >= 3 || !isRecord(value)) return;
  const candidates = [
    ...(Array.isArray(value.channels) ? value.channels : []),
    ...(Array.isArray(value.customChannels) ? value.customChannels : []),
  ];
  const runtimeStore = new QuoteRuntimeStore();
  const seenIds = new Set<string>();

  for (const candidate of candidates) {
    if (
      !isRecord(candidate) ||
      typeof candidate.id !== "string" ||
      candidate.orderMode !== "sequential" ||
      isLegacyRemoteChannel(candidate)
    ) {
      continue;
    }
    const id = candidate.id.trim();
    const cursor = parseStoredNumber(candidate.currentQuoteIndex);
    if (!id || seenIds.has(id) || !Number.isSafeInteger(cursor) || cursor < 0) continue;
    seenIds.add(id);
    runtimeStore.seedSequentialCursor(id, cursor);
  }
}

function normalizeQuoteSettings(value: unknown, storedVersion: number): PersistedQuoteSettings {
  const defaults = getDefaultQuoteChannels();
  const defaultById = new Map(defaults.map((channel) => [channel.id, channel]));
  const source = isRecord(value) ? value : {};
  const rawPreferences = Array.isArray(source.channels) ? source.channels : [];
  const preferences: QuoteChannelPreference[] = [];
  const customChannels: CustomQuoteChannel[] = [];
  const seenPreferenceIds = new Set<string>();

  for (const candidate of rawPreferences) {
    if (!isRecord(candidate) || typeof candidate.id !== "string") continue;
    const id = candidate.id.trim();
    const defaultChannel = defaultById.get(id);
    if (defaultChannel) {
      if (seenPreferenceIds.has(id)) continue;
      const preference = normalizeQuotePreference({ ...candidate, id }, defaultChannel);
      if (preference) {
        seenPreferenceIds.add(id);
        preferences.push(preference);
      }
      continue;
    }

    if (storedVersion < 3 && !isLegacyRemoteChannel(candidate)) {
      const custom = normalizeCustomQuoteChannel({ ...candidate, id });
      if (custom) customChannels.push(custom);
    }
  }

  const rawCustomChannels = Array.isArray(source.customChannels) ? source.customChannels : [];
  for (const candidate of rawCustomChannels) {
    const custom = normalizeCustomQuoteChannel(candidate);
    if (custom) customChannels.push(custom);
  }

  if (storedVersion < 3) {
    const hitokotoDisabled = preferences.some(
      (preference) => preference.id === "hitokoto-api" && !preference.enabled
    );
    if (hitokotoDisabled) {
      for (const id of ["jinrishici-api", "advice-slip-api"]) {
        if (seenPreferenceIds.has(id)) continue;
        const defaultChannel = defaultById.get(id);
        if (!defaultChannel) continue;
        preferences.push({ id, enabled: false, weight: defaultChannel.weight });
        seenPreferenceIds.add(id);
      }
    }
  }

  const normalizedChannels = resolveQuoteChannels(preferences, customChannels);
  const serialized = serializeQuoteChannels(normalizedChannels);

  if (storedVersion < 3) {
    const legacyInterval = parseStoredNumber(source.autoRefreshInterval);
    if (legacyInterval === 0) {
      return {
        autoRefreshEnabled: false,
        autoRefreshIntervalSec: DEFAULT_QUOTE_REFRESH_INTERVAL_SEC,
        animationMode: normalizeQuoteAnimationMode(source.animationMode),
        typingSpeed: normalizeQuoteTypingSpeed(source.typingSpeed),
        typewriterBackspaceEnabled: normalizeTypewriterBackspaceEnabled(
          source.typewriterBackspaceEnabled
        ),
        ...serialized,
      };
    }
    if (Number.isFinite(legacyInterval) && legacyInterval > 0) {
      return {
        autoRefreshEnabled: true,
        autoRefreshIntervalSec: normalizeQuoteRefreshInterval(legacyInterval),
        animationMode: normalizeQuoteAnimationMode(source.animationMode),
        typingSpeed: normalizeQuoteTypingSpeed(source.typingSpeed),
        typewriterBackspaceEnabled: normalizeTypewriterBackspaceEnabled(
          source.typewriterBackspaceEnabled
        ),
        ...serialized,
      };
    }
  }

  return {
    autoRefreshEnabled:
      typeof source.autoRefreshEnabled === "boolean" ? source.autoRefreshEnabled : true,
    autoRefreshIntervalSec: normalizeQuoteRefreshInterval(source.autoRefreshIntervalSec),
    animationMode: normalizeQuoteAnimationMode(source.animationMode),
    typingSpeed: normalizeQuoteTypingSpeed(source.typingSpeed),
    typewriterBackspaceEnabled: normalizeTypewriterBackspaceEnabled(
      source.typewriterBackspaceEnabled
    ),
    ...serialized,
  };
}

const DEFAULT_SETTINGS: AppSettings = {
  version: CURRENT_SETTINGS_VERSION,
  modifiedAt: Date.now(),
  appearance: createDefaultAppearance(),
  general: {
    startup: {
      initialMode: "clock",
    },
    quote: createDefaultQuoteSettings(),
    announcement: {
      hideUntil: 0,
      version: "",
    },
    weather: {
      autoRefreshIntervalMin: 30,
      locationMode: "auto",
      manualLocation: {
        type: "city",
        cityName: "",
      },
    },
    timeSync: {
      enabled: false,
      provider: "httpDate",
      httpDateUrl: "/",
      timeApiUrl: "",
      ntpHost: "pool.ntp.org",
      ntpPort: 123,
      manualOffsetMs: 0,
      offsetMs: 0,
      autoSyncEnabled: false,
      autoSyncIntervalSec: 3600,
      lastSyncAt: 0,
      lastRttMs: undefined,
      lastError: undefined,
    },
    background: {
      type: "default",
    },
  },
  study: {
    targetYear: new Date().getFullYear() + 1,
    countdownType: "gaokao",
    countdownMode: "gaokao", // 默认值
    customCountdown: { name: "", date: "" },
    display: {
      showStatusBar: true,
      timeProgressMode: "day",
      showWeather: true,
      showNoiseMonitor: true,
      showCountdown: true,
      showQuote: true,
      showTime: true,
      showDate: true,
    },
    countdownItems: [],
    infoCarousel: getDefaultStudyInfoCarousel(),
    style: {
      digitOpacity: 1,
    },
    alerts: {
      weatherAlert: false,
      minutelyPrecip: false,
      errorPopup: true,
      errorCenterMode: "off",
      airQuality: false,
      sunriseSunset: false,
    },
    schedule: DEFAULT_SCHEDULE,
    background: {
      type: "default",
    },
  },
  noiseControl: {
    maxLevelDb: 55,
    baselineDb: 40,
    showRealtimeDb: true,
    avgWindowSec: 1,
    sliceSec: NOISE_ANALYSIS_SLICE_SEC,
    frameMs: NOISE_ANALYSIS_FRAME_MS,
    scoreThresholdDbfs: NOISE_SCORE_THRESHOLD_DBFS,
    segmentMergeGapMs: NOISE_SCORE_SEGMENT_MERGE_GAP_MS,
    maxSegmentsPerMin: NOISE_SCORE_MAX_SEGMENTS_PER_MIN,
    baselineDisplayDb: 40,
    baselineRms: 0.000414581087327115,
    reportAutoPopup: true,
    reportRetentionDays: DEFAULT_NOISE_REPORT_RETENTION_DAYS,
    alertSoundEnabled: false,
  },
};

function createDefaultAppSettings(modifiedAt = Date.now()): AppSettings {
  return {
    ...structuredClone(DEFAULT_SETTINGS),
    modifiedAt,
    general: {
      ...structuredClone(DEFAULT_SETTINGS.general),
      quote: createDefaultQuoteSettings(),
    },
  };
}

export function getDefaultAppSettings(): AppSettings {
  return createDefaultAppSettings();
}

function quarantineAppSettings(raw: string, reason: QuarantinedAppSettings["reason"]): void {
  try {
    const record: QuarantinedAppSettings = { createdAt: Date.now(), reason, raw };
    localStorage.setItem(APP_SETTINGS_QUARANTINE_KEY, JSON.stringify(record));
  } catch (error) {
    logger.warn("Failed to quarantine invalid AppSettings", error);
  }
}

export function getQuarantinedAppSettings(): QuarantinedAppSettings | null {
  try {
    const raw = localStorage.getItem(APP_SETTINGS_QUARANTINE_KEY);
    if (!raw) return null;
    const candidate = JSON.parse(raw) as Partial<QuarantinedAppSettings>;
    if (
      typeof candidate.createdAt !== "number" ||
      typeof candidate.raw !== "string" ||
      (candidate.reason !== "invalid-json" && candidate.reason !== "unsupported-version")
    ) {
      return null;
    }
    return candidate as QuarantinedAppSettings;
  } catch {
    return null;
  }
}

export function clearQuarantinedAppSettings(): void {
  localStorage.removeItem(APP_SETTINGS_QUARANTINE_KEY);
}

export function normalizeAppSettings(value: unknown): AppSettings {
  if (!isRecord(value) || Array.isArray(value)) {
    throw new TypeError("设置数据必须是对象");
  }

  const parsed = value;
  const storedVersion = typeof parsed.version === "number" ? parsed.version : 1;
  if (storedVersion > CURRENT_SETTINGS_VERSION) {
    throw new UnsupportedSettingsVersionError(storedVersion);
  }
  const parsedGeneral = isRecord(parsed.general) ? parsed.general : {};
  const parsedStudy = isRecord(parsed.study) ? parsed.study : {};
  const parsedAlerts = isRecord(parsedStudy.alerts) ? parsedStudy.alerts : {};
  const parsedNoiseControl = isRecord(parsed.noiseControl) ? parsed.noiseControl : {};
  const parsedStartup = isRecord(parsedGeneral.startup) ? parsedGeneral.startup : {};
  const parsedAnnouncement = isRecord(parsedGeneral.announcement) ? parsedGeneral.announcement : {};
  const parsedWeather = isRecord(parsedGeneral.weather) ? parsedGeneral.weather : {};
  const parsedTimeSync = isRecord(parsedGeneral.timeSync) ? parsedGeneral.timeSync : {};
  const parsedGeneralBackground = isRecord(parsedGeneral.background)
    ? parsedGeneral.background
    : {};
  const parsedDisplay = isRecord(parsedStudy.display) ? parsedStudy.display : {};
  const parsedStyle = isRecord(parsedStudy.style) ? parsedStudy.style : {};
  const parsedStudyBackground = isRecord(parsedStudy.background) ? parsedStudy.background : {};

  const legacyMinutelyForecast =
    typeof parsedAlerts.minutelyForecast === "boolean" ? parsedAlerts.minutelyForecast : undefined;
  const legacyPrecipDuration =
    typeof parsedAlerts.precipDuration === "boolean" ? parsedAlerts.precipDuration : undefined;
  const legacyErrorCenterEnabled =
    typeof parsedAlerts.errorCenterEnabled === "boolean"
      ? parsedAlerts.errorCenterEnabled
      : undefined;
  const legacyMergedMinutely =
    legacyMinutelyForecast != null || legacyPrecipDuration != null
      ? !!(legacyMinutelyForecast || legacyPrecipDuration)
      : undefined;
  const mergedStudyAlerts: AppSettings["study"]["alerts"] = {
    weatherAlert:
      typeof parsedAlerts.weatherAlert === "boolean"
        ? parsedAlerts.weatherAlert
        : DEFAULT_SETTINGS.study.alerts.weatherAlert,
    minutelyPrecip:
      typeof parsedAlerts.minutelyPrecip === "boolean"
        ? parsedAlerts.minutelyPrecip
        : (legacyMergedMinutely ?? DEFAULT_SETTINGS.study.alerts.minutelyPrecip),
    errorPopup:
      typeof parsedAlerts.errorPopup === "boolean"
        ? parsedAlerts.errorPopup
        : DEFAULT_SETTINGS.study.alerts.errorPopup,
    errorCenterMode: isErrorCenterMode(parsedAlerts.errorCenterMode)
      ? parsedAlerts.errorCenterMode
      : legacyErrorCenterEnabled
        ? "persist"
        : DEFAULT_SETTINGS.study.alerts.errorCenterMode,
    airQuality:
      typeof parsedAlerts.airQuality === "boolean"
        ? parsedAlerts.airQuality
        : DEFAULT_SETTINGS.study.alerts.airQuality,
    sunriseSunset:
      typeof parsedAlerts.sunriseSunset === "boolean"
        ? parsedAlerts.sunriseSunset
        : DEFAULT_SETTINGS.study.alerts.sunriseSunset,
  };

  const appearance = parsed.appearance
    ? normalizeAppearance(parsed.appearance)
    : migrateV1Appearance(parsed as Parameters<typeof migrateV1Appearance>[0]);
  const modifiedAt =
    typeof parsed.modifiedAt === "number" && Number.isFinite(parsed.modifiedAt)
      ? parsed.modifiedAt
      : DEFAULT_SETTINGS.modifiedAt;
  return {
    ...createDefaultAppSettings(modifiedAt),
    version: CURRENT_SETTINGS_VERSION,
    modifiedAt,
    appearance,
    general: {
      ...DEFAULT_SETTINGS.general,
      ...parsedGeneral,
      startup: { ...DEFAULT_SETTINGS.general.startup, ...parsedStartup },
      quote: normalizeQuoteSettings(parsedGeneral.quote, storedVersion),
      announcement: { ...DEFAULT_SETTINGS.general.announcement, ...parsedAnnouncement },
      weather: { ...DEFAULT_SETTINGS.general.weather, ...parsedWeather },
      timeSync: { ...DEFAULT_SETTINGS.general.timeSync, ...parsedTimeSync },
      background: { ...DEFAULT_SETTINGS.general.background, ...parsedGeneralBackground },
    } as AppSettings["general"],
    study: {
      ...DEFAULT_SETTINGS.study,
      ...parsedStudy,
      infoCarousel: normalizeStudyInfoCarousel(parsedStudy.infoCarousel),
      display: {
        ...DEFAULT_SETTINGS.study.display,
        ...parsedDisplay,
        timeProgressMode: normalizeStudyTimeProgressMode(parsedDisplay.timeProgressMode),
      },
      style: { ...DEFAULT_SETTINGS.study.style, ...parsedStyle },
      alerts: mergedStudyAlerts,
      background: { ...DEFAULT_SETTINGS.study.background, ...parsedStudyBackground },
    } as AppSettings["study"],
    noiseControl: {
      ...DEFAULT_SETTINGS.noiseControl,
      ...parsedNoiseControl,
    } as AppSettings["noiseControl"],
  };
}

/**
 * 获取完整的 AppSettings 配置对象
 */
export function getAppSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(APP_SETTINGS_KEY);
    if (!raw) return createDefaultAppSettings();
    return normalizeAppSettings(JSON.parse(raw));
  } catch (error) {
    if (error instanceof UnsupportedSettingsVersionError) throw error;
    logger.error("Failed to load AppSettings", error);
    return createDefaultAppSettings();
  }
}

/**
 * 局部更新 AppSettings 配置
 */
export function updateAppSettings(
  partial: DeepPartial<AppSettings> | ((current: AppSettings) => DeepPartial<AppSettings>)
): void {
  try {
    const current = getAppSettings();
    let updates: DeepPartial<AppSettings>;

    if (typeof partial === "function") {
      updates = partial(current);
    } else {
      updates = partial;
    }

    const nextSettings: AppSettings = {
      ...current,
      modifiedAt: Date.now(),
      version: CURRENT_SETTINGS_VERSION,
    };

    // 当 partial 中包含嵌套分区时，对对应分区进行更细粒度的合并
    // 注意：上方的展开运算是浅拷贝，嵌套对象的部分更新需要单独处理
    // 通常调用方会传入完整的嵌套对象，或通过专门的更新函数进行修改
    // 为安全起见，这里在 updates 含有对应分区时再做一次合并

    if (updates.general) {
      const generalUpdates = updates.general;
      nextSettings.general = {
        ...current.general,
        startup: generalUpdates.startup
          ? { ...current.general.startup, ...generalUpdates.startup }
          : current.general.startup,
        quote: generalUpdates.quote
          ? { ...current.general.quote, ...generalUpdates.quote }
          : current.general.quote,
        announcement: generalUpdates.announcement
          ? { ...current.general.announcement, ...generalUpdates.announcement }
          : current.general.announcement,
        weather: generalUpdates.weather
          ? {
              ...current.general.weather,
              ...generalUpdates.weather,
              manualLocation: generalUpdates.weather.manualLocation
                ? {
                    ...current.general.weather.manualLocation,
                    ...generalUpdates.weather.manualLocation,
                    type:
                      generalUpdates.weather.manualLocation.type ??
                      current.general.weather.manualLocation.type,
                    resolved:
                      generalUpdates.weather.manualLocation.resolved &&
                      generalUpdates.weather.manualLocation.resolved.lat != null &&
                      generalUpdates.weather.manualLocation.resolved.lon != null
                        ? {
                            ...current.general.weather.manualLocation.resolved,
                            ...generalUpdates.weather.manualLocation.resolved,
                            lat: generalUpdates.weather.manualLocation.resolved.lat,
                            lon: generalUpdates.weather.manualLocation.resolved.lon,
                          }
                        : current.general.weather.manualLocation.resolved,
                  }
                : current.general.weather.manualLocation,
            }
          : current.general.weather,
        timeSync: generalUpdates.timeSync
          ? { ...current.general.timeSync, ...generalUpdates.timeSync }
          : current.general.timeSync,
        background: generalUpdates.background
          ? { ...current.general.background, ...generalUpdates.background }
          : current.general.background,
      };
    }
    if (updates.study) {
      const studyUpdates = updates.study;
      nextSettings.study = {
        ...current.study,
        targetYear: studyUpdates.targetYear ?? current.study.targetYear,
        countdownType: studyUpdates.countdownType ?? current.study.countdownType,
        countdownMode: studyUpdates.countdownMode ?? current.study.countdownMode,
        customCountdown: studyUpdates.customCountdown
          ? { ...current.study.customCountdown, ...studyUpdates.customCountdown }
          : current.study.customCountdown,
        display: studyUpdates.display
          ? { ...current.study.display, ...studyUpdates.display }
          : current.study.display,
        countdownItems: studyUpdates.countdownItems ?? current.study.countdownItems,
        carouselIntervalSec: studyUpdates.carouselIntervalSec ?? current.study.carouselIntervalSec,
        infoCarousel: studyUpdates.infoCarousel
          ? normalizeStudyInfoCarousel({
              ...current.study.infoCarousel,
              ...studyUpdates.infoCarousel,
            })
          : current.study.infoCarousel,
        style: studyUpdates.style
          ? { ...current.study.style, ...studyUpdates.style }
          : current.study.style,
        alerts: studyUpdates.alerts
          ? { ...current.study.alerts, ...studyUpdates.alerts }
          : current.study.alerts,
        schedule: studyUpdates.schedule ?? current.study.schedule,
        background: studyUpdates.background
          ? { ...current.study.background, ...studyUpdates.background }
          : current.study.background,
      };
    }
    if (updates.noiseControl) {
      nextSettings.noiseControl = { ...current.noiseControl, ...updates.noiseControl };
    }
    if (updates.appearance) {
      nextSettings.appearance = normalizeAppearance({
        ...current.appearance,
        ...updates.appearance,
        global: { ...current.appearance.global, ...updates.appearance.global },
        scenes: {
          ...current.appearance.scenes,
          ...updates.appearance.scenes,
        },
        instances: {
          ...current.appearance.instances,
          ...updates.appearance.instances,
        },
      });
    }

    localStorage.setItem(APP_SETTINGS_KEY, JSON.stringify(nextSettings));
  } catch (error) {
    logger.error("Failed to save AppSettings", error);
    throw error;
  }
}

/**
 * 将 AppSettings 重置为默认值
 */
export function resetAppSettings(): void {
  try {
    localStorage.setItem(APP_SETTINGS_KEY, JSON.stringify(createDefaultAppSettings()));
  } catch (error) {
    logger.error("Failed to reset AppSettings", error);
  }
}

export function resetAppSettingsPreservingUserContent(): AppSettings {
  const current = getAppSettings();
  const defaults = createDefaultAppSettings();
  const preservedInfoItems = (current.study.infoCarousel?.items ?? []).filter(
    (item) => item.source === "custom"
  );
  const next: AppSettings = {
    ...defaults,
    general: {
      ...defaults.general,
      quote: structuredClone(current.general.quote),
    },
    study: {
      ...defaults.study,
      targetYear: current.study.targetYear,
      countdownType: current.study.countdownType,
      countdownMode: current.study.countdownMode,
      customCountdown: structuredClone(current.study.customCountdown),
      countdownItems: structuredClone(current.study.countdownItems),
      infoCarousel: normalizeStudyInfoCarousel({
        ...defaults.study.infoCarousel,
        items: [...defaults.study.infoCarousel.items, ...structuredClone(preservedInfoItems)],
      }),
      schedule: structuredClone(current.study.schedule),
    },
  };
  localStorage.setItem(APP_SETTINGS_KEY, JSON.stringify(next));
  return next;
}

/**
 * 帮助方法：更新某个特定分区（例如学习设置）
 */
export function updateStudySettings(updates: DeepPartial<AppSettings["study"]>): void {
  updateAppSettings({
    study: updates,
  });
}

export function updateGeneralSettings(updates: DeepPartial<AppSettings["general"]>): void {
  updateAppSettings({
    general: updates,
  });
}

/** Persist the quote editor draft as one normalized v3 settings update. */
export function saveQuoteSettings(
  channels: readonly QuoteChannel[],
  quoteSettings: QuoteSettingsState
): void {
  const serialized = serializeQuoteChannels(channels);
  updateAppSettings({
    general: {
      quote: {
        autoRefreshEnabled: Boolean(quoteSettings.autoRefreshEnabled),
        autoRefreshIntervalSec: normalizeQuoteRefreshInterval(quoteSettings.autoRefreshIntervalSec),
        animationMode: normalizeQuoteAnimationMode(quoteSettings.animationMode),
        typingSpeed: normalizeQuoteTypingSpeed(quoteSettings.typingSpeed),
        typewriterBackspaceEnabled: normalizeTypewriterBackspaceEnabled(
          quoteSettings.typewriterBackspaceEnabled
        ),
        channels: serialized.channels,
        customChannels: serialized.customChannels,
      },
    },
  });
}

/**
 * 更新网络校时设置
 * 对 timeSync 进行深合并，避免覆盖丢字段
 */
export function updateTimeSyncSettings(
  updates:
    | Partial<AppSettings["general"]["timeSync"]>
    | ((current: AppSettings["general"]["timeSync"]) => Partial<AppSettings["general"]["timeSync"]>)
): void {
  updateAppSettings((current) => {
    const base = current.general.timeSync;
    const patch = typeof updates === "function" ? updates(base) : updates;
    return {
      general: {
        ...current.general,
        timeSync: { ...base, ...patch },
      },
    };
  });
}

export function updateNoiseSettings(updates: DeepPartial<AppSettings["noiseControl"]>): void {
  updateAppSettings((current) => ({
    noiseControl: { ...current.noiseControl, ...updates },
  }));
}

export function replaceAppearanceSettings(appearance: AppearanceSettingsV2): void {
  updateAppSettings({ appearance: normalizeAppearance(appearance) });
}

/** Persist the normalized versioned structure before legacy keys are removed. */
export function migrateStoredAppSettings(): AppSettings {
  const raw = localStorage.getItem(APP_SETTINGS_KEY);
  if (!raw) {
    resetAppSettings();
    return getAppSettings();
  }
  let parsed: Record<string, unknown>;
  try {
    const candidate: unknown = JSON.parse(raw);
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
      throw new TypeError("AppSettings must be an object");
    }
    parsed = candidate as Record<string, unknown>;
  } catch (error) {
    logger.error("Stored AppSettings are invalid; restoring defaults", error);
    quarantineAppSettings(raw, "invalid-json");
    resetAppSettings();
    return getAppSettings();
  }
  const storedVersion = typeof parsed.version === "number" ? parsed.version : 1;
  if (storedVersion > CURRENT_SETTINGS_VERSION) {
    logger.warn(
      `Stored AppSettings version ${storedVersion} is unsupported; restoring defaults after quarantine.`
    );
    quarantineAppSettings(raw, "unsupported-version");
    resetAppSettings();
    return getAppSettings();
  }
  const parsedGeneral = isRecord(parsed.general) ? parsed.general : {};
  const parsedStudy = isRecord(parsed.study) ? parsed.study : {};
  const parsedDisplay = isRecord(parsedStudy.display) ? parsedStudy.display : {};
  if (normalizeStudyInfoCarouselWithMetadata(parsedStudy.infoCarousel).limitAdjusted) {
    studyInfoLimitAdjustedSinceLoad = true;
  }
  migrateLegacyQuoteCursors(parsedGeneral.quote, storedVersion);
  const legacySource = parsed as unknown as Parameters<typeof migrateV1Appearance>[0];
  if (!parsed.appearance) {
    const study = (legacySource.study ??= {});
    const style = (study.style ??= {});
    const digitColor = localStorage.getItem("study-digit-color");
    const digitOpacity = Number(localStorage.getItem("study-digit-opacity"));
    const numericFont = localStorage.getItem("study-numeric-font");
    const textFont = localStorage.getItem("study-text-font");
    if (!style.digitColor && digitColor) style.digitColor = digitColor;
    if (style.digitOpacity === undefined && Number.isFinite(digitOpacity)) {
      style.digitOpacity = digitOpacity;
    }
    if (!style.numericFontFamily && numericFont) style.numericFontFamily = numericFont;
    if (!style.textFontFamily && textFont) style.textFontFamily = textFont;
    if (!study.background) {
      const type = localStorage.getItem("study-bg-type");
      const color = localStorage.getItem("study-bg-color");
      const colorAlpha = Number(localStorage.getItem("study-bg-color-alpha"));
      const imageDataUrl = localStorage.getItem("study-bg-image");
      if (type) {
        study.background = {
          type,
          ...(color ? { color } : {}),
          ...(Number.isFinite(colorAlpha) ? { colorAlpha } : {}),
          ...(imageDataUrl ? { imageDataUrl } : {}),
        };
      }
    }
  }
  const normalized = {
    ...getAppSettings(),
    appearance: parsed.appearance
      ? normalizeAppearance(parsed.appearance)
      : migrateV1Appearance(legacySource),
  };
  const quoteNeedsNormalization =
    JSON.stringify(parsedGeneral.quote) !== JSON.stringify(normalized.general.quote);
  const displayNeedsNormalization =
    parsedDisplay.timeProgressMode !== normalized.study.display.timeProgressMode;
  const infoCarouselNeedsNormalization =
    !Object.prototype.hasOwnProperty.call(parsedStudy, "infoCarousel") ||
    JSON.stringify(parsedStudy.infoCarousel) !== JSON.stringify(normalized.study.infoCarousel);
  if (
    storedVersion < CURRENT_SETTINGS_VERSION ||
    !parsed.appearance ||
    quoteNeedsNormalization ||
    displayNeedsNormalization ||
    infoCarouselNeedsNormalization
  ) {
    localStorage.setItem(APP_SETTINGS_KEY, JSON.stringify(normalized));
  }
  return normalized;
}
