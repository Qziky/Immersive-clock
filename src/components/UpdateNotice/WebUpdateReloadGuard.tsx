import { useLayoutEffect } from "react";

import { useAppState } from "../../contexts/AppContext";
import { setWebUpdateReloadBlocked } from "../../services/update/updateRuntime";

/** Protect timers and countdown edits in this tab, regardless of the visible clock mode. */
export function WebUpdateReloadGuard() {
  const { countdown, stopwatch, mode, isModalOpen } = useAppState();
  const pausedCountdown =
    countdown.currentTime > 0 && countdown.currentTime < countdown.initialTime;
  const blocked =
    countdown.isActive ||
    pausedCountdown ||
    stopwatch.isActive ||
    stopwatch.elapsedTime > 0 ||
    mode === "exam" ||
    isModalOpen;
  useLayoutEffect(() => setWebUpdateReloadBlocked(blocked), [blocked]);
  return null;
}
