import { beforeEach, describe, expect, it, vi } from "vitest";

import { NOISE_SCORE_MODEL_CONFIG_DIGEST, NOISE_SCORE_WINDOW_SEC } from "../../../constants/noise";
import {
  NOISE_SCORE_MODEL_VERSION,
  type NoiseCaptureSession,
  type NoiseCapturedFeatureFrame,
  type NoiseScoreWindow,
} from "../../../types/noise";
import type { NoiseRescoreState } from "../../../utils/db";

const stores = vi.hoisted(() => {
  const sessions: NoiseCaptureSession[] = [];
  const frames = new Map<string, NoiseCapturedFeatureFrame[]>();
  const scores = new Map<string, NoiseScoreWindow>();
  const states = new Map<string, NoiseRescoreState>();
  return {
    sessions,
    frames,
    scores,
    states,
    readFrames: vi.fn(async (sessionId: string) => structuredClone(frames.get(sessionId) ?? [])),
    deleteSuperseded: vi.fn(async (currentModelVersion: string) => {
      for (const [id, score] of scores) {
        if (score.modelVersion !== currentModelVersion) scores.delete(id);
      }
    }),
    historyDb: {
      list: vi.fn(async () => Array.from(scores.values()).map((score) => structuredClone(score))),
      putAll: vi.fn(async (records: NoiseScoreWindow[]) => {
        records.forEach((record) => scores.set(record.id, structuredClone(record)));
      }),
    },
    rescoreDb: {
      get: vi.fn(async (modelVersion: string) => structuredClone(states.get(modelVersion))),
      put: vi.fn(async (state: NoiseRescoreState) => {
        states.set(state.modelVersion, structuredClone(state));
      }),
    },
  };
});

vi.mock("../../../utils/db", () => ({
  deleteSupersededNoiseScores: stores.deleteSuperseded,
  noiseHistoryDb: stores.historyDb,
  noiseRescoreStateDb: stores.rescoreDb,
}));

vi.mock("../noiseFeatureRepository", () => ({
  listNoiseCaptureSessions: vi.fn(async () => structuredClone(stores.sessions)),
  readNoiseFeatureFrames: stores.readFrames,
}));

vi.mock("../noiseHistoryLock", () => ({
  withNoiseHistoryWriteLock: async <T>(operation: () => Promise<T>) => operation(),
}));

function createSession(id: string, startedAt: number): NoiseCaptureSession {
  return {
    schemaVersion: 1,
    id,
    captureSessionId: id,
    leaderEpoch: `epoch-${id}`,
    producerId: `producer-${id}`,
    startedAt,
    endedAt: startedAt + 65_000,
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
    lastFrameSequence: 650,
    lastStartSample: 64_900,
  };
}

function createFrames(session: NoiseCaptureSession): NoiseCapturedFeatureFrame[] {
  return Array.from({ length: 650 }, (_, index) => ({
    leaderEpoch: session.leaderEpoch,
    captureSessionId: session.captureSessionId,
    frameSequence: index + 1,
    startSample: index * session.frameSamples,
    rmsDbfs: -35,
    aWeightedDbfs: -36,
    sampleP01Dbfs: -60,
    zeroRatio: 0,
    clippedRatio: 0,
  }));
}

function createStoredScore(
  session: NoiseCaptureSession,
  options: { modelVersion?: string; sourceAvailable?: boolean; score?: number } = {}
): NoiseScoreWindow {
  const modelVersion = options.modelVersion ?? NOISE_SCORE_MODEL_VERSION;
  return {
    schemaVersion: 1,
    id: `${modelVersion}:${session.captureSessionId}:600`,
    modelVersion: modelVersion as typeof NOISE_SCORE_MODEL_VERSION,
    captureSessionId: session.captureSessionId,
    leaderEpoch: session.leaderEpoch,
    windowSequence: 1,
    sourceStartFrameSequence: 1,
    sourceEndFrameSequence: 600,
    sourceStartSample: 0,
    sourceEndSample: 60_000,
    start: session.startedAt,
    end: session.startedAt + 60_000,
    score: options.score ?? 1,
    detail: {
      activityMean: 1,
      activityFloor: 1,
      eventFactor: 1,
      eventCount: 10,
      durationMs: 60_000,
      sampledDurationMs: 60_000,
      validSecondCount: 60,
      totalSecondCount: 60,
      coverageRatio: 1,
      quality: "high",
      thresholdsUsed: {
        activityEnter: 0.78,
        activityExit: 0.4,
        eventMergeGapSec: 3,
        coverageRequired: 0.8,
      },
    },
    signalHealth: "healthy",
    confidence: "high",
    estimated: null,
    sourceAvailable: options.sourceAvailable ?? true,
    featureCount: 600,
    coverageRatio: 1,
  };
}

async function loadService() {
  vi.resetModules();
  vi.stubGlobal("Worker", undefined);
  return import("../noiseRescoreService");
}

describe("noiseRescoreService", () => {
  beforeEach(() => {
    stores.sessions.length = 0;
    stores.frames.clear();
    stores.scores.clear();
    stores.states.clear();
    vi.clearAllMocks();
  });

  it("删除全部派生评分后仅依靠原始帧完整重建", async () => {
    const session = createSession("capture-a", 1_000);
    stores.sessions.push(session);
    stores.frames.set(session.captureSessionId, createFrames(session));
    const service = await loadService();

    await service.scheduleNoiseRescore();

    expect(stores.scores.size).toBe(2);
    expect(Array.from(stores.scores.values()).map((score) => score.sourceEndFrameSequence)).toEqual(
      [600, 650]
    );
    expect(Array.from(stores.scores.values()).every((score) => score.sourceAvailable)).toBe(true);
    expect(await service.getNoiseRescoreState()).toMatchObject({
      status: "complete",
      completedSessionIds: [session.captureSessionId],
      completedSessionCount: 1,
      totalSessionCount: 1,
    });
  });

  it("暂停会等待当前会话写入完成并从会话检查点续跑", async () => {
    const older = createSession("capture-older", 1_000);
    const newer = createSession("capture-newer", 2_000);
    stores.sessions.push(older, newer);
    stores.frames.set(older.captureSessionId, createFrames(older));
    stores.frames.set(newer.captureSessionId, createFrames(newer));
    let releaseRead: (() => void) | undefined;
    stores.readFrames.mockImplementationOnce(
      (sessionId: string) =>
        new Promise((resolve) => {
          releaseRead = () => resolve(structuredClone(stores.frames.get(sessionId) ?? []));
        })
    );
    const service = await loadService();
    const run = service.scheduleNoiseRescore();
    await vi.waitFor(() => expect(stores.readFrames).toHaveBeenCalledWith(newer.captureSessionId));

    const pause = service.pauseNoiseRescore();
    releaseRead?.();
    await Promise.all([run, pause]);

    expect(await service.getNoiseRescoreState()).toMatchObject({
      status: "paused",
      completedSessionIds: [newer.captureSessionId],
    });
    expect(stores.readFrames).toHaveBeenCalledTimes(1);

    await service.scheduleNoiseRescore();
    expect(stores.readFrames).toHaveBeenLastCalledWith(older.captureSessionId);
    expect(await service.getNoiseRescoreState()).toMatchObject({
      status: "complete",
      completedSessionCount: 2,
    });
  });

  it("配置摘要变化时忽略旧检查点并覆盖当前模型评分", async () => {
    const session = createSession("capture-a", 1_000);
    stores.sessions.push(session);
    stores.frames.set(session.captureSessionId, createFrames(session));
    const staleScore = createStoredScore(session, { score: 1 });
    stores.scores.set(staleScore.id, staleScore);
    stores.states.set(NOISE_SCORE_MODEL_VERSION, {
      modelVersion: NOISE_SCORE_MODEL_VERSION,
      configDigest: "stale-config",
      status: "complete",
      sessionId: session.captureSessionId,
      chunkSequence: 1,
      completedSessionIds: [session.captureSessionId],
      completedSessionCount: 1,
      totalSessionCount: 1,
      updatedAt: 1,
      error: null,
    });
    const service = await loadService();

    await service.scheduleNoiseRescore();

    expect(stores.readFrames).toHaveBeenCalledWith(session.captureSessionId);
    expect(stores.scores.get(staleScore.id)?.score).not.toBe(1);
    expect((await service.getNoiseRescoreState())?.configDigest).toBe(
      NOISE_SCORE_MODEL_CONFIG_DIGEST
    );
  });

  it("完成后重复调度保持派生评分幂等", async () => {
    const session = createSession("capture-a", 1_000);
    stores.sessions.push(session);
    stores.frames.set(session.captureSessionId, createFrames(session));
    const service = await loadService();

    await service.scheduleNoiseRescore();
    await service.scheduleNoiseRescore();

    expect(stores.readFrames).toHaveBeenCalledTimes(1);
    expect(stores.scores.size).toBe(2);
  });

  it("新模型完成后删除全部旧模型缓存，不区分原始来源状态", async () => {
    const session = createSession("capture-a", 1_000);
    stores.sessions.push(session);
    stores.frames.set(session.captureSessionId, createFrames(session));
    const sourced = createStoredScore(session, { modelVersion: "relative-v2" });
    const imported = createStoredScore(session, {
      modelVersion: "imported-v1",
      sourceAvailable: false,
    });
    stores.scores.set(sourced.id, sourced);
    stores.scores.set(imported.id, imported);
    const service = await loadService();

    await service.scheduleNoiseRescore();

    expect(stores.scores.has(sourced.id)).toBe(false);
    expect(stores.scores.has(imported.id)).toBe(false);
  });

  it("锁定评分模型版本和参数摘要，参数变更必须同步升级版本", () => {
    expect({
      modelVersion: NOISE_SCORE_MODEL_VERSION,
      configDigest: NOISE_SCORE_MODEL_CONFIG_DIGEST,
      windowSeconds: NOISE_SCORE_WINDOW_SEC,
    }).toEqual({
      modelVersion: "spectral-activity-v2",
      configDigest: "spectral-activity-v2:k0.68:r0.22:e0.78:x0.40:g3:n15:c0.80:f8:s48:w60:u5",
      windowSeconds: 60,
    });
  });
});
