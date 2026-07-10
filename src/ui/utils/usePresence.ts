import { useEffect, useState, useSyncExternalStore } from "react";

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
const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

function getReducedMotionSnapshot(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return false;
  }

  return window.matchMedia(REDUCED_MOTION_QUERY).matches;
}

function subscribeToReducedMotion(onStoreChange: () => void): () => void {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return () => {};
  }

  const mediaQuery = window.matchMedia(REDUCED_MOTION_QUERY);
  if (typeof mediaQuery.addEventListener === "function") {
    mediaQuery.addEventListener("change", onStoreChange);
    return () => mediaQuery.removeEventListener("change", onStoreChange);
  }

  mediaQuery.addListener(onStoreChange);
  return () => mediaQuery.removeListener(onStoreChange);
}

export function usePresence({
  isOpen,
  motion = "default",
  exitDuration = DEFAULT_EXIT_DURATION,
}: UsePresenceOptions): UsePresenceResult {
  const reducedMotion = useSyncExternalStore(
    subscribeToReducedMotion,
    getReducedMotionSnapshot,
    () => false
  );
  const shouldAnimate = motion !== "none" && !reducedMotion;
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
