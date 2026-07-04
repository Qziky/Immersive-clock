import type { HTMLAttributes, ReactNode } from "react";
import { useId } from "react";

import { classNames } from "../utils/classNames";

import styles from "./primitives.module.css";

export interface FieldRenderProps {
  controlId: string;
  describedBy?: string;
  invalid?: boolean;
}

export interface FieldProps extends Omit<HTMLAttributes<HTMLDivElement>, "children"> {
  label?: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  controlId?: string;
  children: ReactNode | ((props: FieldRenderProps) => ReactNode);
}

export function Field({
  label,
  hint,
  error,
  controlId,
  children,
  className,
  ...props
}: FieldProps) {
  const generatedId = useId();
  const resolvedId = controlId ?? generatedId;
  const hintId = hint ? `${resolvedId}-hint` : undefined;
  const errorId = error ? `${resolvedId}-error` : undefined;
  const describedBy = classNames(hintId, errorId) || undefined;

  return (
    <div className={classNames(styles.field, className)} {...props}>
      {(label || hint) && (
        <div className={styles.fieldLabelRow}>
          {label && (
            <label className={styles.label} htmlFor={resolvedId}>
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
      {typeof children === "function"
        ? children({ controlId: resolvedId, describedBy, invalid: Boolean(error) })
        : children}
      {error && (
        <span className={styles.errorText} id={errorId}>
          {error}
        </span>
      )}
    </div>
  );
}
