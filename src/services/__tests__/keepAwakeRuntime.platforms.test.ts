import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type RuntimeModule = typeof import("../keepAwakeRuntime");

describe("keepAwakeRuntime 平台适配", () => {
  const originalVisibilityState = Object.getOwnPropertyDescriptor(document, "visibilityState");
  let runtime: RuntimeModule | null = null;

  const setVisibility = (value: DocumentVisibilityState) => {
    Object.defineProperty(document, "visibilityState", { configurable: true, value });
  };

  const enablePreference = () => {
    localStorage.setItem(
      "AppSettings",
      JSON.stringify({ version: 12, general: { keepAwakeEnabled: true } })
    );
  };

  const loadRuntime = async (
    platform: "android" | "electron",
    androidPlugin = {
      allowSleep: vi.fn(async () => undefined),
      isSupported: vi.fn(async () => ({ isSupported: true })),
      keepAwake: vi.fn(async () => undefined),
    }
  ) => {
    vi.resetModules();
    vi.doMock("@capacitor/core", () => ({
      registerPlugin: () => androidPlugin,
    }));
    vi.doMock("../../utils/runtimePlatform", () => ({
      getRuntimePlatform: () => platform,
    }));
    runtime = await import("../keepAwakeRuntime");
    return runtime;
  };

  beforeEach(() => {
    localStorage.clear();
    setVisibility("visible");
    Reflect.deleteProperty(window, "electronAPI");
    runtime = null;
  });

  afterEach(() => {
    runtime?.__resetKeepAwakeRuntimeForTests();
    vi.doUnmock("@capacitor/core");
    vi.doUnmock("../../utils/runtimePlatform");
    Reflect.deleteProperty(window, "electronAPI");
    if (originalVisibilityState) {
      Object.defineProperty(document, "visibilityState", originalVisibilityState);
    }
  });

  it("Electron 前台启用，后台释放并在恢复前台后重试", async () => {
    const setEnabled = vi.fn(async (enabled: boolean) => ({ active: enabled }));
    Object.defineProperty(window, "electronAPI", {
      configurable: true,
      value: { keepAwake: { setEnabled } },
    });
    enablePreference();
    const currentRuntime = await loadRuntime("electron");

    currentRuntime.startKeepAwakeRuntime();
    await vi.waitFor(() =>
      expect(currentRuntime.getKeepAwakeRuntimeSnapshot().status).toBe("active")
    );
    expect(setEnabled).toHaveBeenLastCalledWith(true);

    setVisibility("hidden");
    document.dispatchEvent(new Event("visibilitychange"));
    await vi.waitFor(() =>
      expect(currentRuntime.getKeepAwakeRuntimeSnapshot().status).toBe("suspended")
    );
    expect(setEnabled).toHaveBeenLastCalledWith(false);

    setVisibility("visible");
    window.dispatchEvent(new Event("focus"));
    await vi.waitFor(() =>
      expect(currentRuntime.getKeepAwakeRuntimeSnapshot().status).toBe("active")
    );
    expect(setEnabled).toHaveBeenLastCalledWith(true);
  });

  it("Android 使用 Capacitor 插件在前后台切换常亮状态", async () => {
    const allowSleep = vi.fn(async () => undefined);
    const isSupported = vi.fn(async () => ({ isSupported: true }));
    const keepAwake = vi.fn(async () => undefined);
    enablePreference();
    const currentRuntime = await loadRuntime("android", { allowSleep, isSupported, keepAwake });

    currentRuntime.startKeepAwakeRuntime();
    await vi.waitFor(() =>
      expect(currentRuntime.getKeepAwakeRuntimeSnapshot().status).toBe("active")
    );
    expect(isSupported).toHaveBeenCalledTimes(1);
    expect(keepAwake).toHaveBeenCalledTimes(1);

    setVisibility("hidden");
    document.dispatchEvent(new Event("visibilitychange"));
    await vi.waitFor(() =>
      expect(currentRuntime.getKeepAwakeRuntimeSnapshot().status).toBe("suspended")
    );
    expect(allowSleep).toHaveBeenCalledTimes(1);

    setVisibility("visible");
    document.dispatchEvent(new Event("visibilitychange"));
    await vi.waitFor(() =>
      expect(currentRuntime.getKeepAwakeRuntimeSnapshot().status).toBe("active")
    );
    expect(keepAwake).toHaveBeenCalledTimes(2);
  });
});
