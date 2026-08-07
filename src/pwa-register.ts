// PWA Service Worker 注册
import { registerSW } from "virtual:pwa-register";

import { configurePwaUpdateControl, markPwaUpdateAvailable } from "./services/update/updateRuntime";
import { logger } from "./utils/logger";

/**
 * 初始化 PWA Service Worker 注册
 */
export function initPWA() {
  if ("serviceWorker" in navigator) {
    const updateSW = registerSW({
      immediate: true,
      onNeedRefresh() {
        markPwaUpdateAvailable();
      },
      onOfflineReady() {},
      onRegisterError(error) {
        configurePwaUpdateControl(null);
        logger.warn("PWA Service Worker 注册失败", error);
      },
    });

    configurePwaUpdateControl({
      async check() {
        const registration = await navigator.serviceWorker.getRegistration();
        if (!registration) return false;
        await registration.update();
        return Boolean(registration.waiting);
      },
      async update() {
        if (!updateSW) {
          window.location.reload();
          return;
        }
        await updateSW(true);
      },
    });
  }
}
