import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  configurePwaUpdateControl: vi.fn(),
  markPwaUpdateAvailable: vi.fn(),
  registerSW: vi.fn(),
  updateSW: vi.fn().mockResolvedValue(undefined),
  warn: vi.fn(),
}));

vi.mock("virtual:pwa-register", () => ({
  registerSW: mocks.registerSW,
}));

vi.mock("../services/update/updateRuntime", () => ({
  configurePwaUpdateControl: mocks.configurePwaUpdateControl,
  markPwaUpdateAvailable: mocks.markPwaUpdateAvailable,
}));

vi.mock("../utils/logger", () => ({
  logger: { warn: mocks.warn },
}));

describe("initPWA", () => {
  let callbacks: {
    onNeedRefresh?: () => void;
    onRegisterError?: (error: unknown) => void;
  };
  const registrationUpdate = vi.fn().mockResolvedValue(undefined);
  const getRegistration = vi.fn();

  beforeEach(() => {
    callbacks = {};
    mocks.configurePwaUpdateControl.mockReset();
    mocks.markPwaUpdateAvailable.mockReset();
    mocks.registerSW.mockReset().mockImplementation((options) => {
      callbacks = options;
      return mocks.updateSW;
    });
    mocks.updateSW.mockReset().mockResolvedValue(undefined);
    mocks.warn.mockReset();
    registrationUpdate.mockReset().mockResolvedValue(undefined);
    getRegistration.mockReset().mockResolvedValue({
      update: registrationUpdate,
      waiting: {},
    });
    Object.defineProperty(navigator, "serviceWorker", {
      configurable: true,
      value: { getRegistration },
    });
  });

  afterEach(() => {
    Reflect.deleteProperty(navigator, "serviceWorker");
  });

  it("把新 Worker 事件交给自动更新运行时，并提供直接激活能力", async () => {
    const { initPWA } = await import("../pwa-register");
    initPWA();

    callbacks.onNeedRefresh?.();
    expect(mocks.markPwaUpdateAvailable).toHaveBeenCalledTimes(1);

    const control = mocks.configurePwaUpdateControl.mock.calls[0]?.[0];
    await expect(control.check()).resolves.toBe(true);
    expect(registrationUpdate).toHaveBeenCalledTimes(1);

    await control.update();
    expect(mocks.updateSW).toHaveBeenCalledWith(true);
  });

  it("注册失败时移除更新控制并记录警告", async () => {
    const { initPWA } = await import("../pwa-register");
    initPWA();
    const error = new Error("注册失败");

    callbacks.onRegisterError?.(error);

    expect(mocks.configurePwaUpdateControl).toHaveBeenLastCalledWith(null);
    expect(mocks.warn).toHaveBeenCalledWith("PWA Service Worker 注册失败", error);
  });
});
