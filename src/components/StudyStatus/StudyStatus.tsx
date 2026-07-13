import React, { useCallback, useEffect, useState } from "react";

import { useComponentAppearance } from "../../contexts/AppearanceContext";
import { DEFAULT_SCHEDULE, StudyPeriod } from "../../types/studySchedule";
import { logger } from "../../utils/logger";
import { subscribeSettingsEvent, SETTINGS_EVENTS } from "../../utils/settingsEvents";
import { readStudySchedule } from "../../utils/studyScheduleStorage";
import { getAdjustedDate } from "../../utils/timeSync";

import { StudyStatusPresentation } from "./StudyStatusPresentation";

// 当前状态类型
export type StudyStatusType = {
  isInClass: boolean;
  currentPeriod: StudyPeriod | null;
  progress: number; // 0-100
  remainingSeconds: number;
  stageText: string;
  statusText: string;
};

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

      return {
        isInClass: true,
        currentPeriod: period,
        progress,
        remainingSeconds: Math.max(0, endSeconds - currentSeconds),
        stageText: getProgressStage(progress, true),
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

      return {
        isInClass: false,
        currentPeriod,
        progress,
        remainingSeconds: Math.max(0, nextStartSeconds - currentSeconds),
        stageText: getProgressStage(progress, false),
        statusText: `${currentPeriod.name} 下课`,
      };
    }
  }

  return {
    isInClass: false,
    currentPeriod: null,
    progress: 0,
    remainingSeconds: 0,
    stageText: "",
    statusText: "未在自习时间",
  };
}

interface StudyStatusProps {
  // 移除onSettingsClick，设置功能已整合到统一设置面板
}

/**
 * 智能自习状态管理组件
 * 功能：显示当前自习状态和进度条
 */
const StudyStatus: React.FC<StudyStatusProps> = () => {
  const containerAppearance = useComponentAppearance("studyStatus", "surface", {
    kind: "surface",
  });
  const labelAppearance = useComponentAppearance("studyStatus", "label");
  const progressAppearance = useComponentAppearance("studyStatus", "progress");
  const fillAppearance = useComponentAppearance("studyStatus", "fill", { kind: "surface" });
  const [schedule, setSchedule] = useState<StudyPeriod[]>(DEFAULT_SCHEDULE);
  const [currentStatus, setCurrentStatus] = useState<StudyStatusType>({
    isInClass: false,
    currentPeriod: null,
    progress: 0,
    remainingSeconds: 0,
    stageText: "",
    statusText: "未在自习时间",
  });

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

  const calculateStatusForSchedule = useCallback(
    (targetSchedule: StudyPeriod[]): StudyStatusType => {
      return calculateStudyStatus(targetSchedule, getAdjustedDate());
    },
    []
  );

  /**
   * 计算当前状态
   */
  const calculateCurrentStatus = useCallback((): StudyStatusType => {
    return calculateStatusForSchedule(schedule);
  }, [schedule, calculateStatusForSchedule]);

  /**
   * 加载课程表（函数级注释：优先从 AppSettings 读取，读取失败则回退默认课程表）
   */
  const loadSchedule = useCallback(() => {
    try {
      const data = readStudySchedule();
      if (Array.isArray(data) && data.length > 0) {
        const next = normalizeSchedule(data);
        setSchedule(next);
        setCurrentStatus(calculateStatusForSchedule(next));
        return;
      }
    } catch (error) {
      logger.error("加载课程表失败:", error);
    }
    // 如果加载失败或没有保存的数据，使用默认课程表
    setSchedule(DEFAULT_SCHEDULE);
    setCurrentStatus(calculateStatusForSchedule(DEFAULT_SCHEDULE));
  }, [normalizeSchedule, calculateStatusForSchedule]);

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

  // 每秒更新状态
  useEffect(() => {
    const updateStatus = () => {
      setCurrentStatus(calculateCurrentStatus());
    };

    // 立即更新一次
    updateStatus();

    // 设置定时器每秒更新
    const interval = setInterval(updateStatus, 1000);

    return () => clearInterval(interval);
  }, [calculateCurrentStatus]);

  const roundedProgress = Math.round(currentStatus.progress);
  const hasProgress = currentStatus.currentPeriod !== null;
  const remainingTimeText = formatRemainingTime(currentStatus.remainingSeconds);

  return (
    <StudyStatusPresentation
      fillAttributes={{ style: fillAppearance }}
      labelAttributes={{ style: labelAppearance }}
      progress={currentStatus.progress}
      progressAttributes={{ style: progressAppearance }}
      progressText={`${roundedProgress}%`}
      remainingTimeText={hasProgress ? remainingTimeText : undefined}
      rootAttributes={{
        "aria-label": `${currentStatus.statusText}进度`,
        "aria-valuemax": 100,
        "aria-valuemin": 0,
        "aria-valuenow": roundedProgress,
        "aria-valuetext": hasProgress
          ? `${currentStatus.stageText}，${remainingTimeText}`
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
