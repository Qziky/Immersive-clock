import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  app: {
    isPackaged: true,
    getVersion: vi.fn(() => "4.0.0"),
  },
  handlers: new Map<string, (...args: unknown[]) => void>(),
  openExternal: vi.fn(),
  autoUpdater: {
    autoDownload: true,
    autoInstallOnAppQuit: false,
    allowPrerelease: true,
    on: vi.fn((event: string, listener: (...args: unknown[]) => void) => {
      mocks.handlers.set(event, listener);
    }),
    checkForUpdates: vi.fn(),
    downloadUpdate: vi.fn(),
    quitAndInstall: vi.fn(),
  },
}));

vi.mock("electron", () => ({
  app: mocks.app,
  BrowserWindow: class {},
  shell: { openExternal: mocks.openExternal },
}));

vi.mock("electron-updater", () => ({
  autoUpdater: mocks.autoUpdater,
}));

const manifest = {
  schemaVersion: 1,
  channel: "stable",
  version: "4.1.0",
  publishedAt: "2026-08-07T00:00:00Z",
  releaseUrl: "https://github.com/Qziky/Immersive-clock/releases/tag/v4.1.0",
  platforms: {
    windows: {
      version: "4.1.0",
      installerUrl: "https://example.com/setup.exe",
      portableUrl: "https://example.com/portable.exe",
    },
  },
};

async function createManager() {
  const { ElectronUpdateManager } = await import("../../../electron/updateManager");
  return new ElectronUpdateManager();
}

describe("ElectronUpdateManager", () => {
  const originalPlatform = process.platform;
  const originalPortableExecutableFile = process.env.PORTABLE_EXECUTABLE_FILE;

  beforeEach(() => {
    vi.resetModules();
    Object.defineProperty(process, "platform", { configurable: true, value: "win32" });
    mocks.handlers.clear();
    mocks.openExternal.mockReset().mockResolvedValue(undefined);
    mocks.autoUpdater.on.mockClear();
    mocks.autoUpdater.checkForUpdates.mockReset();
    mocks.autoUpdater.downloadUpdate.mockReset();
    mocks.autoUpdater.quitAndInstall.mockReset();
    mocks.app.isPackaged = true;
    delete process.env.PORTABLE_EXECUTABLE_FILE;
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(manifest) })
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    Object.defineProperty(process, "platform", { configurable: true, value: originalPlatform });
    if (originalPortableExecutableFile === undefined) delete process.env.PORTABLE_EXECUTABLE_FILE;
    else process.env.PORTABLE_EXECUTABLE_FILE = originalPortableExecutableFile;
  });

  it("Windows 便携版只提供对应下载地址", async () => {
    process.env.PORTABLE_EXECUTABLE_FILE = "portable.exe";
    const manager = await createManager();

    await expect(manager.check()).resolves.toMatchObject({
      status: "available",
      latestVersion: "4.1.0",
      canInstall: false,
      action: "open",
    });
    expect(mocks.autoUpdater.checkForUpdates).not.toHaveBeenCalled();

    await manager.openRelease();
    expect(mocks.openExternal).toHaveBeenCalledWith("https://example.com/portable.exe");
  });

  it("元数据版本一致时静默下载并进入就绪状态", async () => {
    mocks.autoUpdater.checkForUpdates.mockResolvedValue({ updateInfo: { version: "4.1.0" } });
    mocks.autoUpdater.downloadUpdate.mockImplementation(async () => {
      mocks.handlers.get("download-progress")?.({ percent: 42 });
      mocks.handlers.get("update-downloaded")?.({ version: "4.1.0" });
      return [];
    });
    const manager = await createManager();

    await expect(manager.check()).resolves.toMatchObject({
      status: "ready",
      progress: 100,
      canInstall: true,
      action: "install",
    });
    expect(mocks.autoUpdater.downloadUpdate).toHaveBeenCalledTimes(1);

    await manager.install();
    expect(mocks.autoUpdater.quitAndInstall).toHaveBeenCalledWith(false, true);
  });

  it("统一清单和更新元数据不一致时拒绝下载", async () => {
    mocks.autoUpdater.checkForUpdates.mockResolvedValue({ updateInfo: { version: "4.2.0" } });
    const manager = await createManager();

    await expect(manager.check()).resolves.toMatchObject({
      status: "error",
      latestVersion: "4.1.0",
      action: "open",
    });
    expect(mocks.autoUpdater.downloadUpdate).not.toHaveBeenCalled();
  });
});
