import type { HTMLAttributes, ReactNode } from "react";

import { classNames } from "../utils/classNames";

import styles from "./primitives.module.css";

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  padded?: boolean;
  children: ReactNode;
}

export function Card({ padded = true, className, children, ...props }: CardProps) {
  return (
    <div className={classNames(styles.card, padded && styles.cardPadded, className)} {...props}>
      {children}
    </div>
  );
}
