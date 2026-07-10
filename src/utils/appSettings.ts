import {
  NOISE_ANALYSIS_FRAME_MS,
  NOISE_ANALYSIS_SLICE_SEC,
  NOISE_SCORE_MAX_SEGMENTS_PER_MIN,
  NOISE_SCORE_SEGMENT_MERGE_GAP_MS,
  NOISE_SCORE_THRESHOLD_DBFS,
} from "../constants/noise";
import { DEFAULT_NOISE_REPORT_RETENTION_DAYS } from "../constants/noiseReport";
import { QuoteSourceConfig, StudyDisplaySettings, CountdownItem, AppMode } from "../types";
import type { AppearanceSettingsV2 } from "../types/appearance";
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
    quote: {
      autoRefreshInterval: number;
      channels: QuoteSourceConfig[];
      lastUpdated: number;
    };
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
export const CURRENT_SETTINGS_VERSION = 2;

export class UnsupportedSettingsVersionError extends Error {
  constructor(public readonly storedVersion: number) {
    super(`设置文件版本 ${storedVersion} 高于当前支持版本 ${CURRENT_SETTINGS_VERSION}`);
    this.name = "UnsupportedSettingsVersionError";
  }
}

const DEFAULT_SETTINGS: AppSettings = {
  version: CURRENT_SETTINGS_VERSION,
  modifiedAt: Date.now(),
  appearance: createDefaultAppearance(),
  general: {
    startup: {
      initialMode: "clock",
    },
    quote: {
      autoRefreshInterval: 600,
      channels: [],
      lastUpdated: Date.now(),
    },
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
      showNoiseMonitor: true,
      showCountdown: true,
      showQuote: true,
      showTime: true,
      showDate: true,
    },
    countdownItems: [],
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

/**
 * 获取完整的 AppSettings 配置对象
 */
export function getAppSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(APP_SETTINGS_KEY);
    if (!raw) {
      return DEFAULT_SETTINGS;
    }
    const parsed = JSON.parse(raw);
    const storedVersion = typeof parsed.version === "number" ? parsed.version : 1;
    if (storedVersion > CURRENT_SETTINGS_VERSION) {
      throw new UnsupportedSettingsVersionError(storedVersion);
    }
    const parsedStudy = parsed.study || {};
    const parsedAlerts = parsedStudy.alerts || {};
    const legacyMinutelyForecast =
      typeof parsedAlerts.minutelyForecast === "boolean"
        ? parsedAlerts.minutelyForecast
        : undefined;
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
      errorCenterMode:
        typeof parsedAlerts.errorCenterMode === "string" &&
        ["off", "memory", "persist"].includes(parsedAlerts.errorCenterMode)
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

    // 可以在此添加简单的版本检查或结构校验逻辑
    // 目前先信任存储结构，如有新增字段则通过与默认配置合并补齐
    // 此处的深度合并逻辑做了简化处理
    const appearance = parsed.appearance
      ? normalizeAppearance(parsed.appearance)
      : migrateV1Appearance(parsed);
    return {
      ...DEFAULT_SETTINGS,
      ...parsed,
      version: CURRENT_SETTINGS_VERSION,
      appearance,
      general: {
        ...DEFAULT_SETTINGS.general,
        ...parsed.general,
        startup: { ...DEFAULT_SETTINGS.general.startup, ...(parsed.general?.startup || {}) },
        quote: { ...DEFAULT_SETTINGS.general.quote, ...(parsed.general?.quote || {}) },
        announcement: {
          ...DEFAULT_SETTINGS.general.announcement,
          ...(parsed.general?.announcement || {}),
        },
        weather: { ...DEFAULT_SETTINGS.general.weather, ...(parsed.general?.weather || {}) },
        timeSync: { ...DEFAULT_SETTINGS.general.timeSync, ...(parsed.general?.timeSync || {}) },
        background: {
          ...DEFAULT_SETTINGS.general.background,
          ...(parsed.general?.background || {}),
        },
      },
      study: {
        ...DEFAULT_SETTINGS.study,
        ...parsedStudy,
        display: { ...DEFAULT_SETTINGS.study.display, ...(parsedStudy.display || {}) },
        style: { ...DEFAULT_SETTINGS.study.style, ...(parsedStudy.style || {}) },
        alerts: mergedStudyAlerts,
        background: { ...DEFAULT_SETTINGS.study.background, ...(parsedStudy.background || {}) },
      },
      noiseControl: { ...DEFAULT_SETTINGS.noiseControl, ...parsed.noiseControl },
    };
  } catch (error) {
    if (error instanceof UnsupportedSettingsVersionError) throw error;
    logger.error("Failed to load AppSettings", error);
    return DEFAULT_SETTINGS;
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
    const settings = {
      ...DEFAULT_SETTINGS,
      modifiedAt: Date.now(),
    };
    localStorage.setItem(APP_SETTINGS_KEY, JSON.stringify(settings));
  } catch (error) {
    logger.error("Failed to reset AppSettings", error);
  }
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

/** Persist the normalized v2 structure before legacy keys are removed. */
export function migrateStoredAppSettings(): AppSettings {
  const raw = localStorage.getItem(APP_SETTINGS_KEY);
  if (!raw) {
    resetAppSettings();
    return getAppSettings();
  }
  const parsed = JSON.parse(raw) as Record<string, unknown>;
  const storedVersion = typeof parsed.version === "number" ? parsed.version : 1;
  if (storedVersion > CURRENT_SETTINGS_VERSION) {
    throw new UnsupportedSettingsVersionError(storedVersion);
  }
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
  if (storedVersion < CURRENT_SETTINGS_VERSION || !parsed.appearance) {
    localStorage.setItem(APP_SETTINGS_KEY, JSON.stringify(normalized));
  }
  return normalized;
}
