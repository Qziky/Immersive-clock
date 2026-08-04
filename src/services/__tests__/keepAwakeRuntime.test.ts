import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { updateGeneralSettings } from "../../utils/appSettings";
import { broadcastSettingsEvent, SETTINGS_EVENTS } from "../../utils/settingsEvents";
import {
  __resetKeepAwakeRuntimeForTests,
  getKeepAwakeRuntimeSnapshot,
  startKeepAwakeRuntime,
} from "../keepAwakeRuntime";

function createSentinel() {
  const target = new EventTarget();
  const sentinel = Object.assign(target, {
    onrelease: null,
    released: false,
    type: "screen" as WakeLockType,
    release: vi.fn(async () => {
      sentinel.released = true;
      target.dispatchEvent(new Event("release"));
    }),
  });
  return sentinel as WakeLockSentinel & { release: ReturnType<typeof vi.fn> };
}

describe("keepAwakeRuntime", () => {
  const originalVisibilityState = Object.getOwnPropertyDescriptor(document, "visibilityState");
  const originalWakeLock = Object.getOwnPropertyDescriptor(navigator, "wakeLock");

  const setVisibility = (value: DocumentVisibilityState) => {
    Object.defineProperty(document, "visibilityState", { configurable: true, value });
  };

  const setWakeLock = (value: WakeLock | undefined) => {
    Object.defineProperty(navigator, "wakeLock", { configurable: true, value });
  };

  beforeEach(() => {
    localStorage.clear();
    __resetKeepAwakeRuntimeForTests();
    setVisibility("visible");
  });

  afterEach(() => {
    __resetKeepAwakeRuntimeForTests();
    if (originalVisibilityState) {
      Object.defineProperty(document, "visibilityState", originalVisibilityState);
    }
    if (originalWakeLock) {
      Object.defineProperty(navigator, "wakeLock", originalWakeLock);
    } else {
      Reflect.deleteProperty(navigator, "wakeLock");
    }
  });

  it("前台启用，进入后台释放并在返回前台后重新获取", async () => {
    const firstSentinel = createSentinel();
    const secondSentinel = createSentinel();
    const request = vi
      .fn()
      .mockResolvedValueOnce(firstSentinel)
      .mockResolvedValueOnce(secondSentinel);
    setWakeLock({ request } as WakeLock);
    updateGeneralSettings({ keepAwakeEnabled: true });

    startKeepAwakeRuntime();
    await vi.waitFor(() => expect(getKeepAwakeRuntimeSnapshot().status).toBe("active"));
    expect(request).toHaveBeenCalledTimes(1);

    setVisibility("hidden");
    document.dispatchEvent(new Event("visibilitychange"));
    await vi.waitFor(() => expect(getKeepAwakeRuntimeSnapshot().status).toBe("suspended"));
    expect(firstSentinel.release).toHaveBeenCalledTimes(1);

    setVisibility("visible");
    document.dispatchEvent(new Event("visibilitychange"));
    await vi.waitFor(() => expect(getKeepAwakeRuntimeSnapshot().status).toBe("active"));
    expect(request).toHaveBeenCalledTimes(2);
  });

  it("不支持 Wake Lock 时保留开启偏好并报告不可用", async () => {
    setWakeLock(undefined);
    updateGeneralSettings({ keepAwakeEnabled: true });

    startKeepAwakeRuntime();

    await vi.waitFor(() => expect(getKeepAwakeRuntimeSnapshot().status).toBe("unsupported"));
    expect(getKeepAwakeRuntimeSnapshot().preferenceEnabled).toBe(true);
  });

  it("Wake Lock 被浏览器自动释放后在重新聚焦时重新获取", async () => {
    const firstSentinel = createSentinel();
    const secondSentinel = createSentinel();
    const request = vi
      .fn()
      .mockResolvedValueOnce(firstSentinel)
      .mockResolvedValueOnce(secondSentinel);
    setWakeLock({ request } as WakeLock);
    updateGeneralSettings({ keepAwakeEnabled: true });

    startKeepAwakeRuntime();
    await vi.waitFor(() => expect(getKeepAwakeRuntimeSnapshot().status).toBe("active"));

    firstSentinel.dispatchEvent(new Event("release"));
    await vi.waitFor(() => expect(getKeepAwakeRuntimeSnapshot().status).toBe("suspended"));

    window.dispatchEvent(new Event("focus"));
    await vi.waitFor(() => expect(getKeepAwakeRuntimeSnapshot().status).toBe("active"));
    expect(request).toHaveBeenCalledTimes(2);
  });

  it("临时请求失败时保留偏好并在再次进入前台后重试", async () => {
    const sentinel = createSentinel();
    const request = vi
      .fn()
      .mockRejectedValueOnce(new Error("temporarily blocked"))
      .mockResolvedValueOnce(sentinel);
    setWakeLock({ request } as WakeLock);
    updateGeneralSettings({ keepAwakeEnabled: true });

    startKeepAwakeRuntime();
    await vi.waitFor(() => expect(getKeepAwakeRuntimeSnapshot().status).toBe("error"));
    expect(getKeepAwakeRuntimeSnapshot().preferenceEnabled).toBe(true);

    window.dispatchEvent(new Event("focus"));
    await vi.waitFor(() => expect(getKeepAwakeRuntimeSnapshot().status).toBe("active"));
    expect(request).toHaveBeenCalledTimes(2);
  });

  it("启用请求未完成时关闭设置，最终状态保持关闭", async () => {
    const sentinel = createSentinel();
    let resolveRequest: ((value: WakeLockSentinel) => void) | undefined;
    const request = vi.fn(
      () =>
        new Promise<WakeLockSentinel>((resolve) => {
          resolveRequest = resolve;
        })
    );
    setWakeLock({ request } as WakeLock);
    updateGeneralSettings({ keepAwakeEnabled: true });
    startKeepAwakeRuntime();
    await vi.waitFor(() => expect(getKeepAwakeRuntimeSnapshot().status).toBe("requesting"));

    updateGeneralSettings({ keepAwakeEnabled: false });
    broadcastSettingsEvent(SETTINGS_EVENTS.SettingsSaved);
    resolveRequest?.(sentinel);

    await vi.waitFor(() => expect(getKeepAwakeRuntimeSnapshot().status).toBe("disabled"));
    expect(getKeepAwakeRuntimeSnapshot().preferenceEnabled).toBe(false);
    expect(sentinel.release).toHaveBeenCalledTimes(1);
  });
});
