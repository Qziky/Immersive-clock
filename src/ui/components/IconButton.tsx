import type { ButtonHTMLAttributes, ReactNode } from "react";

import { classNames } from "../utils/classNames";

import styles from "./primitives.module.css";

export interface IconButtonProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "aria-label" | "children"> {
  "aria-label": string;
  icon: ReactNode;
  active?: boolean;
}

export function IconButton({
  icon,
  active = false,
  className,
  type = "button",
  title,
  ...props
}: IconButtonProps) {
  return (
    <button
      className={classNames(styles.iconButton, active && styles.iconButtonActive, className)}
      type={type}
      title={title ?? props["aria-label"]}
      {...props}
    >
      {icon}
    </button>
  );
}
