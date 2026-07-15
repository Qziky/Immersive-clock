import type { HTMLAttributes, ReactNode } from "react";

import { classNames } from "../../utils/classNames";
import type { PresentationAttributes } from "../PresentationContent";

import styles from "./Study.module.css";

interface StudyTopDockPresentationProps {
  countdownContent?: ReactNode;
  countdownDockAttributes?: PresentationAttributes<HTMLAttributes<HTMLDivElement>>;
  noiseContent?: ReactNode;
  noiseDockAttributes?: PresentationAttributes<HTMLAttributes<HTMLDivElement>>;
  rootAttributes?: PresentationAttributes<HTMLAttributes<HTMLDivElement>>;
  statusContent?: ReactNode;
  statusDockAttributes?: PresentationAttributes<HTMLAttributes<HTMLDivElement>>;
  weatherContent?: ReactNode;
  weatherDockAttributes?: PresentationAttributes<HTMLAttributes<HTMLDivElement>>;
}

export function StudyTopDockPresentation({
  countdownContent,
  countdownDockAttributes,
  noiseContent,
  noiseDockAttributes,
  rootAttributes,
  statusContent,
  statusDockAttributes,
  weatherContent,
  weatherDockAttributes,
}: StudyTopDockPresentationProps) {
  const { className: rootClassName, ...rootProps } = rootAttributes ?? {};
  const { className: weatherClassName, ...weatherProps } = weatherDockAttributes ?? {};
  const { className: noiseClassName, ...noiseProps } = noiseDockAttributes ?? {};
  const { className: statusClassName, ...statusProps } = statusDockAttributes ?? {};
  const { className: countdownClassName, ...countdownProps } = countdownDockAttributes ?? {};
  const showEnvironment = Boolean(weatherContent || noiseContent);

  return (
    <div {...rootProps} className={classNames(styles.topDock, rootClassName)}>
      {showEnvironment ? (
        <div className={styles.auxDock}>
          {weatherContent ? (
            <div {...weatherProps} className={classNames(styles.weatherDock, weatherClassName)}>
              {weatherContent}
            </div>
          ) : null}
          {noiseContent ? (
            <div {...noiseProps} className={classNames(styles.noiseDock, noiseClassName)}>
              {noiseContent}
            </div>
          ) : null}
        </div>
      ) : null}
      {statusContent ? (
        <div {...statusProps} className={classNames(styles.statusDock, statusClassName)}>
          {statusContent}
        </div>
      ) : null}
      {countdownContent ? (
        <div {...countdownProps} className={classNames(styles.countdownDock, countdownClassName)}>
          {countdownContent}
        </div>
      ) : null}
    </div>
  );
}
