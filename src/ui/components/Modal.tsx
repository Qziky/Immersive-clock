import { X } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect } from "react";
import { createPortal } from "react-dom";

import { classNames } from "../utils/classNames";

import styles from "./primitives.module.css";

export interface ModalProps {
  isOpen: boolean;
  title: string;
  children: ReactNode;
  onClose: () => void;
  footer?: ReactNode;
  width?: "sm" | "md" | "lg" | "xl" | "xxl";
  maxWidth?: "sm" | "md" | "lg" | "xl" | "xxl";
  showCloseButton?: boolean;
  closeOnBackdrop?: boolean;
  headerDivider?: boolean;
  hideHeader?: boolean;
  fullScreen?: boolean;
  compactBodyTop?: boolean;
  closeButtonDataTour?: string;
  className?: string;
}

const widthMap: Record<NonNullable<ModalProps["width"]>, string> = {
  sm: "420px",
  md: "560px",
  lg: "720px",
  xl: "880px",
  xxl: "1040px",
};

export function Modal({
  isOpen,
  title,
  children,
  onClose,
  footer,
  width = "md",
  maxWidth,
  showCloseButton = true,
  closeOnBackdrop = false,
  headerDivider = true,
  hideHeader = false,
  fullScreen = false,
  compactBodyTop = false,
  closeButtonDataTour,
  className,
}: ModalProps) {
  useEffect(() => {
    if (!isOpen) return undefined;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const resolvedWidth = maxWidth ?? width;

  return createPortal(
    <div
      className={classNames(styles.modalBackdrop, fullScreen && styles.modalBackdropFullscreen)}
      role="presentation"
      onMouseDown={() => {
        if (closeOnBackdrop) {
          onClose();
        }
      }}
    >
      <section
        className={classNames(styles.modalPanel, fullScreen && styles.modalPanelFullscreen, className)}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        style={fullScreen ? undefined : { width: `min(100%, ${widthMap[resolvedWidth]})` }}
        onMouseDown={(event) => event.stopPropagation()}
      >
        {!hideHeader && (
          <header
            className={classNames(styles.modalHeader, !headerDivider && styles.modalHeaderFlat)}
          >
            <h2 className={styles.modalTitle}>{title}</h2>
            {showCloseButton && (
              <button
                className={styles.closeButton}
                type="button"
                aria-label="关闭"
                data-tour={closeButtonDataTour}
                onClick={onClose}
              >
                <X size={18} aria-hidden="true" />
              </button>
            )}
          </header>
        )}
        <div
          className={classNames(styles.modalBody, compactBodyTop && styles.modalBodyCompactTop)}
          data-ui-modal-body
        >
          {children}
        </div>
        {footer && <footer className={styles.modalFooter}>{footer}</footer>}
      </section>
    </div>,
    document.body,
  );
}
