import { useEffect, useRef, useState } from "react";
import type { HTMLAttributes, KeyboardEvent } from "react";

import { AppIcon, type AppIconName } from "../../ui";
import { classNames } from "../../utils/classNames";
import type { PresentationAttributes } from "../PresentationContent";

import type { StudyInfoSignal } from "./studyInfoSignals";
import styles from "./StudyStatus.module.css";

interface StudyStatusPresentationProps {
  fillAttributes?: PresentationAttributes<HTMLAttributes<HTMLDivElement>>;
  labelAttributes?: PresentationAttributes<HTMLAttributes<HTMLDivElement>>;
  progress: number;
  progressAttributes?: PresentationAttributes<HTMLAttributes<HTMLSpanElement>>;
  progressText: string;
  remainingTimeText?: string;
  rootAttributes?: PresentationAttributes<HTMLAttributes<HTMLDivElement>>;
  stageText?: string;
  statusText: string;
  hasProgress?: boolean;
  showProgressMeta?: boolean;
  infoCanAdvance?: boolean;
  infoSignal?: StudyInfoSignal | null;
  infoSignalManaged?: boolean;
  onInfoNext?: () => void;
  onInfoPauseChange?: (paused: boolean) => void;
}

export function StudyStatusPresentation({
  fillAttributes,
  labelAttributes,
  progress,
  progressAttributes,
  progressText,
  remainingTimeText,
  rootAttributes,
  stageText,
  statusText,
  hasProgress,
  showProgressMeta,
  infoCanAdvance = false,
  infoSignal,
  infoSignalManaged = false,
  onInfoNext,
  onInfoPauseChange,
}: StudyStatusPresentationProps) {
  const {
    className: rootClassName,
    role: progressRole,
    "aria-label": progressAriaLabel,
    "aria-valuemax": progressAriaValueMax,
    "aria-valuemin": progressAriaValueMin,
    "aria-valuenow": progressAriaValueNow,
    "aria-valuetext": progressAriaValueText,
    ...rootProps
  } = rootAttributes ?? {};
  const { className: fillClassName, style: fillStyle, ...fillProps } = fillAttributes ?? {};
  const { className: labelClassName, ...labelProps } = labelAttributes ?? {};
  const { className: progressClassName, ...progressProps } = progressAttributes ?? {};
  const showRhythm = Boolean(stageText && remainingTimeText);
  const shouldShowProgressMeta = showProgressMeta ?? hasProgress ?? showRhythm;
  const infoPrimaryText = infoSignalManaged
    ? infoSignal?.primaryText
    : (infoSignal?.primaryText ?? stageText);
  const infoSecondaryText = infoSignalManaged
    ? infoSignal?.secondaryText
    : (infoSignal?.secondaryText ?? remainingTimeText);
  const showInfo = Boolean(infoPrimaryText || infoSecondaryText);
  const infoAriaText =
    infoSignal?.ariaText ?? [infoPrimaryText, infoSecondaryText].filter(Boolean).join("，");
  const infoIcon: AppIconName =
    infoSignal?.source === "rain"
      ? "feature.weatherPrecipitation"
      : infoSignal?.source === "weatherAlert"
        ? "feature.weatherAlerts"
        : infoSignal?.source === "nextSchedule"
          ? "feature.event"
          : infoSignal?.source === "custom"
            ? "feature.message"
            : "feature.progress";
  const infoInteractive = Boolean(infoCanAdvance && onInfoNext);
  const showInfoRegion = showInfo || infoSignalManaged;
  const infoControlLabel = showInfo
    ? infoAriaText || undefined
    : infoInteractive
      ? "切换中央信息"
      : undefined;

  // 同一事件保留稳定键，倒计时更新不会重复播报或重播切换动画。
  const liveKey = infoSignal
    ? `${infoSignal.frameId}:${infoSignal.dedupeKey}:${infoSignal.priority}`
    : "legacy";
  const previousLiveKeyRef = useRef<string>("");
  const infoHoveredRef = useRef(false);
  const infoFocusedRef = useRef(false);
  const [liveText, setLiveText] = useState("");

  useEffect(() => {
    if (!infoAriaText || previousLiveKeyRef.current === liveKey) return;
    previousLiveKeyRef.current = liveKey;
    setLiveText(infoAriaText);
  }, [infoAriaText, liveKey]);

  const handleInfoKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!infoInteractive || !onInfoNext || (event.key !== "Enter" && event.key !== " ")) return;
    event.preventDefault();
    onInfoNext();
  };

  return (
    <div {...rootProps} className={classNames(styles.studyStatus, rootClassName)}>
      <div
        className={styles.progressSemantics}
        role={progressRole}
        aria-label={progressAriaLabel}
        aria-valuemax={progressAriaValueMax}
        aria-valuemin={progressAriaValueMin}
        aria-valuenow={progressAriaValueNow}
        aria-valuetext={progressAriaValueText}
      />
      <div
        {...fillProps}
        className={classNames(styles.progressFill, fillClassName)}
        style={{ ...fillStyle, width: `${progress}%` }}
      />
      <div className={styles.statusRow}>
        <div {...labelProps} className={classNames(styles.statusText, labelClassName)}>
          {statusText}
        </div>
        {showInfoRegion ? (
          <div
            className={classNames(
              styles.progressRhythm,
              infoInteractive && styles.progressRhythmInteractive
            )}
            role={infoInteractive ? "button" : undefined}
            tabIndex={infoInteractive ? 0 : undefined}
            aria-label={infoControlLabel}
            title={infoControlLabel}
            onClick={infoInteractive ? onInfoNext : undefined}
            onKeyDown={handleInfoKeyDown}
            onMouseEnter={() => {
              infoHoveredRef.current = true;
              onInfoPauseChange?.(true);
            }}
            onMouseLeave={() => {
              infoHoveredRef.current = false;
              onInfoPauseChange?.(infoFocusedRef.current);
            }}
            onFocus={() => {
              infoFocusedRef.current = true;
              onInfoPauseChange?.(true);
            }}
            onBlur={() => {
              infoFocusedRef.current = false;
              onInfoPauseChange?.(infoHoveredRef.current);
            }}
          >
            {showInfo ? (
              <span key={liveKey} className={styles.infoContent}>
                <AppIcon className={styles.infoIcon} name={infoIcon} />
                <span className={styles.infoCopy}>
                  <span className={styles.stageText}>{infoPrimaryText}</span>
                  {infoSecondaryText ? (
                    <>
                      <span className={styles.rhythmSeparator} aria-hidden="true">
                        ·
                      </span>
                      <span className={styles.remainingTime}>{infoSecondaryText}</span>
                    </>
                  ) : null}
                </span>
              </span>
            ) : null}
          </div>
        ) : null}
        {shouldShowProgressMeta ? (
          <span {...progressProps} className={classNames(styles.progressMeta, progressClassName)}>
            {progressText}
          </span>
        ) : null}
      </div>
      {showInfo ? (
        <span className={styles.liveRegion} role="status" aria-live="polite" aria-atomic="true">
          {liveText}
        </span>
      ) : null}
    </div>
  );
}
