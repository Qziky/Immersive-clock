import type { ReactNode } from "react";

import styles from "./primitives.module.css";

export interface TooltipProps {
  content: string;
  children: ReactNode;
}

export function Tooltip({ content, children }: TooltipProps) {
  return (
    <span className={styles.tooltipWrap}>
      {children}
      <span className={styles.tooltipBubble} role="tooltip">
        {content}
      </span>
    </span>
  );
}
