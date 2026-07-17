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
  return signals.map((signal) => signal.frameId).join("|");
}

function getSignalKeys(signals: StudyInfoSignal[]): string {
  return signals.map((signal) => `${signal.frameId}:${signal.dedupeKey}`).join("|");
}

/**
 * 中央信息调度器：关键消息到来时立即打断一次，随后加入完整队列继续轮播。
 * 页面隐藏、悬停、聚焦和减少动态效果都会停用自动切换。
 */
export function useStudyInfoCarousel({
  signals,
  intervalSec = 6,
}: UseStudyInfoCarouselOptions): UseStudyInfoCarouselResult {
  const normalizedSignals = useMemo(
    () =>
      signals.filter(
        (signal, index) => signals.findIndex((item) => item.frameId === signal.frameId) === index
      ),
    [signals]
  );
  const criticalSignals = useMemo(
    () => normalizedSignals.filter((signal) => signal.priority === "critical"),
    [normalizedSignals]
  );
  const routineSignals = useMemo(
    () => normalizedSignals.filter((signal) => signal.priority !== "critical"),
    [normalizedSignals]
  );
  const rotatingSignals = normalizedSignals;
  const criticalSignalKeys = getSignalKeys(criticalSignals);
  const rotatingSignalIds = getSignalIds(rotatingSignals);
  const timelySignalIds = rotatingSignals
    .filter((signal) => signal.priority === "timely")
    .map((signal) => signal.frameId);
  const timelySignalIdsKey = timelySignalIds.join("|");
  const rotatingSignalCount = rotatingSignals.length;
  const rotatingSignalsRef = useRef(rotatingSignals);

  const [activeId, setActiveId] = useState<string | null>(normalizedSignals[0]?.frameId ?? null);
  const activeIdRef = useRef<string | null>(activeId);
  const routineBeforeInterruptRef = useRef<string | null>(null);
  const previousCriticalKeysRef = useRef<string>("");
  const previousTimelyIdsRef = useRef(new Set(timelySignalIds));
  const pendingTimelyIdsRef = useRef<string[]>([]);
  const [paused, setPaused] = useState(false);
  const [documentHidden, setDocumentHidden] = useState(() =>
    typeof document !== "undefined" ? document.hidden : false
  );
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    rotatingSignalsRef.current = rotatingSignals;
  }, [rotatingSignals]);

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
    const hadCritical = previousCriticalKeysRef.current.length > 0;
    const hasCritical = criticalSignalKeys.length > 0;
    const activeIsCritical =
      !!activeIdRef.current &&
      criticalSignals.some((signal) => signal.frameId === activeIdRef.current);

    if (hasCritical && !hadCritical) {
      if (
        activeIdRef.current &&
        routineSignals.some((signal) => signal.frameId === activeIdRef.current)
      ) {
        routineBeforeInterruptRef.current = activeIdRef.current;
      }
      if (!activeIsCritical) {
        setActiveId(criticalSignals[0].frameId);
      }
    } else if (!hasCritical && hadCritical) {
      const restoreId = routineBeforeInterruptRef.current;
      routineBeforeInterruptRef.current = null;
      if (restoreId && routineSignals.some((signal) => signal.frameId === restoreId)) {
        setActiveId(restoreId);
      } else {
        setActiveId((current) =>
          current && routineSignals.some((signal) => signal.frameId === current)
            ? current
            : (routineSignals[0]?.frameId ?? normalizedSignals[0]?.frameId ?? null)
        );
      }
    } else if (
      hasCritical &&
      hadCritical &&
      criticalSignalKeys !== previousCriticalKeysRef.current
    ) {
      setActiveId(criticalSignals[0].frameId);
    } else if (normalizedSignals.length === 0) {
      setActiveId(null);
    } else if (
      !activeIdRef.current ||
      !normalizedSignals.some((signal) => signal.frameId === activeIdRef.current)
    ) {
      setActiveId(normalizedSignals[0].frameId);
    }

    previousCriticalKeysRef.current = criticalSignalKeys;
  }, [criticalSignalKeys, criticalSignals, normalizedSignals, routineSignals]);

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
    const queue = rotatingSignalsRef.current;
    if (queue.length <= 1) return;
    const pendingTimelyId = pendingTimelyIdsRef.current.find((id) =>
      queue.some((signal) => signal.frameId === id)
    );
    if (pendingTimelyId) {
      pendingTimelyIdsRef.current = pendingTimelyIdsRef.current.filter(
        (id) => id !== pendingTimelyId
      );
      setActiveId(pendingTimelyId);
      return;
    }
    const currentIndex = queue.findIndex((signal) => signal.frameId === activeIdRef.current);
    const nextSignal = queue[(currentIndex + 1 + queue.length) % queue.length] ?? queue[0];
    setActiveId(nextSignal.frameId);
  }, []);

  useEffect(() => {
    const canRotate = !reducedMotion && !paused && !documentHidden && rotatingSignalCount > 1;
    if (!canRotate) return undefined;
    const safeInterval = Math.min(30, Math.max(3, Number(intervalSec) || 6));
    const timer = window.setInterval(next, safeInterval * 1000);
    return () => window.clearInterval(timer);
  }, [
    criticalSignalKeys,
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
    return (
      normalizedSignals.find((signal) => signal.frameId === activeId) ??
      normalizedSignals[0] ??
      null
    );
  }, [activeId, normalizedSignals]);
  const canAdvance = rotatingSignalCount > 1;

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
