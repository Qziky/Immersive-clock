import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";

import { App, KeepAwakeRuntimeNotice } from "./App";
import { LegalConsentGate } from "./components/Legal/LegalConsentGate";
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

let deferredResourcesInitialized = false;

function initializeDeferredResources(): void {
  if (deferredResourcesInitialized) return;
  deferredResourcesInitialized = true;

  void import("./utils/appearanceSettings")
    .then(({ initializeAppearanceResources }) => initializeAppearanceResources())
    .catch((error) => logger.warn("Appearance resource initialization failed", error));

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

function AppRuntime(): React.ReactElement {
  React.useEffect(() => {
    startKeepAwakeRuntime();
    setErrorCenterMode(getAppSettings().study.alerts.errorCenterMode);
    initErrorCenterGlobalCapture();

    window.setTimeout(initializeDeferredResources, 0);
  }, []);

  return (
    <AppContextProvider>
      <AppearanceProvider>
        <FeedbackProvider>
          <KeepAwakeRuntimeNotice />
          <App />
        </FeedbackProvider>
      </AppearanceProvider>
    </AppContextProvider>
  );
}

function bootstrap(): void {
  applySearchIndexingPolicy(window.location.pathname);
  initializeStorage();

  const root = ReactDOM.createRoot(document.getElementById("root") as HTMLElement);
  root.render(
    <React.StrictMode>
      <BrowserRouter>
        <LegalConsentGate>
          <AppRuntime />
        </LegalConsentGate>
      </BrowserRouter>
    </React.StrictMode>
  );
  window.requestAnimationFrame(() => {
    const loadingScreen = document.getElementById("loading-screen");
    loadingScreen?.remove();
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
