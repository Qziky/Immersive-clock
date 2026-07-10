import React, { useEffect, useState, useRef, useCallback } from "react";
import { createPortal } from "react-dom";

import type { MessagePopupType } from "../../types/messagePopup";
import { Button as FormButton, Toast, type ToastVariant } from "../../ui";

import styles from "./messagePopup.module.css";

/**
 * 消息弹窗动作项类型
 * - 统一使用设计系统中的 FormButton 进行渲染
 * - 支持可选的 variant 与 size，用于控制视觉层级与尺寸
 */
interface ActionItem {
  label: string;
  onClick: () => void;
  variant?: "primary" | "secondary" | "danger" | "success" | "ghost";
  size?: "sm" | "md" | "lg";
  icon?: React.ReactNode;
  loading?: boolean;
}

interface MessagePopupProps {
  isOpen: boolean;
  onClose?: () => void;
  type?: MessagePopupType;
  title?: string;
  message?: React.ReactNode;
  icon?: React.ReactNode;
  actions?: ActionItem[];
  className?: string;
  usePortal?: boolean; // 设置页预览时可设为 false 进行内联渲染
  themeColor?: string;
}

/** 兼容旧调用的消息组件；全局事件通知由 FeedbackProvider 的 ToastViewport 承载。 */
export default function MessagePopup({
  isOpen,
  onClose,
  type = "general",
  title = "消息提醒",
  message = "",
  icon,
  actions = [],
  className = "",
  usePortal = true,
  themeColor,
}: MessagePopupProps) {
  const [mounted, setMounted] = useState<boolean>(isOpen);
  const [exiting, setExiting] = useState<boolean>(false);
  const closeTimerRef = useRef<number | null>(null);
  const autoCloseTimerRef = useRef<number | null>(null);
  const autoCloseStartedAtRef = useRef(0);
  const autoCloseRemainingRef = useRef(0);
  const pauseReasonsRef = useRef(new Set<"focus" | "hover">());
  const hasActions = actions.length > 0;
  const autoCloseDuration =
    type === "general" ? 4000 : type === "error" || type === "weatherAlert" ? 8000 : 6000;

  // 打开时挂载并进入动画；关闭时触发退出动画
  useEffect(() => {
    if (isOpen) {
      if (closeTimerRef.current !== null) clearTimeout(closeTimerRef.current);
      setMounted(true);
      setExiting(false);
    } else if (mounted) {
      // 外部控制关闭时也应用退出动画
      setExiting(true);
      closeTimerRef.current = window.setTimeout(() => {
        setMounted(false);
      }, 180);
    }
    return () => {
      if (closeTimerRef.current !== null) clearTimeout(closeTimerRef.current);
    };
  }, [isOpen, mounted]);

  const handleClose = useCallback(() => {
    setExiting(true);
    if (closeTimerRef.current !== null) clearTimeout(closeTimerRef.current);
    if (autoCloseTimerRef.current !== null) clearTimeout(autoCloseTimerRef.current);
    autoCloseTimerRef.current = null;
    closeTimerRef.current = window.setTimeout(() => {
      onClose?.();
    }, 180);
  }, [onClose]);

  const startAutoClose = useCallback(() => {
    if (!isOpen || !onClose || hasActions || pauseReasonsRef.current.size > 0) return;

    if (autoCloseTimerRef.current !== null) {
      clearTimeout(autoCloseTimerRef.current);
    }
    autoCloseStartedAtRef.current = performance.now();
    autoCloseTimerRef.current = window.setTimeout(() => {
      handleClose();
    }, autoCloseRemainingRef.current);
  }, [handleClose, hasActions, isOpen, onClose]);

  useEffect(() => {
    if (autoCloseTimerRef.current !== null) clearTimeout(autoCloseTimerRef.current);
    autoCloseTimerRef.current = null;
    autoCloseRemainingRef.current = autoCloseDuration;
    pauseReasonsRef.current.clear();
    startAutoClose();

    return () => {
      if (autoCloseTimerRef.current !== null) clearTimeout(autoCloseTimerRef.current);
      autoCloseTimerRef.current = null;
    };
  }, [autoCloseDuration, startAutoClose]);

  const pauseAutoClose = (reason: "focus" | "hover") => {
    if (pauseReasonsRef.current.has(reason)) return;
    pauseReasonsRef.current.add(reason);

    if (autoCloseTimerRef.current !== null) {
      autoCloseRemainingRef.current = Math.max(
        0,
        autoCloseRemainingRef.current - (performance.now() - autoCloseStartedAtRef.current)
      );
      clearTimeout(autoCloseTimerRef.current);
      autoCloseTimerRef.current = null;
    }
  };

  const resumeAutoClose = (reason: "focus" | "hover") => {
    pauseReasonsRef.current.delete(reason);
    if (pauseReasonsRef.current.size === 0) startAutoClose();
  };

  if (!mounted) return null;

  const toastVariant: ToastVariant =
    type === "error"
      ? "danger"
      : type === "weatherAlert"
        ? "warning"
        : type === "coolingReminder"
          ? "success"
          : "info";

  const rootClass = `${styles.container} ${exiting ? styles.exit : styles.enter} ${!usePortal ? styles.inline : ""} ${className}`;
  const node = (
    <div
      className={rootClass}
      data-ui-scope
      onMouseEnter={() => pauseAutoClose("hover")}
      onMouseLeave={() => resumeAutoClose("hover")}
      onFocusCapture={() => pauseAutoClose("focus")}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) resumeAutoClose("focus");
      }}
    >
      <Toast
        className={styles.toast}
        variant={toastVariant}
        title={title}
        description={message}
        icon={icon}
        accentColor={themeColor}
        onClose={onClose ? handleClose : undefined}
        motion="none"
        action={
          hasActions ? (
            <div className={styles.actions}>
              {actions.map((action) => (
                <FormButton
                  key={action.label}
                  variant={action.variant ?? "secondary"}
                  size={action.size ?? "sm"}
                  icon={action.icon}
                  loading={action.loading}
                  onClick={action.onClick}
                  type="button"
                >
                  {action.label}
                </FormButton>
              ))}
            </div>
          ) : undefined
        }
      />
    </div>
  );

  return usePortal ? createPortal(node, document.body) : node;
}
