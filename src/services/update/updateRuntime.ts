import type {
  ElectronUpdateBridge,
  ElectronUpdateState,
  UpdateCheckOptions,
  UpdateManifest,
  UpdatePlatform,
  UpdateSnapshot,
} from "../../types/update";
import { getAppSettings } from "../../utils/appSettings";
import { getRuntimePlatform } from "../../utils/runtimePlatform";

import {
  compareVersions,
  fetchUpdateManifest,
  getCurrentVersion,
  getPlatformRelease,
} from "./updateManifest";

export interface PwaUpdateControl {
  check: () => Promise<boolean>;
  update: () => Promise<void>;
}

const UPDATE_NOTICE_ID = "app-update-notice";
const FOREGROUND_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;

let snapshot: UpdateSnapshot = {
  platform: getRuntimePlatform(),
  currentVersion: getCurrentVersion(),
  status: "idle",
  source: "auto",
};
let pwaControl: PwaUpdateControl | null = null;
let electronBridge: ElectronUpdateBridge | null = null;
let started = false;
let runtimeConsumers = 0;
let checkPromise: Promise<UpdateSnapshot> | null = null;
let lastCheckAt = 0;
let foregroundHandler: (() => void) | null = null;
let visibilityHandler: (() => void) | null = null;
let electronUnsubscribe: (() => void) | null = null;
let suppressedVersion: string | null = null;
const listeners = new Set<() => void>();

function emit(next: UpdateSnapshot): UpdateSnapshot {
  snapshot = next;
  listeners.forEach((listener) => listener());
  return next;
}

function platformReleaseUrl(
  manifest: UpdateManifest,
  platform: UpdatePlatform
): string | undefined {
  const release = getPlatformRelease(manifest, platform) as
    | {
        apkUrl?: string;
        installerUrl?: string;
        portableUrl?: string;
        appImageUrl?: string;
        debUrl?: string;
        rpmUrl?: string;
      }
    | undefined;
  if (platform === "android") return release?.apkUrl ?? manifest.releaseUrl;
  if (platform === "electron") {
    const userAgent = typeof navigator !== "undefined" ? navigator.userAgent : "";
    if (/win/i.test(userAgent)) {
      return release?.installerUrl ?? release?.portableUrl ?? manifest.releaseUrl;
    }
    return release?.appImageUrl ?? release?.debUrl ?? release?.rpmUrl ?? manifest.releaseUrl;
  }
  return undefined;
}

function fromElectronState(state: ElectronUpdateState, source: "auto" | "manual"): UpdateSnapshot {
  const action =
    state.status === "ready" && state.canInstall
      ? "install"
      : state.status === "available"
        ? "open"
        : state.status === "error"
          ? "retry"
          : undefined;
  return {
    platform: "electron",
    currentVersion: state.currentVersion,
    status: state.status,
    latestVersion: state.latestVersion,
    checkedAt: state.checkedAt ?? Date.now(),
    progress: state.progress,
    error: state.error,
    source,
    action,
  };
}

function canAutoCheck(): boolean {
  return getAppSettings().general.update.autoCheckEnabled;
}

function setError(error: unknown, source: "auto" | "manual"): UpdateSnapshot {
  return emit({
    ...snapshot,
    status: "error",
    checkedAt: Date.now(),
    error: error instanceof Error ? error.message : "更新检查失败，请稍后重试。",
    source,
    action: "retry",
  });
}

function getElectronBridge(): ElectronUpdateBridge | null {
  if (electronBridge) return electronBridge;
  const candidate = (window as Window & { electronAPI?: { updates?: ElectronUpdateBridge } })
    .electronAPI?.updates;
  if (!candidate) return null;
  electronBridge = candidate;
  electronUnsubscribe = candidate.subscribe((state) => {
    emit(fromElectronState(state, snapshot.source === "manual" ? "manual" : "auto"));
  });
  return candidate;
}

export function getUpdateSnapshot(): UpdateSnapshot {
  return snapshot;
}

export function subscribeUpdateRuntime(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function configurePwaUpdateControl(control: PwaUpdateControl | null): void {
  pwaControl = control;
  if (control && snapshot.platform === "web") {
    void control.check().then((waiting) => {
      if (waiting) {
        emit({
          ...snapshot,
          status: "available",
          latestVersion: snapshot.latestVersion ?? snapshot.currentVersion,
          action: "update",
          source: "platform",
        });
      }
    });
  }
}

export function markPwaUpdateAvailable(): void {
  if (snapshot.platform !== "web") return;
  emit({
    ...snapshot,
    status: "available",
    latestVersion: snapshot.latestVersion ?? snapshot.currentVersion,
    action: "update",
    source: "platform",
  });
}

export async function checkForUpdates(options: UpdateCheckOptions = {}): Promise<UpdateSnapshot> {
  const manual = options.manual === true;
  const source = manual ? "manual" : "auto";
  if (!manual && !canAutoCheck()) return snapshot;
  if (!manual && import.meta.env.DEV && import.meta.env.MODE !== "test") return snapshot;
  if (checkPromise) return checkPromise;

  const bridge = getElectronBridge();
  if (snapshot.platform === "electron" && bridge) {
    emit({ ...snapshot, status: "checking", error: undefined, source });
    checkPromise = bridge
      .check()
      .then((state) => {
        lastCheckAt = Date.now();
        return emit(fromElectronState(state, source));
      })
      .catch((error) => setError(error, source))
      .finally(() => {
        checkPromise = null;
      });
    return checkPromise;
  }

  emit({ ...snapshot, status: "checking", error: undefined, source });
  checkPromise = fetchUpdateManifest(snapshot.platform)
    .then(async (manifest) => {
      const release = getPlatformRelease(manifest, snapshot.platform);
      const latestVersion = release?.version ?? manifest.version;
      const minimumVersionWarning = Boolean(
        manifest.minimumSupportedVersion &&
        compareVersions(snapshot.currentVersion, manifest.minimumSupportedVersion) < 0
      );
      const waiting = snapshot.platform === "web" && pwaControl ? await pwaControl.check() : false;
      lastCheckAt = Date.now();
      const newerVersion = compareVersions(latestVersion, snapshot.currentVersion) > 0;
      if (waiting || newerVersion) {
        return emit({
          ...snapshot,
          status: "available",
          latestVersion,
          manifest,
          checkedAt: lastCheckAt,
          source,
          action: waiting || !pwaControl ? "update" : "retry",
          minimumVersionWarning,
          error: undefined,
        });
      }
      return emit({
        ...snapshot,
        status: "current",
        latestVersion,
        manifest,
        checkedAt: lastCheckAt,
        source,
        action: undefined,
        minimumVersionWarning,
        error: undefined,
      });
    })
    .catch((error) => setError(error, source))
    .finally(() => {
      checkPromise = null;
    });
  return checkPromise;
}

export async function executeUpdateAction(): Promise<void> {
  const current = snapshot;
  if (current.status === "error" || current.action === "retry") {
    await checkForUpdates({ manual: true });
    return;
  }
  if (current.platform === "web") {
    if (pwaControl) {
      try {
        await pwaControl.update();
        return;
      } catch (error) {
        setError(error, current.source === "manual" ? "manual" : "auto");
        throw error;
      }
    }
    window.location.reload();
    return;
  }
  const bridge = getElectronBridge();
  if (current.platform === "electron" && bridge) {
    if (current.status === "ready") {
      await bridge.install();
      return;
    }
    await bridge.openRelease();
    return;
  }
  const url = current.manifest ? platformReleaseUrl(current.manifest, current.platform) : undefined;
  if (!url) throw new Error("当前平台没有可用的更新地址");
  if (current.platform === "android") {
    const releaseUrl = current.manifest?.releaseUrl ?? url;
    try {
      const { Browser } = await import("@capacitor/browser");
      await Browser.open({ url });
      lastCheckAt = 0;
      return;
    } catch {
      try {
        const { Browser } = await import("@capacitor/browser");
        await Browser.open({ url: releaseUrl });
        lastCheckAt = 0;
        return;
      } catch {
        // 浏览器插件不可用时继续使用系统窗口回退到发布页。
      }
    }
    const openedRelease = window.open(releaseUrl, "_blank", "noopener,noreferrer");
    if (!openedRelease) window.location.assign(releaseUrl);
    lastCheckAt = 0;
    return;
  }
  const opened = window.open(url, "_blank", "noopener,noreferrer");
  if (!opened) window.location.assign(url);
}

export function dismissUpdateNotice(): void {
  suppressedVersion = snapshot.latestVersion ?? null;
}

export function isUpdateNoticeSuppressed(): boolean {
  return Boolean(snapshot.latestVersion && suppressedVersion === snapshot.latestVersion);
}

export function isAutomaticCheckEnabled(): boolean {
  return canAutoCheck();
}

export function startUpdateRuntime(): () => void {
  runtimeConsumers += 1;
  if (started) {
    let released = false;
    return () => {
      if (released) return;
      released = true;
      runtimeConsumers = Math.max(0, runtimeConsumers - 1);
    };
  }
  started = true;
  const initialDelay = window.setTimeout(() => {
    void checkForUpdates();
  }, 1500);
  lastCheckAt = 0;
  foregroundHandler = () => {
    if (Date.now() - lastCheckAt < FOREGROUND_CHECK_INTERVAL_MS) return;
    void checkForUpdates();
  };
  visibilityHandler = () => {
    if (document.visibilityState === "visible") foregroundHandler?.();
  };
  window.addEventListener("focus", foregroundHandler);
  document.addEventListener("visibilitychange", visibilityHandler);
  return () => {
    runtimeConsumers = Math.max(0, runtimeConsumers - 1);
    if (runtimeConsumers > 0) return;
    window.clearTimeout(initialDelay);
    if (foregroundHandler) window.removeEventListener("focus", foregroundHandler);
    if (visibilityHandler) document.removeEventListener("visibilitychange", visibilityHandler);
    electronUnsubscribe?.();
    electronUnsubscribe = null;
    electronBridge = null;
    started = false;
  };
}

export const UPDATE_NOTICE_ID_EXPORT = UPDATE_NOTICE_ID;
