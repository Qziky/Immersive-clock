import { Minus, Plus } from "lucide-react";

import styles from "./primitives.module.css";

export interface StepperProps {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  label?: string;
  formatValue?: (value: number) => string;
}

function clampValue(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function Stepper({
  value,
  onChange,
  min = Number.NEGATIVE_INFINITY,
  max = Number.POSITIVE_INFINITY,
  step = 1,
  label = "数值步进器",
  formatValue,
}: StepperProps) {
  const displayValue = formatValue ? formatValue(value) : String(value);
  const decrease = () => onChange(clampValue(value - step, min, max));
  const increase = () => onChange(clampValue(value + step, min, max));

  return (
    <div className={styles.stepper} role="group" aria-label={label}>
      <button
        className={styles.stepperButton}
        type="button"
        onClick={decrease}
        disabled={value <= min}
        aria-label="减少"
      >
        <Minus size={14} aria-hidden="true" />
      </button>
      <span className={styles.stepperValue} aria-live="polite">
        {displayValue}
      </span>
      <button
        className={styles.stepperButton}
        type="button"
        onClick={increase}
        disabled={value >= max}
        aria-label="增加"
      >
        <Plus size={14} aria-hidden="true" />
      </button>
    </div>
  );
}
