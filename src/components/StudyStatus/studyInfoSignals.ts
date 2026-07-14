import type { StudyInfoCarouselSettings, StudyInfoItemConfig, StudyInfoSource } from "../../types";
import type { StudyPeriod } from "../../types/studySchedule";
import {
  getDefaultStudyInfoCarousel,
  MAX_STUDY_INFO_ITEMS as MAX_PERSISTED_STUDY_INFO_ITEMS,
  normalizeStudyInfoCarousel as normalizePersistedStudyInfoCarousel,
} from "../../utils/appSettings";
import type { MinutelyRainStats } from "../../utils/minutelyPrecipLogic";

export type { StudyInfoCarouselSettings, StudyInfoItemConfig, StudyInfoSource } from "../../types";

/** 中央信息的来源。用户配置只保存来源和顺序，优先级由运行时状态决定。 */
export type StudyInfoPriority = "critical" | "timely" | "routine";

export type StudyInfoDisplayMode = "interrupt" | "rotating";

export interface StudyInfoSignal {
  id: string;
  source: StudyInfoSource;
  priority: StudyInfoPriority;
  displayMode: StudyInfoDisplayMode;
  primaryText: string;
  secondaryText?: string;
  ariaText: string;
  eventAt?: number;
  expiresAt?: number;
  dedupeKey: string;
  /** 配置顺序只用于同优先级信号稳定排序，不需要持久化。 */
  order?: number;
}

/** 天气运行层可以直接适配此最小快照，不要求 StudyStatus 依赖 Weather 组件。 */
export interface StudyInfoWeatherSnapshot {
  /** 共享天气运行层的标准快照入口。 */
  stats?: MinutelyRainStats | null;
  freshness?: "fresh" | "stale" | "unknown" | "error";
  sourceUpdatedAt?: number | null;
  /** 以下字段保留给轻量适配器和测试使用。 */
  phase?: "dry" | "preRain" | "raining" | "unknown" | "DRY" | "PRE_RAIN" | "RAINING" | "POST_RAIN";
  rainStartAt?: number | null;
  rainEndAt?: number | null;
  leadMinutes?: number | null;
  remainingMinutes?: number | null;
  durationMinutes?: number | null;
  intensityLabel?: string;
  fetchedAt?: number;
  updatedAt?: number;
  stale?: boolean;
}

export interface StudyInfoProgressSnapshot {
  stageText: string;
  stageAriaText?: string;
  remainingTimeText?: string;
  statusText: string;
  hasProgress: boolean;
}

export const MAX_STUDY_INFO_ITEMS = MAX_PERSISTED_STUDY_INFO_ITEMS;
export const DEFAULT_STUDY_INFO_CAROUSEL: StudyInfoCarouselSettings = getDefaultStudyInfoCarousel();

/** 对外暴露统一的设置归一化入口，实际规则由 AppSettings 保持单一来源。 */
export const normalizeStudyInfoCarousel = normalizePersistedStudyInfoCarousel;

function formatMinutes(minutes: number): string {
  return `${Math.max(0, Math.round(minutes))} 分钟`;
}

function parseTimeOnDate(date: Date, time: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(time.trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  const result = new Date(date);
  result.setHours(hours, minutes, 0, 0);
  return result.getTime();
}

function resolveConfigItems(
  settings: StudyInfoCarouselSettings | undefined
): StudyInfoItemConfig[] {
  return normalizePersistedStudyInfoCarousel(settings).items;
}

function isEnabled(
  items: StudyInfoItemConfig[],
  source: StudyInfoSource
): StudyInfoItemConfig | null {
  return items.find((item) => item.source === source && item.enabled) ?? null;
}

function buildProgressSignal(
  progress: StudyInfoProgressSnapshot,
  config: StudyInfoItemConfig
): StudyInfoSignal | null {
  if (!progress.hasProgress) return null;
  const primaryText = progress.stageText || progress.statusText;
  const secondaryText = progress.remainingTimeText;
  const ariaText = [progress.stageAriaText || primaryText, secondaryText]
    .filter(Boolean)
    .join("，");
  return {
    id: config.id,
    source: "progress",
    priority: "routine",
    displayMode: "rotating",
    primaryText,
    secondaryText,
    ariaText,
    dedupeKey: `progress:${progress.statusText}:${primaryText}`,
    order: config.order,
  };
}

function buildNextScheduleSignal(
  schedule: StudyPeriod[],
  nowMs: number,
  config: StudyInfoItemConfig
): StudyInfoSignal | null {
  const now = new Date(nowMs);
  const next = schedule
    .map((period) => ({ period, startAt: parseTimeOnDate(now, period.startTime) }))
    .filter(
      (candidate): candidate is { period: StudyPeriod; startAt: number } =>
        candidate.startAt != null && candidate.startAt > nowMs
    )
    .sort((first, second) => first.startAt - second.startAt)[0];
  if (!next) return null;

  const minutes = Math.max(0, Math.ceil((next.startAt - nowMs) / 60000));
  const priority: StudyInfoPriority =
    minutes <= 5 ? "critical" : minutes <= 15 ? "timely" : "routine";
  const primaryText = next.period.name;
  const secondaryText = minutes <= 5 ? "即将开始" : `${formatMinutes(minutes)}后开始`;
  const ariaText = `${primaryText}，${secondaryText}`;
  return {
    id: `next-schedule:${next.period.id}`,
    source: "nextSchedule",
    priority,
    displayMode: priority === "critical" ? "interrupt" : "rotating",
    primaryText,
    secondaryText,
    ariaText,
    eventAt: next.startAt,
    expiresAt: next.startAt,
    dedupeKey: `next-schedule:${next.period.id}:${next.startAt}`,
    order: config.order,
  };
}

function buildRainSignal(
  weather: StudyInfoWeatherSnapshot | undefined,
  nowMs: number,
  config: StudyInfoItemConfig
): StudyInfoSignal | null {
  if (!weather || weather.stale || (weather.freshness && weather.freshness !== "fresh"))
    return null;
  const stats = weather.stats;
  if (stats?.hasReliableTimestamps === false) return null;
  const phase = String(
    weather.phase ?? (stats?.isRainingNow ? "raining" : stats?.hasRain ? "preRain" : "unknown")
  )
    .toLowerCase()
    .replace(/_/g, "");
  if (phase !== "raining" && phase !== "prerain") return null;

  const intensity = weather.intensityLabel ?? stats?.intensityLabel ?? "下雨";
  const rainStartAt = weather.rainStartAt ?? stats?.rainStartAt ?? stats?.nextRainStartAt;
  const rainEndAt = weather.rainEndAt ?? stats?.rainEndAt;
  const leadMinutes =
    rainStartAt != null
      ? (rainStartAt - nowMs) / 60000
      : (weather.leadMinutes ?? stats?.leadMinutes ?? null);
  const remainingMinutes =
    rainEndAt != null
      ? (rainEndAt - nowMs) / 60000
      : (weather.remainingMinutes ?? stats?.remainingMinutes ?? null);
  const durationMinutes = weather.durationMinutes ?? stats?.durationMinutes;
  let primaryText: string;
  let secondaryText: string | undefined;
  let eventAt: number | undefined;
  let expiresAt: number | undefined;
  let priority: StudyInfoPriority;

  if (phase === "raining") {
    priority = "critical";
    eventAt = rainStartAt ?? undefined;
    expiresAt = rainEndAt ?? undefined;
    primaryText = `正在${intensity}`;
    secondaryText =
      remainingMinutes != null && remainingMinutes > 0
        ? `预计还剩 ${formatMinutes(remainingMinutes)}`
        : "未来两小时仍可能有雨";
  } else {
    if (leadMinutes == null || rainStartAt == null) return null;
    const safeLead = Math.max(0, Math.ceil(leadMinutes));
    if (safeLead > 30) return null;
    priority = safeLead <= 10 ? "critical" : "timely";
    eventAt = rainStartAt ?? nowMs + safeLead * 60000;
    expiresAt = rainEndAt ?? undefined;
    primaryText = `预计 ${formatMinutes(safeLead)}后下雨`;
    secondaryText =
      durationMinutes != null ? `预计持续 ${formatMinutes(durationMinutes)}` : undefined;
  }

  const ariaText = [primaryText, secondaryText].filter(Boolean).join("，");

  return {
    id: `rain:${rainStartAt ?? "active"}`,
    source: "rain",
    priority,
    displayMode: priority === "critical" ? "interrupt" : "rotating",
    primaryText,
    secondaryText,
    ariaText,
    eventAt,
    expiresAt,
    // 同一阶段保持稳定，开始下雨时切换一次键，让读屏播报状态变化。
    dedupeKey: `rain:${rainStartAt ?? "active"}:${rainEndAt ?? "unknown"}:${phase}`,
    order: config.order,
  };
}

function priorityRank(priority: StudyInfoPriority): number {
  return priority === "critical" ? 0 : priority === "timely" ? 1 : 2;
}

/**
 * 根据当前状态生成标准化信息信号。该函数无副作用，便于在设置页预览和单元测试中复用。
 */
export function resolveStudyInfoSignals(params: {
  now: Date | number;
  progress: StudyInfoProgressSnapshot;
  schedule?: StudyPeriod[];
  weather?: StudyInfoWeatherSnapshot;
  settings?: StudyInfoCarouselSettings;
}): StudyInfoSignal[] {
  const nowMs = typeof params.now === "number" ? params.now : params.now.getTime();
  const items = resolveConfigItems(params.settings);
  const signals: StudyInfoSignal[] = [];
  const progressConfig = isEnabled(items, "progress");
  if (progressConfig) {
    const signal = buildProgressSignal(params.progress, progressConfig);
    if (signal) signals.push(signal);
  }

  const scheduleConfig = isEnabled(items, "nextSchedule");
  if (scheduleConfig && params.schedule) {
    const signal = buildNextScheduleSignal(params.schedule, nowMs, scheduleConfig);
    if (signal) signals.push(signal);
  }

  const rainConfig = isEnabled(items, "rain");
  if (rainConfig) {
    const signal = buildRainSignal(params.weather, nowMs, rainConfig);
    if (signal) signals.push(signal);
  }

  for (const item of items.filter(
    (candidate) => candidate.source === "custom" && candidate.enabled && candidate.text
  )) {
    signals.push({
      id: item.id,
      source: "custom",
      priority: "routine",
      displayMode: "rotating",
      primaryText: item.text as string,
      ariaText: item.text as string,
      dedupeKey: `custom:${item.id}:${item.text}`,
      order: item.order,
    });
  }

  return signals
    .filter((signal) => signal.expiresAt == null || signal.expiresAt > nowMs)
    .filter(
      (signal, index, all) =>
        all.findIndex((candidate) => candidate.dedupeKey === signal.dedupeKey) === index
    )
    .sort((first, second) => {
      const priorityDifference = priorityRank(first.priority) - priorityRank(second.priority);
      if (priorityDifference) return priorityDifference;
      const eventDifference =
        first.priority === "routine"
          ? 0
          : (first.eventAt ?? Number.MAX_SAFE_INTEGER) -
            (second.eventAt ?? Number.MAX_SAFE_INTEGER);
      return (
        eventDifference ||
        (first.order ?? 0) - (second.order ?? 0) ||
        first.id.localeCompare(second.id)
      );
    })
    .slice(0, MAX_STUDY_INFO_ITEMS);
}

/** 兼容“信息条目”命名的别名，供设置预览和后续来源扩展复用。 */
export const resolveStudyInfoItems = resolveStudyInfoSignals;
