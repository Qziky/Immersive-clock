import type { CSSProperties, ReactNode } from "react";

import { AppIcon, type AppIconName } from "../icons/AppIcon";
import type { UiMotionMode } from "../types";
import { classNames } from "../utils/classNames";

import { IconButton } from "./IconButton";
import styles from "./primitives.module.css";

export type ToastVariant = "success" | "info" | "warning" | "danger";

export interface ToastProps {
  variant?: ToastVariant;
  title: ReactNode;
  description?: ReactNode;
  icon?: AppIconName;
  accentColor?: string;
  action?: ReactNode;
  onClose?: () => void;
  motion?: UiMotionMode;
  role?: "status" | "alert";
  className?: string;
}

const variantClassMap: Record<ToastVariant, string> = {
  success: styles.toastSuccess,
  info: styles.toastInfo,
  warning: styles.toastWarning,
  danger: styles.toastDanger,
};

const iconMap: Record<ToastVariant, AppIconName> = {
  success: "status.success",
  info: "status.info",
  warning: "status.warning",
  danger: "status.error",
};

export function Toast({
  variant = "info",
  title,
  description,
  icon,
  accentColor,
  action,
  onClose,
  motion = "default",
  role,
  className,
}: ToastProps) {
  const semanticRole = role ?? (variant === "danger" || variant === "warning" ? "alert" : "status");
  const customAccentStyle = accentColor
    ? ({ "--ui-toast-accent-color": accentColor } as CSSProperties)
    : undefined;

  return (
    <div
      className={classNames(
        styles.toast,
        variantClassMap[variant],
        accentColor && styles.toastCustomAccent,
        className
      )}
      data-ui-motion={motion}
      data-ui-presence="entering"
      role={semanticRole}
      aria-atomic="true"
      style={customAccentStyle}
    >
      <span className={styles.toastIcon}>
        <AppIcon name={icon ?? iconMap[variant]} />
      </span>
      <span className={styles.toastContent}>
        <strong>{title}</strong>
        {description && <span>{description}</span>}
      </span>
      {action && <span className={styles.toastAction}>{action}</span>}
      {onClose && (
        <IconButton
          className={styles.toastClose}
          aria-label="关闭通知"
          icon="action.close"
          size="sm"
          variant="ghost"
          onClick={onClose}
        />
      )}
    </div>
  );
}
