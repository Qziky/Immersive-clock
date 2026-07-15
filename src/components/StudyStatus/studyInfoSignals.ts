import type {
  StudyInfoCarouselSettings,
  StudyInfoItemConfig,
  StudyInfoSource,
  StudyProgressKind,
} from "../../types";
import type { StudyPeriod } from "../../types/studySchedule";
import {
  getDefaultStudyInfoCarousel,
  MAX_STUDY_INFO_ITEMS as MAX_PERSISTED_STUDY_INFO_ITEMS,
  normalizeStudyInfoCarousel as normalizePersistedStudyInfoCarousel,
} from "../../utils/appSettings";
import type { MinutelyRainStats } from "../../utils/minutelyPrecipLogic";

export type {
  StudyInfoCarouselSettings,
  StudyInfoItemConfig,
  StudyInfoSource,
  StudyProgressKind,
} from "../../types";

/** 用户配置只保存来源和顺序，优先级由运行时状态决定。 */
export type StudyInfoPriority = "critical" | "timely" | "routine";

export type StudyInfoDisplayMode = "interrupt" | "rotating";

export interface StudyInfoSignal {
  /** 持久化配置项 ID；天气和课程事件变化不会改变当前轮播位置。 */
  itemId: string;
  source: StudyInfoSource;
  progressKind: StudyProgressKind;
  priority: StudyInfoPriority;
  displayMode: StudyInfoDisplayMode;
  primaryText: string;
  secondaryText?: string;
  ariaText: string;
  eventAt?: number;
  expiresAt?: number;
  /** 事件身份仅用于切换动画和读屏去重。 */
  dedupeKey: string;
  /** 配置顺序只用于信号稳定排序，不需要额外持久化。 */
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

type ProgressItemConfig = Extract<StudyInfoItemConfig, { source: "progress" }>;
type NextScheduleItemConfig = Extract<StudyInfoItemConfig, { source: "nextSchedule" }>;
type RainItemConfig = Extract<StudyInfoItemConfig, { source: "rain" }>;
type CustomItemConfig = Extract<StudyInfoItemConfig, { source: "custom" }>;

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

function sortEnabledItems(items: StudyInfoItemConfig[]): StudyInfoItemConfig[] {
  return items
    .filter((item) => item.enabled)
    .sort((first, second) => first.order - second.order || first.id.localeCompare(second.id));
}

export function getStudyInfoItemProgressKind(item: StudyInfoItemConfig): StudyProgressKind {
  return item.source === "progress" ? item.progressKind : item.backgroundProgressKind;
}

function buildProgressSignal(
  progress: StudyInfoProgressSnapshot,
  config: ProgressItemConfig
): StudyInfoSignal {
  const primaryText = progress.hasProgress ? progress.stageText || progress.statusText : "";
  const secondaryText = progress.hasProgress ? progress.remainingTimeText : undefined;
  const ariaText = progress.hasProgress
    ? [progress.stageAriaText || primaryText, secondaryText].filter(Boolean).join("，")
    : progress.statusText;

  return {
    itemId: config.id,
    source: "progress",
    progressKind: config.progressKind,
    priority: "routine",
    displayMode: "rotating",
    primaryText,
    secondaryText,
    ariaText,
    dedupeKey: `progress:${config.progressKind}:${progress.statusText}:${primaryText}`,
    order: config.order,
  };
}

function buildNextScheduleSignal(
  schedule: StudyPeriod[],
  nowMs: number,
  config: NextScheduleItemConfig
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
  if (config.leadMinutes !== "always" && minutes > config.leadMinutes) return null;

  const priority: StudyInfoPriority =
    minutes <= 5 ? "critical" : minutes <= 15 ? "timely" : "routine";
  const primaryText = next.period.name;
  const secondaryText = minutes <= 5 ? "即将开始" : `${formatMinutes(minutes)}后开始`;

  return {
    itemId: config.id,
    source: "nextSchedule",
    progressKind: config.backgroundProgressKind,
    priority,
    displayMode: priority === "critical" ? "interrupt" : "rotating",
    primaryText,
    secondaryText,
    ariaText: `${primaryText}，${secondaryText}`,
    eventAt: next.startAt,
    expiresAt: next.startAt,
    dedupeKey: `next-schedule:${next.period.id}:${next.startAt}`,
    order: config.order,
  };
}

function buildRainSignal(
  weather: StudyInfoWeatherSnapshot | undefined,
  nowMs: number,
  config: RainItemConfig
): StudyInfoSignal | null {
  if (!weather || weather.stale || (weather.freshness && weather.freshness !== "fresh")) {
    return null;
  }
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
    if (safeLead > config.leadMinutes) return null;
    priority = safeLead <= 10 ? "critical" : "timely";
    eventAt = rainStartAt;
    expiresAt = rainEndAt ?? undefined;
    primaryText = `预计 ${formatMinutes(safeLead)}后下雨`;
    secondaryText =
      durationMinutes != null ? `预计持续 ${formatMinutes(durationMinutes)}` : undefined;
  }

  return {
    itemId: config.id,
    source: "rain",
    progressKind: config.backgroundProgressKind,
    priority,
    displayMode: priority === "critical" ? "interrupt" : "rotating",
    primaryText,
    secondaryText,
    ariaText: [primaryText, secondaryText].filter(Boolean).join("，"),
    eventAt,
    expiresAt,
    // 同一阶段保持稳定，开始下雨时切换一次键，让读屏播报状态变化。
    dedupeKey: `rain:${rainStartAt ?? "active"}:${rainEndAt ?? "unknown"}:${phase}`,
    order: config.order,
  };
}

function buildCustomSignal(config: CustomItemConfig): StudyInfoSignal | null {
  if (!config.text) return null;
  return {
    itemId: config.id,
    source: "custom",
    progressKind: config.backgroundProgressKind,
    priority: "routine",
    displayMode: "rotating",
    primaryText: config.text,
    ariaText: config.text,
    dedupeKey: `custom:${config.id}:${config.text}`,
    order: config.order,
  };
}

function sortSignals(first: StudyInfoSignal, second: StudyInfoSignal): number {
  const firstCritical = first.priority === "critical";
  const secondCritical = second.priority === "critical";
  if (firstCritical !== secondCritical) return firstCritical ? -1 : 1;

  const eventDifference =
    firstCritical && secondCritical
      ? (first.eventAt ?? Number.MAX_SAFE_INTEGER) - (second.eventAt ?? Number.MAX_SAFE_INTEGER)
      : 0;
  return (
    eventDifference ||
    (first.order ?? 0) - (second.order ?? 0) ||
    first.itemId.localeCompare(second.itemId)
  );
}

/**
 * 根据当前状态生成标准化信息信号。条件提示没有内容时不会进入实际轮播队列。
 */
export function resolveStudyInfoSignals(params: {
  now: Date | number;
  progress: Record<StudyProgressKind, StudyInfoProgressSnapshot>;
  schedule?: StudyPeriod[];
  weather?: StudyInfoWeatherSnapshot;
  settings?: StudyInfoCarouselSettings;
}): StudyInfoSignal[] {
  const nowMs = typeof params.now === "number" ? params.now : params.now.getTime();
  const items = sortEnabledItems(resolveConfigItems(params.settings));
  const signals: StudyInfoSignal[] = [];

  for (const item of items) {
    let signal: StudyInfoSignal | null = null;
    switch (item.source) {
      case "progress":
        signal = buildProgressSignal(params.progress[item.progressKind], item);
        break;
      case "nextSchedule":
        signal = params.schedule ? buildNextScheduleSignal(params.schedule, nowMs, item) : null;
        break;
      case "rain":
        signal = buildRainSignal(params.weather, nowMs, item);
        break;
      case "custom":
        signal = buildCustomSignal(item);
        break;
    }
    if (signal) signals.push(signal);
  }

  return signals
    .filter((signal) => signal.expiresAt == null || signal.expiresAt > nowMs)
    .filter(
      (signal, index, all) =>
        all.findIndex((candidate) => candidate.itemId === signal.itemId) === index
    )
    .sort(sortSignals)
    .slice(0, MAX_STUDY_INFO_ITEMS);
}

/** 当配置非空但条件提示均无内容时，为首项保留其背景进度。 */
export function resolveStudyInfoStandbySignal(
  settings: StudyInfoCarouselSettings | undefined
): StudyInfoSignal | null {
  const firstItem = sortEnabledItems(resolveConfigItems(settings))[0];
  if (!firstItem) return null;

  return {
    itemId: firstItem.id,
    source: firstItem.source,
    progressKind: getStudyInfoItemProgressKind(firstItem),
    priority: "routine",
    displayMode: "rotating",
    primaryText: "",
    ariaText: "",
    dedupeKey: `standby:${firstItem.id}`,
    order: firstItem.order,
  };
}

/** 兼容“信息条目”命名的别名，供设置预览和后续来源扩展复用。 */
export const resolveStudyInfoItems = resolveStudyInfoSignals;
