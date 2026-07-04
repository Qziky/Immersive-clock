import { Check, ChevronDown, Search } from "lucide-react";
import type { CSSProperties, ReactNode } from "react";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { classNames } from "../utils/classNames";

import styles from "./primitives.module.css";

export type DropdownValue = string | number;
export type DropdownMode = "single" | "multiple";

export interface DropdownOption {
  value: DropdownValue;
  label: string;
  description?: string;
  disabled?: boolean;
  icon?: ReactNode;
}

export interface DropdownGroup {
  label: string;
  options: DropdownOption[];
}

export interface DropdownProps {
  label?: string;
  hint?: string;
  error?: string;
  placeholder?: string;
  value?: DropdownValue | DropdownValue[];
  defaultValue?: DropdownValue | DropdownValue[];
  options?: DropdownOption[];
  groups?: DropdownGroup[];
  mode?: DropdownMode;
  searchable?: boolean;
  disabled?: boolean;
  maxMenuHeight?: number;
  menuWidth?: number | string;
  width?: number | string;
  variant?: "default" | "ghost";
  renderLabel?: (option: DropdownOption) => string;
  portalContainer?: HTMLElement | null;
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

export function Dropdown({
  label,
  hint,
  error,
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
  renderLabel,
  portalContainer,
  className,
  onChange,
}: DropdownProps) {
  const generatedId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [internalValue, setInternalValue] = useState(defaultValue);
  const [menuStyle, setMenuStyle] = useState<CSSProperties>();

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
            option.description?.toLowerCase().includes(normalizedQuery),
        ),
      }))
      .filter((group) => group.options.length > 0);
  }, [normalizedGroups, query]);

  const flattenedOptions = useMemo(
    () => normalizedGroups.flatMap((group) => group.options),
    [normalizedGroups],
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
    const numericWidth = typeof resolvedWidth === "number" ? resolvedWidth : rect.width;
    const left = Math.max(8, Math.min(rect.left, window.innerWidth - numericWidth - 8));

    setMenuStyle({
      left,
      top: rect.bottom + 8,
      width: resolvedWidth,
    });
  }, [menuWidth, width]);

  useEffect(() => {
    if (!isOpen) {
      return undefined;
    }

    updatePosition();
    const closeOnPointerDown = (event: PointerEvent) => {
      const trigger = triggerRef.current;
      const target = event.target;

      if (target instanceof Node && trigger?.contains(target)) {
        return;
      }

      if (
        target instanceof Element &&
        target.closest(`[data-dropdown-menu="${generatedId}"]`)
      ) {
        return;
      }

      setIsOpen(false);
    };

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsOpen(false);
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
  }, [generatedId, isOpen, updatePosition]);

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
    isOpen && typeof document !== "undefined"
      ? createPortal(
          <div
            className={styles.dropdownMenu}
            data-dropdown-menu={generatedId}
            style={menuStyle}
          >
            {searchable && (
              <label className={styles.dropdownSearch}>
                <Search size={14} aria-hidden="true" />
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
                          selected && styles.dropdownOptionSelected,
                        )}
                        disabled={option.disabled}
                        key={String(option.value)}
                        onClick={() => handleSelect(option)}
                        role="option"
                        type="button"
                        aria-selected={selected}
                      >
                        {option.icon && (
                          <span className={styles.dropdownOptionIcon}>{option.icon}</span>
                        )}
                        <span className={styles.dropdownOptionText}>
                          <span>{option.label}</span>
                          {option.description && <small>{option.description}</small>}
                        </span>
                        {selected && <Check size={14} aria-hidden="true" />}
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>,
          portalContainer ?? document.body,
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
          error && styles.inputError,
          !selectedLabels.length && styles.dropdownPlaceholder,
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
        <span className={styles.dropdownValue}>{displayText}</span>
        <ChevronDown className={styles.dropdownChevron} size={14} aria-hidden="true" />
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
