import type { HTMLAttributes, ReactNode } from "react";

import { classNames } from "../../utils/classNames";

import styles from "./TimeStage.module.css";

export type TimeStagePlacement = "flow" | "overlay";

export type TimeStageAttributes = HTMLAttributes<HTMLDivElement> &
  Partial<Record<`data-${string}`, boolean | number | string | undefined>>;

export interface TimeStageProps {
  children: ReactNode;
  contentAttributes?: TimeStageAttributes;
  placement?: TimeStagePlacement;
  rootAttributes?: TimeStageAttributes;
}

export interface TimeStageValueProps extends TimeStageAttributes {
  children: ReactNode;
}

export function TimeStage({
  children,
  contentAttributes,
  placement = "flow",
  rootAttributes,
}: TimeStageProps) {
  const { className: rootClassName, ...rootProps } = rootAttributes ?? {};
  const { className: contentClassName, ...contentProps } = contentAttributes ?? {};

  return (
    <div
      {...rootProps}
      className={classNames(
        styles.stage,
        placement === "overlay" ? styles.stageOverlay : styles.stageFlow,
        rootClassName
      )}
    >
      <div {...contentProps} className={classNames(styles.content, contentClassName)}>
        {children}
      </div>
    </div>
  );
}

export function TimeStageValue({ children, className, ...props }: TimeStageValueProps) {
  return (
    <div {...props} className={classNames(styles.value, className)}>
      {children}
    </div>
  );
}
