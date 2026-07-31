import { beforeEach, describe, expect, it, vi } from "vitest";

import type {
  NoiseCaptureSession,
  NoiseCapturedFeatureFrame,
  NoiseFeatureChunk,
} from "../../../types/noise";
import {
  appendNoiseFeatureFrames,
  createNoiseCaptureSession,
  deleteNoiseCaptureDataBefore,
  finishNoiseCaptureSession,
  readNoiseFeatureFrames,
  recoverAbandonedNoiseCaptureSessions,
} from "../noiseFeatureRepository";

const stores = vi.hoisted(() => {
  const sessions = new Map<string, NoiseCaptureSession>();
  const chunks = new Map<string, NoiseFeatureChunk>();
  return {
    sessions,
    chunks,
    commit: vi.fn(async (session: NoiseCaptureSession, records: NoiseFeatureChunk[]) => {
      sessions.set(session.id, structuredClone(session));
      records.forEach((record) => chunks.set(record.id, structuredClone(record)));
    }),
    deleteSessions: vi.fn(async (sessionIds: string[]) => {
      sessionIds.forEach((sessionId) => {
        sessions.delete(sessionId);
        for (const [id, chunk] of chunks) {
          if (chunk.captureSessionId === sessionId) chunks.delete(id);
        }
      });
    }),
    sessionDb: {
      put: vi.fn(
        async (record: NoiseCaptureSession) => void sessions.set(record.id, structuredClone(record))
      ),
      get: vi.fn(async (id: string) => structuredClone(sessions.get(id))),
      list: vi.fn(async () => Array.from(sessions.values()).map((value) => structuredClone(value))),
      clear: vi.fn(async () => sessions.clear()),
    },
    chunkDb: {
      put: vi.fn(
        async (record: NoiseFeatureChunk) => void chunks.set(record.id, structuredClone(record))
      ),
      get: vi.fn(async (id: string) => structuredClone(chunks.get(id))),
      list: vi.fn(async (query?: { captureSessionId?: string }) =>
        Array.from(chunks.values())
          .filter(
            (value) => !query?.captureSessionId || value.captureSessionId === query.captureSessionId
          )
          .map((value) => structuredClone(value))
      ),
      clear: vi.fn(async () => chunks.clear()),
    },
  };
});

vi.mock("../../../utils/db", () => ({
  commitNoiseFeatureCheckpoint: stores.commit,
  deleteNoiseSessionData: stores.deleteSessions,
  noiseCaptureSessionDb: stores.sessionDb,
  noiseFeatureChunkDb: stores.chunkDb,
}));

vi.mock("../noiseHistoryLock", () => ({
  withNoiseHistoryWriteLock: async <T>(operation: () => Promise<T>) => operation(),
}));

function session(): NoiseCaptureSession {
  return {
    schemaVersion: 1,
    id: "capture-a",
    captureSessionId: "capture-a",
    leaderEpoch: "epoch-a",
    producerId: "tab-a",
    startedAt: 1_000,
    endedAt: null,
    endReason: null,
    sampleRate: 1_000,
    frameSamples: 100,
    featureSchemaVersion: 1,
    extractorVersion: "spectral-features-v1",
    deviceKey: "device-a",
    persistentDeviceKey: true,
    channelCount: 1,
    channelMixMode: "arithmetic-mean",
    processingSignature: "off",
    processingRequestedOff: true,
    processingDisabled: true,
    inputSettingsSampleRate: 1_000,
    lastFrameSequence: 0,
    lastStartSample: -1,
  };
}

function frame(sequence: number): NoiseCapturedFeatureFrame {
  return {
    leaderEpoch: "epoch-a",
    captureSessionId: "capture-a",
    frameSequence: sequence,
    startSample: (sequence - 1) * 100,
    rmsDbfs: -40,
    aWeightedDbfs: -48 + sequence / 100,
    sampleP01Dbfs: -60,
    zeroRatio: 0,
    clippedRatio: 0,
  };
}

describe("noiseFeatureRepository", () => {
  beforeEach(() => {
    stores.sessions.clear();
    stores.chunks.clear();
    vi.clearAllMocks();
  });

  it("按列式 TypedArray 保存并恢复原始 100 ms 帧", async () => {
    const capture = session();
    await createNoiseCaptureSession(capture);
    await appendNoiseFeatureFrames(capture, [frame(1), frame(2), frame(3)]);

    const stored = stores.chunks.get("capture-a:0")!;
    expect(Object.prototype.toString.call(stored.sequenceOffsets)).toBe("[object Uint32Array]");
    expect(Object.prototype.toString.call(stored.aWeightedDbfs)).toBe("[object Float32Array]");
    expect(stored.frameCount).toBe(3);
    expect(stored).not.toHaveProperty("frames");

    const restored = await readNoiseFeatureFrames("capture-a");
    expect(restored.map((value) => value.frameSequence)).toEqual([1, 2, 3]);
    expect(restored[1]?.aWeightedDbfs).toBeCloseTo(-47.98, 4);
  });

  it("忽略重复和倒序帧但保留序列缺口", async () => {
    const capture = session();
    await createNoiseCaptureSession(capture);
    await appendNoiseFeatureFrames(capture, [frame(1), frame(3), frame(2), frame(3)]);
    expect((await readNoiseFeatureFrames("capture-a")).map((value) => value.frameSequence)).toEqual(
      [1, 2, 3]
    );
  });

  it("结束会话后封存活动分块且不可继续追加", async () => {
    const capture = session();
    await createNoiseCaptureSession(capture);
    await appendNoiseFeatureFrames(capture, [frame(1)]);
    await finishNoiseCaptureSession(capture, 2_000, "stopped");
    expect(stores.chunks.get("capture-a:0")?.sealed).toBe(true);
    expect(stores.sessions.get("capture-a")).toMatchObject({
      endedAt: 2_000,
      endReason: "stopped",
    });
    await expect(appendNoiseFeatureFrames(capture, [frame(4)])).rejects.toThrow("不可追加");
  });

  it("启动恢复会封存崩溃遗留分块并按样本轴结束旧会话", async () => {
    const capture = session();
    await createNoiseCaptureSession(capture);
    await appendNoiseFeatureFrames(capture, [frame(1), frame(2)]);

    await expect(recoverAbandonedNoiseCaptureSessions(5_000)).resolves.toBe(1);
    expect(stores.chunks.get("capture-a:0")?.sealed).toBe(true);
    expect(stores.sessions.get("capture-a")).toMatchObject({
      endedAt: 1_200,
      endReason: "recovered-after-crash",
    });
  });

  it("统一清理到期会话及其原始分块", async () => {
    const capture = session();
    await createNoiseCaptureSession(capture);
    await appendNoiseFeatureFrames(capture, [frame(1)]);
    await finishNoiseCaptureSession(capture, 2_000, "stopped");

    await expect(deleteNoiseCaptureDataBefore(3_000)).resolves.toBe(1);
    expect(stores.sessions.size).toBe(0);
    expect(stores.chunks.size).toBe(0);
  });
});
