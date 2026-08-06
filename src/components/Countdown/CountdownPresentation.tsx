import type { HTMLAttributes } from "react";

import { TimeStage, TimeStageValue } from "../../ui";
import { classNames } from "../../utils/classNames";
import type { PresentationAttributes } from "../PresentationContent";

import styles from "./Countdown.module.css";

interface CountdownPresentationProps {
  contentAttributes?: PresentationAttributes<HTMLAttributes<HTMLDivElement>>;
  finished: boolean;
  finishedMessageAttributes?: PresentationAttributes<HTMLAttributes<HTMLDivElement>>;
  finishedMessageText?: string;
  placeholderAttributes?: PresentationAttributes<HTMLAttributes<HTMLSpanElement>>;
  placeholderText?: string;
  rootAttributes?: PresentationAttributes<HTMLAttributes<HTMLDivElement>>;
  showPlaceholder: boolean;
  timeAttributes?: PresentationAttributes<HTMLAttributes<HTMLDivElement>>;
  timeText: string;
  warning: boolean;
}

export function CountdownPresentation({
  contentAttributes,
  finished,
  finishedMessageAttributes,
  finishedMessageText = "时间到",
  placeholderAttributes,
  placeholderText = "00:00:00",
  rootAttributes,
  showPlaceholder,
  timeAttributes,
  timeText,
  warning,
}: CountdownPresentationProps) {
  const { className: timeClassName, ...timeProps } = timeAttributes ?? {};
  const { className: placeholderClassName, ...placeholderProps } = placeholderAttributes ?? {};
  const { className: finishedClassName, ...finishedProps } = finishedMessageAttributes ?? {};

  return (
    <TimeStage contentAttributes={contentAttributes} rootAttributes={rootAttributes}>
      <TimeStageValue
        {...timeProps}
        className={classNames(
          styles.time,
          styles.clickable,
          warning && styles.warning,
          finished && styles.finished,
          timeClassName
        )}
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
      {finished ? (
        <div {...finishedProps} className={classNames(styles.finishedMessage, finishedClassName)}>
          {finishedMessageText}
        </div>
      ) : null}
    </TimeStage>
  );
}
