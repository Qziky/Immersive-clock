import type { ButtonHTMLAttributes, HTMLAttributes } from "react";

import { classNames } from "../../ui/utils/classNames";
import type { PresentationAttributes } from "../PresentationContent";

import styles from "./NoiseMonitor.module.css";

export type NoisePresentationState = "calibrating" | "error" | "initializing" | "noisy" | "quiet";

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
    <div {...rootProps} className={classNames(styles.noiseMonitor, rootClassName)}>
      <div className={styles.statusContainer}>
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
