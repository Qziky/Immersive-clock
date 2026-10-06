import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const runtime = vi.hoisted(() => ({ platform: "web" as "web" | "electron" | "android" }));

vi.mock("../../utils/runtimePlatform", () => ({
  getRuntimePlatform: () => runtime.platform,
}));

import {
  canCaptureComputerAudio,
  getDynamicAudioSnapshot,
  readDynamicAudioFrame,
  startDynamicAudioCapture,
  stopDynamicAudioCapture,
} from "../dynamicBackgroundAudio";

interface FakeTrack {
  stop: ReturnType<typeof vi.fn>;
  addEventListener: ReturnType<typeof vi.fn>;
  removeEventListener: ReturnType<typeof vi.fn>;
  emit: (name: string) => void;
}

function fakeTrack(): FakeTrack {
  const handlers = new Map<string, EventListener>();
  return {
    stop: vi.fn(),
    addEventListener: vi.fn((name: string, handler: EventListener) => handlers.set(name, handler)),
    removeEventListener: vi.fn((name: string) => handlers.delete(name)),
    emit: (name) => handlers.get(name)?.(new Event(name)),
  };
}

function fakeAudioContext() {
  const analyser = {
    fftSize: 0,
    smoothingTimeConstant: 0,
    connect: vi.fn(),
    getByteFrequencyData: vi.fn((data: Uint8Array) => data.fill(64)),
    getByteTimeDomainData: vi.fn((data: Uint8Array) => data.fill(192)),
  };
  const source = { connect: vi.fn() };
  const output = { gain: { value: 1 }, connect: vi.fn() };
  const context = {
    state: "running",
    destination: {},
    createMediaStreamSource: vi.fn(() => source),
    createAnalyser: vi.fn(() => analyser),
    createGain: vi.fn(() => output),
    resume: vi.fn(async () => {}),
    suspend: vi.fn(async () => {}),
    close: vi.fn(async () => {
      context.state = "closed";
    }),
  };
  return { context, analyser, source, output };
}

describe("dynamicBackgroundAudio", () => {
  let tracks: FakeTrack[];
  let browserMedia: MediaDevices;

  beforeEach(() => {
    runtime.platform = "web";
    tracks = [];
    Object.defineProperty(window, "isSecureContext", { configurable: true, value: true });
    const microphone = vi.fn(async () => makeStream([fakeTrack()]));
    const display = vi.fn(async () => makeStream([fakeTrack(), fakeTrack()]));
    browserMedia = {
      getUserMedia: microphone,
      getDisplayMedia: display,
    } as unknown as MediaDevices;
    Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: browserMedia });
    const { context } = fakeAudioContext();
    Object.defineProperty(window, "AudioContext", {
      configurable: true,
      value: class {
        constructor() {
          return context as unknown as AudioContext;
        }
      },
    });
  });

  afterEach(() => {
    stopDynamicAudioCapture();
    vi.restoreAllMocks();
  });

  function makeStream(streamTracks: FakeTrack[]) {
    tracks.push(...streamTracks);
    const audioTracks = streamTracks.slice(0, streamTracks.length === 2 ? 1 : streamTracks.length);
    const videoTracks = streamTracks.slice(audioTracks.length);
    return {
      getTracks: () => streamTracks,
      getAudioTracks: () => audioTracks,
      getVideoTracks: () => videoTracks,
    } as unknown as MediaStream;
  }

  it("在用户启动后共享麦克风分析帧，并在停止时释放音轨", async () => {
    await startDynamicAudioCapture("microphone");

    expect(getDynamicAudioSnapshot()).toMatchObject({ status: "listening", source: "microphone" });
    expect(browserMedia.getUserMedia).toHaveBeenCalledWith(
      expect.objectContaining({ audio: expect.any(Object), video: false })
    );
    const frequency = new Uint8Array(16);
    const waveform = new Uint8Array(16);
    expect(readDynamicAudioFrame(frequency, waveform)).toBe(true);
    expect(frequency).toEqual(new Uint8Array(16).fill(64));
    expect(waveform).toEqual(new Uint8Array(16).fill(192));

    stopDynamicAudioCapture();

    expect(tracks[0].stop).toHaveBeenCalledOnce();
    expect(getDynamicAudioSnapshot().status).toBe("idle");
  });

  it("电脑音频只共享音轨并立即关闭屏幕画面轨道", async () => {
    expect(canCaptureComputerAudio()).toBe(true);

    await startDynamicAudioCapture("computer");

    expect(browserMedia.getDisplayMedia).toHaveBeenCalledWith(
      expect.objectContaining({ audio: true, video: expect.any(Object) })
    );
    expect(tracks[1].stop).toHaveBeenCalledOnce();
    expect(tracks[0].stop).not.toHaveBeenCalled();
  });

  it("拒绝安卓电脑音源，并将授权取消恢复为待监听状态", async () => {
    runtime.platform = "android";
    expect(canCaptureComputerAudio()).toBe(false);
    await expect(startDynamicAudioCapture("computer")).rejects.toThrow("不支持电脑音频监听");

    runtime.platform = "web";
    vi.mocked(browserMedia.getUserMedia).mockRejectedValueOnce(
      new DOMException("Permission denied", "NotAllowedError")
    );
    await expect(startDynamicAudioCapture("microphone")).rejects.toThrow("Permission denied");
    expect(getDynamicAudioSnapshot()).toMatchObject({
      status: "idle",
      message: "授权已取消或被拒绝",
    });
  });

  it("未选择音轨时停止采集并显示清楚的监听状态", async () => {
    const screenTrack = fakeTrack();
    tracks.push(screenTrack);
    vi.mocked(browserMedia.getDisplayMedia).mockResolvedValueOnce({
      getTracks: () => [screenTrack],
      getAudioTracks: () => [],
      getVideoTracks: () => [screenTrack],
    } as unknown as MediaStream);

    await startDynamicAudioCapture("computer");

    expect(tracks[0].stop).toHaveBeenCalledOnce();
    expect(getDynamicAudioSnapshot()).toMatchObject({
      status: "idle",
      message: "未共享任何音轨，请重新选择带音频的标签页",
    });
  });

  it("停止共享和切换音源都会释放旧会话，旧音轨事件不影响新会话", async () => {
    await startDynamicAudioCapture("microphone");
    const previousTrack = tracks[0];
    await startDynamicAudioCapture("computer");
    expect(previousTrack.stop).toHaveBeenCalledOnce();
    previousTrack.emit("ended");
    expect(getDynamicAudioSnapshot().status).toBe("listening");
    tracks[1].emit("ended");
    expect(getDynamicAudioSnapshot()).toMatchObject({ status: "idle", message: "音频共享已结束" });
  });

  it("等待授权时停止，会释放迟到的采集音轨", async () => {
    let resolveStream: (stream: MediaStream) => void = () => undefined;
    vi.mocked(browserMedia.getUserMedia).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveStream = resolve;
        })
    );
    const starting = startDynamicAudioCapture("microphone");
    stopDynamicAudioCapture();
    const lateTrack = fakeTrack();
    resolveStream(makeStream([lateTrack]));
    await starting;
    expect(lateTrack.stop).toHaveBeenCalledOnce();
    expect(getDynamicAudioSnapshot().status).toBe("idle");
  });
});
