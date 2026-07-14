import type { ReactNode } from "react";

import { AppIcon, type AppIconName } from "../icons/AppIcon";
import { classNames } from "../utils/classNames";

import styles from "./primitives.module.css";

export type AlertVariant = "success" | "info" | "warning" | "danger";

export interface AlertProps {
  variant?: AlertVariant;
  children: ReactNode;
  className?: string;
}

const variantClassMap: Record<AlertVariant, string> = {
  success: styles.alertSuccess,
  info: styles.alertInfo,
  warning: styles.alertWarning,
  danger: styles.alertDanger,
};

const iconMap: Record<AlertVariant, AppIconName> = {
  success: "status.success",
  info: "status.info",
  warning: "status.warning",
  danger: "status.error",
};

export function Alert({ variant = "info", children, className }: AlertProps) {
  return (
    <div className={classNames(styles.alert, variantClassMap[variant], className)} role="status">
      <AppIcon name={iconMap[variant]} />
      <span>{children}</span>
    </div>
  );
}
