import type { CSSProperties, HTMLAttributes, ReactNode } from "react";

import { classNames } from "../utils/classNames";

import styles from "./primitives.module.css";

type Gap = "xs" | "sm" | "md" | "lg" | "xl";

const gapMap: Record<Gap, string> = {
  xs: "var(--ui-space-1)",
  sm: "var(--ui-space-2)",
  md: "var(--ui-space-3)",
  lg: "var(--ui-space-4)",
  xl: "var(--ui-space-5)",
};

interface LayoutBaseProps extends HTMLAttributes<HTMLDivElement> {
  gap?: Gap;
  children: ReactNode;
}

export interface StackProps extends LayoutBaseProps {
  align?: CSSProperties["alignItems"];
}

export interface InlineProps extends LayoutBaseProps {
  align?: CSSProperties["alignItems"] | "left" | "right" | "start" | "end";
  justify?: CSSProperties["justifyContent"];
  wrap?: boolean;
}

export interface GridProps extends LayoutBaseProps {
  columns?: 1 | 2 | 3 | 4 | "auto";
  minColumnWidth?: number;
}

function withGap(style: CSSProperties | undefined, gap: Gap): CSSProperties {
  return { ...style, "--ui-layout-gap": gapMap[gap] } as CSSProperties;
}

export function Stack({ gap = "md", align, className, style, children, ...props }: StackProps) {
  return (
    <div
      className={classNames(styles.stack, className)}
      style={{ ...withGap(style, gap), alignItems: align }}
      {...props}
    >
      {children}
    </div>
  );
}

export function Inline({
  gap = "md",
  align = "center",
  justify = "flex-start",
  wrap = true,
  className,
  style,
  children,
  ...props
}: InlineProps) {
  const alignMap: Record<string, CSSProperties["alignItems"]> = {
    end: "flex-end",
    left: "center",
    right: "center",
    start: "flex-start",
  };
  const justifyMap: Record<string, CSSProperties["justifyContent"]> = {
    left: "flex-start",
    right: "flex-end",
  };
  const resolvedAlign = alignMap[String(align)] ?? align;
  const resolvedJustify = justifyMap[String(align)] ?? justify;

  return (
    <div
      className={classNames(styles.inline, !wrap && styles.inlineNoWrap, className)}
      style={{ ...withGap(style, gap), alignItems: resolvedAlign, justifyContent: resolvedJustify }}
      {...props}
    >
      {children}
    </div>
  );
}

export function Grid({
  gap = "md",
  columns = "auto",
  minColumnWidth = 240,
  className,
  style,
  children,
  ...props
}: GridProps) {
  const template =
    columns === "auto"
      ? `repeat(auto-fit, minmax(min(100%, ${minColumnWidth}px), 1fr))`
      : `repeat(${columns}, minmax(0, 1fr))`;

  return (
    <div
      className={classNames(styles.grid, className)}
      style={{ ...withGap(style, gap), gridTemplateColumns: template }}
      {...props}
    >
      {children}
    </div>
  );
}
