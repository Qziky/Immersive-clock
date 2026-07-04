import type { ButtonHTMLAttributes, ReactNode } from "react";

import { classNames } from "../utils/classNames";

import styles from "./primitives.module.css";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "success";
export type ButtonSize = "sm" | "md" | "lg";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: ReactNode;
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

export function Button({
  variant = "secondary",
  size = "md",
  icon,
  loading = false,
  disabled,
  children,
  className,
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <button
      className={classNames(styles.button, variantClassMap[variant], sizeClassMap[size], className)}
      disabled={disabled || loading}
      type={type}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading ? (
        <span className={styles.buttonSpinner} aria-hidden="true" />
      ) : (
        <>
          {icon && <span className={styles.buttonIcon}>{icon}</span>}
          {children}
        </>
      )}
    </button>
  );
}
