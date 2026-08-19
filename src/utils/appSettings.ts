import { CURRENT_SETTINGS_VERSION } from "../constants/settings";
import {
  DEFAULT_NOISE_REPORT_AUTO_CLOSE_MINUTES,
  MAX_NOISE_REPORT_AUTO_CLOSE_MINUTES,
  MIN_NOISE_REPORT_AUTO_CLOSE_MINUTES,
} from "../constants/noiseReport";
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
  type TimeDisplaySettings,
  type StudyInfoCarouselSettings,
  type StudyInfoItemConfig,
  type StudyNextScheduleLeadMinutes,
  type StudyProgressKind,
  type StudyRainLeadMinutes,
  type StudyInfoSource,
} from "../types";
import type { AppearanceSettingsV2 } from "../types/appearance";
import type { NoiseInputDevicePreference } from "../types/noise";
import type {
  ChinesePoetryDynasty,
  ChinesePoetryType,
  CustomQuoteChannel,
  HitokotoCategory,
  PersistedQuoteSettings,
  QuoteAnimationMode,
  QuoteChannel,
  QuoteChannelPreference,
  QuoteSettingsState,
  QuoteTypingSpeed,
} from "../types/quote";
import {
  CHINESE_POETRY_DYNASTIES,
  CHINESE_POETRY_TYPES,
  HITOKOTO_CATEGORY_LIST,
} from "../types/quote";
import type { StudyTimetableSettings } from "../types/studySchedule";
import { DeepPartial } from "../types/utilityTypes";
import type { WeatherCitySelection } from "../types/weather";

import {
  createDefaultAppearance,
  migrateV1Appearance,
  normalizeAppearance,
} from "./appearanceModel";
import { logger } from "./logger";
import { StudyBackgroundType } from "./studyBackgroundStorage";
import {
  createDefaultStudyTimetable,
  isSupersededDefaultStudyTimetable,
  migrateLegacyStudySchedule,
  normalizeStudyTimetable,
  validateStudyTimetable,
} from "./studyTimetable";

export interface AppSettings {
  version: number;
  modifiedAt: number;
  appearance: AppearanceSettingsV2;

  countdown: {
    customQuickPresetSeconds: number | null;
  };

  general: {
    developerModeEnabled: boolean;
    keepAwakeEnabled: boolean;
    timeDisplay: TimeDisplaySettings;
    startup: {
      initialMode: AppMode;
    };
    quote: PersistedQuoteSettings;
    announcement: {
      hideUntil: number;
      version: string; // 存储版本号，用于与当前应用版本进行比对
    };
    update: {
      autoCheckEnabled: boolean;
    };
    analytics: {
      experienceProgramEnabled: boolean;
    };
    weather: {
      locationMode: "auto" | "manual";
      manualLocation: {
        legacyCoords?: { lat: number; lon: number };
        query: string;
        selected: WeatherCitySelection | null;
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
    countdownMode: "quick" | "single" | "multi" | "gaokao"; // gaokao 为旧版兼容值
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
      errorPopup: boolean;
      errorCenterMode: "off" | "memory" | "persist";
      airQuality: boolean;
      sunriseSunset: boolean;
    };
    timetable: StudyTimetableSettings;
    background: {
      type: StudyBackgroundType;
      color?: string;
      colorAlpha?: number;
      imageDataUrl?: string;
    };
  };

  noiseControl: {
    monitoringEnabled: boolean;
    historyEnabled: boolean;
    preferredInputDevice: NoiseInputDevicePreference | null;
    primaryMetric: "quietness-score" | "estimated-dba";
    showRealtimeValue: boolean;
    autoHidePersistentAnomaly: boolean;
    scoreAlertThreshold: number;
    reportAutoPopup: boolean;
    reportAutoCloseMinutes: number;
    alertSoundEnabled: boolean;
  };
}

export const APP_SETTINGS_KEY = "AppSettings";
export const APP_SETTINGS_QUARANTINE_KEY = "immersive-clock:quarantine:app-settings";
export { CURRENT_SETTINGS_VERSION };

export const MAX_COUNTDOWN_QUICK_PRESET_SECONDS = 23 * 60 * 60 + 59 * 60 + 59;

/** 中央信息轮播的硬上限，配置与运行时都应遵守该值。 */
export const MAX_STUDY_INFO_ITEMS = 20;
export const MIN_STUDY_INFO_INTERVAL_SEC = 3;
export const MAX_STUDY_INFO_INTERVAL_SEC = 30;
export const DEFAULT_STUDY_INFO_INTERVAL_SEC = 6;
export const MAX_STUDY_INFO_TEXT_LENGTH = 80;

export function normalizeNoiseReportAutoCloseMinutes(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return DEFAULT_NOISE_REPORT_AUTO_CLOSE_MINUTES;
  }
  return Math.max(
    MIN_NOISE_REPORT_AUTO_CLOSE_MINUTES,
    Math.min(MAX_NOISE_REPORT_AUTO_CLOSE_MINUTES, Math.round(value))
  );
}

export function normalizeCountdownQuickPresetSeconds(value: unknown): number | null {
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < 1 ||
    value > MAX_COUNTDOWN_QUICK_PRESET_SECONDS
  ) {
    return null;
  }
  return value;
}

export const STUDY_INFO_BUILTIN_IDS = {
  progressDay: "progress-day-default",
  progressSchedule: "progress-schedule-default",
  nextSchedule: "next-schedule-default",
  rain: "rain-default",
  weatherAlert: "weather-alert-default",
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

function normalizeStudyProgressKind(value: unknown): StudyProgressKind {
  return value === "schedule" ? "schedule" : "day";
}

function parseStoredNumber(value: unknown): number {
  if (typeof value === "number") return value;
  if (typeof value === "string" && value.trim()) return Number(value);
  return Number.NaN;
}

function isStudyInfoSource(value: unknown): value is StudyInfoSource {
  return (
    value === "progress" ||
    value === "nextSchedule" ||
    value === "rain" ||
    value === "weatherAlert" ||
    value === "custom"
  );
}

function isStudyProgressKind(value: unknown): value is StudyProgressKind {
  return value === "day" || value === "schedule";
}

function normalizeNextScheduleLeadMinutes(value: unknown): StudyNextScheduleLeadMinutes {
  return value === "always" || value === 120 || value === 60 || value === 30 || value === 15
    ? value
    : "always";
}

function normalizeRainLeadMinutes(value: unknown): StudyRainLeadMinutes {
  return value === 120 || value === 60 || value === 30 || value === 15 || value === 10 ? value : 30;
}

function createDefaultStudyInfoItems(): StudyInfoItemConfig[] {
  return [
    {
      id: STUDY_INFO_BUILTIN_IDS.progressDay,
      source: "progress",
      progressKind: "day",
      enabled: true,
      order: 0,
    },
    {
      id: STUDY_INFO_BUILTIN_IDS.progressSchedule,
      source: "progress",
      progressKind: "schedule",
      enabled: false,
      order: 1,
    },
    {
      id: STUDY_INFO_BUILTIN_IDS.nextSchedule,
      source: "nextSchedule",
      backgroundProgressKind: "day",
      leadMinutes: "always",
      enabled: false,
      order: 2,
    },
    {
      id: STUDY_INFO_BUILTIN_IDS.rain,
      source: "rain",
      backgroundProgressKind: "day",
      leadMinutes: 30,
      enabled: false,
      order: 3,
    },
    {
      id: STUDY_INFO_BUILTIN_IDS.weatherAlert,
      source: "weatherAlert",
      backgroundProgressKind: "day",
      enabled: false,
      order: 4,
    },
  ];
}

/** 返回新对象，避免调用方修改全局默认值。 */
export function getDefaultStudyInfoCarousel(): StudyInfoCarouselSettings {
  return {
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

interface StudyInfoNormalizationOptions {
  /** v1-v3 共用全局进度模式，迁移时应覆盖条目中不存在的 v4 字段。 */
  legacyProgressKind?: StudyProgressKind;
  forceAllDisabled?: boolean;
}

function normalizeStudyInfoItem(
  value: unknown,
  fallbackOrder: number,
  options: StudyInfoNormalizationOptions
): StudyInfoItemConfig | null {
  if (!isRecord(value) || typeof value.id !== "string" || !isStudyInfoSource(value.source)) {
    return null;
  }
  const id = value.id.trim();
  if (!id) return null;

  const orderValue = parseStoredNumber(value.order);
  const order = Number.isFinite(orderValue) ? Math.round(orderValue) : fallbackOrder;
  const base = {
    id,
    enabled: options.forceAllDisabled
      ? false
      : typeof value.enabled === "boolean"
        ? value.enabled
        : true,
    order,
  };

  const progressKind =
    options.legacyProgressKind ??
    (isStudyProgressKind(value.backgroundProgressKind) ? value.backgroundProgressKind : "day");

  switch (value.source) {
    case "progress":
      return {
        ...base,
        source: "progress",
        progressKind:
          options.legacyProgressKind ??
          (isStudyProgressKind(value.progressKind) ? value.progressKind : "day"),
      };
    case "nextSchedule":
      return {
        ...base,
        source: "nextSchedule",
        backgroundProgressKind: progressKind,
        leadMinutes: normalizeNextScheduleLeadMinutes(value.leadMinutes),
      };
    case "rain":
      return {
        ...base,
        source: "rain",
        backgroundProgressKind: progressKind,
        leadMinutes: normalizeRainLeadMinutes(value.leadMinutes),
      };
    case "weatherAlert":
      return {
        ...base,
        source: "weatherAlert",
        backgroundProgressKind: progressKind,
      };
    case "custom": {
      if (typeof value.text !== "string") return null;
      const text = value.text.trim().slice(0, MAX_STUDY_INFO_TEXT_LENGTH);
      if (!text) return null;
      return {
        ...base,
        source: "custom",
        backgroundProgressKind: progressKind,
        text,
      };
    }
  }
}

function getStudyInfoBuiltinKey(item: StudyInfoItemConfig): string | null {
  if (item.source === "progress") return `progress:${item.progressKind}`;
  return item.source === "custom" ? null : item.source;
}

interface StudyInfoCarouselNormalizationResult {
  settings: StudyInfoCarouselSettings;
  limitAdjusted: boolean;
}

/**
 * 归一化中央信息配置：过滤非法条目、去重，并将启用的有效条目限制为 20。
 * 超额条目会被禁用而非删除，严格按用户 order 与原始顺序保留前 20 个启用项。
 */
function normalizeStudyInfoCarouselWithMetadata(
  value: unknown,
  options: StudyInfoNormalizationOptions = {}
): StudyInfoCarouselNormalizationResult {
  const defaults = getDefaultStudyInfoCarousel();
  const source = isRecord(value) ? value : {};
  const rawItems = Array.isArray(source.items) ? source.items : null;
  const parsedItems: Array<{ item: StudyInfoItemConfig; index: number }> = [];
  const seenIds = new Set<string>();
  const seenBuiltinKeys = new Set<string>();

  if (rawItems) {
    rawItems.forEach((candidate, index) => {
      const item = normalizeStudyInfoItem(candidate, index, options);
      if (!item || seenIds.has(item.id)) return;
      const builtinKey = getStudyInfoBuiltinKey(item);
      if (builtinKey) {
        if (seenBuiltinKeys.has(builtinKey)) return;
        seenBuiltinKeys.add(builtinKey);
      }
      seenIds.add(item.id);
      parsedItems.push({ item, index });
    });
  } else {
    defaults.items.forEach((item, index) => parsedItems.push({ item, index }));
  }

  // 配置文件可能来自早期版本或手工编辑：保证五个内置配置始终可供再次添加。
  // 已存在的来源（即使被禁用）会原样保留，避免迁移时意外重新启用。
  const existingBuiltinKeys = new Set(
    parsedItems
      .map(({ item }) => getStudyInfoBuiltinKey(item))
      .filter((key): key is string => key !== null)
  );
  const maxOrder = parsedItems.reduce((maximum, entry) => Math.max(maximum, entry.item.order), -1);
  defaults.items.forEach((defaultItem, index) => {
    const builtinKey = getStudyInfoBuiltinKey(defaultItem);
    if (!builtinKey || existingBuiltinKeys.has(builtinKey)) return;
    let id = defaultItem.id;
    if (seenIds.has(id)) id = `${id}-${index}`;
    const item = {
      ...defaultItem,
      id,
      enabled: rawItems === null && !options.forceAllDisabled ? defaultItem.enabled : false,
      order: maxOrder + index + 1,
    } as StudyInfoItemConfig;
    seenIds.add(id);
    existingBuiltinKeys.add(builtinKey);
    parsedItems.push({ item, index: parsedItems.length + index });
  });

  const limitAdjusted =
    parsedItems.filter(({ item }) => item.enabled).length > MAX_STUDY_INFO_ITEMS;

  const enabledItemIds = new Set(
    parsedItems
      .filter(({ item }) => item.enabled)
      .sort((left, right) => left.item.order - right.item.order || left.index - right.index)
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

function normalizeStoredStudyInfoCarouselWithMetadata(
  value: unknown,
  storedVersion: number,
  legacyDisplay: Record<string, unknown>
): StudyInfoCarouselNormalizationResult {
  if (storedVersion >= 4) return normalizeStudyInfoCarouselWithMetadata(value);

  const legacyProgressKind = normalizeStudyProgressKind(legacyDisplay.timeProgressMode);
  const legacyVisible = legacyDisplay.showStatusBar !== false;
  const source = isRecord(value) ? value : {};
  const hasStoredItems = Array.isArray(source.items);
  const candidate = hasStoredItems
    ? source
    : {
        ...source,
        items: [
          {
            id: "progress-default",
            source: "progress",
            enabled: legacyVisible,
            order: 0,
          },
          {
            id: STUDY_INFO_BUILTIN_IDS.nextSchedule,
            source: "nextSchedule",
            enabled: false,
            order: 1,
          },
          {
            id: STUDY_INFO_BUILTIN_IDS.rain,
            source: "rain",
            enabled: false,
            order: 2,
          },
          {
            id: STUDY_INFO_BUILTIN_IDS.weatherAlert,
            source: "weatherAlert",
            enabled: false,
            order: 3,
          },
        ],
      };

  return normalizeStudyInfoCarouselWithMetadata(candidate, {
    legacyProgressKind,
    forceAllDisabled: !legacyVisible,
  });
}

function normalizeStoredStudyInfoCarousel(
  value: unknown,
  storedVersion: number,
  legacyDisplay: Record<string, unknown>
): StudyInfoCarouselSettings {
  return normalizeStoredStudyInfoCarouselWithMetadata(value, storedVersion, legacyDisplay).settings;
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
  } else if (defaultChannel.providerId === "chinese-poetry") {
    preference.chinesePoetryDynasty = CHINESE_POETRY_DYNASTIES.find(
      (dynasty): dynasty is ChinesePoetryDynasty => dynasty === value.chinesePoetryDynasty
    );
    const allowedTypes = new Set<string>(CHINESE_POETRY_TYPES);
    preference.chinesePoetryTypes = Array.isArray(value.chinesePoetryTypes)
      ? Array.from(
          new Set(
            value.chinesePoetryTypes.filter(
              (type): type is ChinesePoetryType =>
                typeof type === "string" && allowedTypes.has(type)
            )
          )
        )
      : [];
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
  countdown: {
    customQuickPresetSeconds: null,
  },
  general: {
    developerModeEnabled: false,
    keepAwakeEnabled: false,
    timeDisplay: {
      showClockSeconds: true,
      showStudySeconds: true,
    },
    startup: {
      initialMode: "clock",
    },
    quote: createDefaultQuoteSettings(),
    announcement: {
      hideUntil: 0,
      version: "",
    },
    update: {
      autoCheckEnabled: true,
    },
    analytics: {
      experienceProgramEnabled: true,
    },
    weather: {
      locationMode: "auto",
      manualLocation: {
        query: "",
        selected: null,
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
    countdownMode: "quick",
    customCountdown: { name: "", date: "" },
    display: {
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
      errorPopup: true,
      errorCenterMode: "off",
      airQuality: false,
      sunriseSunset: false,
    },
    timetable: createDefaultStudyTimetable(),
    background: {
      type: "default",
    },
  },
  noiseControl: {
    monitoringEnabled: true,
    historyEnabled: true,
    preferredInputDevice: null,
    primaryMetric: "quietness-score",
    showRealtimeValue: true,
    autoHidePersistentAnomaly: true,
    scoreAlertThreshold: 70,
    reportAutoPopup: true,
    reportAutoCloseMinutes: DEFAULT_NOISE_REPORT_AUTO_CLOSE_MINUTES,
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

function normalizeStudyDisplaySettings(value: unknown): StudyDisplaySettings {
  const source = isRecord(value) ? value : {};
  const defaults = DEFAULT_SETTINGS.study.display;
  return {
    showWeather:
      typeof source.showWeather === "boolean" ? source.showWeather : defaults.showWeather,
    showNoiseMonitor:
      typeof source.showNoiseMonitor === "boolean"
        ? source.showNoiseMonitor
        : defaults.showNoiseMonitor,
    showCountdown:
      typeof source.showCountdown === "boolean" ? source.showCountdown : defaults.showCountdown,
    showQuote: typeof source.showQuote === "boolean" ? source.showQuote : defaults.showQuote,
    showTime: typeof source.showTime === "boolean" ? source.showTime : defaults.showTime,
    showDate: typeof source.showDate === "boolean" ? source.showDate : defaults.showDate,
  };
}

function normalizeTimeDisplaySettings(value: unknown): TimeDisplaySettings {
  const source = isRecord(value) ? value : {};
  const defaults = DEFAULT_SETTINGS.general.timeDisplay;
  return {
    showClockSeconds:
      typeof source.showClockSeconds === "boolean"
        ? source.showClockSeconds
        : defaults.showClockSeconds,
    showStudySeconds:
      typeof source.showStudySeconds === "boolean"
        ? source.showStudySeconds
        : defaults.showStudySeconds,
  };
}

function normalizeNoiseInputDevicePreference(value: unknown): NoiseInputDevicePreference | null {
  if (!isRecord(value)) return null;
  const deviceId = typeof value.deviceId === "string" ? value.deviceId.trim() : "";
  const label = typeof value.label === "string" ? value.label.trim() : "";
  if (!deviceId || !label || deviceId === "default" || deviceId === "communications") return null;
  return { deviceId, label };
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

function normalizeWeatherCitySelection(value: unknown): WeatherCitySelection | null {
  if (!isRecord(value)) return null;
  const lat = Number(value.lat);
  const lon = Number(value.lon);
  const name = typeof value.name === "string" ? value.name.trim() : "";
  const locationKey = typeof value.locationKey === "string" ? value.locationKey.trim() : "";
  if (
    !name ||
    !locationKey ||
    !Number.isFinite(lat) ||
    !Number.isFinite(lon) ||
    lat < -90 ||
    lat > 90 ||
    lon < -180 ||
    lon > 180
  ) {
    return null;
  }
  const affiliation =
    typeof value.affiliation === "string" && value.affiliation.trim()
      ? value.affiliation.trim()
      : undefined;
  return { affiliation, lat, locationKey, lon, name };
}

function normalizeLegacyCoords(value: unknown): { lat: number; lon: number } | undefined {
  if (!isRecord(value)) return undefined;
  const lat = Number(value.lat);
  const lon = Number(value.lon);
  if (
    !Number.isFinite(lat) ||
    !Number.isFinite(lon) ||
    lat < -90 ||
    lat > 90 ||
    lon < -180 ||
    lon > 180
  ) {
    return undefined;
  }
  return { lat, lon };
}

function normalizeManualWeatherLocation(
  value: unknown
): AppSettings["general"]["weather"]["manualLocation"] {
  const source = isRecord(value) ? value : {};
  const selected = normalizeWeatherCitySelection(source.selected);
  const querySource =
    typeof source.query === "string"
      ? source.query
      : typeof source.cityName === "string"
        ? source.cityName
        : selected?.name || "";
  const query = querySource.trim();
  const legacyCoords =
    selected == null
      ? (normalizeLegacyCoords(source.legacyCoords) ??
        normalizeLegacyCoords(source.resolved) ??
        (source.type === "coords" ? normalizeLegacyCoords(source) : undefined))
      : undefined;
  return { query, selected, ...(legacyCoords ? { legacyCoords } : {}) };
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
  const parsedCountdown = isRecord(parsed.countdown) ? parsed.countdown : {};
  const parsedTimeDisplay = isRecord(parsedGeneral.timeDisplay) ? parsedGeneral.timeDisplay : {};
  const parsedStudy = isRecord(parsed.study) ? parsed.study : {};
  const parsedAlerts = isRecord(parsedStudy.alerts) ? parsedStudy.alerts : {};
  const parsedNoiseControl = isRecord(parsed.noiseControl) ? parsed.noiseControl : {};
  const parsedStartup = isRecord(parsedGeneral.startup) ? parsedGeneral.startup : {};
  const parsedAnnouncement = isRecord(parsedGeneral.announcement) ? parsedGeneral.announcement : {};
  const parsedUpdate = isRecord(parsedGeneral.update) ? parsedGeneral.update : {};
  const parsedAnalytics = isRecord(parsedGeneral.analytics) ? parsedGeneral.analytics : {};
  const parsedWeather = isRecord(parsedGeneral.weather) ? parsedGeneral.weather : {};
  const parsedTimeSync = isRecord(parsedGeneral.timeSync) ? parsedGeneral.timeSync : {};
  const parsedGeneralBackground = isRecord(parsedGeneral.background)
    ? parsedGeneral.background
    : {};
  const parsedDisplay = isRecord(parsedStudy.display) ? parsedStudy.display : {};
  const parsedStyle = isRecord(parsedStudy.style) ? parsedStudy.style : {};
  const parsedStudyBackground = isRecord(parsedStudy.background) ? parsedStudy.background : {};
  const {
    schedule: legacyStudySchedule,
    timetable: storedTimetable,
    ...parsedStudyWithoutLegacySchedule
  } = parsedStudy;
  const normalizedTimetable =
    storedVersion < 18 && isSupersededDefaultStudyTimetable(storedTimetable)
      ? createDefaultStudyTimetable()
      : validateStudyTimetable(storedTimetable).valid
        ? normalizeStudyTimetable(storedTimetable)
        : Array.isArray(legacyStudySchedule)
          ? migrateLegacyStudySchedule(legacyStudySchedule)
          : createDefaultStudyTimetable();

  const legacyErrorCenterEnabled =
    typeof parsedAlerts.errorCenterEnabled === "boolean"
      ? parsedAlerts.errorCenterEnabled
      : undefined;
  const mergedStudyAlerts: AppSettings["study"]["alerts"] = {
    weatherAlert:
      typeof parsedAlerts.weatherAlert === "boolean"
        ? parsedAlerts.weatherAlert
        : DEFAULT_SETTINGS.study.alerts.weatherAlert,
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
    countdown: {
      customQuickPresetSeconds: normalizeCountdownQuickPresetSeconds(
        parsedCountdown.customQuickPresetSeconds
      ),
    },
    general: {
      ...DEFAULT_SETTINGS.general,
      ...parsedGeneral,
      developerModeEnabled:
        typeof parsedGeneral.developerModeEnabled === "boolean"
          ? parsedGeneral.developerModeEnabled
          : DEFAULT_SETTINGS.general.developerModeEnabled,
      keepAwakeEnabled:
        typeof parsedGeneral.keepAwakeEnabled === "boolean"
          ? parsedGeneral.keepAwakeEnabled
          : DEFAULT_SETTINGS.general.keepAwakeEnabled,
      timeDisplay: normalizeTimeDisplaySettings(parsedTimeDisplay),
      startup: { ...DEFAULT_SETTINGS.general.startup, ...parsedStartup },
      quote: normalizeQuoteSettings(parsedGeneral.quote, storedVersion),
      announcement: { ...DEFAULT_SETTINGS.general.announcement, ...parsedAnnouncement },
      update: {
        autoCheckEnabled:
          typeof parsedUpdate.autoCheckEnabled === "boolean"
            ? parsedUpdate.autoCheckEnabled
            : DEFAULT_SETTINGS.general.update.autoCheckEnabled,
      },
      analytics: {
        experienceProgramEnabled:
          typeof parsedAnalytics.experienceProgramEnabled === "boolean"
            ? parsedAnalytics.experienceProgramEnabled
            : DEFAULT_SETTINGS.general.analytics.experienceProgramEnabled,
      },
      weather: {
        locationMode: parsedWeather.locationMode === "manual" ? "manual" : "auto",
        manualLocation: normalizeManualWeatherLocation(parsedWeather.manualLocation),
      },
      timeSync: { ...DEFAULT_SETTINGS.general.timeSync, ...parsedTimeSync },
      background: { ...DEFAULT_SETTINGS.general.background, ...parsedGeneralBackground },
    } as AppSettings["general"],
    study: {
      ...DEFAULT_SETTINGS.study,
      ...parsedStudyWithoutLegacySchedule,
      infoCarousel: normalizeStoredStudyInfoCarousel(
        parsedStudy.infoCarousel,
        storedVersion,
        parsedDisplay
      ),
      display: normalizeStudyDisplaySettings(parsedDisplay),
      style: { ...DEFAULT_SETTINGS.study.style, ...parsedStyle },
      alerts: mergedStudyAlerts,
      timetable: normalizedTimetable,
      background: { ...DEFAULT_SETTINGS.study.background, ...parsedStudyBackground },
    } as AppSettings["study"],
    noiseControl: {
      monitoringEnabled:
        typeof parsedNoiseControl.monitoringEnabled === "boolean"
          ? parsedNoiseControl.monitoringEnabled
          : storedVersion <= 8 && typeof parsedDisplay.showNoiseMonitor === "boolean"
            ? parsedDisplay.showNoiseMonitor
            : DEFAULT_SETTINGS.noiseControl.monitoringEnabled,
      historyEnabled:
        typeof parsedNoiseControl.historyEnabled === "boolean"
          ? parsedNoiseControl.historyEnabled
          : DEFAULT_SETTINGS.noiseControl.historyEnabled,
      preferredInputDevice:
        storedVersion >= 10
          ? normalizeNoiseInputDevicePreference(parsedNoiseControl.preferredInputDevice)
          : null,
      primaryMetric:
        parsedNoiseControl.primaryMetric === "estimated-dba" ? "estimated-dba" : "quietness-score",
      showRealtimeValue:
        typeof parsedNoiseControl.showRealtimeValue === "boolean"
          ? parsedNoiseControl.showRealtimeValue
          : typeof parsedNoiseControl.showRealtimeDb === "boolean"
            ? parsedNoiseControl.showRealtimeDb
            : DEFAULT_SETTINGS.noiseControl.showRealtimeValue,
      autoHidePersistentAnomaly:
        typeof parsedNoiseControl.autoHidePersistentAnomaly === "boolean"
          ? parsedNoiseControl.autoHidePersistentAnomaly
          : DEFAULT_SETTINGS.noiseControl.autoHidePersistentAnomaly,
      scoreAlertThreshold:
        typeof parsedNoiseControl.scoreAlertThreshold === "number" &&
        Number.isFinite(parsedNoiseControl.scoreAlertThreshold)
          ? Math.max(0, Math.min(100, parsedNoiseControl.scoreAlertThreshold))
          : DEFAULT_SETTINGS.noiseControl.scoreAlertThreshold,
      reportAutoPopup:
        typeof parsedNoiseControl.reportAutoPopup === "boolean"
          ? parsedNoiseControl.reportAutoPopup
          : DEFAULT_SETTINGS.noiseControl.reportAutoPopup,
      reportAutoCloseMinutes: normalizeNoiseReportAutoCloseMinutes(
        parsedNoiseControl.reportAutoCloseMinutes
      ),
      alertSoundEnabled:
        typeof parsedNoiseControl.alertSoundEnabled === "boolean"
          ? parsedNoiseControl.alertSoundEnabled
          : DEFAULT_SETTINGS.noiseControl.alertSoundEnabled,
    },
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

    if (updates.countdown) {
      const countdownUpdates = updates.countdown;
      nextSettings.countdown = {
        ...current.countdown,
        customQuickPresetSeconds:
          countdownUpdates.customQuickPresetSeconds === undefined
            ? current.countdown.customQuickPresetSeconds
            : normalizeCountdownQuickPresetSeconds(countdownUpdates.customQuickPresetSeconds),
      };
    }

    if (updates.general) {
      const generalUpdates = updates.general;
      nextSettings.general = {
        ...current.general,
        developerModeEnabled:
          generalUpdates.developerModeEnabled ?? current.general.developerModeEnabled,
        keepAwakeEnabled: generalUpdates.keepAwakeEnabled ?? current.general.keepAwakeEnabled,
        timeDisplay: generalUpdates.timeDisplay
          ? normalizeTimeDisplaySettings({
              ...current.general.timeDisplay,
              ...generalUpdates.timeDisplay,
            })
          : current.general.timeDisplay,
        startup: generalUpdates.startup
          ? { ...current.general.startup, ...generalUpdates.startup }
          : current.general.startup,
        quote: generalUpdates.quote
          ? { ...current.general.quote, ...generalUpdates.quote }
          : current.general.quote,
        announcement: generalUpdates.announcement
          ? { ...current.general.announcement, ...generalUpdates.announcement }
          : current.general.announcement,
        update: generalUpdates.update
          ? { ...current.general.update, ...generalUpdates.update }
          : current.general.update,
        analytics: generalUpdates.analytics
          ? { ...current.general.analytics, ...generalUpdates.analytics }
          : current.general.analytics,
        weather: generalUpdates.weather
          ? {
              ...current.general.weather,
              ...generalUpdates.weather,
              manualLocation: generalUpdates.weather.manualLocation
                ? normalizeManualWeatherLocation({
                    ...current.general.weather.manualLocation,
                    ...generalUpdates.weather.manualLocation,
                  })
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
        timetable: studyUpdates.timetable
          ? normalizeStudyTimetable(studyUpdates.timetable)
          : current.study.timetable,
        background: studyUpdates.background
          ? { ...current.study.background, ...studyUpdates.background }
          : current.study.background,
      };
    }
    if (updates.noiseControl) {
      const noiseUpdates = updates.noiseControl;
      nextSettings.noiseControl = {
        ...current.noiseControl,
        ...noiseUpdates,
        preferredInputDevice:
          noiseUpdates.preferredInputDevice === undefined
            ? current.noiseControl.preferredInputDevice
            : noiseUpdates.preferredInputDevice === null
              ? null
              : normalizeNoiseInputDevicePreference({
                  ...current.noiseControl.preferredInputDevice,
                  ...noiseUpdates.preferredInputDevice,
                }),
      };
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
  const preservedInfoItems = (current.study.infoCarousel?.items ?? [])
    .filter((item) => item.source === "custom")
    .map((item) => ({ ...item, enabled: false }));
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
      timetable: structuredClone(current.study.timetable),
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
  const parsedCountdown = isRecord(parsed.countdown) ? parsed.countdown : {};
  const parsedStudy = isRecord(parsed.study) ? parsed.study : {};
  const parsedDisplay = isRecord(parsedStudy.display) ? parsedStudy.display : {};
  if (
    normalizeStoredStudyInfoCarouselWithMetadata(
      parsedStudy.infoCarousel,
      storedVersion,
      parsedDisplay
    ).limitAdjusted
  ) {
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
    JSON.stringify(parsedDisplay) !== JSON.stringify(normalized.study.display);
  const infoCarouselNeedsNormalization =
    !Object.prototype.hasOwnProperty.call(parsedStudy, "infoCarousel") ||
    JSON.stringify(parsedStudy.infoCarousel) !== JSON.stringify(normalized.study.infoCarousel);
  const countdownNeedsNormalization =
    !Object.prototype.hasOwnProperty.call(parsed, "countdown") ||
    JSON.stringify(parsedCountdown) !== JSON.stringify(normalized.countdown);
  if (
    storedVersion < CURRENT_SETTINGS_VERSION ||
    !parsed.appearance ||
    quoteNeedsNormalization ||
    displayNeedsNormalization ||
    infoCarouselNeedsNormalization ||
    countdownNeedsNormalization
  ) {
    localStorage.setItem(APP_SETTINGS_KEY, JSON.stringify(normalized));
  }
  return normalized;
}
