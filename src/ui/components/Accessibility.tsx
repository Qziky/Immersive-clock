import type { HTMLAttributes, ReactNode } from "react";
import { createPortal } from "react-dom";

import { classNames } from "../utils/classNames";

import styles from "./primitives.module.css";

export interface PortalProps {
  children: ReactNode;
  container?: Element | DocumentFragment;
}

export function Portal({ children, container }: PortalProps) {
  if (typeof document === "undefined") return null;

  return createPortal(children, container ?? document.body);
}

export type VisuallyHiddenProps = HTMLAttributes<HTMLSpanElement>;

export function VisuallyHidden({ className, ...props }: VisuallyHiddenProps) {
  return <span className={classNames(styles.visuallyHidden, className)} {...props} />;
}

export interface KeyboardShortcutProps extends HTMLAttributes<HTMLSpanElement> {
  keys: string[];
  label?: string;
}

export function KeyboardShortcut({ keys, label, className, ...props }: KeyboardShortcutProps) {
  return (
    <span
      className={classNames(styles.keyboardShortcut, className)}
      aria-label={label ?? keys.join(" ")}
      {...props}
    >
      {keys.map((key) => (
        <kbd key={key}>{key}</kbd>
      ))}
    </span>
  );
}
