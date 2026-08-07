import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  autoCheckEnabled: true,
  platform: "web" as "web" | "android",
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

describe("updateRuntime", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
    mocks.autoCheckEnabled = true;
    mocks.platform = "web";
    mocks.fetchUpdateManifest.mockReset().mockResolvedValue(manifest);
  });

  afterEach(() => {
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

  it("Web 清单领先但 Service Worker 未等待时进入资源准备状态", async () => {
    const runtime = await loadRuntime();
    const check = vi.fn().mockResolvedValue(false);
    runtime.configurePwaUpdateControl({ check, update: vi.fn() });
    await Promise.resolve();

    const result = await runtime.checkForUpdates({ manual: true });
    expect(result).toMatchObject({ status: "available", action: "retry" });
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
