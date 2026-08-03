import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  platform: "web",
}));

vi.mock("@capacitor/core", () => ({
  Capacitor: {
    getPlatform: () => mocks.platform,
  },
}));

describe("runtimePlatform", () => {
  beforeEach(() => {
    mocks.platform = "web";
  });

  it("优先识别 Capacitor Android 环境", async () => {
    mocks.platform = "android";
    const { getRuntimePlatform } = await import("../runtimePlatform");

    expect(getRuntimePlatform("Mozilla/5.0 Electron/41.0.0")).toBe("android");
  });

  it("区分 Electron 与普通 Web 环境", async () => {
    const { getRuntimePlatform } = await import("../runtimePlatform");

    expect(getRuntimePlatform("Mozilla/5.0 Electron/41.0.0")).toBe("electron");
    expect(getRuntimePlatform("Mozilla/5.0 Chrome/140.0.0.0")).toBe("web");
  });

  it("Android 和 Electron 均不注册 Service Worker", async () => {
    const { shouldRegisterServiceWorker } = await import("../runtimePlatform");

    expect(shouldRegisterServiceWorker(true, "android")).toBe(false);
    expect(shouldRegisterServiceWorker(true, "electron")).toBe(false);
    expect(shouldRegisterServiceWorker(true, "web")).toBe(true);
    expect(shouldRegisterServiceWorker(false, "web")).toBe(false);
  });
});
