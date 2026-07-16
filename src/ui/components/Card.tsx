import type { HTMLAttributes, ReactNode } from "react";

import { classNames } from "../../utils/classNames";

import styles from "./primitives.module.css";

export type CardSurface = "base" | "raised";

export interface CardProps extends HTMLAttributes<HTMLElement> {
  as?: "div" | "article" | "section";
  padded?: boolean;
  surface?: CardSurface;
  children: ReactNode;
}

export function Card({
  as: Component = "div",
  padded = true,
  surface = "raised",
  className,
  children,
  ...props
}: CardProps) {
  return (
    <Component
      className={classNames(
        styles.card,
        surface === "base" && styles.cardSurfaceBase,
        padded && styles.cardPadded,
        className
      )}
      {...props}
    >
      {children}
    </Component>
  );
}
