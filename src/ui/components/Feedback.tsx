import type { ReactNode } from "react";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";

import { ConfirmDialog } from "./ConfirmDialog";
import { ToastViewport, type ToastDismissReason, type ToastMessage } from "./ToastViewport";

export interface NotifyOptions extends Omit<ToastMessage, "id" | "revision"> {
  id?: string;
}

export interface ConfirmOptions {
  title: string;
  description?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "default" | "danger";
}

export interface FeedbackContextValue {
  notify: (options: NotifyOptions) => string;
  dismiss: (id: string, reason?: ToastDismissReason) => void;
  confirm: (options: ConfirmOptions) => Promise<boolean>;
}

interface FeedbackProviderProps {
  children: ReactNode;
}

interface ConfirmRequest extends ConfirmOptions {
  id: string;
  resolve: (confirmed: boolean) => void;
}

const FeedbackContext = createContext<FeedbackContextValue | null>(null);
let nextFeedbackId = 0;
let nextToastRevision = 0;

function createFeedbackId(prefix: string) {
  nextFeedbackId += 1;
  return `${prefix}-${nextFeedbackId}`;
}

export function FeedbackProvider({ children }: FeedbackProviderProps) {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [confirmations, setConfirmations] = useState<ConfirmRequest[]>([]);
  const toastsRef = useRef<ToastMessage[]>([]);
  const confirmationsRef = useRef<ConfirmRequest[]>([]);

  const dismiss = useCallback((id: string, reason: ToastDismissReason = "programmatic") => {
    const dismissedToast = toastsRef.current.find((toast) => toast.id === id);
    if (!dismissedToast) return;

    const next = toastsRef.current.filter((toast) => toast.id !== id);
    toastsRef.current = next;
    setToasts(next);
    dismissedToast.onDismiss?.(reason);
  }, []);

  const notify = useCallback((options: NotifyOptions) => {
    const id = options.id ?? createFeedbackId("toast");
    nextToastRevision += 1;
    const toast: ToastMessage = { ...options, id, revision: nextToastRevision };
    const existingIndex = toastsRef.current.findIndex((item) => item.id === id);
    const next =
      existingIndex === -1
        ? [...toastsRef.current, toast]
        : toastsRef.current.map((item, index) => (index === existingIndex ? toast : item));

    toastsRef.current = next;
    setToasts(next);
    return id;
  }, []);

  const confirm = useCallback((options: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      const request: ConfirmRequest = {
        ...options,
        id: createFeedbackId("confirm"),
        resolve,
      };

      setConfirmations((current) => {
        const next = [...current, request];
        confirmationsRef.current = next;
        return next;
      });
    });
  }, []);

  const settleConfirmation = useCallback((confirmed: boolean) => {
    const [current, ...remaining] = confirmationsRef.current;
    if (!current) return;

    confirmationsRef.current = remaining;
    setConfirmations(remaining);
    current.resolve(confirmed);
  }, []);

  useEffect(() => {
    return () => {
      toastsRef.current.forEach((toast) => toast.onDismiss?.("programmatic"));
      toastsRef.current = [];
      confirmationsRef.current.forEach((request) => request.resolve(false));
      confirmationsRef.current = [];
    };
  }, []);

  const currentConfirmation = confirmations[0];

  return (
    <FeedbackContext.Provider value={{ notify, dismiss, confirm }}>
      {children}
      <ToastViewport toasts={toasts} onDismiss={dismiss} />
      <ConfirmDialog
        isOpen={Boolean(currentConfirmation)}
        title={currentConfirmation?.title ?? "确认操作"}
        description={currentConfirmation?.description}
        confirmLabel={currentConfirmation?.confirmLabel}
        cancelLabel={currentConfirmation?.cancelLabel}
        variant={currentConfirmation?.variant}
        onConfirm={() => settleConfirmation(true)}
        onCancel={() => settleConfirmation(false)}
      />
    </FeedbackContext.Provider>
  );
}

export function useFeedback() {
  const context = useContext(FeedbackContext);
  if (!context) throw new Error("useFeedback 必须在 FeedbackProvider 内使用");
  return context;
}
