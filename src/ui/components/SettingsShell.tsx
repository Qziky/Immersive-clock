import type { CSSProperties, ReactNode } from "react";
import {
  startTransition,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { classNames } from "../../utils/classNames";
import { AppIcon, type AppIconName } from "../icons/AppIcon";
import type { UiMotionMode } from "../types";
import { usePresence } from "../utils/usePresence";

import { IconButton } from "./IconButton";
import styles from "./primitives.module.css";

export interface SettingsNavItem<TValue extends string = string> {
  value: TValue;
  label: string;
  description?: string;
  icon?: AppIconName;
  disabled?: boolean;
}

export interface SettingsNavGroup<
  TValue extends string = string,
  TGroupValue extends string = string,
> {
  value: TGroupValue;
  label: string;
  description?: string;
  icon?: AppIconName;
  items: ReadonlyArray<SettingsNavItem<TValue>>;
  disabled?: boolean;
}

export type SettingsShellVariant = "card" | "drawer";

export interface SettingsShellProps<
  TValue extends string = string,
  TGroupValue extends string = string,
> {
  activeItem: TValue;
  onItemChange: (value: TValue) => void;
  groups?: ReadonlyArray<SettingsNavGroup<TValue, TGroupValue>>;
  /** @deprecated Prefer grouped navigation through `groups`. */
  items?: ReadonlyArray<SettingsNavItem<TValue>>;
  children: ReactNode;
  disabled?: boolean;
  title?: string;
  icon?: AppIconName;
  onClose?: () => void;
  contentTitle?: ReactNode;
  contentDescription?: ReactNode;
  footer?: ReactNode;
  motion?: UiMotionMode;
  variant?: SettingsShellVariant;
  id?: string;
  compactMenuId?: string;
  className?: string;
}

const FLAT_GROUP_VALUE = "__settings-flat-group__";
const GROUP_NAVIGATION_FALLBACK_MS = 240;

function findFirstEnabledItem<TValue extends string, TGroupValue extends string>(
  group: SettingsNavGroup<TValue, TGroupValue>
) {
  return group.items.find((item) => !item.disabled);
}

export function SettingsShell<TValue extends string = string, TGroupValue extends string = string>({
  activeItem,
  onItemChange,
  groups,
  items,
  children,
  disabled = false,
  title,
  icon,
  onClose,
  contentTitle,
  contentDescription,
  footer,
  motion = "default",
  variant = "card",
  id,
  compactMenuId: compactMenuIdProp,
  className,
}: SettingsShellProps<TValue, TGroupValue>) {
  const generatedId = useId();
  const contentRef = useRef<HTMLDivElement>(null);
  const compactTriggerRefs = useRef(new Map<TGroupValue, HTMLButtonElement>());
  const compactFocusRestoreGroupRef = useRef<TGroupValue | null>(null);
  const lastItemByGroupRef = useRef(new Map<TGroupValue, TValue>());
  const pendingGroupNavigationRef = useRef<{
    group: TGroupValue;
    item: TValue;
  } | null>(null);
  const pendingGroupNavigationTimerRef = useRef<number | null>(null);
  const normalizedGroups = useMemo<ReadonlyArray<SettingsNavGroup<TValue, TGroupValue>>>(() => {
    if (groups?.length) return groups;
    if (!items?.length) return [];

    return [
      {
        value: FLAT_GROUP_VALUE as TGroupValue,
        label: title ?? "设置分类",
        items,
      },
    ];
  }, [groups, items, title]);
  const activeGroup = normalizedGroups.find((group) =>
    group.items.some((item) => item.value === activeItem)
  );
  const activeGroupValue = activeGroup?.value;
  const activeItemConfig = activeGroup?.items.find((item) => item.value === activeItem);
  const initialGroup = activeGroup ?? normalizedGroups.find((group) => !group.disabled);
  const [expandedGroup, setExpandedGroup] = useState<TGroupValue | null>(
    initialGroup?.value ?? null
  );
  const [compactMenuGroup, setCompactMenuGroup] = useState<TGroupValue | null>(null);
  const [renderedCompactMenuGroup, setRenderedCompactMenuGroup] = useState<TGroupValue | null>(
    initialGroup?.value ?? null
  );
  const compactMenuOpen = compactMenuGroup !== null;
  const {
    isPresent: compactMenuPresent,
    presenceState: compactMenuPresenceState,
    shouldAnimate: shouldAnimateCompactMenu,
  } = usePresence({ isOpen: compactMenuOpen, motion });
  const compactGroup = compactMenuPresent
    ? normalizedGroups.find((group) => group.value === renderedCompactMenuGroup)
    : undefined;
  const contentTitleId = `${generatedId}-content-title`;
  const compactMenuId = compactMenuIdProp ?? `${generatedId}-compact-menu`;
  const resolvedContentTitle = contentTitle ?? activeItemConfig?.label;
  const resolvedContentDescription = contentDescription ?? activeItemConfig?.description;

  const cancelPendingGroupNavigation = useCallback(() => {
    pendingGroupNavigationRef.current = null;
    if (pendingGroupNavigationTimerRef.current !== null) {
      window.clearTimeout(pendingGroupNavigationTimerRef.current);
      pendingGroupNavigationTimerRef.current = null;
    }
  }, []);

  const commitPendingGroupNavigation = useCallback(
    (group: TGroupValue) => {
      const pendingNavigation = pendingGroupNavigationRef.current;
      if (!pendingNavigation || pendingNavigation.group !== group) return;

      cancelPendingGroupNavigation();
      startTransition(() => onItemChange(pendingNavigation.item));
    },
    [cancelPendingGroupNavigation, onItemChange]
  );

  useEffect(() => {
    if (!activeGroupValue) return;
    lastItemByGroupRef.current.set(activeGroupValue, activeItem);
    setExpandedGroup(activeGroupValue);
  }, [activeGroupValue, activeItem]);

  useEffect(() => cancelPendingGroupNavigation, [cancelPendingGroupNavigation]);

  useEffect(() => {
    contentRef.current?.scrollTo?.({ top: 0 });
  }, [activeItem]);

  useLayoutEffect(() => {
    if (compactMenuOpen) return;
    const group = compactFocusRestoreGroupRef.current;
    if (!group) return;

    compactFocusRestoreGroupRef.current = null;
    compactTriggerRefs.current.get(group)?.focus({ preventScroll: true });
  }, [compactMenuOpen]);

  useEffect(() => {
    if (!compactMenuOpen) return undefined;

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      compactFocusRestoreGroupRef.current = compactMenuGroup;
      setCompactMenuGroup(null);
    };

    document.addEventListener("keydown", handleEscape, true);
    return () => document.removeEventListener("keydown", handleEscape, true);
  }, [compactMenuGroup, compactMenuOpen]);

  const handleGroupToggle = (group: SettingsNavGroup<TValue, TGroupValue>) => {
    if (disabled || group.disabled) return;
    cancelPendingGroupNavigation();
    if (expandedGroup === group.value) {
      setExpandedGroup(null);
      return;
    }

    setExpandedGroup(group.value);
    const rememberedValue = lastItemByGroupRef.current.get(group.value);
    const rememberedItem = group.items.find(
      (item) => item.value === rememberedValue && !item.disabled
    );
    const nextItem = rememberedItem ?? findFirstEnabledItem(group);
    if (!nextItem || nextItem.value === activeItem) return;
    if (!shouldAnimateCompactMenu) {
      onItemChange(nextItem.value);
      return;
    }

    pendingGroupNavigationRef.current = {
      group: group.value,
      item: nextItem.value,
    };
    pendingGroupNavigationTimerRef.current = window.setTimeout(
      () => commitPendingGroupNavigation(group.value),
      GROUP_NAVIGATION_FALLBACK_MS
    );
  };

  const handleItemChange = (
    group: SettingsNavGroup<TValue, TGroupValue>,
    item: SettingsNavItem<TValue>
  ) => {
    if (disabled || group.disabled || item.disabled) return;
    cancelPendingGroupNavigation();
    const shouldRestoreCompactTrigger = compactMenuGroup === group.value;
    lastItemByGroupRef.current.set(group.value, item.value);
    if (item.value !== activeItem) onItemChange(item.value);
    if (shouldRestoreCompactTrigger) compactFocusRestoreGroupRef.current = group.value;
    setCompactMenuGroup(null);
  };

  const handleCompactGroupToggle = (group: SettingsNavGroup<TValue, TGroupValue>) => {
    if (disabled || group.disabled) return;
    if (compactMenuGroup === group.value) {
      setCompactMenuGroup(null);
      return;
    }

    setRenderedCompactMenuGroup(group.value);
    setCompactMenuGroup(group.value);
  };

  return (
    <section
      id={id}
      className={classNames(
        styles.settingsShell,
        variant === "drawer" && styles.settingsShellDrawer,
        className
      )}
      aria-label={title ?? "设置"}
      aria-busy={disabled || undefined}
      data-ui-motion={motion}
    >
      {(title || icon || onClose) && (
        <header className={styles.settingsShellHeader}>
          <div className={styles.settingsShellHeading}>
            {icon && <AppIcon name={icon} size="lg" />}
            {title && <h1>{title}</h1>}
          </div>
          {onClose && (
            <IconButton
              aria-label="关闭设置"
              disabled={disabled}
              icon="action.close"
              size="sm"
              onClick={onClose}
            />
          )}
        </header>
      )}

      <div className={styles.settingsShellWorkspace}>
        <aside className={styles.settingsSidebar} aria-label="设置导航">
          <nav className={styles.settingsNav} aria-label="设置分组">
            {normalizedGroups.map((group) => {
              const groupActive = group.value === activeGroup?.value;
              const expanded = group.value === expandedGroup;
              const groupRegionId = `${generatedId}-group-${group.value}`;

              return (
                <section className={styles.settingsNavGroup} key={group.value}>
                  <button
                    className={classNames(
                      styles.settingsGroupButton,
                      groupActive && styles.settingsGroupButtonActive
                    )}
                    type="button"
                    aria-controls={groupRegionId}
                    aria-expanded={expanded}
                    data-settings-group={group.value}
                    disabled={disabled || group.disabled}
                    onClick={() => handleGroupToggle(group)}
                  >
                    <span className={styles.settingsGroupIcon}>
                      <AppIcon name={group.icon ?? "feature.settings"} size="lg" />
                    </span>
                    <span className={styles.settingsGroupText}>
                      <strong>{group.label}</strong>
                      {group.description && <small>{group.description}</small>}
                    </span>
                    <AppIcon
                      className={classNames(
                        styles.settingsGroupChevron,
                        expanded && styles.settingsGroupChevronExpanded
                      )}
                      name="action.expand"
                      size="sm"
                    />
                  </button>
                  <div
                    className={classNames(
                      styles.settingsItemsRegion,
                      expanded && styles.settingsItemsRegionExpanded
                    )}
                    id={groupRegionId}
                    aria-hidden={!expanded}
                    inert={expanded ? undefined : true}
                    onTransitionEnd={(event) => {
                      if (
                        event.target === event.currentTarget &&
                        event.propertyName === "grid-template-rows"
                      ) {
                        commitPendingGroupNavigation(group.value);
                      }
                    }}
                  >
                    <div className={styles.settingsItems} role="group" aria-label={group.label}>
                      {group.items.map((item) => {
                        const itemActive = item.value === activeItem;
                        return (
                          <button
                            className={classNames(
                              styles.settingsNavItem,
                              itemActive && styles.settingsNavItemActive
                            )}
                            key={item.value}
                            type="button"
                            aria-current={itemActive ? "page" : undefined}
                            data-settings-pane={item.value}
                            disabled={disabled || group.disabled || item.disabled}
                            onClick={() => handleItemChange(group, item)}
                          >
                            {item.icon && <AppIcon name={item.icon} size="lg" />}
                            <span>{item.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </section>
              );
            })}
          </nav>
        </aside>

        <div
          className={styles.settingsCompactNavigation}
          onMouseLeave={() => setCompactMenuGroup(null)}
        >
          <nav className={styles.settingsCompactRail} aria-label="设置紧凑导航">
            {normalizedGroups.map((group, index) => {
              const groupActive = group.value === activeGroup?.value;
              const expanded = group.value === compactMenuGroup;
              return (
                <IconButton
                  key={group.value}
                  ref={(element) => {
                    if (element) compactTriggerRefs.current.set(group.value, element);
                    else compactTriggerRefs.current.delete(group.value);
                  }}
                  aria-label={group.label}
                  aria-current={groupActive ? "page" : undefined}
                  aria-controls={expanded ? compactMenuId : undefined}
                  aria-expanded={expanded}
                  data-settings-group={group.value}
                  disabled={disabled || group.disabled}
                  icon={group.icon ?? activeItemConfig?.icon ?? "feature.settings"}
                  size="lg"
                  variant="ghost"
                  onClick={() => handleCompactGroupToggle(group)}
                  style={{ "--settings-group-index": index } as CSSProperties}
                />
              );
            })}
          </nav>

          {compactGroup && (
            <section
              className={styles.settingsCompactMenu}
              id={compactMenuId}
              aria-labelledby={`${compactMenuId}-title`}
              aria-hidden={compactMenuOpen ? undefined : "true"}
              data-ui-motion={shouldAnimateCompactMenu ? "default" : "none"}
              data-ui-presence={compactMenuPresenceState}
              inert={compactMenuOpen ? undefined : true}
              style={
                {
                  "--settings-compact-menu-top": `${
                    10 +
                    Math.max(
                      0,
                      normalizedGroups.findIndex(
                        (group) => group.value === renderedCompactMenuGroup
                      )
                    ) *
                      50
                  }px`,
                } as CSSProperties
              }
            >
              <header className={styles.settingsCompactMenuHeader}>
                <strong id={`${compactMenuId}-title`}>{compactGroup.label}</strong>
                {compactGroup.description && <span>{compactGroup.description}</span>}
              </header>
              <nav
                className={styles.settingsCompactItems}
                aria-label={`${compactGroup.label}子分类`}
              >
                {compactGroup.items.map((item) => {
                  const itemActive = item.value === activeItem;
                  return (
                    <button
                      className={classNames(
                        styles.settingsCompactItem,
                        itemActive && styles.settingsCompactItemActive
                      )}
                      key={item.value}
                      type="button"
                      data-settings-pane={item.value}
                      aria-current={itemActive ? "page" : undefined}
                      disabled={disabled || compactGroup.disabled || item.disabled}
                      onClick={() => handleItemChange(compactGroup, item)}
                    >
                      {item.icon && <AppIcon name={item.icon} size="lg" />}
                      <span>{item.label}</span>
                    </button>
                  );
                })}
              </nav>
            </section>
          )}
        </div>

        {compactGroup && (
          <button
            className={styles.settingsCompactScrim}
            type="button"
            aria-label="关闭设置子菜单"
            aria-hidden={compactMenuOpen ? undefined : "true"}
            data-ui-motion={shouldAnimateCompactMenu ? "default" : "none"}
            data-ui-presence={compactMenuPresenceState}
            inert={compactMenuOpen ? undefined : true}
            tabIndex={-1}
            onClick={() => setCompactMenuGroup(null)}
          />
        )}

        <section
          className={styles.settingsMain}
          aria-labelledby={resolvedContentTitle ? contentTitleId : undefined}
        >
          {(resolvedContentTitle || resolvedContentDescription) && (
            <header
              className={styles.settingsContentHeader}
              data-clarity-mask="true"
              key={activeItem}
            >
              {activeGroup?.label && (
                <span className={styles.settingsContentGroup}>{activeGroup.label}</span>
              )}
              {resolvedContentTitle && <h2 id={contentTitleId}>{resolvedContentTitle}</h2>}
              {resolvedContentDescription && <p>{resolvedContentDescription}</p>}
            </header>
          )}
          <div ref={contentRef} className={styles.settingsBody} data-clarity-mask="true">
            {children}
          </div>
          {footer && <footer className={styles.settingsFooter}>{footer}</footer>}
        </section>
      </div>
    </section>
  );
}
