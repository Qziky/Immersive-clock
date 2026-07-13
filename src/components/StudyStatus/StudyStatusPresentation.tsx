import type { HTMLAttributes } from "react";

import { classNames } from "../../ui/utils/classNames";
import type { PresentationAttributes } from "../PresentationContent";

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
}: StudyStatusPresentationProps) {
  const { className: rootClassName, ...rootProps } = rootAttributes ?? {};
  const { className: fillClassName, style: fillStyle, ...fillProps } = fillAttributes ?? {};
  const { className: labelClassName, ...labelProps } = labelAttributes ?? {};
  const { className: progressClassName, ...progressProps } = progressAttributes ?? {};
  const showRhythm = Boolean(stageText && remainingTimeText);

  return (
    <div {...rootProps} className={classNames(styles.studyStatus, rootClassName)}>
      <div
        {...fillProps}
        className={classNames(styles.progressFill, fillClassName)}
        style={{ ...fillStyle, width: `${progress}%` }}
      />
      <div className={styles.statusRow}>
        <div {...labelProps} className={classNames(styles.statusText, labelClassName)}>
          {statusText}
        </div>
        {showRhythm ? (
          <div className={styles.progressRhythm}>
            <span className={styles.stageText}>{stageText}</span>
            <span className={styles.rhythmSeparator} aria-hidden="true">
              ·
            </span>
            <span className={styles.remainingTime}>{remainingTimeText}</span>
          </div>
        ) : null}
        {showRhythm ? (
          <span {...progressProps} className={classNames(styles.progressMeta, progressClassName)}>
            {progressText}
          </span>
        ) : null}
      </div>
    </div>
  );
}
