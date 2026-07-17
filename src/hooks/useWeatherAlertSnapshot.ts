import { useCallback, useSyncExternalStore } from "react";

import {
  getWeatherAlertSnapshot,
  subscribeWeatherAlerts,
  type WeatherAlertSnapshot,
} from "../services/weatherAlertRuntime";

/** 订阅共享天气预警快照；禁用时不启动 runtime。 */
export function useWeatherAlertSnapshot(enabled = true): WeatherAlertSnapshot {
  const subscribe = useCallback(
    (onStoreChange: () => void) =>
      enabled ? subscribeWeatherAlerts(onStoreChange) : () => undefined,
    [enabled]
  );
  const getSnapshot = useCallback(() => getWeatherAlertSnapshot(), []);
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

export default useWeatherAlertSnapshot;
