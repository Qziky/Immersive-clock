import React, { useCallback } from "react";

import { useAppDispatch, useAppState } from "../../contexts/AppContext";
import type { AppMode } from "../../types";
import { Tabs, type AppIconName } from "../../ui";

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
      icon: "mode.clock" as AppIconName,
      description: "显示当前时间",
    },
    {
      key: "countdown" as AppMode,
      label: "倒计时",
      icon: "mode.countdown" as AppIconName,
      description: "设置倒计时",
    },
    {
      key: "stopwatch" as AppMode,
      label: "秒表",
      icon: "mode.stopwatch" as AppIconName,
      description: "秒表功能",
    },
    {
      key: "study" as AppMode,
      label: "自习",
      icon: "mode.study" as AppIconName,
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
      size="lg"
      scrollable={false}
      onChange={handleModeChange}
      items={modes.map(({ key, label, icon, description }) => ({
        value: key,
        id: key === "study" ? "mode-tab-study" : undefined,
        className: styles.modeButton,
        ariaControls: `${key}-panel`,
        ariaLabel: `${label} - ${description}`,
        title: description,
        icon,
        label: <span className={styles.label}>{label}</span>,
      }))}
    />
  );
}
