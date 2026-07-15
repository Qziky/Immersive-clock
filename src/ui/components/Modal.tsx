import type { ReactNode, RefObject } from "react";
import { useId, useLayoutEffect, useRef } from "react";
import { createPortal } from "react-dom";

import { classNames } from "../../utils/classNames";
import type { UiMotionMode } from "../types";
import { OverlayLayerBoundary, useOverlayLayer } from "../utils/overlayStack";
import { usePresence } from "../utils/usePresence";

import { IconButton } from "./IconButton";
import styles from "./primitives.module.css";

export interface ModalProps {
  isOpen: boolean;
  title: string;
  children: ReactNode;
  onClose: () => void;
  footer?: ReactNode;
  width?: "sm" | "md" | "lg" | "xl" | "xxl";
  maxWidth?: "sm" | "md" | "lg" | "xl" | "xxl";
  placement?: "center" | "left";
  showCloseButton?: boolean;
  closeOnBackdrop?: boolean;
  closeOnEscape?: boolean;
  initialFocusRef?: RefObject<HTMLElement | null>;
  headerDivider?: boolean;
  hideHeader?: boolean;
  fullScreen?: boolean;
  compactBodyTop?: boolean;
  bodyPadding?: "default" | "compact" | "none";
  bodyClassName?: string;
  closeButtonDataTour?: string;
  motion?: UiMotionMode;
  className?: string;
}

const widthMap: Record<NonNullable<ModalProps["width"]>, string> = {
  sm: "420px",
  md: "560px",
  lg: "720px",
  xl: "880px",
  xxl: "1040px",
};

const focusableSelector = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled]):not([type='hidden'])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

function getFocusableElements(container: HTMLElement) {
  return Array.from(container.querySelectorAll<HTMLElement>(focusableSelector)).filter(
    (element) =>
      !element.hidden &&
      element.getAttribute("aria-hidden") !== "true" &&
      !element.closest("[hidden], [inert], [aria-hidden='true']")
  );
}

export function Modal({
  isOpen,
  title,
  children,
  onClose,
  footer,
  width = "md",
  maxWidth,
  placement = "center",
  showCloseButton = true,
  closeOnBackdrop = false,
  closeOnEscape = true,
  initialFocusRef,
  headerDivider = true,
  hideHeader = false,
  fullScreen = false,
  compactBodyTop = false,
  bodyPadding = "default",
  bodyClassName,
  closeButtonDataTour,
  motion = "default",
  className,
}: ModalProps) {
  const titleId = useId();
  const panelRef = useRef<HTMLElement>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);
  const { isPresent, presenceState, shouldAnimate } = usePresence({ isOpen, motion });
  const {
    id: layerId,
    isTop,
    isTopModal,
    zIndex,
  } = useOverlayLayer({
    active: isOpen,
    type: "modal",
  });

  useLayoutEffect(() => {
    if (!isOpen) return undefined;

    restoreFocusRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;

    return () => {
      const restoreTarget = restoreFocusRef.current;
      queueMicrotask(() => {
        if (restoreTarget?.isConnected) restoreTarget.focus({ preventScroll: true });
      });
    };
  }, [isOpen]);

  useLayoutEffect(() => {
    if (!isOpen || !isTopModal) return;

    const panel = panelRef.current;
    const requestedTarget = initialFocusRef?.current;
    const target =
      requestedTarget && panel?.contains(requestedTarget)
        ? requestedTarget
        : panel
          ? (getFocusableElements(panel)[0] ?? panel)
          : null;
    target?.focus({ preventScroll: true });
  }, [initialFocusRef, isOpen, isTopModal]);

  useLayoutEffect(() => {
    if (!isOpen) return undefined;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (!isTop()) return;

      if (event.key === "Escape" && closeOnEscape) {
        event.preventDefault();
        onClose();
        return;
      }

      if (event.key !== "Tab") return;

      const panel = panelRef.current;
      if (!panel) return;

      const focusableElements = getFocusableElements(panel);
      if (focusableElements.length === 0) {
        event.preventDefault();
        panel.focus();
        return;
      }

      const first = focusableElements[0];
      const last = focusableElements[focusableElements.length - 1];
      const activeElement = document.activeElement;

      if (event.shiftKey && (activeElement === first || !panel.contains(activeElement))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (activeElement === last || !panel.contains(activeElement))) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [closeOnEscape, isOpen, isTop, onClose]);

  if (!isPresent) return null;

  const resolvedWidth = maxWidth ?? width;
  const isLeft = placement === "left" && !fullScreen;

  return createPortal(
    <div
      className={classNames(
        styles.modalBackdrop,
        fullScreen && styles.modalBackdropFullscreen,
        isLeft && styles.modalBackdropLeft
      )}
      data-ui-motion={shouldAnimate ? "default" : "none"}
      data-ui-overlay-root
      data-ui-presence={presenceState}
      data-ui-scope
      role="presentation"
      style={{ zIndex }}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && isOpen && closeOnBackdrop && isTop()) {
          onClose();
        }
      }}
    >
      <section
        ref={panelRef}
        className={classNames(
          styles.modalPanel,
          fullScreen && styles.modalPanelFullscreen,
          isLeft && styles.modalPanelLeft,
          className
        )}
        data-ui-motion={shouldAnimate ? "default" : "none"}
        data-ui-presence={presenceState}
        role="dialog"
        aria-hidden={isTopModal ? undefined : "true"}
        aria-modal={isTopModal ? "true" : undefined}
        aria-labelledby={titleId}
        inert={isTopModal ? undefined : true}
        style={fullScreen ? undefined : { width: `min(100%, ${widthMap[resolvedWidth]})` }}
        tabIndex={-1}
      >
        <OverlayLayerBoundary layerId={layerId}>
          {hideHeader ? (
            <h2 className={styles.visuallyHidden} id={titleId}>
              {title}
            </h2>
          ) : (
            <header
              className={classNames(styles.modalHeader, !headerDivider && styles.modalHeaderFlat)}
            >
              <h2 className={styles.modalTitle} id={titleId}>
                {title}
              </h2>
              {showCloseButton && (
                <IconButton
                  className={styles.closeButton}
                  aria-label="关闭"
                  data-tour={closeButtonDataTour}
                  icon="action.close"
                  size="sm"
                  onClick={onClose}
                />
              )}
            </header>
          )}
          <div
            className={classNames(
              styles.modalBody,
              bodyPadding === "compact" && styles.modalBodyPaddingCompact,
              bodyPadding === "none" && styles.modalBodyPaddingNone,
              compactBodyTop && bodyPadding === "default" && styles.modalBodyCompactTop,
              bodyClassName
            )}
            data-ui-modal-body
          >
            {children}
          </div>
          {footer && <footer className={styles.modalFooter}>{footer}</footer>}
        </OverlayLayerBoundary>
      </section>
    </div>,
    document.body
  );
}
