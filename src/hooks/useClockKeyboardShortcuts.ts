import { useCallback, useEffect, useRef } from "react";

import { useAppDispatch, useAppState } from "../contexts/AppContext";
import { useFeedback } from "../ui";
import { formatTimer } from "../utils/formatTime";
import { formatShortcut } from "../utils/keyboardShortcuts";

import { useFullscreen } from "./useFullscreen";
import { useKeyboardShortcutSettings } from "./useKeyboardShortcutSettings";
import { useTimerControls } from "./useTimerControls";

const RESET_CONFIRMATION_MS = 2000;

export function useClockKeyboardShortcuts(blocked: boolean, showHud: () => void) {
  const { mode, countdown } = useAppState();
  const dispatch = useAppDispatch();
  const shortcuts = useKeyboardShortcutSettings();
  const toggleTimer = useTimerControls();
  const [isFullscreen, toggleFullscreen] = useFullscreen();
  const { notify, dismiss } = useFeedback();
  const pendingReset = useRef<{ deadline: number; toastId: string } | null>(null);
  const resetTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const heldKeys = useRef(new Set<string>());

  const cancelReset = useCallback(() => {
    if (resetTimeout.current !== null) clearTimeout(resetTimeout.current);
    resetTimeout.current = null;
    if (pendingReset.current) dismiss(pendingReset.current.toastId);
    pendingReset.current = null;
  }, [dismiss]);

  // 切换模式、修改时长、暂停/继续或打开弹窗后，旧的确认不再有效。
  useEffect(() => {
    cancelReset();
    return cancelReset;
  }, [blocked, mode, countdown.initialTime, countdown.isActive, shortcuts, cancelReset]);

  useEffect(() => {
    const keys = heldKeys.current;
    const handleKeyDown = (event: KeyboardEvent) => {
      const alreadyHeld = keys.has(event.code);
      keys.add(event.code);
      if (blocked || document.hidden) return;
      if (event.defaultPrevented || event.isComposing || event.keyCode === 229) return;
      if (event.ctrlKey || event.altKey || event.metaKey || event.shiftKey) return;
      const target = event.target;
      if (
        target instanceof Element &&
        target.closest(
          'input, textarea, select, button, a, [contenteditable]:not([contenteditable="false"]), [role="button"], [role="tab"], [role="slider"], [role="combobox"], [role="menuitem"], [role="option"], [role="switch"], [role="checkbox"], [role="radio"]'
        )
      )
        return;
      const code = event.code;
      const timerMode = mode === "countdown" || mode === "stopwatch";
      const handlesReset = code === shortcuts.resetCountdown && mode === "countdown";
      const handlesToggle = code === shortcuts.toggleTimer && timerMode;
      const handlesFullscreen = code === shortcuts.toggleFullscreen;
      const handlesHud = mode !== "exam" && (code === "Enter" || (code === "Space" && !timerMode));
      if (!(handlesReset || handlesToggle || handlesFullscreen || handlesHud)) {
        cancelReset();
        return;
      }
      event.preventDefault();
      if (event.repeat || alreadyHeld) return;
      if (handlesReset) {
        if (countdown.initialTime <= 0) return;
        if (pendingReset.current && performance.now() <= pendingReset.current.deadline) {
          cancelReset();
          dispatch({ type: "RESET_COUNTDOWN" });
        } else {
          cancelReset();
          const toastId = notify({
            title: `再按一次 ${formatShortcut(code)}，重置为 ${formatTimer(countdown.initialTime)}`,
            duration: RESET_CONFIRMATION_MS,
            variant: "info",
          });
          pendingReset.current = { deadline: performance.now() + RESET_CONFIRMATION_MS, toastId };
          resetTimeout.current = setTimeout(cancelReset, RESET_CONFIRMATION_MS);
        }
        return;
      }
      cancelReset();
      if (handlesToggle) toggleTimer();
      else if (handlesFullscreen) toggleFullscreen();
      else showHud();
    };
    const releaseKey = (event: KeyboardEvent) => keys.delete(event.code);
    const cancelInteraction = () => {
      keys.clear();
      cancelReset();
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !blocked && isFullscreen && !event.defaultPrevented) {
        toggleFullscreen();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keydown", handleEscape);
    window.addEventListener("keyup", releaseKey);
    window.addEventListener("blur", cancelInteraction);
    document.addEventListener("visibilitychange", cancelInteraction);
    document.addEventListener("pointerdown", cancelReset);
    document.addEventListener("focusin", cancelReset);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keydown", handleEscape);
      window.removeEventListener("keyup", releaseKey);
      window.removeEventListener("blur", cancelInteraction);
      document.removeEventListener("visibilitychange", cancelInteraction);
      document.removeEventListener("pointerdown", cancelReset);
      document.removeEventListener("focusin", cancelReset);
    };
  }, [
    blocked,
    mode,
    countdown.initialTime,
    shortcuts,
    toggleTimer,
    isFullscreen,
    toggleFullscreen,
    showHud,
    notify,
    dispatch,
    cancelReset,
  ]);
}
