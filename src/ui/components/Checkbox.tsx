import { Check } from "lucide-react";
import type { InputHTMLAttributes, ReactNode } from "react";
import { useId } from "react";

import styles from "./primitives.module.css";

export interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "type"> {
  label: ReactNode;
  error?: ReactNode;
}

export function Checkbox({ label, id, error, ...props }: CheckboxProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;

  return (
    <span className={styles.checkGroup}>
      <label className={styles.checkRow} htmlFor={inputId}>
        <input className={styles.checkboxInput} id={inputId} type="checkbox" {...props} />
        <span className={styles.checkboxBox} aria-hidden="true">
          <Check size={12} strokeWidth={3} />
        </span>
        <span>{label}</span>
      </label>
      {error && <span className={styles.errorText}>{error}</span>}
    </span>
  );
}
