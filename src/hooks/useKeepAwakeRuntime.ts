import { useSyncExternalStore } from "react";

import {
  getKeepAwakeRuntimeSnapshot,
  subscribeKeepAwakeRuntime,
} from "../services/keepAwakeRuntime";

export function useKeepAwakeRuntime() {
  return useSyncExternalStore(
    subscribeKeepAwakeRuntime,
    getKeepAwakeRuntimeSnapshot,
    getKeepAwakeRuntimeSnapshot
  );
}
