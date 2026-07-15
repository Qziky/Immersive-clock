import type { HTMLAttributes, ReactNode, Ref } from "react";

import { classNames } from "../../utils/classNames";
import type { PresentationAttributes } from "../PresentationContent";

import styles from "./Study.module.css";

interface StudyCountdownCarouselPresentationProps {
  carouselAttributes?: PresentationAttributes<HTMLAttributes<HTMLDivElement>>;
  carouselRef?: Ref<HTMLDivElement>;
  children: ReactNode;
  trackAttributes?: PresentationAttributes<HTMLAttributes<HTMLDivElement>>;
}

export function StudyCountdownCarouselPresentation({
  carouselAttributes,
  carouselRef,
  children,
  trackAttributes,
}: StudyCountdownCarouselPresentationProps) {
  const { className: carouselClassName, ...carouselProps } = carouselAttributes ?? {};
  const { className: trackClassName, ...trackProps } = trackAttributes ?? {};

  return (
    <div
      {...carouselProps}
      className={classNames(styles.countdownCarousel, carouselClassName)}
      ref={carouselRef}
    >
      <div {...trackProps} className={classNames(styles.carouselTrack, trackClassName)}>
        {children}
      </div>
    </div>
  );
}
