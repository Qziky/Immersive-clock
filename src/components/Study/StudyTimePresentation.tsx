import type { HTMLAttributes } from "react";

import { classNames } from "../../utils/classNames";
import { PresentationContent, type PresentationAttributes } from "../PresentationContent";

import styles from "./Study.module.css";

interface StudyTimePresentationProps {
  contentAttributes?: PresentationAttributes<HTMLAttributes<HTMLDivElement>>;
  currentTimeAttributes?: PresentationAttributes<HTMLAttributes<HTMLDivElement>>;
  dateAttributes?: PresentationAttributes<HTMLAttributes<HTMLDivElement>>;
  dateText?: string;
  primaryAttributes?: PresentationAttributes<HTMLAttributes<HTMLSpanElement>>;
  primaryText: string;
  secondsAttributes?: PresentationAttributes<HTMLAttributes<HTMLSpanElement>>;
  secondsText: string;
}

export function StudyTimePresentation({
  contentAttributes,
  currentTimeAttributes,
  dateAttributes,
  dateText,
  primaryAttributes,
  primaryText,
  secondsAttributes,
  secondsText,
}: StudyTimePresentationProps) {
  const { className: currentTimeClassName, ...currentTimeProps } = currentTimeAttributes ?? {};
  const { className: primaryClassName, ...primaryProps } = primaryAttributes ?? {};
  const { className: secondsClassName, ...secondsProps } = secondsAttributes ?? {};
  const { className: dateClassName, ...dateProps } = dateAttributes ?? {};

  return (
    <PresentationContent attributes={contentAttributes}>
      <div {...currentTimeProps} className={classNames(styles.currentTime, currentTimeClassName)}>
        <span {...primaryProps} className={classNames(styles.timePrimary, primaryClassName)}>
          {primaryText}
        </span>
        <span {...secondsProps} className={classNames(styles.timeSeconds, secondsClassName)}>
          {secondsText}
        </span>
      </div>
      {dateText ? (
        <div {...dateProps} className={classNames(styles.currentDate, dateClassName)}>
          {dateText}
        </div>
      ) : null}
    </PresentationContent>
  );
}
