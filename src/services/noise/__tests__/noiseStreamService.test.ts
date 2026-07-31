import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { NoiseSyncMessage, NoiseSyncPayload } from "../noiseSyncChannel";

function installServiceMocks(
  monitoringEnabled = true,
  initialPreferredInputDevice: { deviceId: string; label: string } | null = null
) {
  const runtimeStart = vi.fn().mockResolvedValue(undefined);
  const runtimeStop = vi.fn().mockResolvedValue(undefined);
  const runtimeOptions = vi.fn();
  const coordinatorStart = vi.fn();
  const coordinatorStop = vi.fn();
  const releaseLeadership = vi.fn();
  let preferredInputDevice = initialPreferredInputDevice;
  let settingsListener: (() => void) | null = null;

  vi.doMock("../noiseCaptureRuntime", () => ({
    NoiseCaptureRuntime: class {
      constructor(options: { historyEnabled: boolean }) {
        runtimeOptions(options);
      }

      start = runtimeStart;
      stop = runtimeStop;
      calibrate = vi.fn().mockResolvedValue(undefined);
      clearCalibration = vi.fn();
    },
  }));

  vi.doMock("../noiseCoordinator", () => ({
    NoiseCoordinator: class {
      private active = false;
      private abort: AbortController | null = null;

      constructor(
        private readonly options: {
          onRoleChange: (role: "leader" | "follower" | "none", epoch: string | null) => void;
          runAsLeader: (context: {
            epoch: string;
            signal: AbortSignal;
            ownsLeadership: () => boolean;
          }) => Promise<void>;
        }
      ) {}

      start = () => {
        coordinatorStart();
        this.active = true;
        this.lead();
      };

      stop = async () => {
        coordinatorStop();
        this.active = false;
        this.abort?.abort();
        this.options.onRoleChange("none", null);
      };

      releaseLeadership = () => {
        releaseLeadership();
        this.abort?.abort();
        if (this.active) this.lead();
      };

      private lead() {
        if (!this.active) return;
        const abort = new AbortController();
        this.abort = abort;
        const epoch = `epoch-${coordinatorStart.mock.calls.length}-${runtimeStart.mock.calls.length}`;
        this.options.onRoleChange("leader", epoch);
        void this.options.runAsLeader({
          epoch,
          signal: abort.signal,
          ownsLeadership: () => this.active && !abort.signal.aborted,
        });
      }
    },
  }));
  vi.doMock("../noiseSyncChannel", () => ({
    broadcastNoiseSyncMessage: vi.fn(),
    createNoiseSyncMessage: <T>(payload: T) => payload,
    getNoiseSyncSenderId: () => "tab-test",
    subscribeNoiseSync: vi.fn(() => () => undefined),
  }));
  vi.doMock("../../../utils/noiseControlSettings", () => ({
    getNoiseControlSettings: () => ({
      monitoringEnabled,
      historyEnabled: true,
      preferredInputDevice,
      primaryMetric: "quietness-score",
      showRealtimeValue: true,
      scoreAlertThreshold: 70,
      alertSoundEnabled: false,
    }),
  }));
  vi.doMock("../../../utils/noiseSliceService", () => ({ writeNoiseSlice: vi.fn() }));
  vi.doMock("../noiseRescoreService", () => ({ scheduleNoiseRescore: vi.fn() }));
  vi.doMock("../../../utils/settingsEvents", () => ({
    SETTINGS_EVENTS: { NoiseControlSettingsUpdated: "noiseControlSettingsUpdated" },
    subscribeSettingsEvent: vi.fn((_event: string, listener: () => void) => {
      settingsListener = listener;
      return () => undefined;
    }),
  }));
  return {
    coordinatorStart,
    coordinatorStop,
    releaseLeadership,
    runtimeOptions,
    runtimeStart,
    runtimeStop,
    setPreferredInputDevice: (preference: { deviceId: string; label: string } | null) => {
      preferredInputDevice = preference;
    },
    notifySettingsUpdated: () => settingsListener?.(),
  };
}

function installFollowerMocks() {
  let syncListener: ((message: NoiseSyncMessage) => void) | null = null;
  const runtimeConstructor = vi.fn();
  vi.doMock("../noiseCaptureRuntime", () => ({ NoiseCaptureRuntime: runtimeConstructor }));
  vi.doMock("../noiseCoordinator", () => ({
    NoiseCoordinator: class {
      constructor(
        private readonly options: {
          onRoleChange: (role: "leader" | "follower" | "none", epoch: string | null) => void;
        }
      ) {}
      start = () => this.options.onRoleChange("follower", null);
      stop = async () => this.options.onRoleChange("none", null);
      releaseLeadership = vi.fn();
    },
  }));
  vi.doMock("../noiseSyncChannel", () => ({
    broadcastNoiseSyncMessage: vi.fn(),
    createNoiseSyncMessage: <T>(payload: T) => payload,
    getNoiseSyncSenderId: () => "tab-follower",
    subscribeNoiseSync: vi.fn((listener: (message: NoiseSyncMessage) => void) => {
      syncListener = listener;
      return () => undefined;
    }),
  }));
  vi.doMock("../../../utils/noiseControlSettings", () => ({
    getNoiseControlSettings: () => ({
      monitoringEnabled: true,
      historyEnabled: true,
      preferredInputDevice: null,
      primaryMetric: "quietness-score",
      showRealtimeValue: true,
      scoreAlertThreshold: 70,
      alertSoundEnabled: false,
    }),
  }));
  vi.doMock("../../../utils/noiseSliceService", () => ({ writeNoiseSlice: vi.fn() }));
  vi.doMock("../noiseRescoreService", () => ({ scheduleNoiseRescore: vi.fn() }));
  vi.doMock("../../../utils/settingsEvents", () => ({
    SETTINGS_EVENTS: { NoiseControlSettingsUpdated: "noiseControlSettingsUpdated" },
    subscribeSettingsEvent: vi.fn(() => () => undefined),
  }));
  return {
    runtimeConstructor,
    deliver: (message: NoiseSyncMessage) => {
      if (!syncListener) throw new Error("sync listener not installed");
      syncListener(message);
    },
  };
}

function remoteMessage<T extends NoiseSyncPayload>(payload: T): NoiseSyncMessage {
  return {
    ...payload,
    id: `remote:${Math.random()}`,
    senderId: "remote-tab",
    sentAt: Date.now(),
    protocolVersion: 2,
  } as NoiseSyncMessage;
}

async function settleAsyncWork(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

describe("noiseStreamService v2 lifecycle", () => {
  beforeEach(() => {
    vi.spyOn(window, "setTimeout").mockImplementation((handler) => {
      void Promise.resolve().then(() => {
        if (typeof handler === "function") handler();
      });
      return 1 as unknown as ReturnType<typeof window.setTimeout>;
    });
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("多个订阅者共享一个协调器，最后一个取消后才停止", async () => {
    const mocks = installServiceMocks();
    const { subscribeNoiseStream } = await import("../noiseStreamService");

    const unsubscribeFirst = subscribeNoiseStream(() => undefined);
    const unsubscribeSecond = subscribeNoiseStream(() => undefined);
    await Promise.resolve();

    expect(mocks.coordinatorStart).toHaveBeenCalledTimes(1);
    expect(mocks.runtimeStart).toHaveBeenCalledTimes(1);

    unsubscribeFirst();
    expect(mocks.coordinatorStop).not.toHaveBeenCalled();

    unsubscribeSecond();
    await settleAsyncWork();
    expect(mocks.coordinatorStop).toHaveBeenCalledTimes(1);
    expect(mocks.runtimeStop).toHaveBeenCalledTimes(1);
  });

  it("Leader 重试会释放当前采集并重新竞选", async () => {
    const mocks = installServiceMocks();
    const { restartNoiseStream, subscribeNoiseStream } = await import("../noiseStreamService");
    const unsubscribe = subscribeNoiseStream(() => undefined);
    await Promise.resolve();

    await restartNoiseStream();
    await Promise.resolve();
    await Promise.resolve();
    await vi.waitFor(() => expect(mocks.runtimeStart).toHaveBeenCalledTimes(2));

    expect(mocks.releaseLeadership).toHaveBeenCalledTimes(1);
    expect(mocks.runtimeStop).toHaveBeenCalledTimes(1);

    unsubscribe();
    await settleAsyncWork();
  });

  it("设备偏好保存后重建 Leader runtime 并传入新的设备 ID", async () => {
    const mocks = installServiceMocks(true, {
      deviceId: "built-in",
      label: "内置麦克风",
    });
    const { subscribeNoiseStream } = await import("../noiseStreamService");
    const unsubscribe = subscribeNoiseStream(() => undefined);
    await Promise.resolve();

    expect(mocks.runtimeOptions).toHaveBeenLastCalledWith(
      expect.objectContaining({ preferredInputDeviceId: "built-in" })
    );

    mocks.setPreferredInputDevice({ deviceId: "usb-mic", label: "USB 麦克风" });
    mocks.notifySettingsUpdated();
    await Promise.resolve();
    await Promise.resolve();
    await vi.waitFor(() => expect(mocks.runtimeStart).toHaveBeenCalledTimes(2));

    expect(mocks.runtimeOptions).toHaveBeenLastCalledWith(
      expect.objectContaining({ preferredInputDeviceId: "usb-mic" })
    );

    unsubscribe();
    await settleAsyncWork();
  });

  it("应用监测关闭时允许无历史写入的临时调试采集，并在释放后停止", async () => {
    const mocks = installServiceMocks(false);
    const { acquireNoiseDebugSession, subscribeNoiseStream } =
      await import("../noiseStreamService");
    const unsubscribe = subscribeNoiseStream(() => undefined);

    expect(mocks.coordinatorStart).not.toHaveBeenCalled();

    const release = acquireNoiseDebugSession();
    await Promise.resolve();

    expect(mocks.coordinatorStart).toHaveBeenCalledTimes(1);
    expect(mocks.runtimeStart).toHaveBeenCalledTimes(1);
    expect(mocks.runtimeOptions).toHaveBeenCalledWith(
      expect.objectContaining({ historyEnabled: false })
    );

    unsubscribe();
    await settleAsyncWork();
    expect(mocks.coordinatorStop).not.toHaveBeenCalled();

    release();
    await vi.waitFor(() => expect(mocks.runtimeStop).toHaveBeenCalledTimes(1));
    expect(mocks.coordinatorStop).toHaveBeenCalledTimes(1);
  });

  it("Follower 实时缓冲保留完整 60 秒的 10 Hz 数据", async () => {
    const now = vi.spyOn(Date, "now").mockReturnValue(100_000);
    const mocks = installFollowerMocks();
    const { getNoiseStreamSnapshot, subscribeNoiseStream } = await import("../noiseStreamService");
    const unsubscribe = subscribeNoiseStream(() => undefined);

    for (let index = 0; index <= 600; index += 1) {
      const timestamp = 100_000 + index * 100;
      now.mockReturnValue(timestamp);
      mocks.deliver(
        remoteMessage({
          type: "snapshot",
          leaderEpoch: "epoch-window",
          sequence: index + 1,
          payload: {
            status: "quiet",
            signalHealth: "healthy",
            confidence: "high",
            point: {
              t: timestamp,
              dbfsA: -45,
              activity: 0.2,
              quietnessScore: 80,
              estimatedDbA: null,
              signalHealth: "healthy",
              confidence: "high",
            },
            latestSlice: null,
            captureSessionId: "capture-window",
            calibrationAvailable: false,
            calibration: { status: "idle", progress: 0, error: null },
            diagnostics: {
              track: null,
              latestFeature: null,
              persistence: {
                enabled: false,
                available: false,
                pendingFrames: 0,
                retainedBytes: null,
                error: null,
              },
              scoring: {
                requiredSeconds: 60,
                collectedSeconds: 60,
                progress: 100,
                validSecondCount: 60,
                coverageRatio: 1,
              },
            },
          },
        })
      );
    }

    const ringBuffer = getNoiseStreamSnapshot().ringBuffer;
    expect(ringBuffer).toHaveLength(601);
    expect(ringBuffer[0]?.t).toBe(100_000);
    expect(ringBuffer[ringBuffer.length - 1]?.t).toBe(160_000);

    unsubscribe();
    await settleAsyncWork();
  });

  it("Follower 忽略旧 epoch、活跃 Leader 冲突和乱序快照", async () => {
    const now = vi.spyOn(Date, "now").mockReturnValue(10_000);
    const mocks = installFollowerMocks();
    const { getNoiseStreamSnapshot, subscribeNoiseStream } = await import("../noiseStreamService");
    const unsubscribe = subscribeNoiseStream(() => undefined);
    const payload = (score: number) => ({
      status: "quiet" as const,
      signalHealth: "healthy" as const,
      confidence: "high" as const,
      point: {
        t: Date.now(),
        dbfsA: -45,
        activity: 0.2,
        quietnessScore: score,
        estimatedDbA: null,
        signalHealth: "healthy" as const,
        confidence: "high" as const,
      },
      latestSlice: null,
      captureSessionId: `capture-${score}`,
      calibrationAvailable: false,
      calibration: { status: "idle" as const, progress: 0, error: null },
      diagnostics: {
        track: null,
        latestFeature: null,
        persistence: {
          enabled: false,
          available: false,
          pendingFrames: 0,
          retainedBytes: null,
          error: null,
        },
        scoring: {
          requiredSeconds: 60,
          collectedSeconds: 60,
          progress: 100,
          validSecondCount: 60,
          coverageRatio: 1,
        },
      },
    });

    mocks.deliver(remoteMessage({ type: "heartbeat", leaderEpoch: "epoch-a", sequence: 1 }));
    mocks.deliver(
      remoteMessage({ type: "snapshot", leaderEpoch: "epoch-a", sequence: 3, payload: payload(80) })
    );
    mocks.deliver(
      remoteMessage({ type: "snapshot", leaderEpoch: "epoch-a", sequence: 2, payload: payload(20) })
    );
    mocks.deliver(
      remoteMessage({ type: "snapshot", leaderEpoch: "epoch-b", sequence: 4, payload: payload(10) })
    );

    expect(getNoiseStreamSnapshot()).toMatchObject({
      role: "follower",
      leaderEpoch: "epoch-a",
      quietnessScore: 80,
      captureSessionId: "capture-80",
    });
    expect(mocks.runtimeConstructor).not.toHaveBeenCalled();

    now.mockReturnValue(13_001);
    mocks.deliver(
      remoteMessage({ type: "snapshot", leaderEpoch: "epoch-b", sequence: 1, payload: payload(65) })
    );
    expect(getNoiseStreamSnapshot()).toMatchObject({
      leaderEpoch: "epoch-b",
      quietnessScore: 65,
      captureSessionId: "capture-65",
    });

    unsubscribe();
    await settleAsyncWork();
  });
});
