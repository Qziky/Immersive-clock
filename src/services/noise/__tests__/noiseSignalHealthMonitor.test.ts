import { describe, expect, it } from "vitest";

import type { NoiseFeatureFrame } from "../../../types/noise";
import { NoiseSignalHealthMonitor } from "../noiseSignalHealthMonitor";

const SAMPLE_RATE = 1_000;

function frame(sequence: number, overrides: Partial<NoiseFeatureFrame> = {}): NoiseFeatureFrame {
  return {
    frameSequence: sequence,
    startSample: (sequence - 1) * 100,
    rmsDbfs: -45,
    aWeightedDbfs: -45,
    sampleP01Dbfs: -70,
    zeroRatio: 0,
    clippedRatio: 0,
    ...overrides,
  };
}

function ingestFrames(
  monitor: NoiseSignalHealthMonitor,
  count: number,
  create: (sequence: number) => NoiseFeatureFrame
) {
  let result = monitor.ingest(create(1));
  for (let sequence = 2; sequence <= count; sequence += 1)
    result = monitor.ingest(create(sequence));
  return result;
}

describe("NoiseSignalHealthMonitor", () => {
  it("预热完成前不输出置信度", () => {
    const monitor = new NoiseSignalHealthMonitor(SAMPLE_RATE, true);
    const result = ingestFrames(monitor, 19, (sequence) => frame(sequence));

    expect(result).toEqual({ health: "warming-up", confidence: "none" });
  });

  it("连续 3 秒至少 95% 数字零归入统一信号异常", () => {
    const monitor = new NoiseSignalHealthMonitor(SAMPLE_RATE, true);
    const result = ingestFrames(monitor, 30, (sequence) =>
      frame(sequence, { aWeightedDbfs: -160, rmsDbfs: -160, zeroRatio: 1 })
    );

    expect(result).toEqual({ health: "signal-anomaly", confidence: "none" });
  });

  it("非零但低于量程时保留中等置信度", () => {
    const monitor = new NoiseSignalHealthMonitor(SAMPLE_RATE, true);
    const result = ingestFrames(monitor, 30, (sequence) =>
      frame(sequence, { aWeightedDbfs: -92, rmsDbfs: -91, zeroRatio: 0.05 })
    );

    expect(result).toEqual({ health: "below-range", confidence: "medium" });
  });

  it("处理未关闭、削波或门限截断与连续零值归入同一异常状态", () => {
    const forcedProcessing = ingestFrames(
      new NoiseSignalHealthMonitor(SAMPLE_RATE, false),
      30,
      (sequence) => frame(sequence)
    );
    const clipping = ingestFrames(new NoiseSignalHealthMonitor(SAMPLE_RATE, true), 30, (sequence) =>
      frame(sequence, { clippedRatio: 0.01 })
    );
    const gated = ingestFrames(new NoiseSignalHealthMonitor(SAMPLE_RATE, true), 30, (sequence) =>
      frame(sequence, {
        aWeightedDbfs: sequence % 2 === 0 ? -42 : -60,
        zeroRatio: 0.3,
      })
    );

    expect(forcedProcessing).toEqual({ health: "signal-anomaly", confidence: "low" });
    expect(clipping).toEqual({ health: "signal-anomaly", confidence: "low" });
    expect(gated).toEqual({ health: "signal-anomaly", confidence: "low" });
  });
});
