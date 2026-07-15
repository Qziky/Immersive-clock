import type { ButtonHTMLAttributes } from "react";
import { forwardRef } from "react";

import { classNames } from "../../utils/classNames";
import { AppIcon, type AppIconName, type AppIconSize } from "../icons/AppIcon";

import styles from "./primitives.module.css";

export interface IconButtonProps extends Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  "aria-label" | "aria-pressed" | "children"
> {
  "aria-label": string;
  icon: AppIconName;
  size?: "sm" | "md" | "lg";
  variant?: "default" | "ghost" | "danger" | "overlay" | "minimal";
  pressed?: boolean;
  loading?: boolean;
}

const sizeClassMap = {
  sm: styles.iconButtonSm,
  md: styles.iconButtonMd,
  lg: styles.iconButtonLg,
} as const;

const iconSizeMap: Record<NonNullable<IconButtonProps["size"]>, AppIconSize> = {
  sm: "sm",
  md: "md",
  lg: "lg",
};

const variantClassMap = {
  default: styles.iconButtonDefault,
  ghost: styles.iconButtonGhost,
  danger: styles.iconButtonDanger,
  overlay: styles.iconButtonOverlay,
  minimal: styles.iconButtonMinimal,
} as const;

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  {
    "aria-label": ariaLabel,
    "aria-busy": ariaBusy,
    icon,
    size = "md",
    variant = "default",
    pressed,
    loading = false,
    disabled,
    className,
    type = "button",
    title,
    ...props
  },
  ref
) {
  return (
    <button
      ref={ref}
      {...props}
      className={classNames(
        styles.iconButton,
        sizeClassMap[size],
        variantClassMap[variant],
        pressed && styles.iconButtonPressed,
        className
      )}
      type={type}
      title={title ?? ariaLabel}
      aria-label={ariaLabel}
      aria-pressed={pressed}
      aria-busy={loading || ariaBusy || undefined}
      disabled={disabled || loading}
    >
      {loading ? (
        <span className={styles.buttonSpinner} aria-hidden="true" />
      ) : (
        <AppIcon name={icon} size={iconSizeMap[size]} />
      )}
    </button>
  );
});
