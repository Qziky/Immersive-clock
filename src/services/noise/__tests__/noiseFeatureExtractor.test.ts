import { describe, expect, it, vi } from "vitest";

import type { NoiseFeatureFrame } from "../../../types/noise";
import { AWeightingFilter, NoiseFeatureExtractor } from "../noiseFeatureExtractor";

function sine(sampleRate: number, frequency: number, seconds: number, amplitude: number) {
  return Float32Array.from(
    { length: Math.round(sampleRate * seconds) },
    (_, index) => amplitude * Math.sin((2 * Math.PI * frequency * index) / sampleRate)
  );
}

describe("NoiseFeatureExtractor", () => {
  it("按会话采样率生成严格 100ms 特征帧", () => {
    const frames: NoiseFeatureFrame[] = [];
    const extractor = new NoiseFeatureExtractor({
      sampleRate: 48_000,
      onFeature: (frame) => frames.push(frame),
    });

    extractor.process(sine(48_000, 1_000, 0.25, 0.1));

    expect(frames).toHaveLength(2);
    expect(frames.map((frame) => frame.frameSequence)).toEqual([1, 2]);
    expect(frames.map((frame) => frame.startSample)).toEqual([0, 4_800]);
    expect(frames[0].rmsDbfs).toBeCloseTo(-23.01, 1);
  });

  it("只输出评分和健康检查所需的五项特征且不泄露 PCM", () => {
    const onFeature = vi.fn<(frame: NoiseFeatureFrame) => void>();
    const extractor = new NoiseFeatureExtractor({ sampleRate: 1_000, windowMs: 100, onFeature });
    const samples = new Float32Array(100);
    samples[0] = 1;
    extractor.process(samples);

    const frame = onFeature.mock.calls[0][0];
    expect(frame.zeroRatio).toBe(0.99);
    expect(frame.clippedRatio).toBe(0.01);
    expect(frame.sampleP01Dbfs).toBe(-160);
    expect(Object.keys(frame)).toEqual([
      "frameSequence",
      "startSample",
      "rmsDbfs",
      "aWeightedDbfs",
      "sampleP01Dbfs",
      "zeroRatio",
      "clippedRatio",
    ]);
    expect(JSON.stringify(frame)).not.toContain("samples");
    expect(JSON.stringify(frame)).not.toContain("pcm");
  });

  it("在 100ms 窗口内计算绝对样本振幅的 P01", () => {
    const onFeature = vi.fn<(frame: NoiseFeatureFrame) => void>();
    const extractor = new NoiseFeatureExtractor({
      sampleRate: 10_000,
      windowMs: 100,
      onFeature,
    });
    const samples = Float32Array.from({ length: 1_000 }, (_, index) => index / 1_000);

    extractor.process(samples);

    const frame = onFeature.mock.calls[0][0];
    expect(frame.sampleP01Dbfs).toBeCloseTo(20 * Math.log10(0.00999), 4);
  });

  it("A 加权在 1kHz 归一并衰减低频", () => {
    const filter = new AWeightingFilter(48_000);

    expect(filter.getMagnitudeAt(1_000)).toBeCloseTo(1, 6);
    expect(filter.getMagnitudeAt(100)).toBeLessThan(filter.getMagnitudeAt(1_000));
    expect(filter.getMagnitudeAt(50)).toBeLessThan(filter.getMagnitudeAt(100));
  });
});
