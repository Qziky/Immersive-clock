import { beforeEach, describe, expect, it, vi } from "vitest";

import type { NoiseFeatureFrame, NoiseTrackMetadata } from "../../../types/noise";
import type {
  NoiseCaptureAdapter,
  NoiseCaptureOptions,
  NoiseCaptureSession,
} from "../noiseCapture";
import { NoiseCaptureRuntime } from "../noiseCaptureRuntime";
import type { NoiseScoringResumeWindow } from "../noiseFeatureRepository";

const repository = vi.hoisted(() => ({
  append: vi.fn().mockResolvedValue([]),
  cleanup: vi.fn().mockResolvedValue(0),
  create: vi.fn().mockResolvedValue(undefined),
  finish: vi.fn().mockResolvedValue(undefined),
  resume: vi.fn().mockResolvedValue(null),
  recover: vi.fn().mockResolvedValue(0),
}));

vi.mock("../noiseFeatureRepository", () => ({
  appendNoiseFeatureFrames: repository.append,
  createNoiseCaptureSession: repository.create,
  deleteNoiseCaptureDataBefore: repository.cleanup,
  finishNoiseCaptureSession: repository.finish,
  readNoiseScoringResumeWindow: repository.resume,
  recoverAbandonedNoiseCaptureSessions: repository.recover,
}));

const SAMPLE_RATE = 1_000;

class FakeCaptureAdapter implements NoiseCaptureAdapter {
  options: NoiseCaptureOptions | null = null;
  readonly stop = vi.fn().mockResolvedValue(undefined);

  constructor(private readonly metadata: NoiseTrackMetadata) {}

  async start(options: NoiseCaptureOptions): Promise<NoiseCaptureSession> {
    this.options = options;
    return { metadata: this.metadata } as NoiseCaptureSession;
  }

  emit(sequence: number, noisy = false, clippedRatio = 0, zeroRatio = 0): void {
    const frame: NoiseFeatureFrame = {
      frameSequence: sequence,
      startSample: (sequence - 1) * 100,
      rmsDbfs: -40,
      aWeightedDbfs: noisy ? -40 : -50,
      sampleP01Dbfs: -60,
      zeroRatio,
      clippedRatio,
    };
    this.options?.onFeature(frame);
  }
}

function metadata(processingDisabled = true): NoiseTrackMetadata {
  return {
    deviceKey: "runtime-device",
    persistentDeviceKey: true,
    sampleRate: SAMPLE_RATE,
    frameSamples: 100,
    channelCount: 1,
    channelMixMode: "arithmetic-mean",
    processingSignature: processingDisabled ? "processing-off" : "processing-unknown",
    processingRequestedOff: true,
    processingDisabled,
  };
}

function createRuntime(adapter: FakeCaptureAdapter, preferredInputDeviceId?: string) {
  const onSlice = vi.fn().mockResolvedValue(undefined);
  const onFatalTrackState = vi.fn();
  const onUpdate = vi.fn();
  const runtime = new NoiseCaptureRuntime({
    leaderEpoch: "epoch-runtime",
    producerId: "tab-runtime",
    preferredInputDeviceId,
    scoreAlertThreshold: 70,
    historyEnabled: true,
    onUpdate,
    onSlice,
    onFatalTrackState,
    captureAdapter: adapter,
  });
  return { onFatalTrackState, onSlice, onUpdate, runtime };
}

function resumeWindow(now: number, seconds: number, gapSeconds: number): NoiseScoringResumeWindow {
  const startedAt = now - (seconds + gapSeconds) * 1000;
  const frames = Array.from({ length: seconds * 10 }, (_, index) => ({
    captureSessionId: "capture-before-refresh",
    capturedAt: startedAt + index * 100,
    frameSequence: index + 1,
    startSample: index * 100,
    rmsDbfs: -40,
    aWeightedDbfs: -50,
    sampleP01Dbfs: -60,
    zeroRatio: 0,
    clippedRatio: 0,
  }));
  return {
    frames,
    startedAt,
    endedAt: startedAt + seconds * 1000,
  };
}

describe("NoiseCaptureRuntime", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it("创建独立采集会话并发布精简特征，不包含 PCM 或基线", async () => {
    const adapter = new FakeCaptureAdapter(metadata());
    const { onUpdate, runtime } = createRuntime(adapter);
    await runtime.start();
    adapter.emit(1, false, 0.002, 0.1);

    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        captureSessionId: runtime.captureSessionId,
        leaderEpoch: "epoch-runtime",
        producerId: "tab-runtime",
        sampleRate: SAMPLE_RATE,
        frameSamples: 100,
      })
    );
    const update = onUpdate.mock.calls[onUpdate.mock.calls.length - 1]?.[0];
    expect(update.diagnostics.latestFeature).toMatchObject({
      frameSequence: 1,
      rmsDbfs: -40,
      aWeightedDbfs: -50,
      sampleP01Dbfs: -60,
    });
    expect(JSON.stringify(update)).not.toContain("pcm");
    expect(JSON.stringify(update)).not.toContain("relativeBaseline");
    await runtime.stop();
  });

  it("每 5 秒检查点一次原始帧，停止时封存会话", async () => {
    const adapter = new FakeCaptureAdapter(metadata());
    const { runtime } = createRuntime(adapter);
    await runtime.start();
    for (let sequence = 1; sequence <= 50; sequence += 1) adapter.emit(sequence);
    await vi.waitFor(() => expect(repository.append).toHaveBeenCalled());
    expect(repository.append.mock.calls[0]?.[1]).toHaveLength(50);
    await runtime.stop();
    expect(repository.finish).toHaveBeenCalledWith(
      expect.objectContaining({ captureSessionId: runtime.captureSessionId }),
      expect.any(Number),
      "stopped"
    );
  });

  it("满 60 秒后生成首个环境安静评分", async () => {
    const adapter = new FakeCaptureAdapter(metadata());
    const { onSlice, onUpdate, runtime } = createRuntime(adapter);
    await runtime.start();
    for (let sequence = 1; sequence <= 300; sequence += 1) adapter.emit(sequence);
    expect(onUpdate.mock.calls[onUpdate.mock.calls.length - 1]?.[0]).toMatchObject({
      point: { quietnessScore: null },
      diagnostics: {
        scoring: {
          requiredSeconds: 60,
          collectedSeconds: 30,
          progress: 50,
          validSecondCount: 30,
          coverageRatio: 0.5,
        },
      },
    });
    for (let sequence = 301; sequence < 600; sequence += 1) adapter.emit(sequence);
    expect(onSlice).not.toHaveBeenCalled();
    adapter.emit(600);
    await vi.waitFor(() => expect(onSlice).toHaveBeenCalled());
    expect(onSlice.mock.calls[0]?.[0]).toMatchObject({
      modelVersion: "spectral-activity-v2",
      score: 100,
      sourceStartFrameSequence: 1,
      sourceEndFrameSequence: 600,
    });
    for (let sequence = 601; sequence < 650; sequence += 1) adapter.emit(sequence);
    expect(onSlice).toHaveBeenCalledTimes(1);
    adapter.emit(650);
    await vi.waitFor(() => expect(onSlice).toHaveBeenCalledTimes(2));
    expect(onSlice.mock.calls[1]?.[0]).toMatchObject({
      sourceStartFrameSequence: 51,
      sourceEndFrameSequence: 650,
    });
    await runtime.stop();
  });

  it("刷新后恢复最近评分窗口，同时保持新历史切片的会话来源完整", async () => {
    const now = Date.now();
    repository.resume.mockResolvedValueOnce(resumeWindow(now, 30, 5));
    const adapter = new FakeCaptureAdapter(metadata());
    const { onSlice, onUpdate, runtime } = createRuntime(adapter);
    await runtime.start();

    adapter.emit(1);
    expect(onUpdate.mock.calls[onUpdate.mock.calls.length - 1]?.[0]).toMatchObject({
      point: { quietnessScore: null },
      diagnostics: {
        scoring: {
          collectedSeconds: expect.closeTo(35.1, 1),
          progress: expect.closeTo(58.5, 1),
          validSecondCount: 30,
          coverageRatio: 0.5,
        },
      },
    });

    for (let sequence = 2; sequence <= 250; sequence += 1) adapter.emit(sequence);
    expect(onUpdate.mock.calls[onUpdate.mock.calls.length - 1]?.[0]).toMatchObject({
      status: "quiet",
      point: { quietnessScore: 100 },
    });
    expect(onSlice).not.toHaveBeenCalled();

    for (let sequence = 251; sequence <= 600; sequence += 1) adapter.emit(sequence);
    await vi.waitFor(() => expect(onSlice).toHaveBeenCalledTimes(1));
    expect(onSlice.mock.calls[0]?.[0]).toMatchObject({
      captureSessionId: runtime.captureSessionId,
      sourceStartFrameSequence: 1,
      sourceEndFrameSequence: 600,
      sourceStartSample: 0,
      sourceEndSample: 60_000,
      featureCount: 600,
    });
    await runtime.stop();
  });

  it("异常零信号导致覆盖不足时输出空评分", async () => {
    const adapter = new FakeCaptureAdapter(metadata());
    const { onSlice, runtime } = createRuntime(adapter);
    await runtime.start();
    for (let sequence = 1; sequence <= 600; sequence += 1) {
      adapter.emit(sequence, false, 0, sequence <= 130 ? 1 : 0);
    }
    await vi.waitFor(() => expect(onSlice).toHaveBeenCalled());
    expect(onSlice.mock.calls[0]?.[0]).toMatchObject({
      score: null,
      signalHealth: "insufficient-coverage",
      confidence: "none",
    });
    await runtime.stop();
  });

  it("dB(A) 校准只增加物理估算，不改变环境安静评分", async () => {
    const adapter = new FakeCaptureAdapter(metadata());
    const { onSlice, onUpdate, runtime } = createRuntime(adapter);
    await runtime.start();
    const calibration = runtime.calibrate(60);
    for (let sequence = 1; sequence <= 100; sequence += 1) adapter.emit(sequence);
    const profile = await calibration;
    expect(profile).toMatchObject({
      referenceDbA: 60,
      measuredDbfsA: -50,
      offsetDb: 110,
    });
    for (let sequence = 101; sequence <= 600; sequence += 1) adapter.emit(sequence);
    await vi.waitFor(() => expect(onSlice).toHaveBeenCalled());
    expect(onSlice.mock.calls[0]?.[0]).toMatchObject({
      score: 100,
      estimated: { calibrationId: profile.id },
    });
    expect(onUpdate.mock.calls[onUpdate.mock.calls.length - 1]?.[0]).toMatchObject({
      point: { quietnessScore: 100, estimatedDbA: 60 },
    });
    await runtime.stop();
  });

  it("系统处理开启时拒绝物理声级校准，但实时评分仍可工作", async () => {
    const adapter = new FakeCaptureAdapter(metadata(false));
    const { onSlice, runtime } = createRuntime(adapter);
    await runtime.start();
    await expect(runtime.calibrate(60)).rejects.toThrow("系统音频处理");
    for (let sequence = 1; sequence <= 600; sequence += 1) adapter.emit(sequence);
    await vi.waitFor(() => expect(onSlice).toHaveBeenCalled());
    expect(onSlice.mock.calls[0]?.[0]).toMatchObject({
      score: 100,
      signalHealth: "signal-anomaly",
      confidence: "low",
    });
    await runtime.stop();
  });

  it("原始帧仓库不可用时继续实时评分并报告持久化错误", async () => {
    repository.create.mockRejectedValueOnce(new Error("IndexedDB unavailable"));
    const adapter = new FakeCaptureAdapter(metadata());
    const { onSlice, onUpdate, runtime } = createRuntime(adapter);
    await expect(runtime.start()).resolves.toBeUndefined();
    for (let sequence = 1; sequence <= 600; sequence += 1) adapter.emit(sequence);

    const update = onUpdate.mock.calls[onUpdate.mock.calls.length - 1]?.[0];
    expect(update).toMatchObject({
      diagnostics: {
        persistence: {
          enabled: true,
          available: false,
          error: "IndexedDB unavailable",
        },
      },
    });
    expect(update.point.quietnessScore).toBe(100);
    expect(onSlice).not.toHaveBeenCalled();
    await runtime.stop();
    expect(adapter.stop).toHaveBeenCalled();
  });

  it("音频上下文挂起会结束当前会话并通知协调器", async () => {
    const adapter = new FakeCaptureAdapter(metadata());
    const { onFatalTrackState, runtime } = createRuntime(adapter, "usb-mic");
    await runtime.start();
    expect(adapter.options?.preferredInputDeviceId).toBe("usb-mic");
    adapter.options?.onCaptureStateChange?.("audio-context-suspended");
    expect(onFatalTrackState).toHaveBeenCalledWith("audio-context-suspended");
    await runtime.stop();
    expect(repository.finish).toHaveBeenCalledWith(
      expect.anything(),
      expect.any(Number),
      "audio-context-suspended"
    );
  });
});
