import React, { useCallback, useEffect, useMemo, useState } from "react";

import { useComponentAppearance } from "../../contexts/AppearanceContext";
import type { StudyTimeProgressMode } from "../../types";
import { DEFAULT_SCHEDULE, StudyPeriod } from "../../types/studySchedule";
import { logger } from "../../utils/logger";
import { subscribeSettingsEvent, SETTINGS_EVENTS } from "../../utils/settingsEvents";
import { readStudySchedule } from "../../utils/studyScheduleStorage";
import { getAdjustedDate } from "../../utils/timeSync";

import { getDayGreeting } from "./dayGreeting";
import { StudyStatusPresentation } from "./StudyStatusPresentation";

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
  mode?: StudyTimeProgressMode;
}

/**
 * 计划进度组件
 * 功能：按设置显示今日 24 小时进度或课时进度
 */
const StudyStatus: React.FC<StudyStatusProps> = ({ mode = "day" }) => {
  const containerAppearance = useComponentAppearance("studyStatus", "surface", {
    kind: "surface",
  });
  const labelAppearance = useComponentAppearance("studyStatus", "label");
  const progressAppearance = useComponentAppearance("studyStatus", "progress");
  const fillAppearance = useComponentAppearance("studyStatus", "fill", { kind: "surface" });
  const [schedule, setSchedule] = useState<StudyPeriod[]>(DEFAULT_SCHEDULE);
  const [currentTime, setCurrentTime] = useState<Date>(getAdjustedDate);

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
    loadSchedule();
    const offSchedule = subscribeSettingsEvent(SETTINGS_EVENTS.StudyScheduleUpdated, () =>
      loadSchedule()
    );
    const offSaved = subscribeSettingsEvent(SETTINGS_EVENTS.SettingsSaved, () => loadSchedule());
    const onStorage = (e: StorageEvent) => {
      if (e.key === "AppSettings" || e.key === "study-schedule" || e.key === "studySchedule") {
        loadSchedule();
      }
    };
    window.addEventListener("storage", onStorage);
    return () => {
      offSchedule();
      offSaved();
      window.removeEventListener("storage", onStorage);
    };
  }, [loadSchedule]);

  // 每秒读取一次校准时间，进度由当前模式和课表直接派生。
  useEffect(() => {
    const interval = setInterval(() => setCurrentTime(getAdjustedDate()), 1000);

    return () => clearInterval(interval);
  }, []);

  const currentStatus = useMemo(
    () =>
      mode === "day"
        ? calculateDayProgress(currentTime)
        : calculateStudyStatus(schedule, currentTime),
    [currentTime, mode, schedule]
  );

  const displayedProgress =
    mode === "day" ? Math.floor(currentStatus.progress) : Math.round(currentStatus.progress);
  const hasProgress = currentStatus.hasProgress;
  const remainingTimeText = formatRemainingTime(currentStatus.remainingSeconds);
  const progressLabel = mode === "day" ? "今日进度" : `${currentStatus.statusText}进度`;

  return (
    <StudyStatusPresentation
      fillAttributes={{ style: fillAppearance }}
      labelAttributes={{ style: labelAppearance }}
      progress={currentStatus.progress}
      progressAttributes={{ style: progressAppearance }}
      progressText={`${displayedProgress}%`}
      remainingTimeText={hasProgress ? remainingTimeText : undefined}
      rootAttributes={{
        "aria-label": progressLabel,
        "aria-valuemax": 100,
        "aria-valuemin": 0,
        "aria-valuenow": displayedProgress,
        "aria-valuetext": hasProgress
          ? `${currentStatus.stageAriaText}，${remainingTimeText}`
          : currentStatus.statusText,
        role: "progressbar",
        style: containerAppearance,
      }}
      stageText={hasProgress ? currentStatus.stageText : undefined}
      statusText={currentStatus.statusText}
    />
  );
};

export default StudyStatus;
