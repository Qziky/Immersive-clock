import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { logger } from "../../utils/logger";
import { useAudio } from "../useAudio";

class MockAudio extends EventTarget {
  static latest: MockAudio | null = null;
  static readyOnLoad = true;

  currentTime = 0;
  preload = "";
  volume = 1;
  readonly play = vi.fn(() => Promise.resolve());
  readonly pause = vi.fn();
  src: string;

  constructor(src: string) {
    super();
    this.src = src;
    MockAudio.latest = this;
  }

  load() {
    if (MockAudio.readyOnLoad) this.dispatchEvent(new Event("canplaythrough"));
  }
}

describe("useAudio 播放完成回调", () => {
  beforeEach(() => {
    MockAudio.latest = null;
    MockAudio.readyOnLoad = true;
    vi.stubGlobal("Audio", MockAudio);
    vi.spyOn(logger, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("等提示音播放结束后只调用一次回调", () => {
    const { result } = renderHook(() => useAudio("/ding.mp3"));
    const audio = MockAudio.latest;
    expect(audio).not.toBeNull();
    expect(result.current[1]).toBe(true);

    const onPlaybackComplete = vi.fn();
    act(() => result.current[0](onPlaybackComplete));

    expect(audio!.play).toHaveBeenCalledTimes(1);
    expect(onPlaybackComplete).not.toHaveBeenCalled();
    act(() => audio!.dispatchEvent(new Event("ended")));
    act(() => audio!.dispatchEvent(new Event("ended")));
    expect(onPlaybackComplete).toHaveBeenCalledTimes(1);
  });

  it("提示音还未就绪时立即调用回调", () => {
    MockAudio.readyOnLoad = false;
    const { result } = renderHook(() => useAudio("/ding.mp3"));
    const audio = MockAudio.latest;
    expect(audio).not.toBeNull();
    expect(result.current[1]).toBe(false);

    const onPlaybackComplete = vi.fn();
    act(() => result.current[0](onPlaybackComplete));

    expect(onPlaybackComplete).toHaveBeenCalledTimes(1);
    expect(audio!.play).not.toHaveBeenCalled();
  });

  it("提示音播放失败时立即调用回调", async () => {
    const { result } = renderHook(() => useAudio("/ding.mp3"));
    const audio = MockAudio.latest;
    expect(audio).not.toBeNull();
    audio!.play.mockRejectedValueOnce(new Error("播放被阻止"));

    const onPlaybackComplete = vi.fn();
    act(() => result.current[0](onPlaybackComplete));

    await waitFor(() => expect(onPlaybackComplete).toHaveBeenCalledTimes(1));
  });

  it("组件卸载后不再调用待处理的回调", () => {
    const { result, unmount } = renderHook(() => useAudio("/ding.mp3"));
    const audio = MockAudio.latest;
    expect(audio).not.toBeNull();

    const onPlaybackComplete = vi.fn();
    act(() => result.current[0](onPlaybackComplete));
    unmount();
    act(() => audio!.dispatchEvent(new Event("ended")));

    expect(onPlaybackComplete).not.toHaveBeenCalled();
  });
});
