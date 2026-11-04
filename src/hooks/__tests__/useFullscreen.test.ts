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

  afterEach(async () => {
    // 全屏状态在应用级保存；模拟退出，避免测试之间保留系统栏状态。
    mocks.platform = "android";
    mocks.setStyle.mockResolvedValue(undefined);
    mocks.show.mockResolvedValue(undefined);
    const { result, unmount } = renderHook(() => useFullscreen());
    if (result.current[0]) {
      act(() => result.current[1]());
      await waitFor(() => expect(result.current[0]).toBe(false));
    }
    unmount();
    vi.restoreAllMocks();
  });

  it("Android 的独立入口共享状态，并可互相退出全屏", async () => {
    mocks.platform = "android";
    const button = renderHook(() => useFullscreen());
    const keyboard = renderHook(() => useFullscreen());

    act(() => button.result.current[1]());
    await waitFor(() => expect(keyboard.result.current[0]).toBe(true));
    expect(button.result.current[0]).toBe(true);

    act(() => keyboard.result.current[1]());
    await waitFor(() => expect(button.result.current[0]).toBe(false));
    expect(keyboard.result.current[0]).toBe(false);
    expect(mocks.hide).toHaveBeenCalledTimes(1);
    expect(mocks.show).toHaveBeenCalledTimes(1);

    act(() => keyboard.result.current[1]());
    await waitFor(() => expect(button.result.current[0]).toBe(true));
    act(() => button.result.current[1]());
    await waitFor(() => expect(keyboard.result.current[0]).toBe(false));
  });

  it("Android 全屏在所有入口卸载后仍保留，并同步给新入口", async () => {
    mocks.platform = "android";
    const firstPage = renderHook(() => useFullscreen());
    act(() => firstPage.result.current[1]());
    await waitFor(() => expect(firstPage.result.current[0]).toBe(true));
    firstPage.unmount();

    const nextPage = renderHook(() => useFullscreen());
    expect(nextPage.result.current[0]).toBe(true);
    act(() => nextPage.result.current[1]());
    await waitFor(() => expect(nextPage.result.current[0]).toBe(false));
    expect(mocks.hide).toHaveBeenCalledTimes(1);
    expect(mocks.show).toHaveBeenCalledTimes(1);
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
