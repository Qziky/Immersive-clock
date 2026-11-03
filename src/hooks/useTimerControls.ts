import { useCallback } from "react";

import { useAppDispatch, useAppState } from "../contexts/AppContext";

/** 鼠标按钮与快捷键共用当前页面的计时操作。 */
export function useTimerControls() {
  const { mode, countdown, stopwatch } = useAppState();
  const dispatch = useAppDispatch();
  const toggleTimer = useCallback(() => {
    if (mode === "countdown") {
      if (countdown.currentTime === 0) dispatch({ type: "OPEN_MODAL" });
      else dispatch({ type: countdown.isActive ? "PAUSE_COUNTDOWN" : "START_COUNTDOWN" });
    } else if (mode === "stopwatch") {
      dispatch({ type: stopwatch.isActive ? "PAUSE_STOPWATCH" : "START_STOPWATCH" });
    }
  }, [mode, countdown.currentTime, countdown.isActive, stopwatch.isActive, dispatch]);
  return toggleTimer;
}
