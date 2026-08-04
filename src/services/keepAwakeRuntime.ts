import { registerPlugin } from "@capacitor/core";
import type { KeepAwakePlugin } from "@capacitor-community/keep-awake";

import { getAppSettings } from "../utils/appSettings";
import { logger } from "../utils/logger";
import { getRuntimePlatform, type RuntimePlatform } from "../utils/runtimePlatform";
import { SETTINGS_EVENTS, subscribeSettingsEvent } from "../utils/settingsEvents";

export type KeepAwakeRuntimeStatus =
  | "disabled"
  | "requesting"
  | "active"
  | "suspended"
  | "unsupported"
  | "error";

export interface KeepAwakeRuntimeSnapshot {
  platform: RuntimePlatform;
  preferenceEnabled: boolean;
  status: KeepAwakeRuntimeStatus;
  message: string | null;
  updatedAt: number;
}

interface ElectronKeepAwakeBridge {
  setEnabled: (enabled: boolean) => Promise<{ active: boolean }>;
}

type Listener = () => void;

const UNSUPPORTED_MESSAGE = "当前浏览器或运行环境不支持屏幕常亮，设置已保留。";
const ERROR_MESSAGE = "系统暂未允许屏幕常亮，设置已保留，将在应用再次进入前台时重试。";
const SUSPENDED_MESSAGE = "应用已进入后台，返回前台后将恢复屏幕常亮。";
const AndroidKeepAwake = registerPlugin<KeepAwakePlugin>("KeepAwake");

const platform = getRuntimePlatform();
let snapshot: KeepAwakeRuntimeSnapshot = {
  platform,
  preferenceEnabled: false,
  status: "disabled",
  message: null,
  updatedAt: 0,
};
const listeners = new Set<Listener>();

let runtimeStarted = false;
let stopListeners: (() => void) | null = null;
let operation = Promise.resolve();
let generation = 0;
let webSentinel: WakeLockSentinel | null = null;

function publish(next: Partial<KeepAwakeRuntimeSnapshot>): void {
  snapshot = {
    ...snapshot,
    ...next,
    platform,
    updatedAt: Date.now(),
  };
  listeners.forEach((listener) => listener());
}

function isVisible(): boolean {
  return typeof document === "undefined" || document.visibilityState === "visible";
}

function getElectronBridge(): ElectronKeepAwakeBridge | null {
  if (typeof window === "undefined") return null;
  const candidate = (window as Window & { electronAPI?: { keepAwake?: unknown } }).electronAPI
    ?.keepAwake;
  if (!candidate || typeof candidate !== "object") return null;
  const setEnabled = (candidate as { setEnabled?: unknown }).setEnabled;
  return typeof setEnabled === "function"
    ? ({
        setEnabled: setEnabled as ElectronKeepAwakeBridge["setEnabled"],
      } satisfies ElectronKeepAwakeBridge)
    : null;
}

async function releaseWebSentinel(): Promise<void> {
  const sentinel = webSentinel;
  webSentinel = null;
  if (!sentinel) return;
  try {
    await sentinel.release();
  } catch (error) {
    logger.warn("释放 Web 屏幕常亮失败:", error);
  }
}

async function releaseBackend(): Promise<void> {
  if (platform === "web") {
    await releaseWebSentinel();
    return;
  }

  if (platform === "electron") {
    const bridge = getElectronBridge();
    if (bridge) {
      try {
        await bridge.setEnabled(false);
      } catch (error) {
        logger.warn("释放 Electron 屏幕常亮失败:", error);
      }
    }
    return;
  }

  try {
    await AndroidKeepAwake.allowSleep();
  } catch (error) {
    logger.warn("释放 Android 屏幕常亮失败:", error);
  }
}

function attachWebSentinelRelease(sentinel: WakeLockSentinel): void {
  const onRelease = () => {
    if (webSentinel !== sentinel) return;
    webSentinel = null;
    if (snapshot.preferenceEnabled && isVisible()) {
      publish({ status: "suspended", message: ERROR_MESSAGE });
    }
  };
  sentinel.addEventListener("release", onRelease, { once: true });
}

async function enableBackend(): Promise<"active" | "unsupported" | "error"> {
  if (platform === "web") {
    if (
      typeof navigator === "undefined" ||
      !("wakeLock" in navigator) ||
      typeof navigator.wakeLock?.request !== "function"
    ) {
      return "unsupported";
    }
    try {
      await releaseWebSentinel();
      const sentinel = await navigator.wakeLock.request("screen");
      webSentinel = sentinel;
      attachWebSentinelRelease(sentinel);
      return "active";
    } catch (error) {
      logger.warn("请求 Web 屏幕常亮失败:", error);
      return "error";
    }
  }

  if (platform === "electron") {
    const bridge = getElectronBridge();
    if (!bridge) return "unsupported";
    try {
      const result = await bridge.setEnabled(true);
      return result.active ? "active" : "error";
    } catch (error) {
      logger.warn("请求 Electron 屏幕常亮失败:", error);
      return "error";
    }
  }

  try {
    const support = await AndroidKeepAwake.isSupported();
    if (!support.isSupported) return "unsupported";
    await AndroidKeepAwake.keepAwake();
    return "active";
  } catch (error) {
    logger.warn("请求 Android 屏幕常亮失败:", error);
    return "error";
  }
}

async function reconcile(): Promise<void> {
  const currentGeneration = generation;
  const enabled = snapshot.preferenceEnabled;

  if (!enabled) {
    await releaseBackend();
    if (currentGeneration === generation) publish({ status: "disabled", message: null });
    return;
  }

  if (!isVisible()) {
    await releaseBackend();
    if (currentGeneration === generation) {
      publish({ status: "suspended", message: SUSPENDED_MESSAGE });
    }
    return;
  }

  publish({ status: "requesting", message: null });
  const result = await enableBackend();
  if (currentGeneration !== generation) {
    await releaseBackend();
    return;
  }

  if (result === "active") {
    publish({ status: "active", message: null });
  } else if (result === "unsupported") {
    publish({ status: "unsupported", message: UNSUPPORTED_MESSAGE });
  } else {
    publish({ status: "error", message: ERROR_MESSAGE });
  }
}

function queueReconcile(): void {
  operation = operation.then(reconcile, reconcile).catch((error: unknown) => {
    logger.warn("同步屏幕常亮状态失败:", error);
  });
}

function requestReconcile(): void {
  generation += 1;
  queueReconcile();
}

function readPreference(): boolean {
  try {
    return getAppSettings().general.keepAwakeEnabled;
  } catch (error) {
    logger.warn("读取屏幕常亮设置失败:", error);
    return false;
  }
}

function updatePreference(enabled: boolean): void {
  generation += 1;
  publish({ preferenceEnabled: enabled });
  queueReconcile();
}

function attachRuntimeListeners(): () => void {
  if (typeof window === "undefined" || typeof document === "undefined") return () => undefined;

  const onVisibilityChange = () => requestReconcile();
  const onFocus = () => requestReconcile();
  const onSettingsSaved = () => updatePreference(readPreference());
  const onStorage = (event: StorageEvent) => {
    if (event.key === "AppSettings") updatePreference(readPreference());
  };
  const onPageHide = () => {
    generation += 1;
    void releaseBackend();
  };

  document.addEventListener("visibilitychange", onVisibilityChange);
  document.addEventListener("fullscreenchange", onVisibilityChange);
  window.addEventListener("focus", onFocus);
  window.addEventListener("pageshow", onFocus);
  window.addEventListener("storage", onStorage);
  window.addEventListener("pagehide", onPageHide);
  const offSettings = subscribeSettingsEvent(SETTINGS_EVENTS.SettingsSaved, onSettingsSaved);

  return () => {
    document.removeEventListener("visibilitychange", onVisibilityChange);
    document.removeEventListener("fullscreenchange", onVisibilityChange);
    window.removeEventListener("focus", onFocus);
    window.removeEventListener("pageshow", onFocus);
    window.removeEventListener("storage", onStorage);
    window.removeEventListener("pagehide", onPageHide);
    offSettings();
  };
}

export function startKeepAwakeRuntime(): () => void {
  if (runtimeStarted) return stopKeepAwakeRuntime;
  runtimeStarted = true;
  snapshot = {
    ...snapshot,
    preferenceEnabled: readPreference(),
    status: "disabled",
    message: null,
  };
  stopListeners = attachRuntimeListeners();
  queueReconcile();
  return stopKeepAwakeRuntime;
}

export function stopKeepAwakeRuntime(): void {
  runtimeStarted = false;
  generation += 1;
  stopListeners?.();
  stopListeners = null;
  void releaseBackend();
  publish({ preferenceEnabled: false, status: "disabled", message: null });
}

export function getKeepAwakeRuntimeSnapshot(): KeepAwakeRuntimeSnapshot {
  return snapshot;
}

export function subscribeKeepAwakeRuntime(listener: Listener): () => void {
  listeners.add(listener);
  listener();
  return () => listeners.delete(listener);
}

export function __resetKeepAwakeRuntimeForTests(): void {
  stopKeepAwakeRuntime();
  listeners.clear();
  operation = Promise.resolve();
  generation = 0;
  webSentinel = null;
}
