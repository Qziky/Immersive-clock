import type { HTMLAttributes } from "react";

import { classNames } from "../../utils/classNames";
import type { PresentationAttributes } from "../PresentationContent";

import styles from "./Study.module.css";

interface StudyCountdownItemPresentationProps {
  daysAttributes?: PresentationAttributes<HTMLAttributes<HTMLSpanElement>>;
  daysText: string;
  eventLabel: string;
  labelAttributes?: PresentationAttributes<HTMLAttributes<HTMLSpanElement>>;
  rootAttributes?: PresentationAttributes<HTMLAttributes<HTMLDivElement>>;
  unitAttributes?: PresentationAttributes<HTMLAttributes<HTMLSpanElement>>;
}

export function StudyCountdownItemPresentation({
  daysAttributes,
  daysText,
  eventLabel,
  labelAttributes,
  rootAttributes,
  unitAttributes,
}: StudyCountdownItemPresentationProps) {
  const { className: rootClassName, ...rootProps } = rootAttributes ?? {};
  const { className: labelClassName, ...labelProps } = labelAttributes ?? {};
  const { className: daysClassName, ...daysProps } = daysAttributes ?? {};
  const { className: unitClassName, ...unitProps } = unitAttributes ?? {};

  return (
    <div {...rootProps} className={classNames(styles.carouselItem, rootClassName)}>
      <span className={styles.countdownContent}>
        <span {...labelProps} className={classNames(styles.countdownPrefix, labelClassName)}>
          距离{eventLabel}
        </span>
        <span {...labelProps} className={classNames(styles.countdownOnly, labelClassName)}>
          仅
        </span>
        <span {...daysProps} className={classNames(styles.days, daysClassName)}>
          {daysText}
        </span>
        <span {...unitProps} className={classNames(styles.countdownUnit, unitClassName)}>
          天
        </span>
      </span>
    </div>
  );
}
