import type { HTMLAttributes, ReactNode } from "react";

import { TimeStage } from "../../ui";
import { classNames } from "../../utils/classNames";
import type { PresentationAttributes } from "../PresentationContent";

import styles from "./Study.module.css";

interface StudyCenterPresentationProps {
  displayScale?: number;
  quoteContent?: ReactNode;
  quoteSectionAttributes?: PresentationAttributes<HTMLAttributes<HTMLDivElement>>;
  rootAttributes?: PresentationAttributes<HTMLAttributes<HTMLDivElement>>;
  timeContent?: ReactNode;
}

export function StudyCenterPresentation({
  displayScale,
  quoteContent,
  quoteSectionAttributes,
  rootAttributes,
  timeContent,
}: StudyCenterPresentationProps) {
  const { className: quoteClassName, ...quoteProps } = quoteSectionAttributes ?? {};

  return (
    <TimeStage displayScale={displayScale} placement="overlay" rootAttributes={rootAttributes}>
      {timeContent}
      {quoteContent ? (
        <div {...quoteProps} className={classNames(styles.quoteSection, quoteClassName)}>
          {quoteContent}
        </div>
      ) : null}
    </TimeStage>
  );
}
