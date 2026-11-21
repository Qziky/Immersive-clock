import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ElectronUpdateState } from "../../../types/update";
import type { PwaWorkerSnapshot, PwaWorkerStatus } from "../pwaUpdateController";

const mocks = vi.hoisted(() => ({
  autoCheckEnabled: true,
  platform: "web" as "web" | "electron" | "android",
  fetchUpdateManifest: vi.fn(),
}));

vi.mock("../../../utils/appSettings", () => ({
  getAppSettings: () => ({ general: { update: { autoCheckEnabled: mocks.autoCheckEnabled } } }),
}));

vi.mock("../../../utils/runtimePlatform", () => ({
  getRuntimePlatform: () => mocks.platform,
}));

vi.mock("@capacitor/browser", () => ({
  Browser: { open: vi.fn().mockResolvedValue(undefined) },
}));

vi.mock("../updateManifest", () => ({
  compareVersions: (left: string, right: string) =>
    left.localeCompare(right, undefined, { numeric: true }),
  fetchUpdateManifest: mocks.fetchUpdateManifest,
  getCurrentVersion: () => "4.0.0",
  getPlatformRelease: (manifest: {
    platforms: { web?: { version: string }; android?: { version: string; apkUrl?: string } };
  }) => (mocks.platform === "android" ? manifest.platforms.android : manifest.platforms.web),
}));

const manifest = {
  schemaVersion: 1 as const,
  channel: "stable" as const,
  version: "4.1.0",
  publishedAt: "2026-08-07T00:00:00Z",
  minimumSupportedVersion: "4.0.0",
  releaseUrl: "https://github.com/Qziky/Immersive-clock/releases/tag/v4.1.0",
  platforms: {
    web: { version: "4.1.0" },
    android: {
      version: "4.1.0",
      versionCode: 40100,
      apkUrl: "https://example.com/immersive-clock.apk",
    },
  },
};

async function loadRuntime() {
  return import("../updateRuntime");
}

function mockWorker(initial: PwaWorkerStatus = "idle") {
  let snapshot: PwaWorkerSnapshot = { status: initial };
  const listeners = new Set<() => void>();
  return {
    check: vi.fn(async () => undefined),
    activate: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
    getSnapshot: () => snapshot,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    report(status: PwaWorkerStatus, error?: string) {
      snapshot = { status, error };
      listeners.forEach((listener) => listener());
    },
  };
}

function mockPageReload() {
  const reload = vi.fn();
  vi.stubGlobal("window", { location: { reload } });
  return reload;
}

describe("updateRuntime", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
    mocks.autoCheckEnabled = true;
    mocks.platform = "web";
    mocks.fetchUpdateManifest.mockReset().mockResolvedValue(manifest);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    Reflect.deleteProperty(window, "electronAPI");
    vi.useRealTimers();
  });

  it("自动检查关闭后跳过轮询，但手动检查仍可用", async () => {
    mocks.autoCheckEnabled = false;
    const runtime = await loadRuntime();

    expect((await runtime.checkForUpdates()).status).toBe("idle");
    expect(mocks.fetchUpdateManifest).not.toHaveBeenCalled();

    const manual = await runtime.checkForUpdates({ manual: true });
    expect(manual.status).toBe("available");
    expect(manual.source).toBe("manual");
    expect(mocks.fetchUpdateManifest).toHaveBeenCalledTimes(1);
  });

  it("重复检查会复用同一个请求", async () => {
    let resolveManifest: ((value: typeof manifest) => void) | undefined;
    mocks.fetchUpdateManifest.mockReturnValue(
      new Promise<typeof manifest>((resolve) => {
        resolveManifest = resolve;
      })
    );
    const runtime = await loadRuntime();

    const first = runtime.checkForUpdates({ manual: true });
    const second = runtime.checkForUpdates({ manual: true });
    expect(mocks.fetchUpdateManifest).toHaveBeenCalledTimes(1);

    resolveManifest?.(manifest);
    await expect(first).resolves.toMatchObject({ status: "available" });
    await expect(second).resolves.toMatchObject({ status: "available" });
  });

  it("发现清单但尚无新版资源时可以重查，再跟随原生准备状态", async () => {
    const runtime = await loadRuntime();
    const worker = mockWorker();
    runtime.configurePwaUpdateControl(worker);

    const result = await runtime.checkForUpdates({ manual: true });
    expect(result).toMatchObject({ status: "available", action: "update", latestVersion: "4.1.0" });
    await runtime.executeUpdateAction();
    expect(worker.check).toHaveBeenCalledTimes(3);
    expect(worker.activate).not.toHaveBeenCalled();

    worker.report("preparing");
    expect(runtime.getUpdateSnapshot().status).toBe("preparing");
    worker.report("waiting");
    expect(runtime.getUpdateSnapshot()).toMatchObject({ status: "ready", action: "update" });
  });

  it("等待与其他窗口的接管都不会自动刷新，手动应用后才刷新本窗", async () => {
    const reload = mockPageReload();
    const runtime = await loadRuntime();
    const worker = mockWorker("waiting");
    runtime.configurePwaUpdateControl(worker);
    expect(runtime.getUpdateSnapshot().status).toBe("ready");
    expect(worker.activate).not.toHaveBeenCalled();
    worker.report("controlled");
    expect(reload).not.toHaveBeenCalled();
    expect(runtime.getUpdateSnapshot().status).toBe("ready");

    await runtime.executeUpdateAction();
    expect(worker.activate).toHaveBeenCalledTimes(1);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("接管失败时提示并允许重试；并发点击只执行一次", async () => {
    const reload = mockPageReload();
    const runtime = await loadRuntime();
    const worker = mockWorker("waiting");
    worker.activate.mockRejectedValueOnce(new Error("尚未确认新版接管"));
    runtime.configurePwaUpdateControl(worker);

    await Promise.all([runtime.executeUpdateAction(), runtime.executeUpdateAction()]);
    expect(worker.activate).toHaveBeenCalledTimes(1);
    expect(reload).not.toHaveBeenCalled();
    expect(runtime.getUpdateSnapshot()).toMatchObject({
      status: "error",
      action: "retry",
      error: "尚未确认新版接管",
    });

    await runtime.executeUpdateAction();
    expect(worker.activate).toHaveBeenCalledTimes(2);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("计时保护既挡住点击，也挡住等待接管期间新出现的计时", async () => {
    const reload = mockPageReload();
    const runtime = await loadRuntime();
    const worker = mockWorker("waiting");
    runtime.configurePwaUpdateControl(worker);
    runtime.setWebUpdateReloadBlocked(true);
    await runtime.executeUpdateAction();
    expect(worker.activate).not.toHaveBeenCalled();
    expect(runtime.getUpdateSnapshot().webReloadBlocked).toBe(true);

    runtime.setWebUpdateReloadBlocked(false);
    let finish: (() => void) | undefined;
    worker.activate.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        })
    );
    const applying = runtime.executeUpdateAction();
    expect(runtime.getUpdateSnapshot().status).toBe("applying");
    await Promise.resolve();
    runtime.setWebUpdateReloadBlocked(true);
    worker.report("controlled");
    finish?.();
    await applying;
    expect(reload).not.toHaveBeenCalled();
    expect(runtime.getUpdateSnapshot()).toMatchObject({ status: "ready", webReloadBlocked: true });

    runtime.setWebUpdateReloadBlocked(false);
    expect(reload).not.toHaveBeenCalled();
    await runtime.executeUpdateAction();
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("无 SW 支持时仅在发现新版本后提供手动刷新", async () => {
    const reload = mockPageReload();
    const runtime = await loadRuntime();
    runtime.configurePwaUpdateControl(null);
    const state = await runtime.checkForUpdates({ manual: true });
    expect(state).toMatchObject({ status: "ready", webDirectReload: true });
    expect(reload).not.toHaveBeenCalled();
    await runtime.executeUpdateAction();
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("Electron 保留主进程提供的下载与安装状态语义", async () => {
    mocks.platform = "electron";
    let updateListener: ((state: ElectronUpdateState) => void) | undefined;
    Object.defineProperty(window, "electronAPI", {
      configurable: true,
      value: {
        updates: {
          check: vi.fn().mockResolvedValue({
            status: "available",
            currentVersion: "4.0.0",
            latestVersion: "4.1.0",
            action: "download",
          }),
          getState: vi.fn(),
          install: vi.fn(),
          openRelease: vi.fn(),
          subscribe: vi.fn((listener: (state: ElectronUpdateState) => void) => {
            updateListener = listener;
            return vi.fn();
          }),
        },
      },
    });
    const runtime = await loadRuntime();

    await expect(runtime.checkForUpdates({ manual: true })).resolves.toMatchObject({
      platform: "electron",
      status: "available",
      action: "download",
    });

    updateListener?.({
      status: "ready",
      currentVersion: "4.0.0",
      latestVersion: "4.1.0",
      canInstall: true,
      action: "install",
    });
    expect(runtime.getUpdateSnapshot()).toMatchObject({ status: "ready", action: "install" });
  });

  it("启动检查后，前台恢复会按 6 小时节流", async () => {
    const runtime = await loadRuntime();
    const stop = runtime.startUpdateRuntime();

    await vi.advanceTimersByTimeAsync(1_500);
    expect(mocks.fetchUpdateManifest).toHaveBeenCalledTimes(1);

    window.dispatchEvent(new Event("focus"));
    await Promise.resolve();
    expect(mocks.fetchUpdateManifest).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(6 * 60 * 60 * 1_000);
    window.dispatchEvent(new Event("focus"));
    await Promise.resolve();
    expect(mocks.fetchUpdateManifest).toHaveBeenCalledTimes(2);
    stop();
  });

  it("Android 更新打开 APK 地址并在返回前台时允许立即复查", async () => {
    mocks.platform = "android";
    const runtime = await loadRuntime();
    const result = await runtime.checkForUpdates({ manual: true });
    expect(result).toMatchObject({ status: "available", latestVersion: "4.1.0" });

    await runtime.executeUpdateAction();
    const { Browser } = await import("@capacitor/browser");
    expect(Browser.open).toHaveBeenCalledWith({ url: "https://example.com/immersive-clock.apk" });
  });

  it("Android 打开 APK 失败时回退到 Release 页面", async () => {
    mocks.platform = "android";
    const runtime = await loadRuntime();
    await runtime.checkForUpdates({ manual: true });
    const { Browser } = await import("@capacitor/browser");
    vi.mocked(Browser.open).mockReset();
    vi.mocked(Browser.open)
      .mockRejectedValueOnce(new Error("无法打开 APK"))
      .mockResolvedValueOnce(undefined);

    await runtime.executeUpdateAction();

    expect(Browser.open).toHaveBeenNthCalledWith(1, {
      url: "https://example.com/immersive-clock.apk",
    });
    expect(Browser.open).toHaveBeenNthCalledWith(2, {
      url: "https://github.com/Qziky/Immersive-clock/releases/tag/v4.1.0",
    });
  });
});
