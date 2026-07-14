import { useCallback, useSyncExternalStore } from "react";

import {
  getMinutelyWeatherSnapshot,
  subscribeMinutelyWeather,
  type MinutelyWeatherSnapshot,
} from "../services/minutelyWeatherRuntime";

/**
 * 订阅共享分钟降水快照。即使顶部 Weather 组件被隐藏，只要调用方仍在
 * 订阅，runtime 就会继续本地重算并按策略刷新接口。
 */
export function useMinutelyWeatherSnapshot(enabled = true): MinutelyWeatherSnapshot {
  const subscribe = useCallback(
    (onStoreChange: () => void) =>
      enabled ? subscribeMinutelyWeather(onStoreChange) : () => undefined,
    [enabled]
  );
  const getSnapshot = useCallback(() => getMinutelyWeatherSnapshot(), []);
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

export default useMinutelyWeatherSnapshot;
