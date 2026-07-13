import type { HTMLAttributes } from "react";

import { classNames } from "../../ui/utils/classNames";
import { PresentationContent, type PresentationAttributes } from "../PresentationContent";

import styles from "./Clock.module.css";

interface ClockPresentationProps {
  contentAttributes?: PresentationAttributes<HTMLAttributes<HTMLDivElement>>;
  dateAttributes?: PresentationAttributes<HTMLAttributes<HTMLDivElement>>;
  dateText: string;
  rootAttributes?: PresentationAttributes<HTMLAttributes<HTMLDivElement>>;
  timeAttributes?: PresentationAttributes<HTMLAttributes<HTMLDivElement>>;
  timeText: string;
}

export function ClockPresentation({
  contentAttributes,
  dateAttributes,
  dateText,
  rootAttributes,
  timeAttributes,
  timeText,
}: ClockPresentationProps) {
  const { className: rootClassName, ...rootProps } = rootAttributes ?? {};
  const { className: timeClassName, ...timeProps } = timeAttributes ?? {};
  const { className: dateClassName, ...dateProps } = dateAttributes ?? {};

  return (
    <div {...rootProps} className={classNames(styles.clock, rootClassName)}>
      <PresentationContent attributes={contentAttributes}>
        <div {...timeProps} className={classNames(styles.time, timeClassName)}>
          {timeText}
        </div>
        <div {...dateProps} className={classNames(styles.date, dateClassName)}>
          {dateText}
        </div>
      </PresentationContent>
    </div>
  );
}
