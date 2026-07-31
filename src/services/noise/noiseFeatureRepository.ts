import { NOISE_FEATURE_CHUNK_SEC } from "../../constants/noise";
import * as noiseTypes from "../../types/noise";
import {
  commitNoiseFeatureCheckpoint,
  deleteNoiseSessionData,
  noiseCaptureSessionDb,
  noiseFeatureChunkDb,
} from "../../utils/db";

import { withNoiseHistoryWriteLock } from "./noiseHistoryLock";

type NoiseCaptureSession = noiseTypes.NoiseCaptureSession;
type NoiseCapturedFeatureFrame = noiseTypes.NoiseCapturedFeatureFrame;
type NoiseFeatureChunk = noiseTypes.NoiseFeatureChunk;

export interface NoiseFeatureRepositoryInspection {
  sessionCount: number;
  chunkCount: number;
  frameCount: number;
  bytes: number;
  oldestAt: number | null;
  newestAt: number | null;
}

function chunkId(sessionId: string, sequence: number): string {
  return `${sessionId}:${sequence}`;
}

function assertFrame(frame: NoiseCapturedFeatureFrame, session: NoiseCaptureSession): void {
  if (
    frame.captureSessionId !== session.captureSessionId ||
    frame.leaderEpoch !== session.leaderEpoch ||
    !Number.isSafeInteger(frame.frameSequence) ||
    frame.frameSequence < 1 ||
    !Number.isSafeInteger(frame.startSample) ||
    frame.startSample < 0 ||
    !Number.isFinite(frame.rmsDbfs) ||
    !Number.isFinite(frame.aWeightedDbfs) ||
    !Number.isFinite(frame.sampleP01Dbfs) ||
    !Number.isFinite(frame.zeroRatio) ||
    !Number.isFinite(frame.clippedRatio) ||
    frame.zeroRatio < 0 ||
    frame.zeroRatio > 1 ||
    frame.clippedRatio < 0 ||
    frame.clippedRatio > 1
  ) {
    throw new TypeError("无效的 100 ms 音频特征帧");
  }
}

function createChunk(
  session: NoiseCaptureSession,
  sequence: number,
  frames: readonly NoiseCapturedFeatureFrame[],
  sealed: boolean
): NoiseFeatureChunk {
  const first = frames[0]!;
  const firstSequence = first.frameSequence;
  const firstStartSample = first.startSample;
  const frameCount = frames.length;
  const sequenceOffsets = new Uint32Array(frameCount);
  const startSampleOffsets = new Uint32Array(frameCount);
  const rmsDbfs = new Float32Array(frameCount);
  const aWeightedDbfs = new Float32Array(frameCount);
  const sampleP01Dbfs = new Float32Array(frameCount);
  const zeroRatio = new Float32Array(frameCount);
  const clippedRatio = new Float32Array(frameCount);
  for (let index = 0; index < frameCount; index += 1) {
    const frame = frames[index]!;
    sequenceOffsets[index] = frame.frameSequence - firstSequence;
    startSampleOffsets[index] = frame.startSample - firstStartSample;
    rmsDbfs[index] = frame.rmsDbfs;
    aWeightedDbfs[index] = frame.aWeightedDbfs;
    sampleP01Dbfs[index] = frame.sampleP01Dbfs;
    zeroRatio[index] = frame.zeroRatio;
    clippedRatio[index] = frame.clippedRatio;
  }
  const startAt = session.startedAt + (firstStartSample / session.sampleRate) * 1000;
  const last = frames[frameCount - 1]!;
  const endAt =
    session.startedAt + ((last.startSample + session.frameSamples) / session.sampleRate) * 1000;
  return {
    schemaVersion: noiseTypes.NOISE_FEATURE_CHUNK_SCHEMA_VERSION,
    id: chunkId(session.captureSessionId, sequence),
    captureSessionId: session.captureSessionId,
    leaderEpoch: session.leaderEpoch,
    chunkSequence: sequence,
    firstFrameSequence: firstSequence,
    firstStartSample,
    frameCount,
    startAt,
    endAt,
    sealed,
    sequenceOffsets,
    startSampleOffsets,
    rmsDbfs,
    aWeightedDbfs,
    sampleP01Dbfs,
    zeroRatio,
    clippedRatio,
  };
}

function mergeChunks(
  session: NoiseCaptureSession,
  current: NoiseFeatureChunk,
  frames: readonly NoiseCapturedFeatureFrame[],
  sealed: boolean
): NoiseFeatureChunk {
  const existing = unpackNoiseFeatureChunk(current, session);
  return createChunk(session, current.chunkSequence, [...existing, ...frames], sealed);
}

export function unpackNoiseFeatureChunk(
  chunk: NoiseFeatureChunk,
  session: Pick<
    NoiseCaptureSession,
    "captureSessionId" | "leaderEpoch" | "sampleRate" | "frameSamples"
  >
): NoiseCapturedFeatureFrame[] {
  const frames: NoiseCapturedFeatureFrame[] = [];
  for (let index = 0; index < chunk.frameCount; index += 1) {
    frames.push({
      leaderEpoch: session.leaderEpoch,
      captureSessionId: session.captureSessionId,
      frameSequence: chunk.firstFrameSequence + (chunk.sequenceOffsets[index] ?? 0),
      startSample: chunk.firstStartSample + (chunk.startSampleOffsets[index] ?? 0),
      rmsDbfs: chunk.rmsDbfs[index] ?? -160,
      aWeightedDbfs: chunk.aWeightedDbfs[index] ?? -160,
      sampleP01Dbfs: chunk.sampleP01Dbfs[index] ?? -160,
      zeroRatio: chunk.zeroRatio[index] ?? 1,
      clippedRatio: chunk.clippedRatio[index] ?? 0,
    });
  }
  return frames;
}

export async function createNoiseCaptureSession(session: NoiseCaptureSession): Promise<void> {
  await withNoiseHistoryWriteLock(async () => {
    await noiseCaptureSessionDb.put(session);
  });
}

export async function appendNoiseFeatureFrames(
  session: NoiseCaptureSession,
  frames: readonly NoiseCapturedFeatureFrame[],
  options: { seal?: boolean } = {}
): Promise<NoiseFeatureChunk[]> {
  if (frames.length === 0) return [];
  const accepted = frames.slice().sort((left, right) => left.frameSequence - right.frameSequence);
  accepted.forEach((frame) => assertFrame(frame, session));

  return withNoiseHistoryWriteLock(async () => {
    const framesByChunk = new Map<number, NoiseCapturedFeatureFrame[]>();
    const previousChunkSequence =
      session.lastStartSample >= 0
        ? Math.floor(session.lastStartSample / (session.sampleRate * NOISE_FEATURE_CHUNK_SEC))
        : null;
    let lastSequence = session.lastFrameSequence;
    let lastSample = session.lastStartSample;
    for (const frame of accepted) {
      const sequence = frame.frameSequence;
      if (sequence <= lastSequence || frame.startSample <= lastSample) continue;
      const chunkSequence = Math.floor(
        frame.startSample / (session.sampleRate * NOISE_FEATURE_CHUNK_SEC)
      );
      const chunkFrames = framesByChunk.get(chunkSequence) ?? [];
      chunkFrames.push(frame);
      framesByChunk.set(chunkSequence, chunkFrames);
      lastSequence = sequence;
      lastSample = frame.startSample;
    }
    if (framesByChunk.size === 0) return [];

    const lastChunkSequence = Math.max(...framesByChunk.keys());
    const chunks: NoiseFeatureChunk[] = [];
    for (const [chunkSequence, chunkFrames] of framesByChunk) {
      const current = await noiseFeatureChunkDb.get<NoiseFeatureChunk>(
        chunkId(session.captureSessionId, chunkSequence)
      );
      if (current?.sealed) throw new Error("已封存的音频特征分块不可追加");
      const sealed = options.seal === true || chunkSequence < lastChunkSequence;
      chunks.push(
        current
          ? mergeChunks(session, current, chunkFrames, sealed)
          : createChunk(session, chunkSequence, chunkFrames, sealed)
      );
    }
    if (
      previousChunkSequence !== null &&
      previousChunkSequence < lastChunkSequence &&
      !framesByChunk.has(previousChunkSequence)
    ) {
      const previous = await noiseFeatureChunkDb.get<NoiseFeatureChunk>(
        chunkId(session.captureSessionId, previousChunkSequence)
      );
      if (previous && !previous.sealed) chunks.push({ ...previous, sealed: true });
    }
    const nextSession = {
      ...session,
      lastFrameSequence: lastSequence,
      lastStartSample: lastSample,
    };
    await commitNoiseFeatureCheckpoint(nextSession, chunks);
    session.lastFrameSequence = lastSequence;
    session.lastStartSample = lastSample;
    return chunks;
  });
}

export async function finishNoiseCaptureSession(
  session: NoiseCaptureSession,
  endedAt: number,
  endReason: NoiseCaptureSession["endReason"]
): Promise<void> {
  await withNoiseHistoryWriteLock(async () => {
    const chunks = await noiseFeatureChunkDb.list<NoiseFeatureChunk>({
      captureSessionId: session.captureSessionId,
    });
    const sealedChunks = chunks.map((chunk) => (chunk.sealed ? chunk : { ...chunk, sealed: true }));
    await commitNoiseFeatureCheckpoint({ ...session, endedAt, endReason }, sealedChunks);
  });
}

export async function recoverAbandonedNoiseCaptureSessions(now = Date.now()): Promise<number> {
  return withNoiseHistoryWriteLock(async () => {
    const sessions = await noiseCaptureSessionDb.list<NoiseCaptureSession>();
    const abandoned = sessions.filter((session) => session.endedAt === null);
    for (const session of abandoned) {
      const chunks = await noiseFeatureChunkDb.list<NoiseFeatureChunk>({
        captureSessionId: session.captureSessionId,
      });
      const endedAt =
        session.lastStartSample >= 0
          ? session.startedAt +
            ((session.lastStartSample + session.frameSamples) / session.sampleRate) * 1000
          : Math.min(now, session.startedAt);
      await commitNoiseFeatureCheckpoint(
        {
          ...session,
          endedAt: Math.min(now, endedAt),
          endReason: "recovered-after-crash",
        },
        chunks.map((chunk) => (chunk.sealed ? chunk : { ...chunk, sealed: true }))
      );
    }
    return abandoned.length;
  });
}

export async function deleteNoiseCaptureDataBefore(cutoff: number): Promise<number> {
  return withNoiseHistoryWriteLock(async () => {
    const sessions = await noiseCaptureSessionDb.list<NoiseCaptureSession>();
    const expired = sessions.filter(
      (session) => session.endedAt !== null && session.endedAt < cutoff
    );
    await deleteNoiseSessionData(expired.map((session) => session.captureSessionId));
    return expired.length;
  });
}

export async function listNoiseCaptureSessions(): Promise<NoiseCaptureSession[]> {
  return noiseCaptureSessionDb.list<NoiseCaptureSession>({ direction: "asc" });
}

export async function listNoiseFeatureChunks(sessionId: string): Promise<NoiseFeatureChunk[]> {
  const chunks = await noiseFeatureChunkDb.list<NoiseFeatureChunk>({ captureSessionId: sessionId });
  return chunks.sort((left, right) => left.chunkSequence - right.chunkSequence);
}

export async function readNoiseFeatureFrames(
  sessionId: string
): Promise<NoiseCapturedFeatureFrame[]> {
  const session = await noiseCaptureSessionDb.get<NoiseCaptureSession>(sessionId);
  if (!session) return [];
  const chunks = await listNoiseFeatureChunks(sessionId);
  return chunks.flatMap((chunk) => unpackNoiseFeatureChunk(chunk, session));
}

export async function clearNoiseCaptureData(): Promise<void> {
  await withNoiseHistoryWriteLock(async () => {
    await noiseFeatureChunkDb.clear();
    await noiseCaptureSessionDb.clear();
  });
}

export async function inspectNoiseFeatureData(): Promise<NoiseFeatureRepositoryInspection> {
  const sessions = await listNoiseCaptureSessions();
  const chunks = await noiseFeatureChunkDb.list<NoiseFeatureChunk>();
  const frameCount = chunks.reduce((sum, chunk) => sum + chunk.frameCount, 0);
  const bytes = chunks.reduce((sum, chunk) => {
    const arrays = [
      chunk.sequenceOffsets,
      chunk.startSampleOffsets,
      chunk.rmsDbfs,
      chunk.aWeightedDbfs,
      chunk.sampleP01Dbfs,
      chunk.zeroRatio,
      chunk.clippedRatio,
    ];
    return sum + arrays.reduce((total, array) => total + array.byteLength, 0);
  }, 0);
  return {
    sessionCount: sessions.length,
    chunkCount: chunks.length,
    frameCount,
    bytes,
    oldestAt:
      sessions.length > 0 ? Math.min(...sessions.map((session) => session.startedAt)) : null,
    newestAt:
      sessions.length > 0
        ? Math.max(...sessions.map((session) => session.endedAt ?? session.startedAt))
        : null,
  };
}
