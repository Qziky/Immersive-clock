import { app, BrowserWindow, shell } from "electron";
import { autoUpdater } from "electron-updater";

import type { ElectronUpdateState } from "../src/types/update";

const MANIFEST_URL =
  process.env.VITE_UPDATE_MANIFEST_URL ||
  "https://github.com/Qziky/Immersive-clock/releases/latest/download/update-manifest.json";
const RELEASE_URL = "https://github.com/Qziky/Immersive-clock/releases/latest";
const MANIFEST_TIMEOUT_MS = 10_000;

type UpdateListener = (state: ElectronUpdateState) => void;

interface ReleaseManifest {
  schemaVersion?: unknown;
  channel?: unknown;
  version?: unknown;
  publishedAt?: unknown;
  releaseUrl?: unknown;
  platforms?: {
    windows?: { version?: unknown; installerUrl?: unknown; portableUrl?: unknown };
    linux?: { version?: unknown; appImageUrl?: unknown; debUrl?: unknown; rpmUrl?: unknown };
  };
}

function isStableVersion(value: unknown): value is string {
  return typeof value === "string" && /^v?\d+\.\d+\.\d+(?:\+[^-\s]+)?$/.test(value.trim());
}

function compareVersions(left: string, right: string): number {
  const leftParts = left.replace(/^v/i, "").split(".").map(Number);
  const rightParts = right.replace(/^v/i, "").split(".").map(Number);
  for (let index = 0; index < 3; index += 1) {
    const leftPart = Number.isFinite(leftParts[index]) ? leftParts[index] : 0;
    const rightPart = Number.isFinite(rightParts[index]) ? rightParts[index] : 0;
    if (leftPart !== rightPart) return leftPart > rightPart ? 1 : -1;
  }
  return 0;
}

function isAutoUpdateSupported(): boolean {
  if (!app.isPackaged) return false;
  if (process.platform === "win32") return !process.env.PORTABLE_EXECUTABLE_FILE;
  if (process.platform === "linux") return Boolean(process.env.APPIMAGE);
  return false;
}

function getPlatformManifest(manifest: ReleaseManifest): Record<string, unknown> | undefined {
  const platform =
    process.platform === "win32" ? manifest.platforms?.windows : manifest.platforms?.linux;
  return platform as Record<string, unknown> | undefined;
}

async function fetchManifest(): Promise<{
  version: string;
  releaseUrl: string;
  platform: Record<string, unknown>;
  downloadUrl?: string;
}> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), MANIFEST_TIMEOUT_MS);
  try {
    const response = await fetch(MANIFEST_URL, {
      cache: "no-store",
      headers: { accept: "application/json" },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`更新清单请求失败（${response.status}）`);
    const manifest = (await response.json()) as ReleaseManifest;
    const platform = getPlatformManifest(manifest);
    if (
      manifest.schemaVersion !== 1 ||
      manifest.channel !== "stable" ||
      !isStableVersion(manifest.version) ||
      typeof manifest.version !== "string" ||
      typeof manifest.releaseUrl !== "string" ||
      new URL(manifest.releaseUrl).protocol !== "https:" ||
      !platform ||
      typeof platform.version !== "string"
    ) {
      throw new Error("更新清单缺少当前平台信息");
    }
    if (
      !isStableVersion(platform.version) ||
      compareVersions(manifest.version, platform.version) !== 0
    ) {
      throw new Error("更新清单的平台版本与主版本不一致");
    }
    const downloadKey =
      process.platform === "win32"
        ? process.env.PORTABLE_EXECUTABLE_FILE
          ? "portableUrl"
          : "installerUrl"
        : process.platform === "linux" && process.env.APPIMAGE
          ? "appImageUrl"
          : undefined;
    const candidate = downloadKey ? platform[downloadKey] : undefined;
    const downloadUrl = typeof candidate === "string" ? candidate : undefined;
    return { version: manifest.version, releaseUrl: manifest.releaseUrl, platform, downloadUrl };
  } finally {
    clearTimeout(timeout);
  }
}

export class ElectronUpdateManager {
  private state: ElectronUpdateState = {
    status: "idle",
    currentVersion: app.getVersion(),
  };

  private readonly listeners = new Set<UpdateListener>();

  private windowGetter: () => BrowserWindow | null = () => null;

  private releaseUrl = RELEASE_URL;

  constructor() {
    autoUpdater.autoDownload = false;
    autoUpdater.autoInstallOnAppQuit = true;
    autoUpdater.allowPrerelease = false;
    autoUpdater.on("checking-for-update", () => this.setState({ status: "checking" }));
    autoUpdater.on("update-available", (info) =>
      this.setState({
        status: "available",
        latestVersion: info.version,
        progress: 0,
        canInstall: false,
        action: "download",
      })
    );
    autoUpdater.on("download-progress", (progress) =>
      this.setState({
        status: "downloading",
        progress: Math.round(progress.percent),
        action: undefined,
      })
    );
    autoUpdater.on("update-downloaded", (info) =>
      this.setState({
        status: "ready",
        latestVersion: info.version,
        progress: 100,
        canInstall: true,
        action: "install",
      })
    );
    autoUpdater.on("update-not-available", () =>
      this.setState({
        status: "current",
        checkedAt: Date.now(),
        error: undefined,
        action: undefined,
      })
    );
    autoUpdater.on("error", (error) =>
      this.setState({
        status: "error",
        checkedAt: Date.now(),
        error: error.message,
        action: "retry",
      })
    );
  }

  setWindowGetter(getter: () => BrowserWindow | null): void {
    this.windowGetter = getter;
  }

  private setState(next: Partial<ElectronUpdateState>): ElectronUpdateState {
    this.state = { ...this.state, ...next, currentVersion: app.getVersion() };
    this.listeners.forEach((listener) => listener(this.state));
    const window = this.windowGetter();
    if (window && !window.isDestroyed()) window.webContents.send("updates:state", this.state);
    return this.state;
  }

  subscribe(listener: UpdateListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  getState(): ElectronUpdateState {
    return this.state;
  }

  async check(): Promise<ElectronUpdateState> {
    if (!app.isPackaged) {
      return this.setState({ status: "current", checkedAt: Date.now(), error: undefined });
    }
    try {
      const manifest = await fetchManifest();
      this.releaseUrl = manifest.releaseUrl;
      if (compareVersions(manifest.version, app.getVersion()) <= 0) {
        return this.setState({
          status: "current",
          latestVersion: manifest.version,
          checkedAt: Date.now(),
          error: undefined,
          action: undefined,
        });
      }

      if (!isAutoUpdateSupported()) {
        return this.setState({
          status: "available",
          latestVersion: manifest.version,
          checkedAt: Date.now(),
          releaseUrl: this.releaseUrl,
          downloadUrl: manifest.downloadUrl,
          canInstall: false,
          action: "open",
          error: undefined,
        });
      }

      const result = await autoUpdater.checkForUpdates();
      const metadataVersion = result?.updateInfo?.version;
      if (!metadataVersion || compareVersions(metadataVersion, manifest.version) !== 0) {
        return this.setState({
          status: "error",
          latestVersion: manifest.version,
          checkedAt: Date.now(),
          releaseUrl: this.releaseUrl,
          downloadUrl: manifest.downloadUrl,
          canInstall: false,
          action: "open",
          error: "更新元数据与统一清单版本不一致，请打开发布页确认。",
        });
      }

      this.setState({
        latestVersion: metadataVersion,
        releaseUrl: this.releaseUrl,
        downloadUrl: manifest.downloadUrl,
      });
      await autoUpdater.downloadUpdate();
      return this.state;
    } catch (error) {
      return this.setState({
        status: "error",
        checkedAt: Date.now(),
        error: error instanceof Error ? error.message : "更新检查失败",
      });
    }
  }

  async install(): Promise<void> {
    if (this.state.status !== "ready" || !isAutoUpdateSupported()) {
      await this.openRelease();
      return;
    }
    autoUpdater.quitAndInstall(false, true);
  }

  async openRelease(): Promise<void> {
    await shell.openExternal(this.state.downloadUrl || this.state.releaseUrl || this.releaseUrl);
  }
}

export const electronUpdateManager = new ElectronUpdateManager();
