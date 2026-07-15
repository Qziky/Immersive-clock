import type { CSSProperties, ReactNode } from "react";
import { useCallback, useLayoutEffect, useRef, useState } from "react";

import styles from "./primitives.module.css";

export interface TooltipProps {
  content: string;
  children: ReactNode;
}

export function Tooltip({ content, children }: TooltipProps) {
  const wrapRef = useRef<HTMLSpanElement>(null);
  const bubbleRef = useRef<HTMLSpanElement>(null);
  const [horizontalShift, setHorizontalShift] = useState(0);

  const updatePosition = useCallback(() => {
    const wrap = wrapRef.current;
    const bubble = bubbleRef.current;
    if (!wrap || !bubble) return;

    const viewportInset = 8;
    const wrapRect = wrap.getBoundingClientRect();
    const bubbleRect = bubble.getBoundingClientRect();
    const idealLeft = wrapRect.left + wrapRect.width / 2 - bubbleRect.width / 2;
    const maximumLeft = Math.max(
      viewportInset,
      window.innerWidth - bubbleRect.width - viewportInset
    );
    const clampedLeft = Math.min(Math.max(idealLeft, viewportInset), maximumLeft);

    setHorizontalShift(clampedLeft - idealLeft);
  }, []);

  useLayoutEffect(() => {
    updatePosition();
    window.addEventListener("resize", updatePosition);

    if (typeof ResizeObserver === "undefined") {
      return () => window.removeEventListener("resize", updatePosition);
    }

    const observer = new ResizeObserver(updatePosition);
    if (wrapRef.current) observer.observe(wrapRef.current);
    if (bubbleRef.current) observer.observe(bubbleRef.current);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", updatePosition);
    };
  }, [updatePosition]);

  const bubbleStyle = {
    "--ui-tooltip-shift-x": `${horizontalShift}px`,
  } as CSSProperties;

  return (
    <span
      ref={wrapRef}
      className={styles.tooltipWrap}
      onFocusCapture={updatePosition}
      onMouseEnter={updatePosition}
    >
      {children}
      <span ref={bubbleRef} className={styles.tooltipBubble} role="tooltip" style={bubbleStyle}>
        {content}
      </span>
    </span>
  );
}
