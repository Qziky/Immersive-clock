import type { HTMLAttributes } from "react";

import { classNames } from "../../utils/classNames";
import { AppIcon, type AppIconName } from "../icons/AppIcon";

import styles from "./primitives.module.css";

export type BadgeVariant = "neutral" | "accent" | "success" | "warning" | "danger";

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
  icon?: AppIconName;
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
      {icon && (
        <span className={styles.badgeIcon}>
          <AppIcon name={icon} size="sm" />
        </span>
      )}
      {children}
    </span>
  );
}
