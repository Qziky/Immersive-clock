import React, { useCallback } from "react";

import { STOPWATCH_TICK_MS } from "../../constants/timer";
import { useAppState, useAppDispatch } from "../../contexts/AppContext";
import { useComponentAppearance } from "../../contexts/AppearanceContext";
import { useAccumulatingTimer } from "../../hooks/useTimer";
import { formatStopwatch } from "../../utils/formatTime";

import { StopwatchPresentation } from "./StopwatchPresentation";

/**
 * 秒表组件
 * 显示秒表时间，支持启动、暂停、重置功能
 * 使用高频计时器确保精确计时
 */
export function Stopwatch() {
  const { stopwatch } = useAppState();
  const dispatch = useAppDispatch();

  /**
   * 秒表递增处理函数
   */
  const handleTick = useCallback(
    (count: number) => {
      // 一次性派发补偿量，减少多次 dispatch
      dispatch({ type: "TICK_STOPWATCH_BY", payload: count });
    },
    [dispatch]
  );

  // 使用累积计时器：按10ms间隔计算应触发次数，一次性派发
  useAccumulatingTimer(handleTick, stopwatch.isActive, STOPWATCH_TICK_MS);

  const timeString = formatStopwatch(stopwatch.elapsedTime);
  const totalSeconds = Math.floor(stopwatch.elapsedTime / 1000);
  const isLongDuration = totalSeconds >= 3600; // 1小时以上
  const appearanceState = stopwatch.isActive ? "running" : "paused";
  const timeAppearance = useComponentAppearance("stopwatch", "time", {
    state: appearanceState,
  });
  const statusAppearance = useComponentAppearance("stopwatch", "status", { state: "paused" });
  const milestoneAppearance = useComponentAppearance("stopwatch", "milestone");
  const containerAppearance = useComponentAppearance("stopwatch", "surface", { kind: "surface" });

  return (
    <StopwatchPresentation
      active={stopwatch.isActive}
      milestoneAttributes={{ style: milestoneAppearance }}
      placeholderAttributes={{ style: timeAppearance }}
      rootAttributes={{ style: containerAppearance }}
      showMilestone={isLongDuration}
      showPausedStatus={stopwatch.elapsedTime > 0 && !stopwatch.isActive}
      showPlaceholder={stopwatch.elapsedTime === 0}
      statusAttributes={{ style: statusAppearance }}
      timeAttributes={{ "aria-live": "polite", style: timeAppearance }}
      timeText={timeString}
    />
  );
}
