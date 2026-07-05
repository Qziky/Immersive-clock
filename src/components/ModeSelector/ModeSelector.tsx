import {
  BookOpen as StudyIcon,
  Clock as ClockIcon,
  Timer as CountdownIcon,
  TimerReset as WatchIcon,
} from "lucide-react";
import React, { useCallback } from "react";

import { useAppDispatch, useAppState } from "../../contexts/AppContext";
import type { AppMode } from "../../types";
import { Tabs } from "../../ui";

import styles from "./ModeSelector.module.css";

interface ModeSelectorProps {
  onModeChange?: (mode: AppMode) => void;
}

/**
 * 模式选择器组件
 * 提供时钟、倒计时、秒表、自习四种模式的切换
 */
export function ModeSelector({ onModeChange }: ModeSelectorProps) {
  const { mode } = useAppState();
  const dispatch = useAppDispatch();

  /**
   * 处理模式切换
   * @param newMode 新模式
   */
  const handleModeChange = useCallback(
    (newMode: AppMode) => {
      if (onModeChange) {
        onModeChange(newMode);
        return;
      }
      if (newMode !== mode) {
        dispatch({ type: "SET_MODE", payload: newMode });
      }
    },
    [dispatch, mode, onModeChange]
  );

  const modes = [
    {
      key: "clock" as AppMode,
      label: "时钟",
      icon: ClockIcon,
      description: "显示当前时间",
    },
    {
      key: "countdown" as AppMode,
      label: "倒计时",
      icon: CountdownIcon,
      description: "设置倒计时",
    },
    {
      key: "stopwatch" as AppMode,
      label: "秒表",
      icon: WatchIcon,
      description: "秒表功能",
    },
    {
      key: "study" as AppMode,
      label: "自习",
      icon: StudyIcon,
      description: "自习模式",
    },
  ];

  return (
    <Tabs<AppMode>
      id="tour-mode-selector"
      className={styles.modeSelector}
      value={mode}
      label="选择时钟模式"
      variant="underlined"
      scrollable={false}
      onChange={handleModeChange}
      items={modes.map(({ key, label, icon: Icon, description }) => ({
        value: key,
        id: key === "study" ? "mode-tab-study" : undefined,
        className: styles.modeButton,
        ariaControls: `${key}-panel`,
        ariaLabel: `${label} - ${description}`,
        title: description,
        icon: <Icon className={styles.icon} size={20} aria-hidden={true} />,
        label: <span className={styles.label}>{label}</span>,
      }))}
    />
  );
}
