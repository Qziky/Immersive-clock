import { beforeEach, describe, expect, it, vi } from "vitest";

import type { NoiseCaptureSession, NoiseFeatureChunk } from "../../../types/noise";
import {
  exportNoiseFeatureArchive,
  importNoiseFeatureArchive,
  preflightNoiseFeatureArchive,
} from "../noiseFeatureArchiveService";

const state = vi.hoisted(() => ({
  sessions: new Map<string, NoiseCaptureSession>(),
  chunks: new Map<string, NoiseFeatureChunk>(),
  rescore: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../noiseFeatureRepository", () => ({
  listNoiseCaptureSessions: vi.fn(async () => Array.from(state.sessions.values())),
  listNoiseFeatureChunks: vi.fn(async (sessionId: string) =>
    Array.from(state.chunks.values()).filter((chunk) => chunk.captureSessionId === sessionId)
  ),
}));

vi.mock("../../../utils/db", () => ({
  putNoiseArchiveData: vi.fn(
    async (sessions: NoiseCaptureSession[], chunks: NoiseFeatureChunk[]) => {
      sessions.forEach((session) => state.sessions.set(session.id, session));
      chunks.forEach((chunk) => state.chunks.set(chunk.id, chunk));
    }
  ),
  noiseCaptureSessionDb: {
    get: vi.fn(async (id: string) => state.sessions.get(id)),
    putAll: vi.fn(async (sessions: NoiseCaptureSession[]) =>
      sessions.forEach((session) => state.sessions.set(session.id, session))
    ),
  },
  noiseFeatureChunkDb: {
    get: vi.fn(async (id: string) => state.chunks.get(id)),
    putAll: vi.fn(async (chunks: NoiseFeatureChunk[]) =>
      chunks.forEach((chunk) => state.chunks.set(chunk.id, chunk))
    ),
  },
}));

vi.mock("../noiseHistoryLock", () => ({
  withNoiseHistoryWriteLock: async <T>(operation: () => Promise<T>) => operation(),
}));

vi.mock("../noiseRescoreService", () => ({ scheduleNoiseRescore: state.rescore }));

function session(): NoiseCaptureSession {
  return {
    schemaVersion: 1,
    id: "capture-a",
    captureSessionId: "capture-a",
    leaderEpoch: "epoch-a",
    producerId: "tab-a",
    startedAt: 1,
    endedAt: 61_000,
    endReason: "stopped",
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
    lastFrameSequence: 2,
    lastStartSample: 100,
  };
}

function chunk(): NoiseFeatureChunk {
  return {
    schemaVersion: 1,
    id: "capture-a:0",
    captureSessionId: "capture-a",
    leaderEpoch: "epoch-a",
    chunkSequence: 0,
    firstFrameSequence: 1,
    firstStartSample: 0,
    frameCount: 2,
    startAt: 1,
    endAt: 201,
    sealed: true,
    sequenceOffsets: new Uint32Array([0, 1]),
    startSampleOffsets: new Uint32Array([0, 100]),
    rmsDbfs: new Float32Array([-40, -41]),
    aWeightedDbfs: new Float32Array([-45, -46]),
    sampleP01Dbfs: new Float32Array([-60, -61]),
    zeroRatio: new Float32Array([0, 0]),
    clippedRatio: new Float32Array([0, 0]),
  };
}

describe(".icnoise v1", () => {
  beforeEach(() => {
    state.sessions.clear();
    state.chunks.clear();
    state.rescore.mockClear();
  });

  it("二进制往返保留 TypedArray 且明确不包含 PCM", async () => {
    state.sessions.set("capture-a", session());
    state.chunks.set("capture-a:0", chunk());
    const archive = await exportNoiseFeatureArchive();
    expect(archive.type).toBe("application/x-immersive-clock-noise-features");

    state.sessions.clear();
    state.chunks.clear();
    const result = await importNoiseFeatureArchive(archive);
    expect(result).toMatchObject({ sessionCount: 1, chunkCount: 1, frameCount: 2 });
    expect(state.chunks.get("capture-a:0")?.aWeightedDbfs).toEqual(new Float32Array([-45, -46]));
    expect(state.rescore).toHaveBeenCalled();
  });

  it("幂等预检只把缺失分块计入新增占用", async () => {
    state.sessions.set("capture-a", session());
    state.chunks.set("capture-a:0", chunk());
    const archive = await exportNoiseFeatureArchive();

    const preview = await preflightNoiseFeatureArchive(archive);

    expect(preview.requiredBytes).toBeGreaterThan(0);
    expect(preview.additionalBytes).toBe(0);
  });

  it("损坏文件在任何写入前被拒绝", async () => {
    await expect(importNoiseFeatureArchive(new Blob(["bad"]))).rejects.toThrow(".icnoise");
    expect(state.sessions.size).toBe(0);
    expect(state.chunks.size).toBe(0);
  });
});
