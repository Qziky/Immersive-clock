import { ChevronDown } from "lucide-react";
import type { SelectHTMLAttributes } from "react";
import { useId } from "react";

import { classNames } from "../utils/classNames";

import styles from "./primitives.module.css";

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  hint?: string;
  error?: string;
  options: SelectOption[];
}

export function Select({ label, hint, error, options, className, id, ...props }: SelectProps) {
  const generatedId = useId();
  const selectId = id ?? generatedId;
  const hintId = hint ? `${selectId}-hint` : undefined;
  const errorId = error ? `${selectId}-error` : undefined;

  return (
    <div className={styles.field}>
      {(label || hint) && (
        <div className={styles.fieldLabelRow}>
          {label && (
            <label className={styles.label} htmlFor={selectId}>
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
      <span className={styles.selectWrap}>
        <select
          className={classNames(styles.select, error && styles.selectError, className)}
          id={selectId}
          aria-invalid={error ? true : undefined}
          aria-describedby={classNames(hintId, errorId) || undefined}
          {...props}
        >
          {options.map((option) => (
            <option key={option.value} value={option.value} disabled={option.disabled}>
              {option.label}
            </option>
          ))}
        </select>
        <ChevronDown className={styles.selectChevron} size={14} aria-hidden="true" />
      </span>
      {error && (
        <span className={styles.errorText} id={errorId}>
          {error}
        </span>
      )}
    </div>
  );
}
