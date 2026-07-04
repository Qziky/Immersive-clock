import { ChevronDown, Check } from "lucide-react";
import type { CSSProperties, ReactNode } from "react";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { classNames } from "../utils/classNames";

import styles from "./primitives.module.css";

export interface PopoverProps {
  trigger: ReactNode;
  children: ReactNode;
  ariaLabel: string;
  className?: string;
  width?: number | string;
}

export interface MenuItem {
  value: string;
  label: string;
  description?: string;
  icon?: ReactNode;
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

export function Popover({ trigger, children, ariaLabel, className, width }: PopoverProps) {
  const id = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [panelStyle, setPanelStyle] = useState<CSSProperties>();

  const updatePosition = useCallback(() => {
    const triggerNode = triggerRef.current;

    if (!triggerNode) return;

    const rect = triggerNode.getBoundingClientRect();
    const resolvedWidth = formatWidth(width, Math.max(240, rect.width));
    const numericWidth = typeof resolvedWidth === "number" ? resolvedWidth : Math.max(240, rect.width);

    setPanelStyle({
      left: Math.max(8, Math.min(rect.left, window.innerWidth - numericWidth - 8)),
      top: rect.bottom + 8,
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
      if (event.key === "Escape") setIsOpen(false);
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
  }, [id, isOpen, updatePosition]);

  const panel =
    isOpen && typeof document !== "undefined"
      ? createPortal(
          <div
            className={classNames(styles.popoverPanel, className)}
            data-popover-panel={id}
            role="dialog"
            aria-label={ariaLabel}
            style={panelStyle}
          >
            {children}
          </div>,
          document.body,
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
          <ChevronDown size={14} aria-hidden="true" />
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
            {item.icon && <span className={styles.menuItemIcon}>{item.icon}</span>}
            <span className={styles.menuItemText}>
              <span>{item.label}</span>
              {item.description && <small>{item.description}</small>}
            </span>
            {item.selected && <Check size={14} aria-hidden="true" />}
          </button>
        ))}
      </div>
    </Popover>
  );
}
