import { useSyncExternalStore } from "react";

import { getUpdateSnapshot, subscribeUpdateRuntime } from "../services/update/updateRuntime";

export function useUpdateSnapshot() {
  return useSyncExternalStore(subscribeUpdateRuntime, getUpdateSnapshot, getUpdateSnapshot);
}
