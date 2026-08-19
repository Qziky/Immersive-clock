import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { NoiseMonitoringSnapshot } from "../../../types/noise";
import NoiseMonitor from "../NoiseMonitor";

const hooks = vi.hoisted(() => ({
  snapshot: null as NoiseMonitoringSnapshot | null,
}));

vi.mock("../../../hooks/useNoiseStream", () => ({
  useNoiseStream: () => hooks.snapshot,
}));

vi.mock("../../../hooks/useAudio", () => ({
  useAudio: () => [vi.fn(), true],
}));

vi.mock("../../../contexts/AppContext", () => ({
  useAppState: () => ({ study: { errorPopupEnabled: false } }),
}));

vi.mock("../../../contexts/AppearanceContext", () => ({
  useComponentAppearance: () => ({}),
}));

vi.mock("../../../utils/errorCenter", () => ({
  pushErrorCenterRecord: vi.fn(),
}));

function createSnapshot(overrides: Partial<NoiseMonitoringSnapshot> = {}): NoiseMonitoringSnapshot {
  return {
    role: "leader",
    status: "collecting",
    signalHealth: "healthy",
    confidence: "none",
    quietnessScore: null,
    estimatedDbA: null,
    realtimeDbfsA: -50,
    showRealtimeValue: true,
    autoHidePersistentAnomaly: true,
    primaryMetric: "quietness-score",
    scoreAlertThreshold: 70,
    alertSoundEnabled: false,
    leaderEpoch: "epoch-a",
    captureSessionId: "capture-a",
    ringBuffer: [],
    latestSlice: null,
    calibrationAvailable: false,
    calibration: { status: "idle", progress: 0, error: null },
    diagnostics: {
      track: null,
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
        collectedSeconds: 30,
        progress: 50,
        validSecondCount: 30,
        coverageRatio: 0.5,
      },
    },
    ...overrides,
  };
}

describe("NoiseMonitor", () => {
  beforeEach(() => {
    hooks.snapshot = createSnapshot();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("首个评分前仅显示采集中和覆盖百分比", () => {
    render(<NoiseMonitor />);

    expect(screen.getByText("采集中")).toBeVisible();
    expect(screen.getByText("50%")).toBeVisible();
    expect(screen.queryByText(/覆盖/)).not.toBeInTheDocument();
    expect(screen.queryByText(/30\/60|已保存|写入中/)).not.toBeInTheDocument();
  });

  it("评分可用后仅显示实时分数，持久化故障保留在提示中", () => {
    hooks.snapshot = createSnapshot({
      status: "quiet",
      confidence: "high",
      quietnessScore: 88,
      diagnostics: {
        ...createSnapshot().diagnostics,
        persistence: {
          enabled: true,
          available: false,
          pendingFrames: 0,
          retainedBytes: null,
          error: "IndexedDB unavailable",
        },
      },
    });

    render(<NoiseMonitor />);

    expect(screen.getByText("安静")).toBeVisible();
    expect(screen.getByText("88 分")).toBeVisible();
    expect(screen.queryByText("保存失败")).not.toBeInTheDocument();
    expect(screen.getByText("安静")).toHaveAttribute(
      "title",
      "当前环境安静评分 88 分；原始帧保存失败"
    );
  });

  it("信号异常时显示麦克风异常且不显示辅助文案", () => {
    hooks.snapshot = createSnapshot({
      status: "signal-unavailable",
      signalHealth: "signal-anomaly",
      confidence: "none",
    });

    render(<NoiseMonitor />);

    expect(screen.getByText("麦克风异常")).toBeVisible();
    expect(screen.queryByText("无有效信号")).not.toBeInTheDocument();
    expect(screen.queryByText("测量可信度低")).not.toBeInTheDocument();
    expect(screen.queryByText("疑似设备降噪")).not.toBeInTheDocument();
    expect(screen.queryByText("数字静音")).not.toBeInTheDocument();
  });

  it("麦克风异常连续 5 分钟后仅触发一次自动隐藏", () => {
    vi.useFakeTimers();
    const onPersistentAnomalyAutoHide = vi.fn();
    hooks.snapshot = createSnapshot({ signalHealth: "signal-anomaly" });

    render(<NoiseMonitor onPersistentAnomalyAutoHide={onPersistentAnomalyAutoHide} />);

    act(() => {
      vi.advanceTimersByTime(5 * 60 * 1000 - 1);
    });
    expect(onPersistentAnomalyAutoHide).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(onPersistentAnomalyAutoHide).toHaveBeenCalledTimes(1);

    act(() => {
      vi.advanceTimersByTime(5 * 60 * 1000);
    });
    expect(onPersistentAnomalyAutoHide).toHaveBeenCalledTimes(1);
  });

  it("异常恢复或关闭选项时取消自动隐藏计时", () => {
    vi.useFakeTimers();
    const onPersistentAnomalyAutoHide = vi.fn();
    hooks.snapshot = createSnapshot({ signalHealth: "signal-anomaly" });
    const { rerender } = render(
      <NoiseMonitor onPersistentAnomalyAutoHide={onPersistentAnomalyAutoHide} />
    );

    act(() => {
      vi.advanceTimersByTime(2 * 60 * 1000);
    });
    hooks.snapshot = createSnapshot({ signalHealth: "healthy" });
    rerender(<NoiseMonitor onPersistentAnomalyAutoHide={onPersistentAnomalyAutoHide} />);

    act(() => {
      vi.advanceTimersByTime(5 * 60 * 1000);
    });
    expect(onPersistentAnomalyAutoHide).not.toHaveBeenCalled();

    hooks.snapshot = createSnapshot({
      autoHidePersistentAnomaly: false,
      signalHealth: "signal-anomaly",
    });
    rerender(<NoiseMonitor onPersistentAnomalyAutoHide={onPersistentAnomalyAutoHide} />);

    act(() => {
      vi.advanceTimersByTime(5 * 60 * 1000);
    });
    expect(onPersistentAnomalyAutoHide).not.toHaveBeenCalled();
  });
});
