import type { ButtonHTMLAttributes } from "react";
import { forwardRef } from "react";

import { AppIcon, type AppIconName, type AppIconSize } from "../icons/AppIcon";
import { classNames } from "../utils/classNames";

import styles from "./primitives.module.css";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "success";
export type ButtonSize = "sm" | "md" | "lg";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: AppIconName;
  loading?: boolean;
}

const variantClassMap: Record<ButtonVariant, string> = {
  primary: styles.buttonPrimary,
  secondary: styles.buttonSecondary,
  ghost: styles.buttonGhost,
  danger: styles.buttonDanger,
  success: styles.buttonPrimary,
};

const sizeClassMap: Record<ButtonSize, string> = {
  sm: styles.buttonSm,
  md: styles.buttonMd,
  lg: styles.buttonLg,
};

const iconSizeMap: Record<ButtonSize, AppIconSize> = {
  sm: "sm",
  md: "md",
  lg: "lg",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    "aria-busy": ariaBusy,
    variant = "secondary",
    size = "md",
    icon,
    loading = false,
    disabled,
    children,
    className,
    type = "button",
    ...props
  },
  ref
) {
  return (
    <button
      ref={ref}
      className={classNames(styles.button, variantClassMap[variant], sizeClassMap[size], className)}
      disabled={disabled || loading}
      type={type}
      aria-busy={loading || ariaBusy || undefined}
      {...props}
    >
      {loading ? (
        <>
          <span className={styles.buttonSpinner} aria-hidden="true" />
          <span className={styles.visuallyHidden}>{children}</span>
        </>
      ) : (
        <>
          {icon && (
            <span className={styles.buttonIcon}>
              <AppIcon name={icon} size={iconSizeMap[size]} />
            </span>
          )}
          {children}
        </>
      )}
    </button>
  );
});
