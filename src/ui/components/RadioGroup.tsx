import type { ReactNode } from "react";
import { useId } from "react";

import { classNames } from "../utils/classNames";

import styles from "./primitives.module.css";

export interface RadioOption<TValue extends string = string> {
  value: TValue;
  label: ReactNode;
  disabled?: boolean;
}

export interface RadioGroupProps<TValue extends string = string> {
  value: TValue;
  options: Array<RadioOption<TValue>>;
  onChange: (value: TValue) => void;
  label?: string;
  name?: string;
  error?: ReactNode;
  className?: string;
  variant?: "segmented" | "list";
}

export function RadioGroup<TValue extends string = string>({
  value,
  options,
  onChange,
  label,
  name,
  error,
  className,
  variant = "segmented",
}: RadioGroupProps<TValue>) {
  const generatedName = useId();
  const groupName = name ?? generatedName;
  const segmented = variant === "segmented";

  return (
    <div className={classNames(segmented && styles.radioFieldSegmented, className)}>
      {label && <div className={styles.label}>{label}</div>}
      <div
        className={classNames(styles.radioGroup, segmented && styles.radioGroupSegmented)}
        role="radiogroup"
        aria-label={label}
      >
        {options.map((option) => (
          <label
            key={option.value}
            className={classNames(
              styles.radioRow,
              segmented && styles.radioRowSegmented,
              segmented && option.value === value && styles.radioRowSegmentedActive,
              option.disabled && styles.radioRowDisabled
            )}
          >
            <input
              className={styles.radioInput}
              type="radio"
              name={groupName}
              value={option.value}
              checked={option.value === value}
              disabled={option.disabled}
              onChange={() => onChange(option.value)}
            />
            {segmented ? null : <span className={styles.radioDot} aria-hidden="true" />}
            <span className={styles.radioLabelText}>{option.label}</span>
          </label>
        ))}
      </div>
      {error && <span className={styles.errorText}>{error}</span>}
    </div>
  );
}
