import type { HTMLAttributes, ReactNode, TextareaHTMLAttributes } from "react";
import { useId } from "react";

import { classNames } from "../utils/classNames";

import styles from "./primitives.module.css";

export interface FormSectionProps extends HTMLAttributes<HTMLElement> {
  title: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
}

export function FormSection({
  title,
  description,
  action,
  children,
  className,
  ...props
}: FormSectionProps) {
  return (
    <section className={classNames(styles.formSection, className)} {...props}>
      <header className={styles.formSectionHeader}>
        <div>
          <h3 className={styles.formSectionTitle}>{title}</h3>
          {description && <p className={styles.formSectionDescription}>{description}</p>}
        </div>
        {action && <div className={styles.formSectionAction}>{action}</div>}
      </header>
      <div className={styles.formSectionBody}>{children}</div>
    </section>
  );
}

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  hint?: string;
  error?: string;
}

export function Textarea({ label, hint, error, className, id, ...props }: TextareaProps) {
  const generatedId = useId();
  const textareaId = id ?? generatedId;
  const hintId = hint ? `${textareaId}-hint` : undefined;
  const errorId = error ? `${textareaId}-error` : undefined;

  return (
    <div className={styles.field}>
      {(label || hint) && (
        <div className={styles.fieldLabelRow}>
          {label && (
            <label className={styles.label} htmlFor={textareaId}>
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
      <textarea
        className={classNames(styles.textarea, error && styles.inputError, className)}
        id={textareaId}
        aria-invalid={error ? true : undefined}
        aria-describedby={classNames(hintId, errorId) || undefined}
        {...props}
      />
      {error && (
        <span className={styles.errorText} id={errorId}>
          {error}
        </span>
      )}
    </div>
  );
}
