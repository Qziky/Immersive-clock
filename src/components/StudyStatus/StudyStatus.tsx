import React, { useCallback, useEffect, useMemo, useState } from "react";

import { useComponentAppearance } from "../../contexts/AppearanceContext";
import { useMinutelyWeatherSnapshot } from "../../hooks/useMinutelyWeatherSnapshot";
import type { StudyInfoCarouselSettings, StudyProgressKind } from "../../types";
import { DEFAULT_SCHEDULE } from "../../types/studySchedule";
import type { StudyPeriod } from "../../types/studySchedule";
import { getAppSettings, getDefaultStudyInfoCarousel } from "../../utils/appSettings";
import { logger } from "../../utils/logger";
import { subscribeSettingsEvent, SETTINGS_EVENTS } from "../../utils/settingsEvents";
import { readStudySchedule } from "../../utils/studyScheduleStorage";
import { getAdjustedDate } from "../../utils/timeSync";

import { getDayGreeting } from "./dayGreeting";
import {
  resolveStudyInfoSignals,
  resolveStudyInfoStandbySignal,
  type StudyInfoWeatherSnapshot,
} from "./studyInfoSignals";
import { StudyStatusPresentation } from "./StudyStatusPresentation";
import { useStudyInfoCarousel } from "./useStudyInfoCarousel";

// 当前状态类型
export type StudyStatusType = {
  isInClass: boolean;
  currentPeriod: StudyPeriod | null;
  hasProgress: boolean;
  progress: number; // 0-100
  remainingSeconds: number;
  stageAriaText: string;
  stageText: string;
  statusText: string;
};

export interface StudyProgressSnapshot {
  kind: StudyProgressKind;
  status: StudyStatusType;
  progress: number;
  displayedProgress: number;
  progressText: string;
  remainingTimeText?: string;
  stageText?: string;
  statusText: string;
  progressLabel: string;
  ariaValueText: string;
}

const SECONDS_PER_DAY = 24 * 60 * 60;

function timeStringToSeconds(timeString: string): number {
  const [hours, minutes] = timeString.split(":").map(Number);
  return hours * 60 * 60 + minutes * 60;
}

export function getProgressStage(progress: number, isInClass: boolean): string {
  if (!isInClass) {
    if (progress < 50) return "放松一下";
    if (progress < 80) return "准备回来";
    return "即将开始";
  }

  if (progress < 25) return "进入状态";
  if (progress < 50) return "渐入佳境";
  if (progress < 75) return "保持专注";
  if (progress < 90) return "稳定推进";
  return "准备收尾";
}

export function formatRemainingTime(remainingSeconds: number): string {
  const safeSeconds = Math.max(0, Math.ceil(remainingSeconds));
  if (safeSeconds === 0) return "即将结束";
  if (safeSeconds < 60) return `还剩 ${safeSeconds} 秒`;

  const remainingMinutes = Math.ceil(safeSeconds / 60);
  if (remainingMinutes < 60) return `还剩 ${remainingMinutes} 分钟`;

  const hours = Math.floor(remainingMinutes / 60);
  const minutes = remainingMinutes % 60;
  return minutes > 0 ? `还剩 ${hours} 小时 ${minutes} 分钟` : `还剩 ${hours} 小时`;
}

export function calculateDayProgress(now: Date): StudyStatusType {
  const elapsedSeconds = now.getHours() * 60 * 60 + now.getMinutes() * 60 + now.getSeconds();
  const greeting = getDayGreeting(now);

  return {
    isInClass: false,
    currentPeriod: null,
    hasProgress: true,
    progress: (elapsedSeconds / SECONDS_PER_DAY) * 100,
    remainingSeconds: SECONDS_PER_DAY - elapsedSeconds,
    stageAriaText: greeting.ariaText,
    stageText: greeting.text,
    statusText: "今日进度",
  };
}

export function calculateStudyStatus(targetSchedule: StudyPeriod[], now: Date): StudyStatusType {
  const currentSeconds = now.getHours() * 60 * 60 + now.getMinutes() * 60 + now.getSeconds();
  const sortedSchedule = [...targetSchedule].sort(
    (first, second) => timeStringToSeconds(first.startTime) - timeStringToSeconds(second.startTime)
  );

  for (const period of sortedSchedule) {
    const startSeconds = timeStringToSeconds(period.startTime);
    const endSeconds = timeStringToSeconds(period.endTime);

    if (currentSeconds >= startSeconds && currentSeconds <= endSeconds) {
      const totalDuration = endSeconds - startSeconds;
      const elapsed = currentSeconds - startSeconds;
      const progress = Math.min(100, Math.max(0, (elapsed / totalDuration) * 100));
      const stageText = getProgressStage(progress, true);

      return {
        isInClass: true,
        currentPeriod: period,
        hasProgress: true,
        progress,
        remainingSeconds: Math.max(0, endSeconds - currentSeconds),
        stageAriaText: stageText,
        stageText,
        statusText: period.name,
      };
    }
  }

  for (let index = 0; index < sortedSchedule.length - 1; index += 1) {
    const currentPeriod = sortedSchedule[index];
    const currentEndSeconds = timeStringToSeconds(currentPeriod.endTime);
    const nextStartSeconds = timeStringToSeconds(sortedSchedule[index + 1].startTime);

    if (currentSeconds > currentEndSeconds && currentSeconds <= nextStartSeconds) {
      const totalBreakDuration = nextStartSeconds - currentEndSeconds;
      const breakElapsed = currentSeconds - currentEndSeconds;
      const progress = Math.min(100, Math.max(0, (breakElapsed / totalBreakDuration) * 100));
      const stageText = getProgressStage(progress, false);

      return {
        isInClass: false,
        currentPeriod,
        hasProgress: true,
        progress,
        remainingSeconds: Math.max(0, nextStartSeconds - currentSeconds),
        stageAriaText: stageText,
        stageText,
        statusText: `${currentPeriod.name} 下课`,
      };
    }
  }

  return {
    isInClass: false,
    currentPeriod: null,
    hasProgress: false,
    progress: 0,
    remainingSeconds: 0,
    stageAriaText: "",
    stageText: "",
    statusText: "未在自习时间",
  };
}

interface StudyStatusProps {
  /** @deprecated 进度类型现由轮播条目决定，仅为旧调用方保留。 */
  mode?: StudyProgressKind;
}

function readInfoCarouselSettings(): StudyInfoCarouselSettings {
  try {
    return getAppSettings().study.infoCarousel ?? getDefaultStudyInfoCarousel();
  } catch {
    return getDefaultStudyInfoCarousel();
  }
}

export function createProgressSnapshot(
  kind: StudyProgressKind,
  status: StudyStatusType
): StudyProgressSnapshot {
  const displayedProgress =
    kind === "day" ? Math.floor(status.progress) : Math.round(status.progress);
  const remainingTimeText = status.hasProgress
    ? formatRemainingTime(status.remainingSeconds)
    : undefined;
  const ariaValueText = status.hasProgress
    ? [status.stageAriaText, remainingTimeText].filter(Boolean).join("，")
    : status.statusText;

  return {
    kind,
    status,
    progress: status.progress,
    displayedProgress,
    progressText: `${displayedProgress}%`,
    remainingTimeText,
    stageText: status.hasProgress ? status.stageText : undefined,
    statusText: status.statusText,
    progressLabel:
      kind === "day" ? "今日进度" : status.hasProgress ? `${status.statusText}进度` : "课时进度",
    ariaValueText,
  };
}

/** 顶部进度与信息组件：当前信息和其绑定的背景进度始终作为同一帧展示。 */
const StudyStatus: React.FC<StudyStatusProps> = () => {
  const containerAppearance = useComponentAppearance("studyStatus", "surface", {
    kind: "surface",
  });
  const labelAppearance = useComponentAppearance("studyStatus", "label");
  const progressAppearance = useComponentAppearance("studyStatus", "progress");
  const fillAppearance = useComponentAppearance("studyStatus", "fill", { kind: "surface" });
  const [schedule, setSchedule] = useState<StudyPeriod[]>(DEFAULT_SCHEDULE);
  const [currentTime, setCurrentTime] = useState<Date>(getAdjustedDate);
  const [infoCarouselSettings, setInfoCarouselSettings] =
    useState<StudyInfoCarouselSettings>(readInfoCarouselSettings);
  const rainSourceEnabled = infoCarouselSettings.items.some(
    (item) => item.source === "rain" && item.enabled
  );
  const minutelyWeather = useMinutelyWeatherSnapshot(rainSourceEnabled);

  const normalizeSchedule = useCallback((input: StudyPeriod[]): StudyPeriod[] => {
    return input.map((p, index) => {
      const safeName = typeof p.name === "string" ? p.name.trim() : "";
      return {
        ...p,
        id: String(p.id ?? ""),
        startTime: String(p.startTime ?? ""),
        endTime: String(p.endTime ?? ""),
        name: safeName.length > 0 ? safeName : `自定义时段${index + 1}`,
      };
    });
  }, []);

  /**
   * 加载课程表（函数级注释：优先从 AppSettings 读取，读取失败则回退默认课程表）
   */
  const loadSchedule = useCallback(() => {
    try {
      const data = readStudySchedule();
      if (Array.isArray(data) && data.length > 0) {
        const next = normalizeSchedule(data);
        setSchedule(next);
        return;
      }
    } catch (error) {
      logger.error("加载课程表失败:", error);
    }
    // 如果加载失败或没有保存的数据，使用默认课程表
    setSchedule(DEFAULT_SCHEDULE);
  }, [normalizeSchedule]);

  // 组件初始化时加载课程表
  useEffect(() => {
    let settingsSavedTimer: number | undefined;
    loadSchedule();
    setInfoCarouselSettings(readInfoCarouselSettings());
    const offSchedule = subscribeSettingsEvent(SETTINGS_EVENTS.StudyScheduleUpdated, () =>
      loadSchedule()
    );
    const offSaved = subscribeSettingsEvent(SETTINGS_EVENTS.SettingsSaved, () => {
      if (settingsSavedTimer !== undefined) window.clearTimeout(settingsSavedTimer);
      settingsSavedTimer = window.setTimeout(() => {
        settingsSavedTimer = undefined;
        loadSchedule();
        setInfoCarouselSettings(readInfoCarouselSettings());
      }, 0);
    });
    const onStorage = (e: StorageEvent) => {
      if (e.key === "AppSettings" || e.key === "study-schedule" || e.key === "studySchedule") {
        loadSchedule();
        if (e.key === "AppSettings") setInfoCarouselSettings(readInfoCarouselSettings());
      }
    };
    window.addEventListener("storage", onStorage);
    return () => {
      if (settingsSavedTimer !== undefined) window.clearTimeout(settingsSavedTimer);
      offSchedule();
      offSaved();
      window.removeEventListener("storage", onStorage);
    };
  }, [loadSchedule]);

  // 每秒读取一次校准时间，两种进度快照都从同一时刻派生。
  useEffect(() => {
    const interval = setInterval(() => setCurrentTime(getAdjustedDate()), 1000);

    return () => clearInterval(interval);
  }, []);

  const progressSnapshots = useMemo<Record<StudyProgressKind, StudyProgressSnapshot>>(
    () => ({
      day: createProgressSnapshot("day", calculateDayProgress(currentTime)),
      schedule: createProgressSnapshot("schedule", calculateStudyStatus(schedule, currentTime)),
    }),
    [currentTime, schedule]
  );

  const weatherSnapshot = useMemo<StudyInfoWeatherSnapshot | undefined>(() => {
    if (!rainSourceEnabled) return undefined;
    return {
      stats: minutelyWeather.stats,
      freshness: minutelyWeather.freshness,
      sourceUpdatedAt: minutelyWeather.sourceUpdatedAt,
      phase: minutelyWeather.phase ?? "unknown",
      stale: minutelyWeather.stale,
    };
  }, [minutelyWeather, rainSourceEnabled]);

  const infoSignals = useMemo(
    () =>
      resolveStudyInfoSignals({
        now: currentTime,
        progress: {
          day: {
            stageText: progressSnapshots.day.status.stageText,
            stageAriaText: progressSnapshots.day.status.stageAriaText,
            remainingTimeText: progressSnapshots.day.remainingTimeText,
            statusText: progressSnapshots.day.statusText,
            hasProgress: progressSnapshots.day.status.hasProgress,
          },
          schedule: {
            stageText: progressSnapshots.schedule.status.stageText,
            stageAriaText: progressSnapshots.schedule.status.stageAriaText,
            remainingTimeText: progressSnapshots.schedule.remainingTimeText,
            statusText: progressSnapshots.schedule.statusText,
            hasProgress: progressSnapshots.schedule.status.hasProgress,
          },
        },
        schedule,
        weather: weatherSnapshot,
        settings: infoCarouselSettings,
      }),
    [currentTime, infoCarouselSettings, progressSnapshots, schedule, weatherSnapshot]
  );
  const infoCarousel = useStudyInfoCarousel({
    signals: infoSignals,
    intervalSec: infoCarouselSettings.intervalSec,
  });
  const standbySignal = useMemo(
    () => resolveStudyInfoStandbySignal(infoCarouselSettings),
    [infoCarouselSettings]
  );
  const activeSignal = infoCarousel.currentSignal ?? standbySignal;

  if (!activeSignal) return null;

  const activeProgress = progressSnapshots[activeSignal.progressKind];

  return (
    <StudyStatusPresentation
      fillAttributes={{ style: fillAppearance }}
      labelAttributes={{ style: labelAppearance }}
      progress={activeProgress.progress}
      progressAttributes={{ style: progressAppearance }}
      progressText={activeProgress.progressText}
      hasProgress={activeProgress.status.hasProgress}
      showProgressMeta
      remainingTimeText={activeProgress.remainingTimeText}
      rootAttributes={{
        "aria-label": activeProgress.progressLabel,
        "aria-valuemax": 100,
        "aria-valuemin": 0,
        "aria-valuenow": activeProgress.displayedProgress,
        "aria-valuetext": activeProgress.ariaValueText,
        role: "progressbar",
        style: containerAppearance,
      }}
      stageText={activeProgress.stageText}
      statusText={activeProgress.statusText}
      infoCanAdvance={infoCarousel.canAdvance}
      infoSignal={activeSignal}
      infoSignalManaged
      onInfoNext={infoCarousel.next}
      onInfoPauseChange={infoCarousel.setPaused}
    />
  );
};

export default StudyStatus;
