import type { KeyboardEvent, ReactNode } from "react";

import { AppIcon, type AppIconName, type AppIconSize } from "../icons/AppIcon";
import { classNames } from "../utils/classNames";

import styles from "./primitives.module.css";

export interface TabItem<TValue extends string = string> {
  value?: TValue;
  key?: TValue;
  id?: string;
  label: ReactNode;
  icon?: AppIconName;
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
  onPreviewChange?: (value: TValue | null) => void;
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

const iconSizeMap: Record<NonNullable<TabsProps["size"]>, AppIconSize> = {
  sm: "sm",
  md: "md",
  lg: "lg",
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
  onPreviewChange,
}: TabsProps<TValue>) {
  const resolvedValue = value ?? activeKey;
  const firstEnabledItem = items.find((item) => !item.disabled);
  const firstEnabledValue = (firstEnabledItem?.value ?? firstEnabledItem?.key) as
    | TValue
    | undefined;
  const resolvedEnabledItem = items.find(
    (item) => !item.disabled && (item.value ?? item.key) === resolvedValue
  );
  const tabStopValue = (resolvedEnabledItem?.value ??
    resolvedEnabledItem?.key ??
    firstEnabledValue) as TValue | undefined;

  const moveFocus = (event: KeyboardEvent<HTMLButtonElement>, nextIndex: number) => {
    const enabledItems = items.filter((item) => !item.disabled);
    const nextItem = enabledItems[nextIndex];
    const nextValue = (nextItem?.value ?? nextItem?.key) as TValue | undefined;
    if (!nextValue) return;

    event.preventDefault();
    onChange(nextValue);

    const tablist = event.currentTarget.closest<HTMLElement>("[role='tablist']");
    const target = Array.from(tablist?.querySelectorAll<HTMLElement>("[role='tab']") ?? []).find(
      (tab) => tab.dataset.uiTabValue === String(nextValue)
    );
    target?.focus({ preventScroll: true });
    target?.scrollIntoView?.({ behavior: "smooth", block: "nearest", inline: "nearest" });
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>, itemValue: TValue) => {
    const enabledItems = items.filter((item) => !item.disabled);
    const currentIndex = enabledItems.findIndex((item) => (item.value ?? item.key) === itemValue);
    if (currentIndex < 0) return;

    if (event.key === "ArrowRight") {
      moveFocus(event, (currentIndex + 1) % enabledItems.length);
    } else if (event.key === "ArrowLeft") {
      moveFocus(event, (currentIndex - 1 + enabledItems.length) % enabledItems.length);
    } else if (event.key === "Home") {
      moveFocus(event, 0);
    } else if (event.key === "End") {
      moveFocus(event, enabledItems.length - 1);
    }
  };

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
      aria-orientation="horizontal"
    >
      {items.map((item) => {
        const itemValue = (item.value ?? item.key) as TValue;
        const active = itemValue === resolvedValue;
        const isTabStop = itemValue === tabStopValue;

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
            id={item.id ?? (id ? `${id}-tab-${itemValue}` : undefined)}
            data-ui-tab-value={itemValue}
            aria-controls={item.ariaControls}
            aria-label={item.ariaLabel}
            aria-selected={active}
            tabIndex={isTabStop && !item.disabled ? 0 : -1}
            title={item.title}
            disabled={item.disabled}
            onClick={() => onChange(itemValue)}
            onPointerEnter={() => onPreviewChange?.(itemValue)}
            onPointerLeave={() => onPreviewChange?.(null)}
            onFocus={() => onPreviewChange?.(itemValue)}
            onBlur={() => onPreviewChange?.(null)}
            onKeyDown={(event) => handleKeyDown(event, itemValue)}
          >
            {item.icon && <AppIcon name={item.icon} size={iconSizeMap[size]} />}
            <span>{item.label}</span>
          </button>
        );
      })}
    </div>
  );
}
