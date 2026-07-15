import type { CSSProperties } from "react";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { classNames } from "../../utils/classNames";
import { AppIcon, type AppIconName } from "../icons/AppIcon";
import type { UiMotionMode } from "../types";
import { useOverlayLayer } from "../utils/overlayStack";
import { usePresence } from "../utils/usePresence";

import styles from "./primitives.module.css";

export type DropdownValue = string | number;
export type DropdownMode = "single" | "multiple";

export interface DropdownOption {
  value: DropdownValue;
  label: string;
  description?: string;
  disabled?: boolean;
  icon?: AppIconName;
}

export interface DropdownGroup {
  label: string;
  options: readonly DropdownOption[];
}

export interface DropdownProps {
  label?: string;
  hint?: string;
  error?: string;
  prefixIcon?: AppIconName;
  placeholder?: string;
  value?: DropdownValue | DropdownValue[];
  defaultValue?: DropdownValue | DropdownValue[];
  options?: readonly DropdownOption[];
  groups?: readonly DropdownGroup[];
  mode?: DropdownMode;
  searchable?: boolean;
  disabled?: boolean;
  maxMenuHeight?: number;
  menuWidth?: number | string;
  width?: number | string;
  variant?: "default" | "ghost";
  renderLabel?: (option: DropdownOption) => string;
  portalContainer?: HTMLElement | null;
  motion?: UiMotionMode;
  className?: string;
  onChange?: (value: DropdownValue | DropdownValue[] | undefined) => void;
}

function normalizeValue(value: DropdownValue | DropdownValue[] | undefined) {
  if (Array.isArray(value)) {
    return value;
  }

  return value === undefined ? [] : [value];
}

function formatMenuWidth(width: number | string | undefined, fallback: number) {
  if (typeof width === "number") {
    return width;
  }

  return width ?? fallback;
}

function getPositioningWidth(width: number | string, fallback: number) {
  if (typeof width === "number") return width;
  const pixelWidth = /^([0-9]+(?:\.[0-9]+)?)px$/.exec(width.trim());
  return pixelWidth ? Number(pixelWidth[1]) : fallback;
}

export function Dropdown({
  label,
  hint,
  error,
  prefixIcon,
  placeholder = "请选择",
  value,
  defaultValue,
  options,
  groups,
  mode = "single",
  searchable = false,
  disabled = false,
  maxMenuHeight = 260,
  menuWidth,
  width,
  variant = "default",
  renderLabel,
  portalContainer,
  motion = "default",
  className,
  onChange,
}: DropdownProps) {
  const generatedId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [internalValue, setInternalValue] = useState(defaultValue);
  const [menuStyle, setMenuStyle] = useState<CSSProperties>();
  const { isPresent, presenceState, shouldAnimate } = usePresence({ isOpen, motion });
  const { isTop, zIndex } = useOverlayLayer({ active: isOpen, type: "floating" });

  const resolvedValue = value ?? internalValue;
  const selectedValues = useMemo(() => new Set(normalizeValue(resolvedValue)), [resolvedValue]);
  const hintId = hint ? `${generatedId}-hint` : undefined;
  const errorId = error ? `${generatedId}-error` : undefined;
  const listboxId = `${generatedId}-listbox`;

  const normalizedGroups = useMemo(() => {
    if (groups?.length) {
      return groups;
    }

    return [{ label: "", options: options ?? [] }];
  }, [groups, options]);

  const filteredGroups = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    if (!normalizedQuery) {
      return normalizedGroups;
    }

    return normalizedGroups
      .map((group) => ({
        ...group,
        options: group.options.filter(
          (option) =>
            option.label.toLowerCase().includes(normalizedQuery) ||
            option.description?.toLowerCase().includes(normalizedQuery)
        ),
      }))
      .filter((group) => group.options.length > 0);
  }, [normalizedGroups, query]);

  const flattenedOptions = useMemo(
    () => normalizedGroups.flatMap((group) => group.options),
    [normalizedGroups]
  );

  const selectedLabels = flattenedOptions
    .filter((option) => selectedValues.has(option.value))
    .map((option) => (renderLabel ? renderLabel(option) : option.label));

  const updatePosition = useCallback(() => {
    const trigger = triggerRef.current;

    if (!trigger) {
      return;
    }

    const rect = trigger.getBoundingClientRect();
    const resolvedWidth = formatMenuWidth(menuWidth ?? width, rect.width);
    const viewportInset = 8;
    const menuGap = 8;
    const maximumWidth = Math.max(0, window.innerWidth - viewportInset * 2);
    const measuredWidth = menuRef.current?.getBoundingClientRect().width ?? 0;
    const numericWidth = Math.min(
      measuredWidth || getPositioningWidth(resolvedWidth, rect.width),
      maximumWidth
    );
    const menuHeight = menuRef.current?.offsetHeight ?? 0;
    const availableBelow = window.innerHeight - rect.bottom - menuGap - viewportInset;
    const availableAbove = rect.top - menuGap - viewportInset;
    const openAbove = menuHeight > availableBelow && availableAbove > availableBelow;
    const preferredTop = openAbove ? rect.top - menuGap - menuHeight : rect.bottom + menuGap;
    const maximumTop = Math.max(viewportInset, window.innerHeight - menuHeight - viewportInset);
    const left = Math.max(
      viewportInset,
      Math.min(rect.left, window.innerWidth - numericWidth - viewportInset)
    );
    const top = Math.max(viewportInset, Math.min(preferredTop, maximumTop));

    setMenuStyle({
      left,
      maxWidth: `calc(100vw - ${viewportInset * 2}px)`,
      top,
      width: resolvedWidth,
    });
  }, [menuWidth, width]);

  useEffect(() => {
    if (!isOpen) {
      return undefined;
    }

    const closeOnPointerDown = (event: PointerEvent) => {
      const trigger = triggerRef.current;
      const target = event.target;

      if (target instanceof Node && trigger?.contains(target)) {
        return;
      }

      if (target instanceof Element && target.closest(`[data-dropdown-menu="${generatedId}"]`)) {
        return;
      }

      setIsOpen(false);
    };

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && isTop()) {
        event.preventDefault();
        setIsOpen(false);
        queueMicrotask(() => triggerRef.current?.focus({ preventScroll: true }));
      }
    };

    document.addEventListener("pointerdown", closeOnPointerDown);
    document.addEventListener("keydown", closeOnEscape);
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);

    return () => {
      document.removeEventListener("pointerdown", closeOnPointerDown);
      document.removeEventListener("keydown", closeOnEscape);
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [generatedId, isOpen, isTop, updatePosition]);

  useEffect(() => {
    if (!isOpen) return;
    updatePosition();
  }, [filteredGroups, isOpen, updatePosition]);

  useEffect(() => {
    if (!isOpen || typeof ResizeObserver === "undefined") return undefined;
    const observer = new ResizeObserver(updatePosition);
    if (triggerRef.current) observer.observe(triggerRef.current);
    if (menuRef.current) observer.observe(menuRef.current);
    return () => observer.disconnect();
  }, [isOpen, updatePosition]);

  const commitValue = (nextValue: DropdownValue | DropdownValue[] | undefined) => {
    if (value === undefined) {
      setInternalValue(nextValue);
    }

    onChange?.(nextValue);
  };

  const handleSelect = (option: DropdownOption) => {
    if (option.disabled) {
      return;
    }

    if (mode === "multiple") {
      const nextValues = new Set(selectedValues);

      if (nextValues.has(option.value)) {
        nextValues.delete(option.value);
      } else {
        nextValues.add(option.value);
      }

      commitValue(Array.from(nextValues));
      return;
    }

    commitValue(option.value);
    setIsOpen(false);
  };

  const displayText =
    selectedLabels.length > 0
      ? mode === "multiple"
        ? selectedLabels.join("、")
        : selectedLabels[0]
      : placeholder;

  const menu =
    isPresent && typeof document !== "undefined"
      ? createPortal(
          <div
            ref={menuRef}
            className={styles.dropdownMenu}
            data-dropdown-menu={generatedId}
            data-ui-motion={shouldAnimate ? "default" : "none"}
            data-ui-overlay-root
            data-ui-presence={presenceState}
            data-ui-scope
            style={{ ...menuStyle, zIndex }}
          >
            {searchable && (
              <label className={styles.dropdownSearch}>
                <AppIcon name="action.search" size="sm" />
                <input
                  autoFocus
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="搜索选项"
                />
              </label>
            )}
            <div
              className={styles.dropdownList}
              id={listboxId}
              role="listbox"
              aria-multiselectable={mode === "multiple" ? true : undefined}
              style={{ maxHeight: maxMenuHeight }}
            >
              {filteredGroups.length === 0 && (
                <div className={styles.dropdownEmpty}>没有匹配的选项</div>
              )}
              {filteredGroups.map((group) => (
                <div className={styles.dropdownGroup} key={group.label || "default"}>
                  {group.label && <div className={styles.dropdownGroupLabel}>{group.label}</div>}
                  {group.options.map((option) => {
                    const selected = selectedValues.has(option.value);

                    return (
                      <button
                        className={classNames(
                          styles.dropdownOption,
                          selected && styles.dropdownOptionSelected
                        )}
                        disabled={option.disabled}
                        key={String(option.value)}
                        onClick={() => handleSelect(option)}
                        role="option"
                        type="button"
                        aria-selected={selected}
                      >
                        {option.icon && (
                          <span className={styles.dropdownOptionIcon}>
                            <AppIcon name={option.icon} />
                          </span>
                        )}
                        <span className={styles.dropdownOptionText}>
                          <span>{option.label}</span>
                          {option.description && <small>{option.description}</small>}
                        </span>
                        {selected && <AppIcon name="status.selected" size="sm" />}
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>,
          portalContainer ?? document.body
        )
      : null;

  return (
    <div className={classNames(styles.field, className)}>
      {(label || hint) && (
        <div className={styles.fieldLabelRow}>
          {label && (
            <label className={styles.label} id={`${generatedId}-label`}>
              {label}
            </label>
          )}
          {hint && (
            <span className={styles.hint} id={hintId}>
              {hint}
            </span>
          )}
        </div>
      )}
      <button
        ref={triggerRef}
        className={classNames(
          styles.dropdownTrigger,
          variant === "ghost" ? styles.dropdownTriggerGhost : styles.dropdownTriggerDefault,
          error && styles.inputError,
          !selectedLabels.length && styles.dropdownPlaceholder
        )}
        disabled={disabled}
        style={width ? { width } : undefined}
        onClick={() => {
          setIsOpen((open) => !open);
          setQuery("");
        }}
        type="button"
        aria-controls={listboxId}
        aria-describedby={classNames(hintId, errorId) || undefined}
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        aria-invalid={error ? true : undefined}
        aria-labelledby={label ? `${generatedId}-label` : undefined}
      >
        {prefixIcon && (
          <AppIcon
            aria-hidden="true"
            className={styles.dropdownTriggerIcon}
            name={prefixIcon}
            size="sm"
          />
        )}
        <span className={styles.dropdownValue}>{displayText}</span>
        <AppIcon className={styles.dropdownChevron} name="action.expand" size="sm" />
      </button>
      {error && (
        <span className={styles.errorText} id={errorId}>
          {error}
        </span>
      )}
      {menu}
    </div>
  );
}
