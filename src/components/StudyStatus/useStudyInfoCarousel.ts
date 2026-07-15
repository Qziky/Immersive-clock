import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { StudyInfoSignal } from "./studyInfoSignals";

export interface UseStudyInfoCarouselOptions {
  signals: StudyInfoSignal[];
  intervalSec?: number;
}

export interface UseStudyInfoCarouselResult {
  canAdvance: boolean;
  currentSignal: StudyInfoSignal | null;
  signals: StudyInfoSignal[];
  rotatingSignals: StudyInfoSignal[];
  paused: boolean;
  next: () => void;
  setPaused: (paused: boolean) => void;
}

function getSignalIds(signals: StudyInfoSignal[]): string {
  return signals.map((signal) => signal.itemId).join("|");
}

/**
 * 中央信息调度器：关键消息打断普通轮播，关键消息结束后恢复打断前的普通消息。
 * 计时器只负责同一优先级队列内切换，页面隐藏、悬停、聚焦和减少动态效果都会停用它。
 */
export function useStudyInfoCarousel({
  signals,
  intervalSec = 6,
}: UseStudyInfoCarouselOptions): UseStudyInfoCarouselResult {
  const normalizedSignals = useMemo(
    () =>
      signals.filter(
        (signal, index) => signals.findIndex((item) => item.itemId === signal.itemId) === index
      ),
    [signals]
  );
  const criticalSignals = useMemo(
    () => normalizedSignals.filter((signal) => signal.priority === "critical"),
    [normalizedSignals]
  );
  const rotatingSignals = useMemo(
    () => normalizedSignals.filter((signal) => signal.priority !== "critical"),
    [normalizedSignals]
  );
  const criticalSignalIds = getSignalIds(criticalSignals);
  const rotatingSignalIds = getSignalIds(rotatingSignals);
  const timelySignalIds = rotatingSignals
    .filter((signal) => signal.priority === "timely")
    .map((signal) => signal.itemId);
  const timelySignalIdsKey = timelySignalIds.join("|");
  const criticalSignalCount = criticalSignals.length;
  const rotatingSignalCount = rotatingSignals.length;
  const criticalSignalsRef = useRef(criticalSignals);
  const rotatingSignalsRef = useRef(rotatingSignals);

  const [activeId, setActiveId] = useState<string | null>(normalizedSignals[0]?.itemId ?? null);
  const activeIdRef = useRef<string | null>(activeId);
  const routineBeforeInterruptRef = useRef<string | null>(null);
  const previousCriticalIdsRef = useRef<string>("");
  const previousTimelyIdsRef = useRef(new Set(timelySignalIds));
  const pendingTimelyIdsRef = useRef<string[]>([]);
  const [paused, setPaused] = useState(false);
  const [documentHidden, setDocumentHidden] = useState(() =>
    typeof document !== "undefined" ? document.hidden : false
  );
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    criticalSignalsRef.current = criticalSignals;
    rotatingSignalsRef.current = rotatingSignals;
  }, [criticalSignals, rotatingSignals]);

  useEffect(() => {
    activeIdRef.current = activeId;
    pendingTimelyIdsRef.current = pendingTimelyIdsRef.current.filter((id) => id !== activeId);
  }, [activeId]);

  useEffect(() => {
    const previousIds = previousTimelyIdsRef.current;
    const pendingIds = new Set(pendingTimelyIdsRef.current);
    timelySignalIds.forEach((id) => {
      if (!previousIds.has(id) && id !== activeIdRef.current) pendingIds.add(id);
    });
    pendingTimelyIdsRef.current = timelySignalIds.filter((id) => pendingIds.has(id));
    previousTimelyIdsRef.current = new Set(timelySignalIds);
  }, [timelySignalIds, timelySignalIdsKey]);

  useEffect(() => {
    const currentCriticalIds = getSignalIds(criticalSignals);
    const hadCritical = previousCriticalIdsRef.current.length > 0;
    const hasCritical = currentCriticalIds.length > 0;
    const activeIsCritical =
      !!activeIdRef.current &&
      criticalSignals.some((signal) => signal.itemId === activeIdRef.current);

    if (hasCritical && !hadCritical) {
      if (
        activeIdRef.current &&
        rotatingSignals.some((signal) => signal.itemId === activeIdRef.current)
      ) {
        routineBeforeInterruptRef.current = activeIdRef.current;
      }
      if (!activeIsCritical) {
        setActiveId(criticalSignals[0].itemId);
      }
    } else if (!hasCritical && hadCritical) {
      const restoreId = routineBeforeInterruptRef.current;
      routineBeforeInterruptRef.current = null;
      if (restoreId && rotatingSignals.some((signal) => signal.itemId === restoreId)) {
        setActiveId(restoreId);
      } else {
        setActiveId((current) =>
          current && rotatingSignals.some((signal) => signal.itemId === current)
            ? current
            : (rotatingSignals[0]?.itemId ?? normalizedSignals[0]?.itemId ?? null)
        );
      }
    } else if (
      hasCritical &&
      hadCritical &&
      currentCriticalIds !== previousCriticalIdsRef.current
    ) {
      setActiveId(criticalSignals[0].itemId);
    } else if (normalizedSignals.length === 0) {
      setActiveId(null);
    } else if (
      !activeIdRef.current ||
      !normalizedSignals.some((signal) => signal.itemId === activeIdRef.current)
    ) {
      setActiveId(normalizedSignals[0].itemId);
    } else if (hasCritical && !activeIsCritical) {
      setActiveId(criticalSignals[0].itemId);
    }

    previousCriticalIdsRef.current = currentCriticalIds;
  }, [criticalSignals, normalizedSignals, rotatingSignals]);

  useEffect(() => {
    if (typeof document === "undefined") return undefined;
    const handleVisibility = () => setDocumentHidden(document.hidden);
    document.addEventListener("visibilitychange", handleVisibility);
    handleVisibility();
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return undefined;
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const handleChange = () => setReducedMotion(media.matches);
    handleChange();
    media.addEventListener?.("change", handleChange);
    return () => media.removeEventListener?.("change", handleChange);
  }, []);

  const next = useCallback(() => {
    const currentCriticalSignals = criticalSignalsRef.current;
    const currentRotatingSignals = rotatingSignalsRef.current;
    const queue =
      currentCriticalSignals.length > 0 ? currentCriticalSignals : currentRotatingSignals;
    if (queue.length <= 1) return;
    if (currentCriticalSignals.length === 0) {
      const pendingTimelyId = pendingTimelyIdsRef.current.find((id) =>
        queue.some((signal) => signal.itemId === id)
      );
      if (pendingTimelyId) {
        pendingTimelyIdsRef.current = pendingTimelyIdsRef.current.filter(
          (id) => id !== pendingTimelyId
        );
        setActiveId(pendingTimelyId);
        return;
      }
    }
    const currentIndex = queue.findIndex((signal) => signal.itemId === activeIdRef.current);
    const nextSignal = queue[(currentIndex + 1 + queue.length) % queue.length] ?? queue[0];
    setActiveId(nextSignal.itemId);
  }, []);

  useEffect(() => {
    const queueLength = criticalSignalCount > 0 ? criticalSignalCount : rotatingSignalCount;
    const canRotate =
      !reducedMotion &&
      !paused &&
      !documentHidden &&
      queueLength > 1 &&
      (criticalSignalCount === 0 || criticalSignalCount > 1);
    if (!canRotate) return undefined;
    const safeInterval = Math.min(30, Math.max(3, Number(intervalSec) || 6));
    const timer = window.setInterval(next, safeInterval * 1000);
    return () => window.clearInterval(timer);
  }, [
    criticalSignalCount,
    criticalSignalIds,
    documentHidden,
    intervalSec,
    next,
    paused,
    reducedMotion,
    rotatingSignalCount,
    rotatingSignalIds,
  ]);

  const currentSignal = useMemo(() => {
    if (normalizedSignals.length === 0) return null;
    const queue = criticalSignals.length > 0 ? criticalSignals : normalizedSignals;
    return queue.find((signal) => signal.itemId === activeId) ?? queue[0] ?? null;
  }, [activeId, criticalSignals, normalizedSignals]);
  const canAdvance = (criticalSignalCount > 0 ? criticalSignalCount : rotatingSignalCount) > 1;

  return {
    canAdvance,
    currentSignal,
    signals: normalizedSignals,
    rotatingSignals,
    paused: paused || documentHidden,
    next,
    setPaused,
  };
}
