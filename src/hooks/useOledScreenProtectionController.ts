import { useCallback, useEffect, useRef, useState } from "react";

const POINTER_WAKE_DISTANCE = 4;
const BROWSER_SHORTCUT_KEYS = new Set(["F5", "F11", "F12", "Tab", "w", "r", "l", "t", "n"]);

interface OledScreenProtectionControllerOptions {
  blocked: boolean;
  enabled: boolean;
  idleMinutes: number;
  mode: string;
}

export function useOledScreenProtectionController({
  blocked,
  enabled,
  idleMinutes,
  mode,
}: OledScreenProtectionControllerOptions) {
  const [active, setActive] = useState(false);
  const [activityRevision, setActivityRevision] = useState(0);
  const activeRef = useRef(false);
  const lastActivityAtRef = useRef(0);
  const lastPointerPositionRef = useRef<{ x: number; y: number } | null>(null);

  const wake = useCallback(() => {
    lastActivityAtRef.current = Date.now();
    activeRef.current = false;
    setActive(false);
    setActivityRevision((revision) => revision + 1);
  }, []);

  useEffect(() => {
    let idleTimer: number | null = null;
    let swallowClickTimeout: number | null = null;
    let swallowPendingClick = false;
    lastActivityAtRef.current = Date.now();
    activeRef.current = false;
    setActive(false);

    const clearIdleTimer = () => {
      if (idleTimer !== null) window.clearTimeout(idleTimer);
      idleTimer = null;
    };
    const scheduleIdleTimer = () => {
      clearIdleTimer();
      if (!enabled || blocked || mode === "exam" || document.visibilityState === "hidden") return;
      const remaining = Math.max(
        0,
        idleMinutes * 60_000 - (Date.now() - lastActivityAtRef.current)
      );
      idleTimer = window.setTimeout(() => {
        if (blocked || mode === "exam" || document.visibilityState === "hidden") {
          lastActivityAtRef.current = Date.now();
          scheduleIdleTimer();
          return;
        }
        activeRef.current = true;
        setActive(true);
      }, remaining);
    };
    const recordActivity = () => {
      lastActivityAtRef.current = Date.now();
      activeRef.current = false;
      setActive(false);
      scheduleIdleTimer();
    };
    const swallowClick = (event: MouseEvent) => {
      if (!swallowPendingClick) return;
      swallowPendingClick = false;
      if (swallowClickTimeout !== null) window.clearTimeout(swallowClickTimeout);
      document.removeEventListener("click", swallowClick, true);
      event.preventDefault();
      event.stopImmediatePropagation();
    };
    const stopEvent = (event: Event) => {
      event.stopImmediatePropagation();
    };
    const swallowNextClick = () => {
      swallowPendingClick = true;
      document.addEventListener("click", swallowClick, true);
      if (swallowClickTimeout !== null) window.clearTimeout(swallowClickTimeout);
      swallowClickTimeout = window.setTimeout(() => {
        swallowPendingClick = false;
        document.removeEventListener("click", swallowClick, true);
      }, 750);
    };
    const handlePointerMove = (event: PointerEvent) => {
      const previous = lastPointerPositionRef.current;
      lastPointerPositionRef.current = { x: event.clientX, y: event.clientY };
      if (
        previous &&
        Math.hypot(event.clientX - previous.x, event.clientY - previous.y) < POINTER_WAKE_DISTANCE
      ) {
        return;
      }
      if (activeRef.current) {
        stopEvent(event);
        swallowNextClick();
      }
      recordActivity();
    };
    const handlePointerDown = (event: PointerEvent) => {
      if (!activeRef.current) {
        recordActivity();
        return;
      }
      stopEvent(event);
      activeRef.current = false;
      setActive(false);
      lastActivityAtRef.current = Date.now();
      swallowNextClick();
      scheduleIdleTimer();
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!activeRef.current) {
        recordActivity();
        return;
      }
      if (
        BROWSER_SHORTCUT_KEYS.has(event.key) &&
        (event.key.startsWith("F") || event.ctrlKey || event.metaKey || event.altKey)
      ) {
        return;
      }
      event.preventDefault();
      stopEvent(event);
      recordActivity();
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        clearIdleTimer();
        activeRef.current = false;
        setActive(false);
        return;
      }
      recordActivity();
    };
    const handleWheel = (event: WheelEvent) => {
      if (activeRef.current) {
        event.preventDefault();
        stopEvent(event);
      }
      recordActivity();
    };
    const handleTouchStart = (event: TouchEvent) => {
      if (activeRef.current) {
        stopEvent(event);
        activeRef.current = false;
        setActive(false);
        lastActivityAtRef.current = Date.now();
        swallowNextClick();
        scheduleIdleTimer();
        return;
      }
      recordActivity();
    };

    const activityOptions = { capture: true } as const;
    window.addEventListener("pointermove", handlePointerMove, activityOptions);
    window.addEventListener("pointerdown", handlePointerDown, activityOptions);
    window.addEventListener("keydown", handleKeyDown, activityOptions);
    window.addEventListener("wheel", handleWheel, { ...activityOptions, passive: false });
    window.addEventListener("touchstart", handleTouchStart, activityOptions);
    window.addEventListener("touchmove", handleTouchStart, activityOptions);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    scheduleIdleTimer();

    return () => {
      clearIdleTimer();
      if (swallowClickTimeout !== null) window.clearTimeout(swallowClickTimeout);
      document.removeEventListener("click", swallowClick, true);
      window.removeEventListener("pointermove", handlePointerMove, activityOptions);
      window.removeEventListener("pointerdown", handlePointerDown, activityOptions);
      window.removeEventListener("keydown", handleKeyDown, activityOptions);
      window.removeEventListener("wheel", handleWheel, activityOptions);
      window.removeEventListener("touchstart", handleTouchStart, activityOptions);
      window.removeEventListener("touchmove", handleTouchStart, activityOptions);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [activityRevision, blocked, enabled, idleMinutes, mode]);

  return { active, wake };
}
