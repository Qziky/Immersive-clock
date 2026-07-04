import type { ReactNode } from "react";

import { classNames } from "../utils/classNames";

import styles from "./primitives.module.css";

export interface TabItem<TValue extends string = string> {
  value?: TValue;
  key?: TValue;
  label: string;
  icon?: ReactNode;
  disabled?: boolean;
}

export interface TabsProps<TValue extends string = string> {
  value?: TValue;
  activeKey?: TValue;
  items: Array<TabItem<TValue>>;
  onChange: (value: TValue) => void;
  label?: string;
  variant?: "underlined" | "pill" | "browser" | "announcement";
  size?: "sm" | "md" | "lg";
  scrollable?: boolean;
  sticky?: boolean;
  className?: string;
}

export function Tabs<TValue extends string = string>({
  value,
  activeKey,
  items,
  onChange,
  label = "选项卡",
  className,
}: TabsProps<TValue>) {
  const resolvedValue = value ?? activeKey;

  return (
    <div className={classNames(styles.tabs, className)} role="tablist" aria-label={label}>
      {items.map((item) => {
        const itemValue = (item.value ?? item.key) as TValue;
        const active = itemValue === resolvedValue;
        return (
          <button
            key={itemValue}
            className={classNames(styles.tabButton, active && styles.tabButtonActive)}
            type="button"
            role="tab"
            aria-selected={active}
            disabled={item.disabled}
            onClick={() => onChange(itemValue)}
          >
            {item.icon}
            <span>{item.label}</span>
          </button>
        );
      })}
    </div>
  );
}
