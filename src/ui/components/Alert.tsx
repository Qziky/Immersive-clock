import { AlertCircle, CheckCircle2, Info, TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";

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

const iconMap: Record<AlertVariant, ReactNode> = {
  success: <CheckCircle2 size={16} aria-hidden="true" />,
  info: <Info size={16} aria-hidden="true" />,
  warning: <TriangleAlert size={16} aria-hidden="true" />,
  danger: <AlertCircle size={16} aria-hidden="true" />,
};

export function Alert({ variant = "info", children, className }: AlertProps) {
  return (
    <div className={classNames(styles.alert, variantClassMap[variant], className)} role="status">
      {iconMap[variant]}
      <span>{children}</span>
    </div>
  );
}
