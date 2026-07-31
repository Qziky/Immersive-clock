import { beforeEach, describe, expect, it, vi } from "vitest";

import { createNoiseSliceFixture } from "../../test/noiseFixtures";
import type { NoiseCaptureSession, NoiseSliceSummary } from "../../types/noise";
import * as service from "../noiseSliceService";

const backend = vi.hoisted(() => {
  const records = new Map<string, NoiseSliceSummary>();
  const sessions: NoiseCaptureSession[] = [];
  return {
    records,
    sessions,
    db: {
      list: vi.fn(async () => Array.from(records.values()).map((value) => structuredClone(value))),
      put: vi.fn(
        async (record: NoiseSliceSummary) => void records.set(record.id, structuredClone(record))
      ),
      replaceAll: vi.fn(async (next: NoiseSliceSummary[]) => {
        records.clear();
        next.forEach((record) => records.set(record.id, structuredClone(record)));
      }),
      deleteEndedBefore: vi.fn().mockResolvedValue(undefined),
      clear: vi.fn(async () => records.clear()),
    },
    clearRescore: vi.fn().mockResolvedValue(undefined),
    clearCapture: vi.fn().mockResolvedValue(undefined),
    cleanupExpiredCapture: vi.fn().mockResolvedValue(0),
    overlapWarning: vi.fn(),
  };
});

vi.mock("../db", () => ({
  noiseHistoryDb: backend.db,
  noiseRescoreStateDb: { clear: backend.clearRescore },
}));

vi.mock("../../services/noise/noiseFeatureRepository", () => ({
  clearNoiseCaptureData: backend.clearCapture,
  deleteNoiseCaptureDataBefore: backend.cleanupExpiredCapture,
  listNoiseCaptureSessions: vi.fn(async () => structuredClone(backend.sessions)),
}));

vi.mock("../../services/noise/noiseHistoryLock", () => ({
  withNoiseHistoryWriteLock: async <T>(operation: () => Promise<T>) => operation(),
}));

vi.mock("../errorCenter", () => ({
  pushErrorCenterRecord: backend.overlapWarning,
}));

function createSession(id: string, startedAt: number): NoiseCaptureSession {
  return {
    schemaVersion: 1,
    id,
    captureSessionId: id,
    leaderEpoch: `epoch-${id}`,
    producerId: `producer-${id}`,
    startedAt,
    endedAt: startedAt + 120_000,
    endReason: "stopped",
    sampleRate: 1_000,
    frameSamples: 100,
    featureSchemaVersion: 1,
    extractorVersion: "spectral-features-v1",
    deviceKey: `device-${id}`,
    persistentDeviceKey: true,
    channelCount: 1,
    channelMixMode: "arithmetic-mean",
    processingSignature: "off",
    processingRequestedOff: true,
    processingDisabled: true,
    inputSettingsSampleRate: 1_000,
    lastFrameSequence: 1_200,
    lastStartSample: 119_900,
  };
}

function sliceFor(
  sessionId: string,
  coverageRatio: number,
  quality: NoiseSliceSummary["detail"]["quality"]
): NoiseSliceSummary {
  const base = createNoiseSliceFixture({
    id: `spectral-activity-v2:${sessionId}:600`,
    captureSessionId: sessionId,
    coverageRatio,
  });
  return {
    ...base,
    detail: { ...base.detail, coverageRatio, quality },
  };
}

describe("noiseSliceService spectral-activity-v2", () => {
  beforeEach(() => {
    backend.records.clear();
    backend.sessions.length = 0;
    localStorage.clear();
    vi.clearAllMocks();
  });

  it("只使用 IndexedDB 保存版本化派生评分，不提供 localStorage 回退", async () => {
    const slice = createNoiseSliceFixture();
    await service.writeNoiseSlice(slice);
    expect(await service.readNoiseSlices()).toEqual([slice]);
    expect(localStorage.getItem("noise-slices-v2")).toBeNull();
    expect(localStorage.getItem("noise-score-slices-v3")).toBeNull();
  });

  it("严格校验当前模型并拒绝重复主键", () => {
    const slice = createNoiseSliceFixture();
    expect(service.isNoiseSliceSummary(slice)).toBe(true);
    expect(() => service.validateNoiseSlicesForReplacement([{ end: 3 }])).toThrow(
      "spectral-activity-v2"
    );
    expect(() => service.validateNoiseSlicesForReplacement([slice, slice])).toThrow("重复记录");
  });

  it("备份恢复的派生结果标记为不可重算", async () => {
    const slice = createNoiseSliceFixture();
    await service.replaceNoiseSlices([slice]);
    expect((await service.readNoiseSlices())[0]?.sourceAvailable).toBe(false);
  });

  it("写入时执行保留期清理", async () => {
    await service.writeNoiseSlice(createNoiseSliceFixture());
    expect(backend.db.deleteEndedBefore).toHaveBeenCalledWith(expect.any(Number));
  });

  it("清理监测数据会同时删除派生评分、重算状态和原始帧", async () => {
    await service.writeNoiseSlice(createNoiseSliceFixture());
    await service.clearNoiseSlices();
    expect(backend.db.clear).toHaveBeenCalled();
    expect(backend.clearRescore).toHaveBeenCalled();
    expect(backend.clearCapture).toHaveBeenCalled();
  });

  it("跨标签更新事件在写入后触发", async () => {
    const listener = vi.fn();
    const unsubscribe = service.subscribeNoiseSlicesUpdated(listener);
    await service.writeNoiseSlice(createNoiseSliceFixture());
    expect(listener).toHaveBeenCalled();
    unsubscribe();
  });

  it("极端重叠会话按覆盖率、质量和开始时间选择单一报告来源", async () => {
    const candidates = [
      { id: "capture-a", startedAt: 1_000, coverage: 0.95, quality: "high" as const },
      { id: "capture-b", startedAt: 2_000, coverage: 0.96, quality: "low" as const },
      { id: "capture-c", startedAt: 3_000, coverage: 0.96, quality: "high" as const },
      { id: "capture-d", startedAt: 4_000, coverage: 0.96, quality: "high" as const },
    ];
    candidates.forEach((candidate) => {
      backend.sessions.push(createSession(candidate.id, candidate.startedAt));
      const slice = sliceFor(candidate.id, candidate.coverage, candidate.quality);
      backend.records.set(slice.id, slice);
    });

    const result = await service.readNoiseSlices();

    expect(result.map((slice) => slice.captureSessionId)).toEqual(["capture-c"]);
    expect(backend.overlapWarning).toHaveBeenCalledWith(
      expect.objectContaining({
        level: "warn",
        extra: {
          selectedSessionId: "capture-c",
          ignoredSessionIds: ["capture-a", "capture-b", "capture-d"],
        },
      })
    );
  });
});
