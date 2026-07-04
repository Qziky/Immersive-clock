import type { HTMLAttributes, ReactNode } from "react";

import { classNames } from "../utils/classNames";

import styles from "./primitives.module.css";

export type BadgeVariant = "neutral" | "accent" | "success" | "warning" | "danger";

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
  icon?: ReactNode;
}

const variantClassMap: Record<BadgeVariant, string> = {
  neutral: styles.badgeNeutral,
  accent: styles.badgeAccent,
  success: styles.badgeSuccess,
  warning: styles.badgeWarning,
  danger: styles.badgeDanger,
};

export function Badge({ variant = "neutral", icon, children, className, ...props }: BadgeProps) {
  return (
    <span className={classNames(styles.badge, variantClassMap[variant], className)} {...props}>
      {icon && <span className={styles.badgeIcon}>{icon}</span>}
      {children}
    </span>
  );
}
