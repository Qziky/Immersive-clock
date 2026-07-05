import { useEffect, useMemo, useState } from "react";

import type { UiMotionMode } from "../types";

export type PresenceState = "entering" | "exiting";

export interface UsePresenceOptions {
  isOpen: boolean;
  motion?: UiMotionMode;
  exitDuration?: number;
}

export interface UsePresenceResult {
  isPresent: boolean;
  presenceState: PresenceState;
  shouldAnimate: boolean;
}

const DEFAULT_EXIT_DURATION = 180;

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return false;
  }

  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function usePresence({
  isOpen,
  motion = "default",
  exitDuration = DEFAULT_EXIT_DURATION,
}: UsePresenceOptions): UsePresenceResult {
  const shouldAnimate = useMemo(() => motion !== "none" && !prefersReducedMotion(), [motion]);
  const [isPresentAfterExit, setIsPresentAfterExit] = useState(isOpen);

  useEffect(() => {
    if (isOpen) {
      setIsPresentAfterExit(true);
      return undefined;
    }

    if (!shouldAnimate) {
      setIsPresentAfterExit(false);
      return undefined;
    }

    const timer = window.setTimeout(() => {
      setIsPresentAfterExit(false);
    }, exitDuration);

    return () => window.clearTimeout(timer);
  }, [exitDuration, isOpen, shouldAnimate]);

  return {
    isPresent: isOpen || (shouldAnimate && isPresentAfterExit),
    presenceState: isOpen ? "entering" : "exiting",
    shouldAnimate,
  };
}
