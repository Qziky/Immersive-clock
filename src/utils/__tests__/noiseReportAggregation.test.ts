import { describe, expect, it } from "vitest";

import { createNoiseSliceFixture } from "../../test/noiseFixtures";
import type { NoiseScoreQuality, NoiseSliceSummary } from "../../types/noise";
import { aggregateNoiseSlicesForRange } from "../noiseReportAggregation";

interface SliceOptions {
  activityFloor?: number;
  activityMean?: number;
  coverageRatio?: number;
  end: number;
  estimated?: NoiseSliceSummary["estimated"];
  eventFactor?: number;
  id: string;
  quality?: NoiseScoreQuality;
  score: number | null;
  start: number;
}

function makeSlice(options: SliceOptions): NoiseSliceSummary {
  const coverageRatio = options.coverageRatio ?? 1;
  const base = createNoiseSliceFixture({
    id: options.id,
    start: options.start,
    end: options.end,
    score: options.score,
    coverageRatio,
    estimated: options.estimated ?? null,
  });
  return {
    ...base,
    detail: {
      ...base.detail,
      activityFloor: options.activityFloor ?? 0.1,
      activityMean: options.activityMean ?? 0.2,
      coverageRatio,
      durationMs: options.end - options.start,
      eventFactor: options.eventFactor ?? 0.3,
      quality: options.quality ?? "high",
      sampledDurationMs: (options.end - options.start) * coverageRatio,
    },
  };
}

describe("aggregateNoiseSlicesForRange", () => {
  it("滚动窗口只累计超出已覆盖终点的新增区间", () => {
    const slices = [
      makeSlice({
        id: "0-60",
        start: 0,
        end: 60_000,
        score: 68,
        activityMean: 0.4,
        activityFloor: 0.2,
        eventFactor: 0.1,
      }),
      makeSlice({
        id: "5-65",
        start: 5_000,
        end: 65_000,
        score: 79.5,
        activityMean: 0.2,
        activityFloor: 0.1,
        eventFactor: 0.5,
      }),
      makeSlice({
        id: "10-70",
        start: 10_000,
        end: 70_000,
        score: 91,
        activityMean: 0,
        activityFloor: 0,
        eventFactor: 0.9,
      }),
    ];

    const report = aggregateNoiseSlicesForRange(slices, 0, 70_000);

    expect(report.validDurationMs).toBe(70_000);
    expect(report.excludedDurationMs).toBe(0);
    expect(report.averageScore).toBeCloseTo((68 * 60 + 79.5 * 5 + 91 * 5) / 70, 6);
    expect(report.eventFactor).toBeCloseTo((0.1 * 60 + 0.5 * 5 + 0.9 * 5) / 70, 6);
    expect(report.scoreDeductions.activityMean).toBeCloseTo(((0.4 * 60 + 0.2 * 5) / 70) * 65, 6);
    expect(report.scoreDeductions.activityFloor).toBeCloseTo(((0.2 * 60 + 0.1 * 5) / 70) * 25, 6);
    expect(report.scoreDeductions.eventFactor).toBeCloseTo(
      ((0.1 * 60 + 0.5 * 5 + 0.9 * 5) / 70) * 10,
      6
    );
    expect(report.scoreDeductions.total).toBeCloseTo(100 - (report.averageScore ?? 0), 6);
  });

  it("同一终点的重复窗口优先采用覆盖率和质量更高的记录", () => {
    const preferred = makeSlice({
      id: "preferred",
      start: 0,
      end: 60_000,
      score: 94,
      coverageRatio: 1,
      quality: "high",
    });
    const duplicate = makeSlice({
      id: "duplicate",
      start: 0,
      end: 60_000,
      score: 40,
      coverageRatio: 0.8,
      quality: "low",
    });

    const report = aggregateNoiseSlicesForRange([duplicate, preferred], 0, 60_000);

    expect(report.validDurationMs).toBe(60_000);
    expect(report.averageScore).toBe(94);
    expect(report.slices.map((slice) => slice.id)).toEqual(["preferred"]);
  });

  it("按报告边界裁剪并用覆盖率折算有效与排除时长", () => {
    const slices = [
      makeSlice({ id: "0-60", start: 0, end: 60_000, score: 80, coverageRatio: 0.8 }),
      makeSlice({
        id: "5-65",
        start: 5_000,
        end: 65_000,
        score: 100,
        coverageRatio: 0.8,
      }),
    ];

    const report = aggregateNoiseSlicesForRange(slices, 10_000, 70_000);

    expect(report.periodDurationMs).toBe(60_000);
    expect(report.validDurationMs).toBe(44_000);
    expect(report.excludedDurationMs).toBe(16_000);
    expect(report.validDurationMs).toBeLessThanOrEqual(report.periodDurationMs);
  });

  it("保留窗口缺口且忽略无评分窗口", () => {
    const slices = [
      makeSlice({ id: "first", start: 0, end: 60_000, score: 90 }),
      makeSlice({ id: "invalid", start: 60_000, end: 120_000, score: null }),
      makeSlice({ id: "last", start: 120_000, end: 180_000, score: 70 }),
    ];

    const report = aggregateNoiseSlicesForRange(slices, 0, 180_000);

    expect(report.validDurationMs).toBe(120_000);
    expect(report.excludedDurationMs).toBe(60_000);
    expect(report.averageScore).toBe(80);
  });

  it("校准读数与评分使用相同的新增区间权重", () => {
    const slices = [
      makeSlice({
        id: "calibrated-first",
        start: 0,
        end: 60_000,
        score: 90,
        estimated: { calibrationId: "a", avgDbA: 40, p95DbA: 52 },
      }),
      makeSlice({
        id: "calibrated-next",
        start: 5_000,
        end: 65_000,
        score: 80,
        estimated: { calibrationId: "a", avgDbA: 60, p95DbA: 68 },
      }),
      makeSlice({ id: "uncalibrated", start: 10_000, end: 70_000, score: 70 }),
    ];

    const report = aggregateNoiseSlicesForRange(slices, 0, 70_000);

    expect(report.hasEstimated).toBe(true);
    expect(report.averageEstimatedDbA).toBeCloseTo((40 * 60 + 60 * 5) / 65, 6);
    expect(report.maxEstimatedDbA).toBe(68);
  });
});
