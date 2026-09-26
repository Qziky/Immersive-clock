import type { CSSProperties, HTMLAttributes, ReactNode } from "react";

import { classNames } from "../../utils/classNames";

import styles from "./TimeStage.module.css";

export type TimeStagePlacement = "flow" | "overlay";

export type TimeStageAttributes = HTMLAttributes<HTMLDivElement> &
  Partial<Record<`data-${string}`, boolean | number | string | undefined>>;

export interface TimeStageProps {
  /** 视口布局优先利用屏幕宽度，适合贴边辅助信息的大屏。 */
  layout?: "default" | "viewport";
  children: ReactNode;
  contentAttributes?: TimeStageAttributes;
  /** 主时间数字相对响应式默认字号的缩放比例，1 为默认大小。 */
  displayScale?: number;
  placement?: TimeStagePlacement;
  rootAttributes?: TimeStageAttributes;
}

export interface TimeStageValueProps extends TimeStageAttributes {
  children: ReactNode;
}

export function TimeStage({
  layout = "default",
  children,
  contentAttributes,
  displayScale,
  placement = "flow",
  rootAttributes,
}: TimeStageProps) {
  const { className: rootClassName, style: rootStyle, ...rootProps } = rootAttributes ?? {};
  const { className: contentClassName, ...contentProps } = contentAttributes ?? {};
  const stageStyle =
    displayScale !== undefined && Number.isFinite(displayScale) && displayScale > 0
      ? ({ ...rootStyle, "--time-stage-display-scale": String(displayScale) } as CSSProperties)
      : rootStyle;

  return (
    <div
      {...rootProps}
      style={stageStyle}
      className={classNames(
        styles.stage,
        layout === "viewport" && styles.stageViewport,
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
