import type { CSSProperties, ReactNode } from "react";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { classNames } from "../../utils/classNames";
import { AppIcon, type AppIconName } from "../icons/AppIcon";
import type { UiMotionMode } from "../types";
import { useOverlayLayer } from "../utils/overlayStack";
import { usePresence } from "../utils/usePresence";

import styles from "./primitives.module.css";

export interface PopoverProps {
  trigger: ReactNode;
  children: ReactNode;
  ariaLabel: string;
  className?: string;
  width?: number | string;
  motion?: UiMotionMode;
}

export interface MenuItem {
  value: string;
  label: string;
  description?: string;
  icon?: AppIconName;
  disabled?: boolean;
  selected?: boolean;
}

export interface MenuProps {
  triggerLabel: string;
  items: MenuItem[];
  onSelect?: (value: string) => void;
}

function formatWidth(width: number | string | undefined, fallback: number) {
  return width ?? fallback;
}

export function Popover({
  trigger,
  children,
  ariaLabel,
  className,
  width,
  motion = "default",
}: PopoverProps) {
  const id = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [panelStyle, setPanelStyle] = useState<CSSProperties>();
  const { isPresent, presenceState, shouldAnimate } = usePresence({ isOpen, motion });
  const { isTop, zIndex } = useOverlayLayer({ active: isOpen, type: "floating" });

  const updatePosition = useCallback(() => {
    const triggerNode = triggerRef.current;

    if (!triggerNode) return;

    const rect = triggerNode.getBoundingClientRect();
    const resolvedWidth = formatWidth(width, Math.max(240, rect.width));
    const viewportInset = 8;
    const panelGap = 8;
    const maximumWidth = Math.max(0, window.innerWidth - viewportInset * 2);
    const measuredWidth = panelRef.current?.getBoundingClientRect().width ?? 0;
    const numericWidth = Math.min(
      measuredWidth ||
        (typeof resolvedWidth === "number" ? resolvedWidth : Math.max(240, rect.width)),
      maximumWidth
    );
    const panelHeight = panelRef.current?.offsetHeight ?? 0;
    const availableBelow = window.innerHeight - rect.bottom - panelGap - viewportInset;
    const availableAbove = rect.top - panelGap - viewportInset;
    const openAbove = panelHeight > availableBelow && availableAbove > availableBelow;
    const preferredTop = openAbove ? rect.top - panelGap - panelHeight : rect.bottom + panelGap;
    const maximumTop = Math.max(viewportInset, window.innerHeight - panelHeight - viewportInset);
    const left = Math.round(
      Math.max(viewportInset, Math.min(rect.left, window.innerWidth - numericWidth - viewportInset))
    );
    const top = Math.round(Math.max(viewportInset, Math.min(preferredTop, maximumTop)));

    setPanelStyle({
      left,
      maxHeight: `calc(100vh - ${viewportInset * 2}px)`,
      maxWidth: `calc(100vw - ${viewportInset * 2}px)`,
      top,
      width: resolvedWidth,
    });
  }, [width]);

  useEffect(() => {
    if (!isOpen) return undefined;

    updatePosition();

    const closeOnPointerDown = (event: PointerEvent) => {
      const target = event.target;

      if (target instanceof Node && triggerRef.current?.contains(target)) return;
      if (target instanceof Element && target.closest(`[data-popover-panel="${id}"]`)) return;

      setIsOpen(false);
    };

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && isTop()) {
        event.preventDefault();
        setIsOpen(false);
        queueMicrotask(() => triggerRef.current?.focus({ preventScroll: true }));
      }
    };

    document.addEventListener("pointerdown", closeOnPointerDown);
    document.addEventListener("keydown", closeOnEscape);
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);

    return () => {
      document.removeEventListener("pointerdown", closeOnPointerDown);
      document.removeEventListener("keydown", closeOnEscape);
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [id, isOpen, isTop, updatePosition]);

  useEffect(() => {
    if (!isOpen || typeof ResizeObserver === "undefined") return undefined;
    const observer = new ResizeObserver(updatePosition);
    if (triggerRef.current) observer.observe(triggerRef.current);
    if (panelRef.current) observer.observe(panelRef.current);
    return () => observer.disconnect();
  }, [isOpen, updatePosition]);

  const panel =
    isPresent && typeof document !== "undefined"
      ? createPortal(
          <div
            ref={panelRef}
            className={classNames(styles.popoverPanel, className)}
            data-ui-motion={shouldAnimate ? "default" : "none"}
            data-ui-overlay-root
            data-popover-panel={id}
            data-ui-presence={presenceState}
            data-ui-scope
            role="dialog"
            aria-label={ariaLabel}
            style={{ ...panelStyle, zIndex }}
          >
            {children}
          </div>,
          document.body
        )
      : null;

  return (
    <>
      <button
        ref={triggerRef}
        className={styles.popoverTrigger}
        type="button"
        aria-expanded={isOpen}
        onClick={() => setIsOpen((open) => !open)}
      >
        {trigger}
      </button>
      {panel}
    </>
  );
}

export function Menu({ triggerLabel, items, onSelect }: MenuProps) {
  return (
    <Popover
      ariaLabel={triggerLabel}
      trigger={
        <>
          <span>{triggerLabel}</span>
          <AppIcon name="action.expand" size="sm" />
        </>
      }
    >
      <div className={styles.menuList} role="menu">
        {items.map((item) => (
          <button
            className={styles.menuItem}
            disabled={item.disabled}
            key={item.value}
            role="menuitem"
            type="button"
            onClick={() => onSelect?.(item.value)}
          >
            {item.icon && (
              <span className={styles.menuItemIcon}>
                <AppIcon name={item.icon} />
              </span>
            )}
            <span className={styles.menuItemText}>
              <span>{item.label}</span>
              {item.description && <small>{item.description}</small>}
            </span>
            {item.selected && <AppIcon name="status.selected" size="sm" />}
          </button>
        ))}
      </div>
    </Popover>
  );
}
