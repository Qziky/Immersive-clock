import type { InputHTMLAttributes, ReactNode } from "react";
import { useId } from "react";

import { classNames } from "../utils/classNames";

import { Button } from "./Button";
import { Field } from "./Field";
import styles from "./primitives.module.css";

export interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "prefix"> {
  label?: string;
  hint?: string;
  error?: string;
  prefix?: ReactNode;
  suffix?: ReactNode;
  variant?: "default" | "time" | "number";
  buttonText?: string;
  fileName?: string;
  onFileChange?: (file: File | null) => void;
}

export function Input({
  label,
  hint,
  error,
  prefix,
  suffix,
  className,
  id,
  type,
  variant,
  buttonText = "选择文件",
  fileName,
  onFileChange,
  ...props
}: InputProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const hasAffix = Boolean(prefix || suffix);

  if (type === "file" || onFileChange || fileName !== undefined) {
    return (
      <Field label={label} hint={hint} error={error} controlId={inputId}>
        {({ controlId, describedBy, invalid }) => (
          <span className={styles.filePicker}>
            <span
              className={classNames(
                styles.filePickerName,
                !fileName && styles.filePickerEmpty,
                invalid && styles.inputError,
              )}
            >
              {fileName || props.placeholder || "未选择文件"}
            </span>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={props.disabled}
              onClick={() => document.getElementById(controlId)?.click()}
            >
              {buttonText}
            </Button>
            <input
              className={styles.fileInput}
              id={controlId}
              type="file"
              aria-invalid={invalid || undefined}
              aria-describedby={describedBy}
              onChange={(event) => onFileChange?.(event.target.files?.[0] ?? null)}
              {...props}
            />
          </span>
        )}
      </Field>
    );
  }

  return (
    <Field label={label} hint={hint} error={error} controlId={inputId}>
      {({ controlId, describedBy, invalid }) => (
        <span
          className={classNames(
            hasAffix && styles.inputShell,
            hasAffix && invalid && styles.inputError,
          )}
        >
          {prefix && <span className={styles.inputAffix}>{prefix}</span>}
          <input
            className={classNames(
              hasAffix ? styles.inputBare : styles.input,
              type === "color" && styles.inputColor,
              type === "file" && styles.inputFile,
              (variant === "time" || type === "time") && styles.inputTime,
              (variant === "number" || type === "number") && styles.inputNumber,
              invalid && !hasAffix && styles.inputError,
              className,
            )}
            id={controlId}
            type={type}
            aria-invalid={invalid || undefined}
            aria-describedby={describedBy}
            {...props}
          />
          {suffix && <span className={styles.inputAffix}>{suffix}</span>}
        </span>
      )}
    </Field>
  );
}
