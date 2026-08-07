import type { FocusEvent } from "react";
import { useCallback, useEffect, useRef } from "react";
import { createPortal } from "react-dom";

import styles from "./primitives.module.css";
import { Toast, type ToastProps } from "./Toast";

export type ToastDismissReason = "timeout" | "close" | "programmatic";

export const TOAST_EXIT_DURATION_MS = 180;

export interface ToastMessage extends Omit<ToastProps, "motion" | "onClose"> {
  id: string;
  revision: number;
  duration?: number | null;
  presence?: "entering" | "exiting";
  onDismiss?: (reason: ToastDismissReason) => void;
}

export interface ToastViewportProps {
  toasts: readonly ToastMessage[];
  onDismiss: (id: string, reason: ToastDismissReason) => void;
}

interface TimedToastProps {
  toast: ToastMessage;
  onDismiss: (id: string, reason: ToastDismissReason) => void;
}

function TimedToast({ toast, onDismiss }: TimedToastProps) {
  const presence = toast.presence ?? "entering";
  const isExiting = presence === "exiting";
  const duration = isExiting
    ? null
    : toast.action
      ? null
      : toast.duration === undefined
        ? 5000
        : toast.duration;
  const remainingRef = useRef(duration ?? 0);
  const startedAtRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const pauseReasonsRef = useRef(new Set<"focus" | "hover">());

  const clearTimer = useCallback(() => {
    if (timerRef.current !== undefined) {
      clearTimeout(timerRef.current);
      timerRef.current = undefined;
    }
  }, []);

  const startTimer = useCallback(() => {
    if (duration === null || pauseReasonsRef.current.size > 0) return;

    clearTimer();
    startedAtRef.current = performance.now();
    timerRef.current = setTimeout(() => onDismiss(toast.id, "timeout"), remainingRef.current);
  }, [clearTimer, duration, onDismiss, toast.id]);

  const pauseTimer = (reason: "focus" | "hover") => {
    if (duration === null || pauseReasonsRef.current.has(reason)) return;

    pauseReasonsRef.current.add(reason);
    if (timerRef.current !== undefined) {
      remainingRef.current = Math.max(
        0,
        remainingRef.current - (performance.now() - startedAtRef.current)
      );
    }
    clearTimer();
  };

  const resumeTimer = (reason: "focus" | "hover") => {
    pauseReasonsRef.current.delete(reason);
    if (pauseReasonsRef.current.size === 0) startTimer();
  };

  useEffect(() => {
    remainingRef.current = duration ?? 0;
    if (!isExiting) startTimer();
    return clearTimer;
  }, [clearTimer, duration, isExiting, startTimer, toast.revision]);

  const handleBlur = (event: FocusEvent<HTMLDivElement>) => {
    if (!event.currentTarget.contains(event.relatedTarget)) resumeTimer("focus");
  };

  return (
    <div
      className={styles.toastItem}
      data-ui-motion="default"
      data-ui-presence={presence}
      aria-hidden={isExiting || undefined}
      onMouseEnter={() => pauseTimer("hover")}
      onMouseLeave={() => resumeTimer("hover")}
      onFocusCapture={() => pauseTimer("focus")}
      onBlurCapture={handleBlur}
    >
      <Toast
        variant={toast.variant}
        title={toast.title}
        description={toast.description}
        icon={toast.icon}
        accentColor={toast.accentColor}
        action={toast.action}
        role={toast.role}
        className={toast.className}
        motion="none"
        onClose={isExiting ? undefined : () => onDismiss(toast.id, "close")}
      />
    </div>
  );
}

export function ToastViewport({ toasts, onDismiss }: ToastViewportProps) {
  if (typeof document === "undefined") return null;

  return createPortal(
    <div className={styles.toastViewport} data-ui-overlay-root data-ui-scope aria-label="通知">
      {toasts.slice(0, 3).map((toast) => (
        <TimedToast key={toast.id} toast={toast} onDismiss={onDismiss} />
      ))}
    </div>,
    document.body
  );
}
