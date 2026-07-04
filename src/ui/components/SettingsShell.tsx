import type { ReactNode } from "react";

import { classNames } from "../utils/classNames";

import styles from "./primitives.module.css";

export interface SettingsNavItem<TValue extends string = string> {
  value: TValue;
  label: string;
  icon?: ReactNode;
}

export interface SettingsShellProps<TValue extends string = string> {
  title: string;
  activeItem: TValue;
  items: Array<SettingsNavItem<TValue>>;
  onItemChange: (value: TValue) => void;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
}

export function SettingsShell<TValue extends string = string>({
  title,
  activeItem,
  items,
  onItemChange,
  children,
  footer,
  className,
}: SettingsShellProps<TValue>) {
  return (
    <section className={classNames(styles.settingsShell, className)} aria-label={title}>
      <aside className={styles.settingsSidebar}>
        <nav className={styles.settingsNav} aria-label="设置分类">
          {items.map((item) => {
            const active = item.value === activeItem;
            return (
              <button
                key={item.value}
                className={classNames(styles.settingsNavItem, active && styles.settingsNavItemActive)}
                type="button"
                aria-current={active ? "page" : undefined}
                onClick={() => onItemChange(item.value)}
              >
                {item.icon}
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>
      </aside>
      <div className={styles.settingsMain}>
        <header className={styles.settingsHeader}>
          <h2 className={styles.settingsTitle}>{title}</h2>
        </header>
        <div className={styles.settingsBody}>{children}</div>
        {footer && <footer className={styles.settingsFooter}>{footer}</footer>}
      </div>
    </section>
  );
}
