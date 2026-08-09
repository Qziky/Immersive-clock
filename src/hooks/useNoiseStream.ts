import { useCallback, useEffect, useState } from "react";

import type { NoiseStreamSnapshot } from "../services/noise/noiseStreamService";
import {
  calibrateNoiseStream,
  clearNoiseStreamCalibration,
  getNoiseStreamSnapshot,
  restartNoiseStream,
  subscribeNoiseStream,
} from "../services/noise/noiseStreamService";

/**
 * 订阅环境噪音数据流的 Hook
 * @param enabled 是否持有实时采集订阅
 * @returns 包含噪音快照数据和重试函数的对象
 */
export function useNoiseStream(enabled = true): NoiseStreamSnapshot & {
  retry: () => void;
  calibrate: (referenceDbA: number) => Promise<void>;
  clearCalibration: () => Promise<void>;
} {
  const [snap, setSnap] = useState<NoiseStreamSnapshot>(() => getNoiseStreamSnapshot());

  useEffect(() => {
    if (!enabled) return undefined;
    let mounted = true;
    const update = () => {
      if (!mounted) return;
      setSnap(getNoiseStreamSnapshot());
    };
    const unsubscribe = subscribeNoiseStream(update);
    update();
    return () => {
      mounted = false;
      unsubscribe();
    };
  }, [enabled]);

  const retry = useCallback(() => {
    void restartNoiseStream();
  }, []);

  return {
    ...snap,
    retry,
    calibrate: calibrateNoiseStream,
    clearCalibration: clearNoiseStreamCalibration,
  };
}
