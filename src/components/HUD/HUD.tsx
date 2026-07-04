import React from "react";

import { useAppState } from "../../contexts/AppContext";
import type { AppMode } from "../../types";
import { ControlBar } from "../ControlBar/ControlBar";
import { ModeSelector } from "../ModeSelector/ModeSelector";

import styles from "./HUD.module.css";

/**
 * HUD (Heads-Up Display) 组件
 * 显示模式选择器和控制栏，支持淡入淡出动画
 */
interface HUDProps {
  onModeChange?: (mode: AppMode) => void;
}

export function HUD({ onModeChange }: HUDProps) {
  const { isHudVisible } = useAppState();

  return (
    <section
      className={`${styles.hud} ${isHudVisible ? styles.visible : styles.hidden}`}
      aria-hidden={!isHudVisible}
      aria-label="HUD 控制面板"
    >
      <div className={styles.hudContent}>
        <div className={styles.topSection}>
          <ModeSelector onModeChange={onModeChange} />
        </div>

        <div className={styles.bottomSection}>
          <ControlBar />
        </div>
      </div>
    </section>
  );
}
