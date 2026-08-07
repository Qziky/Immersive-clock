export type UpdatePlatform = "web" | "electron" | "android";

export type UpdateStatus =
  "idle" | "checking" | "current" | "available" | "downloading" | "ready" | "error";

export interface WebPlatformRelease {
  version: string;
}

export interface WindowsPlatformRelease {
  version: string;
  installerUrl?: string;
  portableUrl?: string;
}

export interface LinuxPlatformRelease {
  version: string;
  appImageUrl?: string;
  debUrl?: string;
  rpmUrl?: string;
}

export interface AndroidPlatformRelease {
  version: string;
  versionCode?: number;
  apkUrl?: string;
}

export interface UpdateManifest {
  schemaVersion: 1;
  channel: "stable";
  version: string;
  publishedAt: string;
  minimumSupportedVersion?: string;
  releaseUrl: string;
  platforms: {
    web?: WebPlatformRelease;
    windows?: WindowsPlatformRelease;
    linux?: LinuxPlatformRelease;
    android?: AndroidPlatformRelease;
  };
}

export type UpdateAction = "update" | "install" | "download" | "retry" | "open";

export interface UpdateSnapshot {
  platform: UpdatePlatform;
  currentVersion: string;
  status: UpdateStatus;
  latestVersion?: string;
  manifest?: UpdateManifest;
  checkedAt?: number;
  progress?: number;
  error?: string;
  source: "auto" | "manual" | "platform";
  action?: UpdateAction;
  minimumVersionWarning?: boolean;
}

export interface UpdateCheckOptions {
  manual?: boolean;
}

export interface ElectronUpdateState {
  status: UpdateStatus;
  currentVersion: string;
  latestVersion?: string;
  checkedAt?: number;
  progress?: number;
  error?: string;
  releaseUrl?: string;
  downloadUrl?: string;
  canInstall?: boolean;
  action?: UpdateAction;
}

export interface ElectronUpdateBridge {
  getState: () => Promise<ElectronUpdateState>;
  check: () => Promise<ElectronUpdateState>;
  install: () => Promise<void>;
  openRelease: () => Promise<void>;
  subscribe: (listener: (state: ElectronUpdateState) => void) => () => void;
}
