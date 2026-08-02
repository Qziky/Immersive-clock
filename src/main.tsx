import Clarity from "@microsoft/clarity";
import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";

import { App } from "./App";
import { AppContextProvider } from "./contexts/AppContext";
import { AppearanceProvider } from "./contexts/AppearanceContext";
import { initializeNoiseDataMaintenance } from "./services/noise/noiseDataMaintenance";
import { FeedbackProvider } from "./ui";
import { initializeAppearanceResources } from "./utils/appearanceSettings";
import { getAppSettings } from "./utils/appSettings";
import { applySearchIndexingPolicy } from "./utils/developerPages";
import { initErrorCenterGlobalCapture, setErrorCenterMode } from "./utils/errorCenter";
import { logger } from "./utils/logger";
import { initializeStorage } from "./utils/storageInitializer";

import "./styles/global.css";
import "./styles/tour.css";

/**
 * 初始化埋点服务
 * 仅在生产环境且显式开启时初始化，避免受网络策略影响产生无效报错
 */
function initAnalytics(): void {
  const clarityProjectId = import.meta.env.VITE_CLARITY_PROJECT_ID?.trim();
  const enableClarity = import.meta.env.VITE_ENABLE_CLARITY === "true";

  if (!import.meta.env.PROD || !enableClarity || !clarityProjectId) {
    return;
  }

  Clarity.init(clarityProjectId);
}

async function bootstrap(): Promise<void> {
  applySearchIndexingPolicy(window.location.pathname);
  initAnalytics();
  initializeStorage();
  initializeNoiseDataMaintenance();
  await initializeAppearanceResources();
  setErrorCenterMode(getAppSettings().study.alerts.errorCenterMode);
  initErrorCenterGlobalCapture();

  const root = ReactDOM.createRoot(document.getElementById("root") as HTMLElement);
  root.render(
    <React.StrictMode>
      <BrowserRouter>
        <AppContextProvider>
          <AppearanceProvider>
            <FeedbackProvider>
              <App />
            </FeedbackProvider>
          </AppearanceProvider>
        </AppContextProvider>
      </BrowserRouter>
    </React.StrictMode>
  );
  window.setTimeout(() => {
    const loadingScreen = document.getElementById("loading-screen");
    if (loadingScreen) requestAnimationFrame(() => loadingScreen.remove());
  }, 200);
}

void bootstrap().catch((error) => {
  logger.error("Application bootstrap failed", error);
  const loadingScreen = document.getElementById("loading-screen");
  if (loadingScreen) {
    loadingScreen.textContent =
      error instanceof Error ? `应用无法启动：${error.message}` : "应用无法启动，请刷新后重试。";
  }
});

// 注册 Service Worker（仅在 Web 模式下）
// @ts-ignore
if (__ENABLE_PWA__) {
  import("./pwa-register").then(({ initPWA }) => {
    initPWA();
  });
}
