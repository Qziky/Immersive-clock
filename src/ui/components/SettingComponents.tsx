import type { CSSProperties, HTMLAttributes, ReactNode } from "react";

import { classNames } from "../utils/classNames";

import styles from "./primitives.module.css";

export type UiTone = "neutral" | "accent" | "success" | "warning" | "danger" | "info";

export interface SettingItemProps extends Omit<HTMLAttributes<HTMLDivElement>, "title"> {
  icon?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  control?: ReactNode;
  tone?: UiTone;
  disabled?: boolean;
}

export interface SettingGridProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  columns?: 1 | 2 | 3 | "auto";
}

export interface MetricCardProps extends HTMLAttributes<HTMLDivElement> {
  icon?: ReactNode;
  label: ReactNode;
  value: ReactNode;
  meta?: ReactNode;
  tone?: UiTone;
}

export interface StatusPillProps extends HTMLAttributes<HTMLSpanElement> {
  tone: UiTone;
  icon?: ReactNode;
  children: ReactNode;
}

export interface InfoPanelProps extends Omit<HTMLAttributes<HTMLDivElement>, "title"> {
  tone?: UiTone;
  title?: ReactNode;
  children: ReactNode;
}

const toneClassMap: Record<UiTone, string> = {
  neutral: styles.toneNeutral,
  accent: styles.toneAccent,
  success: styles.toneSuccess,
  warning: styles.toneWarning,
  danger: styles.toneDanger,
  info: styles.toneInfo,
};

export function SettingGrid({
  children,
  columns = "auto",
  className,
  style,
  ...props
}: SettingGridProps) {
  const template =
    columns === "auto"
      ? "repeat(auto-fit, minmax(min(100%, 300px), 1fr))"
      : `repeat(${columns}, minmax(0, 1fr))`;

  return (
    <div
      className={classNames(styles.settingGrid, className)}
      style={{ ...style, "--ui-setting-columns": template } as CSSProperties}
      {...props}
    >
      {children}
    </div>
  );
}

export function SettingItem({
  icon,
  title,
  description,
  control,
  tone = "neutral",
  disabled,
  children,
  className,
  ...props
}: SettingItemProps) {
  return (
    <div
      className={classNames(
        styles.settingItem,
        toneClassMap[tone],
        disabled && styles.settingItemDisabled,
        className,
      )}
      aria-disabled={disabled || undefined}
      {...props}
    >
      {icon && (
        <span className={styles.settingItemIcon} aria-hidden="true">
          {icon}
        </span>
      )}
      <div className={styles.settingItemContent}>
        <span className={styles.settingItemTitle}>{title}</span>
        {description && <span className={styles.settingItemDescription}>{description}</span>}
        {children && <div className={styles.settingItemBody}>{children}</div>}
      </div>
      {control && <div className={styles.settingItemControl}>{control}</div>}
    </div>
  );
}

export function MetricCard({
  icon,
  label,
  value,
  meta,
  tone = "neutral",
  className,
  ...props
}: MetricCardProps) {
  return (
    <div className={classNames(styles.metricCard, toneClassMap[tone], className)} {...props}>
      <span className={styles.metricCardHeader}>
        {icon && (
          <span className={styles.metricCardIcon} aria-hidden="true">
            {icon}
          </span>
        )}
        <span className={styles.metricCardLabel}>{label}</span>
      </span>
      <span className={styles.metricCardValue}>{value}</span>
      {meta && <span className={styles.metricCardMeta}>{meta}</span>}
    </div>
  );
}

export function StatusPill({ tone, icon, children, className, ...props }: StatusPillProps) {
  return (
    <span className={classNames(styles.statusPill, toneClassMap[tone], className)} {...props}>
      {icon && (
        <span className={styles.statusPillIcon} aria-hidden="true">
          {icon}
        </span>
      )}
      {children}
    </span>
  );
}

export function InfoPanel({
  tone = "neutral",
  title,
  children,
  className,
  ...props
}: InfoPanelProps) {
  return (
    <div className={classNames(styles.infoPanel, toneClassMap[tone], className)} {...props}>
      {title && <strong className={styles.infoPanelTitle}>{title}</strong>}
      <div className={styles.infoPanelBody}>{children}</div>
    </div>
  );
}
