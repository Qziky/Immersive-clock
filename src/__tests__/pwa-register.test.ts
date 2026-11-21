import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createPwaUpdateControl: vi.fn(),
  configurePwaUpdateControl: vi.fn(),
}));

vi.mock("../services/update/pwaUpdateController", () => ({
  createPwaUpdateControl: mocks.createPwaUpdateControl,
}));

vi.mock("../services/update/updateRuntime", () => ({
  configurePwaUpdateControl: mocks.configurePwaUpdateControl,
}));

describe("initPWA", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.configurePwaUpdateControl.mockClear();
    mocks.createPwaUpdateControl.mockReset().mockReturnValue({});
  });

  afterEach(() => Reflect.deleteProperty(navigator, "serviceWorker"));

  it("原生 Service Worker 控制只初始化一次", async () => {
    const serviceWorker = {};
    Object.defineProperty(navigator, "serviceWorker", { configurable: true, value: serviceWorker });
    const { initPWA } = await import("../pwa-register");
    initPWA();
    initPWA();
    expect(mocks.createPwaUpdateControl).toHaveBeenCalledExactlyOnceWith(
      serviceWorker,
      import.meta.env.DEV ? "/dev-sw.js?dev-sw" : "/sw.js"
    );
    expect(mocks.configurePwaUpdateControl).toHaveBeenCalledTimes(1);
  });

  it("没有 SW API 时明确报告，允许用户选择网页刷新", async () => {
    const { initPWA } = await import("../pwa-register");
    initPWA();
    expect(mocks.createPwaUpdateControl).not.toHaveBeenCalled();
    expect(mocks.configurePwaUpdateControl).toHaveBeenCalledExactlyOnceWith(null);
  });
});
