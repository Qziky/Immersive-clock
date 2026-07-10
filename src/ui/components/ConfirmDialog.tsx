import type { ReactNode } from "react";
import { useRef } from "react";

import { Button } from "./Button";
import { Modal } from "./Modal";
import styles from "./primitives.module.css";

export interface ConfirmDialogProps {
  isOpen: boolean;
  title: string;
  description?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "default" | "danger";
  pending?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  isOpen,
  title,
  description,
  confirmLabel = "确定",
  cancelLabel = "取消",
  variant = "default",
  pending = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const cancelButtonRef = useRef<HTMLButtonElement>(null);

  return (
    <Modal
      isOpen={isOpen}
      title={title}
      width="sm"
      closeOnEscape={!pending}
      initialFocusRef={cancelButtonRef}
      showCloseButton={!pending}
      onClose={onCancel}
      footer={
        <>
          <Button ref={cancelButtonRef} disabled={pending} onClick={onCancel}>
            {cancelLabel}
          </Button>
          <Button
            variant={variant === "danger" ? "danger" : "primary"}
            loading={pending}
            onClick={onConfirm}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      {description && <div className={styles.confirmDescription}>{description}</div>}
    </Modal>
  );
}
