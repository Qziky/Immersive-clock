import type { HTMLAttributes, ReactNode } from "react";

import { classNames } from "../../utils/classNames";

import styles from "./primitives.module.css";

export interface CardProps extends HTMLAttributes<HTMLElement> {
  as?: "div" | "article" | "section";
  padded?: boolean;
  children: ReactNode;
}

export function Card({
  as: Component = "div",
  padded = true,
  className,
  children,
  ...props
}: CardProps) {
  return (
    <Component
      className={classNames(styles.card, padded && styles.cardPadded, className)}
      {...props}
    >
      {children}
    </Component>
  );
}
