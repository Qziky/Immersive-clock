import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";

import { App, KeepAwakeRuntimeNotice } from "./App";
import { AppContextProvider } from "./contexts/AppContext";
import { AppearanceProvider } from "./contexts/AppearanceContext";
import { startKeepAwakeRuntime } from "./services/keepAwakeRuntime";
import { FeedbackProvider } from "./ui";
import { getAppSettings } from "./utils/appSettings";
import { applySearchIndexingPolicy } from "./utils/developerPages";
import { initErrorCenterGlobalCapture, setErrorCenterMode } from "./utils/errorCenter";
import { logger } from "./utils/logger";
import { shouldRegisterServiceWorker } from "./utils/runtimePlatform";
import { initializeStorage } from "./utils/storageInitializer";

import "./styles/global.css";
import "./styles/tour.css";

/**
 * 初始化埋点服务
 * 仅在生产环境且显式开启时初始化，避免受网络策略影响产生无效报错
 */
async function initAnalytics(): Promise<void> {
  const clarityProjectId = import.meta.env.VITE_CLARITY_PROJECT_ID?.trim();
  const enableClarity = import.meta.env.VITE_ENABLE_CLARITY === "true";

  if (!import.meta.env.PROD || !enableClarity || !clarityProjectId) {
    return;
  }

  const { default: Clarity } = await import("@microsoft/clarity");
  Clarity.init(clarityProjectId);
}

function initializeDeferredResources(): void {
  void import("./utils/appearanceSettings")
    .then(({ initializeAppearanceResources }) => initializeAppearanceResources())
    .catch((error) => logger.warn("Appearance resource initialization failed", error));

  void initAnalytics().catch((error) => logger.warn("Analytics initialization failed", error));

  const initializeNoise = () => {
    void import("./services/noise/noiseDataMaintenance")
      .then(({ initializeNoiseDataMaintenance }) => initializeNoiseDataMaintenance())
      .catch((error) => logger.warn("Noise data maintenance initialization failed", error));
  };

  if (typeof window.requestIdleCallback === "function") {
    window.requestIdleCallback(initializeNoise, { timeout: 2000 });
    return;
  }

  window.setTimeout(initializeNoise, 0);
}

function bootstrap(): void {
  applySearchIndexingPolicy(window.location.pathname);
  initializeStorage();
  startKeepAwakeRuntime();
  setErrorCenterMode(getAppSettings().study.alerts.errorCenterMode);
  initErrorCenterGlobalCapture();

  const root = ReactDOM.createRoot(document.getElementById("root") as HTMLElement);
  root.render(
    <React.StrictMode>
      <BrowserRouter>
        <AppContextProvider>
          <AppearanceProvider>
            <FeedbackProvider>
              <KeepAwakeRuntimeNotice />
              <App />
            </FeedbackProvider>
          </AppearanceProvider>
        </AppContextProvider>
      </BrowserRouter>
    </React.StrictMode>
  );
  window.requestAnimationFrame(() => {
    const loadingScreen = document.getElementById("loading-screen");
    loadingScreen?.remove();
    window.setTimeout(initializeDeferredResources, 0);
  });
}

try {
  bootstrap();
} catch (error) {
  logger.error("Application bootstrap failed", error);
  const loadingScreen = document.getElementById("loading-screen");
  if (loadingScreen) {
    loadingScreen.textContent =
      error instanceof Error ? `应用无法启动：${error.message}` : "应用无法启动，请刷新后重试。";
  }
}

// 注册 Service Worker（仅在 Web 模式下）
// @ts-ignore
if (shouldRegisterServiceWorker(__ENABLE_PWA__)) {
  import("./pwa-register").then(({ initPWA }) => {
    initPWA();
  });
}
