import { useCallback, useSyncExternalStore } from "react";

import {
  getWeatherRuntimeSnapshot,
  subscribeWeatherRuntime,
  type WeatherRuntimeSnapshot,
} from "../services/weatherRuntime";

export function useWeatherRuntimeSnapshot(): WeatherRuntimeSnapshot {
  const subscribe = useCallback(
    (onStoreChange: () => void) => subscribeWeatherRuntime(onStoreChange),
    []
  );
  const getSnapshot = useCallback(() => getWeatherRuntimeSnapshot(), []);
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
