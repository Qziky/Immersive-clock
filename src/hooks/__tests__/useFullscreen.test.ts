import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useFullscreen } from "../useFullscreen";

const mocks = vi.hoisted(() => ({
  hide: vi.fn(),
  loggerWarn: vi.fn(),
  platform: "web",
  setStyle: vi.fn(),
  show: vi.fn(),
}));

vi.mock("@capacitor/core", () => ({
  Capacitor: {
    getPlatform: () => mocks.platform,
  },
  SystemBars: {
    hide: mocks.hide,
    setStyle: mocks.setStyle,
    show: mocks.show,
  },
  SystemBarsStyle: {
    Dark: "DARK",
  },
}));

vi.mock("../../utils/logger", () => ({
  logger: {
    warn: mocks.loggerWarn,
  },
}));

describe("useFullscreen", () => {
  let exitFullscreen: ReturnType<typeof vi.fn>;
  let fullscreenElement: Element | null;
  let requestFullscreen: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mocks.platform = "web";
    mocks.hide.mockReset().mockResolvedValue(undefined);
    mocks.loggerWarn.mockReset();
    mocks.setStyle.mockReset().mockResolvedValue(undefined);
    mocks.show.mockReset().mockResolvedValue(undefined);
    fullscreenElement = null;

    Object.defineProperty(document, "fullscreenElement", {
      configurable: true,
      get: () => fullscreenElement,
    });

    requestFullscreen = vi.fn(async () => {
      fullscreenElement = document.documentElement;
      document.dispatchEvent(new Event("fullscreenchange"));
    });
    exitFullscreen = vi.fn(async () => {
      fullscreenElement = null;
      document.dispatchEvent(new Event("fullscreenchange"));
    });

    Object.defineProperty(document.documentElement, "requestFullscreen", {
      configurable: true,
      value: requestFullscreen,
    });
    Object.defineProperty(document, "exitFullscreen", {
      configurable: true,
      value: exitFullscreen,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("在 Android 中通过系统栏 API 进入和退出全屏", async () => {
    mocks.platform = "android";
    const { result } = renderHook(() => useFullscreen());

    act(() => result.current[1]());

    await waitFor(() => expect(result.current[0]).toBe(true));
    expect(mocks.hide).toHaveBeenCalledTimes(1);
    expect(requestFullscreen).not.toHaveBeenCalled();

    act(() => result.current[1]());

    await waitFor(() => expect(result.current[0]).toBe(false));
    expect(mocks.setStyle).toHaveBeenCalledWith({ style: "DARK" });
    expect(mocks.show).toHaveBeenCalledTimes(1);
    expect(mocks.setStyle.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.show.mock.invocationCallOrder[0]
    );
  });

  it("Android 系统栏隐藏失败时保持非全屏状态", async () => {
    mocks.platform = "android";
    mocks.hide.mockRejectedValueOnce(new Error("hide failed"));
    const { result } = renderHook(() => useFullscreen());

    act(() => result.current[1]());

    await waitFor(() => expect(mocks.loggerWarn).toHaveBeenCalled());
    expect(result.current[0]).toBe(false);
    expect(mocks.show).not.toHaveBeenCalled();
  });

  it("Android 系统栏恢复失败时保持全屏状态", async () => {
    mocks.platform = "android";
    const { result } = renderHook(() => useFullscreen());

    act(() => result.current[1]());
    await waitFor(() => expect(result.current[0]).toBe(true));

    mocks.show.mockRejectedValueOnce(new Error("show failed"));
    act(() => result.current[1]());

    await waitFor(() => expect(mocks.loggerWarn).toHaveBeenCalled());
    expect(result.current[0]).toBe(true);
  });

  it("在 Web 中继续使用浏览器 Fullscreen API", async () => {
    const { result } = renderHook(() => useFullscreen());

    act(() => result.current[1]());

    await waitFor(() => expect(result.current[0]).toBe(true));
    expect(requestFullscreen).toHaveBeenCalledTimes(1);
    expect(mocks.hide).not.toHaveBeenCalled();

    act(() => result.current[1]());

    await waitFor(() => expect(result.current[0]).toBe(false));
    expect(exitFullscreen).toHaveBeenCalledTimes(1);
    expect(mocks.show).not.toHaveBeenCalled();
  });
});
