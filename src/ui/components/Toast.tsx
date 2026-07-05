import { AlertCircle, CheckCircle2, Info, TriangleAlert, X } from "lucide-react";
import type { ReactNode } from "react";

import type { UiMotionMode } from "../types";
import { classNames } from "../utils/classNames";

import styles from "./primitives.module.css";

export type ToastVariant = "success" | "info" | "warning" | "danger";

export interface ToastProps {
  variant?: ToastVariant;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  onClose?: () => void;
  motion?: UiMotionMode;
  className?: string;
}

const variantClassMap: Record<ToastVariant, string> = {
  success: styles.toastSuccess,
  info: styles.toastInfo,
  warning: styles.toastWarning,
  danger: styles.toastDanger,
};

const iconMap: Record<ToastVariant, ReactNode> = {
  success: <CheckCircle2 size={16} aria-hidden="true" />,
  info: <Info size={16} aria-hidden="true" />,
  warning: <TriangleAlert size={16} aria-hidden="true" />,
  danger: <AlertCircle size={16} aria-hidden="true" />,
};

export function Toast({
  variant = "info",
  title,
  description,
  action,
  onClose,
  motion = "default",
  className,
}: ToastProps) {
  return (
    <div
      className={classNames(styles.toast, variantClassMap[variant], className)}
      data-ui-motion={motion}
      data-ui-presence="entering"
      role="status"
    >
      <span className={styles.toastIcon}>{iconMap[variant]}</span>
      <span className={styles.toastContent}>
        <strong>{title}</strong>
        {description && <span>{description}</span>}
      </span>
      {action && <span className={styles.toastAction}>{action}</span>}
      {onClose && (
        <button className={styles.toastClose} type="button" onClick={onClose} aria-label="关闭通知">
          <X size={14} aria-hidden="true" />
        </button>
      )}
    </div>
  );
}
