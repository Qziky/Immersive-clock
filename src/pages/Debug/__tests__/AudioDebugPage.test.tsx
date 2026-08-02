import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { NoiseMonitoringSnapshot } from "../../../types/noise";
import { FeedbackProvider } from "../../../ui";
import { AudioDebugPage } from "../AudioDebugPage";

const service = vi.hoisted(() => ({
  acquire: vi.fn(),
  calibrate: vi.fn(),
  clearCalibration: vi.fn(),
  getSnapshot: vi.fn(),
  restart: vi.fn(),
  subscribe: vi.fn(() => () => undefined),
}));

const inputDeviceService = vi.hoisted(() => ({
  list: vi.fn(),
  requestAccess: vi.fn(),
  subscribe: vi.fn(() => () => undefined),
}));

const noiseControlSettings = vi.hoisted(() => ({
  get: vi.fn(),
  save: vi.fn(),
}));

vi.mock("../../../services/noise/noiseStreamService", () => ({
  acquireNoiseDebugSession: service.acquire,
  calibrateNoiseStream: service.calibrate,
  clearNoiseStreamCalibration: service.clearCalibration,
  getNoiseStreamSnapshot: service.getSnapshot,
  restartNoiseStream: service.restart,
  subscribeNoiseStream: service.subscribe,
}));

vi.mock("../../../services/noise/noiseInputDeviceService", () => ({
  listNoiseInputDevices: inputDeviceService.list,
  requestNoiseInputDeviceAccess: inputDeviceService.requestAccess,
  subscribeNoiseInputDeviceChanges: inputDeviceService.subscribe,
}));

vi.mock("../../../utils/noiseControlSettings", () => ({
  getNoiseControlSettings: noiseControlSettings.get,
  saveNoiseControlSettings: noiseControlSettings.save,
}));

function createSnapshot(overrides: Partial<NoiseMonitoringSnapshot> = {}): NoiseMonitoringSnapshot {
  return {
    role: "none",
    status: "disabled",
    signalHealth: "warming-up",
    confidence: "none",
    quietnessScore: null,
    estimatedDbA: null,
    realtimeDbfsA: null,
    showRealtimeValue: true,
    primaryMetric: "quietness-score",
    scoreAlertThreshold: 70,
    alertSoundEnabled: false,
    leaderEpoch: null,
    captureSessionId: null,
    ringBuffer: [],
    latestSlice: null,
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
        collectedSeconds: 0,
        progress: 0,
        validSecondCount: 0,
        coverageRatio: 0,
      },
    },
    ...overrides,
  };
}

function createCalibrationReadySnapshot(
  overrides: Partial<NoiseMonitoringSnapshot> = {}
): NoiseMonitoringSnapshot {
  const snapshot = createSnapshot({
    role: "leader",
    status: "collecting",
    leaderEpoch: "epoch-calibration",
    captureSessionId: "capture-calibration",
    diagnostics: {
      track: {
        deviceKey: "calibration-device",
        persistentDeviceKey: true,
        sampleRate: 48_000,
        frameSamples: 4_800,
        channelCount: 1,
        processingSignature: JSON.stringify({
          autoGainControl: false,
          echoCancellation: false,
          noiseSuppression: false,
        }),
        processingRequestedOff: true,
        processingDisabled: true,
      },
      latestFeature: null,
      persistence: {
        enabled: true,
        available: true,
        pendingFrames: 0,
        retainedBytes: null,
        error: null,
      },
      scoring: {
        requiredSeconds: 60,
        collectedSeconds: 10,
        progress: 17,
        validSecondCount: 10,
        coverageRatio: 1,
      },
    },
  });
  return {
    ...snapshot,
    ...overrides,
    diagnostics: overrides.diagnostics ?? snapshot.diagnostics,
  };
}

function renderPage(snapshot: NoiseMonitoringSnapshot) {
  service.getSnapshot.mockReturnValue(snapshot);
  return render(
    <FeedbackProvider>
      <AudioDebugPage />
    </FeedbackProvider>
  );
}

describe("AudioDebugPage", () => {
  beforeEach(() => {
    service.acquire.mockReset();
    service.calibrate.mockReset();
    service.clearCalibration.mockReset();
    service.getSnapshot.mockReset();
    service.restart.mockReset();
    service.subscribe.mockClear();
    inputDeviceService.list.mockReset();
    inputDeviceService.list.mockResolvedValue([
      { deviceId: "built-in", label: "内置麦克风" },
      { deviceId: "usb-mic", label: "USB 麦克风" },
    ]);
    inputDeviceService.requestAccess.mockReset();
    inputDeviceService.requestAccess.mockResolvedValue([
      { deviceId: "built-in", label: "内置麦克风" },
      { deviceId: "usb-mic", label: "USB 麦克风" },
    ]);
    inputDeviceService.subscribe.mockClear();
    noiseControlSettings.get.mockReset();
    noiseControlSettings.get.mockReturnValue({ preferredInputDevice: null });
    noiseControlSettings.save.mockReset();
  });

  it("按数据处理顺序展示六个流程节点和常显阶段", async () => {
    const { container } = renderPage(createSnapshot());

    const overview = screen.getByRole("list", { name: "音频数据处理流程" });
    const overviewStages = within(overview).getAllByRole("listitem");
    expect(overviewStages.map((stage) => stage.querySelector("strong")?.textContent)).toEqual([
      "输入设备",
      "采集会话",
      "特征提取",
      "信号诊断",
      "评分与校准",
      "分发与持久化",
    ]);
    expect(overviewStages.map((stage) => stage.textContent)).toEqual([
      "01输入设备等待设备",
      "02采集会话未参与",
      "03特征提取等待帧",
      "04信号诊断预热中 · 无置信度",
      "05评分与校准采集进度 0%",
      "06分发与持久化保存关闭 · 未参与",
    ]);

    const sections = Array.from(container.querySelectorAll<HTMLElement>("[data-flow-section]"));
    expect(sections.map((section) => section.dataset.flowSection)).toEqual([
      "input",
      "session",
      "features",
      "health",
      "score",
      "output",
    ]);
    expect(sections.map((section) => section.querySelector("h2")?.textContent)).toEqual([
      "输入设备",
      "采集会话",
      "特征提取",
      "信号诊断",
      "评分与校准",
      "分发与持久化",
    ]);
    expect(screen.getByText("跨标签快照")).toBeInTheDocument();
    expect(screen.getByText("IndexedDB")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "运行轨迹" })).toBeInTheDocument();
  });

  it("在调试页选择并立即保存采集麦克风", async () => {
    const user = userEvent.setup();
    renderPage(createSnapshot());

    const dropdown = await screen.findByRole("button", { name: "麦克风设备" });
    expect(dropdown).toHaveTextContent("系统默认");
    await user.click(dropdown);
    await user.click(screen.getByRole("option", { name: "USB 麦克风" }));

    expect(dropdown).toHaveTextContent("USB 麦克风");
    expect(noiseControlSettings.save).toHaveBeenCalledWith({
      preferredInputDevice: { deviceId: "usb-mic", label: "USB 麦克风" },
    });

    await user.click(screen.getByRole("button", { name: "授权并刷新麦克风设备" }));
    expect(inputDeviceService.requestAccess).toHaveBeenCalledTimes(1);
  });

  it("显示 Leader、轨道处理配置和三条可独立开关的 AudioWorklet 特征曲线", async () => {
    const user = userEvent.setup();
    const { container } = renderPage(
      createSnapshot({
        role: "leader",
        status: "quiet",
        signalHealth: "healthy",
        confidence: "high",
        quietnessScore: 88.5,
        leaderEpoch: "epoch-debug",
        captureSessionId: "capture-debug",
        diagnostics: {
          track: {
            deviceKey: "runtime-device",
            persistentDeviceKey: true,
            sampleRate: 48_000,
            frameSamples: 4_800,
            channelCount: 1,
            processingSignature: JSON.stringify({
              autoGainControl: false,
              channelCount: 1,
              echoCancellation: false,
              noiseSuppression: false,
              sampleRate: 48_000,
            }),
            processingRequestedOff: true,
            processingDisabled: true,
          },
          latestFeature: {
            frameSequence: 7,
            startSample: 28_800,
            rmsDbfs: -42,
            aWeightedDbfs: -44,
            sampleP01Dbfs: -80,
            zeroRatio: 0.01,
            clippedRatio: 0,
            t: Date.now(),
            health: "healthy",
            confidence: "high",
          },
          persistence: {
            enabled: true,
            available: true,
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
      })
    );

    expect(screen.getByRole("heading", { name: "音频采集诊断" })).toBeInTheDocument();
    expect(screen.getAllByText("Leader").length).toBeGreaterThan(0);
    expect(screen.getByText("runtime-device")).toBeInTheDocument();
    expect(screen.getAllByText("48,000 Hz")).toHaveLength(2);
    expect(screen.getByText("-44.0 dBFS")).toBeInTheDocument();
    expect(screen.getAllByText("1% 谷值")).toHaveLength(2);
    expect(screen.getByText("-80.0 dBFS")).toBeInTheDocument();
    expect(screen.getByText("88.5")).toBeInTheDocument();
    expect(screen.getAllByText("帧 7")).toHaveLength(2);
    expect(screen.queryByText("20 dB")).not.toBeInTheDocument();

    const overview = screen.getByRole("list", { name: "音频数据处理流程" });
    expect(within(overview).getByText("健康 · 高置信度")).toBeInTheDocument();
    expect(within(overview).getByText("安静")).toBeInTheDocument();
    expect(within(overview).getByText("保存正常 · Leader")).toBeInTheDocument();

    const curveControls = screen.getByRole("group", { name: "曲线显示" });
    expect(curveControls.querySelectorAll('[role="switch"]')).toHaveLength(3);
    await waitFor(() => {
      for (const id of ["a-weighted-dbfs", "raw-rms-dbfs", "sample-p01-dbfs"]) {
        expect(container.querySelector(`[data-chart-series="${id}"]`)).not.toBeNull();
      }
    });

    const valleySwitch = screen.getByRole("switch", { name: "1% 谷值曲线" });
    expect(valleySwitch).toHaveAttribute("aria-checked", "true");
    await user.click(valleySwitch);
    expect(valleySwitch).toHaveAttribute("aria-checked", "false");
    expect(container.querySelector('[data-chart-series="sample-p01-dbfs"]')).toBeNull();

    await user.click(valleySwitch);
    expect(valleySwitch).toHaveAttribute("aria-checked", "true");
    expect(container.querySelector('[data-chart-series="sample-p01-dbfs"]')).not.toBeNull();
  });

  it("只在用户点击后获取临时调试会话，并在停止时释放", async () => {
    const user = userEvent.setup();
    const release = vi.fn();
    service.acquire.mockReturnValue(release);
    renderPage(createSnapshot());

    expect(service.acquire).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "开始临时采集" }));
    await waitFor(() => expect(service.acquire).toHaveBeenCalledTimes(1));

    await user.click(screen.getByRole("button", { name: "停止临时采集" }));
    expect(release).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "开始临时采集" })).toBeInTheDocument();
  });

  it("校验外部参考值并启动 10 秒 dB(A) 校准", async () => {
    const user = userEvent.setup();
    service.calibrate.mockResolvedValue(undefined);
    renderPage(createCalibrationReadySnapshot());

    const referenceInput = screen.getByRole("spinbutton", { name: "参考声级" });
    expect(referenceInput).toHaveValue(40);
    await user.clear(referenceInput);
    await user.type(referenceInput, "125");
    await user.click(screen.getByRole("button", { name: "开始校准" }));
    expect(screen.getByText("参考声级必须在 30–120 dB(A) 之间。")).toBeInTheDocument();
    expect(service.calibrate).not.toHaveBeenCalled();

    await user.clear(referenceInput);
    await user.type(referenceInput, "65.5");
    await user.click(screen.getByRole("button", { name: "开始校准" }));
    const dialog = await screen.findByRole("dialog", { name: "开始外部参考校准" });
    await user.click(within(dialog).getByRole("button", { name: "开始校准" }));

    await waitFor(() => expect(service.calibrate).toHaveBeenCalledWith(65.5));
    expect(await screen.findByText("校准完成")).toBeInTheDocument();
  });

  it("确认后清除当前设备的 dB(A) 校准", async () => {
    const user = userEvent.setup();
    service.clearCalibration.mockResolvedValue(undefined);
    renderPage(
      createCalibrationReadySnapshot({
        calibrationAvailable: true,
        calibration: { status: "complete", progress: 100, error: null },
      })
    );

    await user.click(screen.getByRole("button", { name: "清除校准" }));
    const dialog = await screen.findByRole("dialog", { name: "清除 dB(A) 校准" });
    await user.click(within(dialog).getByRole("button", { name: "清除校准" }));

    await waitFor(() => expect(service.clearCalibration).toHaveBeenCalledTimes(1));
    expect(await screen.findByText("校准已清除")).toBeInTheDocument();
  });

  it("把无法可靠归因的采集状态统一显示为信号异常", async () => {
    renderPage(
      createSnapshot({
        status: "signal-unavailable",
        signalHealth: "signal-anomaly",
        confidence: "none",
      })
    );

    expect((await screen.findAllByText("信号异常")).length).toBeGreaterThan(0);
    expect(screen.queryByText("疑似设备降噪")).not.toBeInTheDocument();
    expect(screen.queryByText("数字静音")).not.toBeInTheDocument();
  });
});
