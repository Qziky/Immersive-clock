import { describe, expect, it } from "vitest";

import type { NoiseFeatureFrame } from "../../types/noise";
import { computeFrameActivity, computeSpectralActivityScore } from "../noiseScoreEngine";

const SAMPLE_RATE = 48_000;
const FRAME_SAMPLES = 4_800;

function frame(index: number, activity: "quiet" | "noisy" | "silent" = "quiet"): NoiseFeatureFrame {
  return {
    frameSequence: index + 1,
    startSample: index * FRAME_SAMPLES,
    rmsDbfs: -40,
    aWeightedDbfs: activity === "noisy" ? -40 : -50,
    sampleP01Dbfs: -60,
    zeroRatio: activity === "silent" ? 1 : 0,
    clippedRatio: 0,
  };
}

function minute(select: (second: number) => "quiet" | "noisy" | "silent") {
  return Array.from({ length: 600 }, (_, index) => frame(index, select(Math.floor(index / 10))));
}

function score(frames: NoiseFeatureFrame[]) {
  return computeSpectralActivityScore(frames, {
    sampleRate: SAMPLE_RATE,
    frameSamples: FRAME_SAMPLES,
    endSample: SAMPLE_RATE * 60,
    processingDisabled: true,
  });
}

describe("spectral-activity-v2", () => {
  it("只使用 A 加权在 RMS 与 P01 之间的位置计算活动度", () => {
    expect(computeFrameActivity(frame(0, "quiet"))).toBe(0);
    expect(computeFrameActivity(frame(0, "noisy"))).toBe(1);
  });

  it("对 K 的 0.68 到 0.90 区间使用 smoothstep", () => {
    const midpoint = frame(0);
    midpoint.aWeightedDbfs =
      midpoint.sampleP01Dbfs + (midpoint.rmsDbfs - midpoint.sampleP01Dbfs) * 0.79;
    expect(computeFrameActivity(midpoint)).toBeCloseTo(0.5, 6);
  });

  it("对中等声学活动保持低灵敏度", () => {
    const moderate = frame(0);
    moderate.aWeightedDbfs =
      moderate.sampleP01Dbfs + (moderate.rmsDbfs - moderate.sampleP01Dbfs) * 0.7;
    expect(computeFrameActivity(moderate)).toBeLessThan(0.03);
  });

  it("安静分钟为 100 分且完全不需要基线", () => {
    const result = score(minute(() => "quiet"));
    expect(result.score).toBe(100);
    expect(result.detail).toMatchObject({
      activityMean: 0,
      activityFloor: 0,
      eventCount: 0,
      validSecondCount: 60,
      coverageRatio: 1,
    });
  });

  it("持续活动按 E、C、F 权重扣分", () => {
    const result = score(minute(() => "noisy"));
    expect(result.detail.activityMean).toBe(1);
    expect(result.detail.activityFloor).toBe(1);
    expect(result.detail.eventCount).toBe(1);
    expect(result.score).toBe(9.3);
  });

  it("有效秒不足 48 秒时不生成分数", () => {
    const result = score(minute((second) => (second < 47 ? "quiet" : "silent")));
    expect(result.detail.validSecondCount).toBe(47);
    expect(result.score).toBeNull();
    expect(result.signalHealth).toBe("insufficient-coverage");
  });

  it("每秒至少需要 8 帧有效帧", () => {
    const frames = minute(() => "quiet");
    for (let index = 0; index < 3; index += 1) frames[index]!.rmsDbfs = Number.NaN;
    const result = score(frames);
    expect(result.secondActivities[0]).toBeNull();
    expect(result.detail.validSecondCount).toBe(59);
  });

  it("不足 3 秒的高零比例保留，连续 3 秒后整段按异常零信号排除", () => {
    const shortSilence = score(minute((second) => (second < 2 ? "silent" : "quiet")));
    expect(shortSilence.detail.validSecondCount).toBe(60);

    const anomalousSignal = score(minute((second) => (second < 3 ? "silent" : "quiet")));
    expect(anomalousSignal.detail.validSecondCount).toBe(57);
    expect(anomalousSignal.signalHealth).toBe("signal-anomaly");
  });

  it("两秒退出并合并三秒内的事件间隔", () => {
    const result = score(
      minute((second) =>
        (second >= 2 && second <= 4) || (second >= 8 && second <= 10) ? "noisy" : "quiet"
      )
    );
    expect(result.detail.eventCount).toBe(1);
  });

  it("削波只降低质量，不修改评分公式", () => {
    const frames = minute(() => "quiet");
    frames[200]!.clippedRatio = 0.01;
    const result = score(frames);
    expect(result.score).toBe(100);
    expect(result.detail.quality).toBe("low");
  });
});
