import type { HTMLAttributes } from "react";

import { AppIcon, TimeStage, TimeStageValue } from "../../ui";
import { classNames } from "../../utils/classNames";
import type { PresentationAttributes } from "../PresentationContent";

import styles from "./Stopwatch.module.css";

interface StopwatchPresentationProps {
  active: boolean;
  contentAttributes?: PresentationAttributes<HTMLAttributes<HTMLDivElement>>;
  milestoneAttributes?: PresentationAttributes<HTMLAttributes<HTMLDivElement>>;
  milestoneText?: string;
  placeholderAttributes?: PresentationAttributes<HTMLAttributes<HTMLSpanElement>>;
  placeholderText?: string;
  rootAttributes?: PresentationAttributes<HTMLAttributes<HTMLDivElement>>;
  showMilestone: boolean;
  showPausedStatus: boolean;
  showPlaceholder: boolean;
  statusAttributes?: PresentationAttributes<HTMLAttributes<HTMLDivElement>>;
  statusText?: string;
  timeAttributes?: PresentationAttributes<HTMLAttributes<HTMLDivElement>>;
  timeText: string;
}

export function StopwatchPresentation({
  active,
  contentAttributes,
  milestoneAttributes,
  milestoneText = "已超过1小时！",
  placeholderAttributes,
  placeholderText = "00:00:00",
  rootAttributes,
  showMilestone,
  showPausedStatus,
  showPlaceholder,
  statusAttributes,
  statusText = "已暂停",
  timeAttributes,
  timeText,
}: StopwatchPresentationProps) {
  const { className: timeClassName, ...timeProps } = timeAttributes ?? {};
  const { className: placeholderClassName, ...placeholderProps } = placeholderAttributes ?? {};
  const { className: statusClassName, ...statusProps } = statusAttributes ?? {};
  const { className: milestoneClassName, ...milestoneProps } = milestoneAttributes ?? {};

  return (
    <TimeStage contentAttributes={contentAttributes} rootAttributes={rootAttributes}>
      <TimeStageValue
        {...timeProps}
        className={classNames(styles.time, active && styles.running, timeClassName)}
      >
        {showPlaceholder ? (
          <span
            {...placeholderProps}
            className={classNames(styles.placeholder, placeholderClassName)}
          >
            {placeholderText}
          </span>
        ) : (
          timeText
        )}
      </TimeStageValue>
      {showPausedStatus ? (
        <div {...statusProps} className={classNames(styles.status, statusClassName)}>
          {statusText}
        </div>
      ) : null}
      {showMilestone ? (
        <div {...milestoneProps} className={classNames(styles.milestone, milestoneClassName)}>
          <AppIcon name="status.milestone" size="xl" />
          <span>{milestoneText}</span>
        </div>
      ) : null}
    </TimeStage>
  );
}
