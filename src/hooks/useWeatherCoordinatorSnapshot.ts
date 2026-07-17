import { useCallback, useSyncExternalStore } from "react";

import {
  getWeatherCoordinatorSnapshot,
  subscribeWeatherCoordinator,
  type WeatherCoordinatorSnapshot,
} from "../services/weatherCoordinator";

export function useWeatherCoordinatorSnapshot(): WeatherCoordinatorSnapshot {
  const subscribe = useCallback(
    (onStoreChange: () => void) => subscribeWeatherCoordinator(onStoreChange),
    []
  );
  const getSnapshot = useCallback(() => getWeatherCoordinatorSnapshot(), []);
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
