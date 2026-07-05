import type { ReactNode } from "react";

import { classNames } from "../utils/classNames";

import styles from "./primitives.module.css";

export interface TabItem<TValue extends string = string> {
  value?: TValue;
  key?: TValue;
  id?: string;
  label: ReactNode;
  icon?: ReactNode;
  disabled?: boolean;
  ariaControls?: string;
  ariaLabel?: string;
  title?: string;
  className?: string;
}

export interface TabsProps<TValue extends string = string> {
  id?: string;
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

const variantClassMap: Record<NonNullable<TabsProps["variant"]>, string> = {
  underlined: styles.tabsUnderlined,
  pill: styles.tabsPill,
  browser: styles.tabsBrowser,
  announcement: styles.tabsAnnouncement,
};

const tabVariantClassMap: Record<NonNullable<TabsProps["variant"]>, string> = {
  underlined: styles.tabButtonUnderlined,
  pill: styles.tabButtonPill,
  browser: styles.tabButtonBrowser,
  announcement: styles.tabButtonAnnouncement,
};

const sizeClassMap: Record<NonNullable<TabsProps["size"]>, string> = {
  sm: styles.tabButtonSm,
  md: styles.tabButtonMd,
  lg: styles.tabButtonLg,
};

export function Tabs<TValue extends string = string>({
  id,
  value,
  activeKey,
  items,
  onChange,
  label = "选项卡",
  variant = "underlined",
  size = "md",
  scrollable = true,
  sticky = false,
  className,
}: TabsProps<TValue>) {
  const resolvedValue = value ?? activeKey;

  return (
    <div
      id={id}
      className={classNames(
        styles.tabs,
        variantClassMap[variant],
        scrollable ? styles.tabsScrollable : styles.tabsStatic,
        sticky && styles.tabsSticky,
        className
      )}
      role="tablist"
      aria-label={label}
    >
      {items.map((item) => {
        const itemValue = (item.value ?? item.key) as TValue;
        const active = itemValue === resolvedValue;
        return (
          <button
            key={String(itemValue)}
            className={classNames(
              styles.tabButton,
              tabVariantClassMap[variant],
              sizeClassMap[size],
              active && styles.tabButtonActive,
              item.className
            )}
            type="button"
            role="tab"
            id={item.id}
            aria-controls={item.ariaControls}
            aria-label={item.ariaLabel}
            aria-selected={active}
            title={item.title}
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
