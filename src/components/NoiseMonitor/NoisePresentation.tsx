import type { ButtonHTMLAttributes, HTMLAttributes } from "react";

import { classNames } from "../../utils/classNames";
import type { PresentationAttributes } from "../PresentationContent";

import styles from "./NoiseMonitor.module.css";

export type NoisePresentationState =
  | "error"
  | "initializing"
  | "noisy"
  | "quiet"
  | "signal-anomaly";

interface NoisePresentationProps {
  indicatorAttributes?: PresentationAttributes<ButtonHTMLAttributes<HTMLButtonElement>>;
  rootAttributes?: PresentationAttributes<HTMLAttributes<HTMLDivElement>>;
  state: NoisePresentationState;
  statusAttributes?: PresentationAttributes<HTMLAttributes<HTMLDivElement>>;
  statusText: string;
  subtext?: string;
  subtextAttributes?: PresentationAttributes<HTMLAttributes<HTMLDivElement>>;
}

export function NoisePresentation({
  indicatorAttributes,
  rootAttributes,
  state,
  statusAttributes,
  statusText,
  subtext,
  subtextAttributes,
}: NoisePresentationProps) {
  const { className: rootClassName, ...rootProps } = rootAttributes ?? {};
  const { className: indicatorClassName, ...indicatorProps } = indicatorAttributes ?? {};
  const { className: statusClassName, ...statusProps } = statusAttributes ?? {};
  const { className: subtextClassName, ...subtextProps } = subtextAttributes ?? {};
  const stateClassName = styles[state];

  return (
    <div
      {...rootProps}
      className={classNames(styles.noiseMonitor, rootClassName)}
      data-noise-state={state}
    >
      <div className={styles.statusContainer}>
        {/* eslint-disable-next-line react/forbid-elements -- 呼吸灯是噪音领域状态表面，不是公共图标按钮。 */}
        <button
          {...indicatorProps}
          className={classNames(styles.breathingLight, stateClassName, indicatorClassName)}
          type="button"
        />
        <div className={styles.textBlock}>
          <div
            {...statusProps}
            className={classNames(styles.statusText, stateClassName, statusClassName)}
          >
            {statusText}
          </div>
          {subtext ? (
            <div {...subtextProps} className={classNames(styles.statusSubtext, subtextClassName)}>
              {subtext}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
