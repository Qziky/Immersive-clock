import type { ButtonHTMLAttributes } from "react";

import { classNames } from "../utils/classNames";

import styles from "./primitives.module.css";

export interface SwitchProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "onChange"> {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  label?: string;
}

export function Switch({
  checked,
  onCheckedChange,
  label,
  className,
  type = "button",
  ...props
}: SwitchProps) {
  const accessibleLabel = props["aria-label"] ?? label;
  const control = (
    <button
      className={classNames(styles.switchRoot, checked && styles.switchRootOn, className)}
      type={type}
      role="switch"
      aria-checked={checked}
      aria-label={accessibleLabel}
      onClick={() => onCheckedChange(!checked)}
      {...props}
    >
      <span className={styles.switchThumb} aria-hidden="true" />
    </button>
  );

  if (!label) {
    return control;
  }

  return (
    <span className={styles.checkRow}>
      {control}
      <span>{label}</span>
    </span>
  );
}
