import type { HTMLAttributes } from "react";

import { TimeStage, TimeStageValue } from "../../ui";
import { classNames } from "../../utils/classNames";
import type { PresentationAttributes } from "../PresentationContent";

import styles from "./Clock.module.css";

interface ClockPresentationProps {
  contentAttributes?: PresentationAttributes<HTMLAttributes<HTMLDivElement>>;
  dateAttributes?: PresentationAttributes<HTMLAttributes<HTMLDivElement>>;
  dateText: string;
  displayScale?: number;
  rootAttributes?: PresentationAttributes<HTMLAttributes<HTMLDivElement>>;
  timeAttributes?: PresentationAttributes<HTMLAttributes<HTMLDivElement>>;
  timeText: string;
}

export function ClockPresentation({
  contentAttributes,
  dateAttributes,
  dateText,
  displayScale,
  rootAttributes,
  timeAttributes,
  timeText,
}: ClockPresentationProps) {
  const { className: timeClassName, ...timeProps } = timeAttributes ?? {};
  const { className: dateClassName, ...dateProps } = dateAttributes ?? {};

  return (
    <TimeStage
      contentAttributes={contentAttributes}
      displayScale={displayScale}
      rootAttributes={rootAttributes}
    >
      <TimeStageValue {...timeProps} className={timeClassName}>
        {timeText}
      </TimeStageValue>
      <div {...dateProps} className={classNames(styles.date, dateClassName)}>
        {dateText}
      </div>
    </TimeStage>
  );
}
