import type { ButtonHTMLAttributes, ReactNode } from "react";

import { classNames } from "../utils/classNames";

import styles from "./primitives.module.css";

export interface ListItemProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  title: string;
  description?: string;
  icon?: ReactNode;
  trailing?: ReactNode;
}

export function ListItem({
  title,
  description,
  icon,
  trailing,
  className,
  type = "button",
  ...props
}: ListItemProps) {
  return (
    <button
      className={classNames(styles.listItem, styles.listItemClickable, className)}
      type={type}
      {...props}
    >
      {icon && <span className={styles.listItemIcon}>{icon}</span>}
      <span className={styles.listItemContent}>
        <span className={styles.listItemTitle}>{title}</span>
        {description && <span className={styles.listItemDescription}>{description}</span>}
      </span>
      {trailing}
    </button>
  );
}
