import { createPwaUpdateControl } from "./services/update/pwaUpdateController";
import { configurePwaUpdateControl } from "./services/update/updateRuntime";

let initialized = false;

export function initPWA() {
  if (initialized) return;
  initialized = true;
  if (!("serviceWorker" in navigator)) {
    configurePwaUpdateControl(null);
    return;
  }
  // The plugin's registerSW client reloads on "controlling" even when no
  // onNeedRefresh callback is supplied. Use the native lifecycle instead.
  const scriptUrl = import.meta.env.DEV ? "/dev-sw.js?dev-sw" : "/sw.js";
  configurePwaUpdateControl(createPwaUpdateControl(navigator.serviceWorker, scriptUrl));
}
