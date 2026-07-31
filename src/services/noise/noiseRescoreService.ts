import {
  NOISE_FEATURE_CHUNK_SEC,
  NOISE_FRAMES_PER_SECOND,
  NOISE_SCORE_MODEL_CONFIG_DIGEST,
  NOISE_SCORE_WINDOW_SEC,
} from "../../constants/noise";
import {
  NOISE_SCORE_MODEL_VERSION,
  type NoiseCaptureSession,
  type NoiseScoreWindow,
} from "../../types/noise";
import {
  deleteSupersededNoiseScores,
  noiseHistoryDb,
  noiseRescoreStateDb,
  type NoiseRescoreState,
} from "../../utils/db";

import { listNoiseCaptureSessions, readNoiseFeatureFrames } from "./noiseFeatureRepository";
import { withNoiseHistoryWriteLock } from "./noiseHistoryLock";
import { buildNoiseScoreWindows } from "./noiseRescoreCore";

export type { NoiseRescoreState } from "../../utils/db";

type Listener = (state: NoiseRescoreState | null) => void;

interface WorkerSessionMessage {
  type: "session";
  sessionId: string;
  chunkSequence: number;
  windows: NoiseScoreWindow[];
}

type WorkerMessage = WorkerSessionMessage | { type: "complete" } | { type: "error"; error: string };

const listeners = new Set<Listener>();
let running: Promise<void> | null = null;
let latestState: NoiseRescoreState | null = null;
let activeWorker: Worker | null = null;
let cancelWorkerRun: (() => void) | null = null;
let pauseRequested = false;

function emit(state: NoiseRescoreState): void {
  latestState = state;
  listeners.forEach((listener) => listener(state));
}

async function saveState(state: NoiseRescoreState): Promise<void> {
  await noiseRescoreStateDb.put(state);
  emit(state);
}

function createState(
  status: NoiseRescoreState["status"],
  sessions: readonly NoiseCaptureSession[],
  completedSessionIds: readonly string[],
  patch: Partial<NoiseRescoreState> = {}
): NoiseRescoreState {
  return {
    modelVersion: NOISE_SCORE_MODEL_VERSION,
    configDigest: NOISE_SCORE_MODEL_CONFIG_DIGEST,
    status,
    sessionId: null,
    chunkSequence: 0,
    completedSessionIds: [...completedSessionIds],
    completedSessionCount: completedSessionIds.length,
    totalSessionCount: sessions.length,
    updatedAt: Date.now(),
    error: null,
    ...patch,
  };
}

async function persistSessionResult(
  message: WorkerSessionMessage,
  sessions: readonly NoiseCaptureSession[],
  completed: Set<string>
): Promise<void> {
  await withNoiseHistoryWriteLock(() => noiseHistoryDb.putAll(message.windows));
  completed.add(message.sessionId);
  await saveState(
    createState("running", sessions, [...completed], {
      sessionId: message.sessionId,
      chunkSequence: message.chunkSequence,
    })
  );
}

async function runInWorker(
  sessions: readonly NoiseCaptureSession[],
  pending: readonly NoiseCaptureSession[],
  completed: Set<string>
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const worker = new Worker(new URL("./noiseRescore.worker.ts", import.meta.url), {
      type: "module",
    });
    activeWorker = worker;
    let writes = Promise.resolve();
    cancelWorkerRun = () => void writes.then(resolve, reject);
    worker.onmessage = (event: MessageEvent<WorkerMessage>) => {
      const message = event.data;
      if (message.type === "session") {
        writes = writes.then(() => persistSessionResult(message, sessions, completed));
        return;
      }
      if (message.type === "error") {
        void writes.finally(() => reject(new Error(message.error)));
        return;
      }
      void writes.then(resolve, reject);
    };
    worker.onerror = (event) => reject(new Error(event.message || "历史评分 Worker 异常"));
    worker.postMessage({
      type: "run",
      sessionIds: pending.map((session) => session.captureSessionId),
    });
  }).finally(() => {
    activeWorker?.terminate();
    activeWorker = null;
    cancelWorkerRun = null;
  });
}

async function runInline(
  sessions: readonly NoiseCaptureSession[],
  pending: readonly NoiseCaptureSession[],
  completed: Set<string>
): Promise<void> {
  for (const session of pending) {
    if (pauseRequested) return;
    const frames = await readNoiseFeatureFrames(session.captureSessionId);
    await persistSessionResult(
      {
        type: "session",
        sessionId: session.captureSessionId,
        chunkSequence: Math.max(
          0,
          Math.ceil(frames.length / (NOISE_FEATURE_CHUNK_SEC * NOISE_FRAMES_PER_SECOND)) - 1
        ),
        windows: buildNoiseScoreWindows(session, frames),
      },
      sessions,
      completed
    );
    await new Promise<void>((resolve) => globalThis.setTimeout(resolve, 0));
  }
}

async function run(reset: boolean): Promise<void> {
  const sessions = (await listNoiseCaptureSessions())
    .filter((session) => session.endedAt !== null)
    .sort((left, right) => right.startedAt - left.startedAt);
  const stored = await noiseRescoreStateDb.get(NOISE_SCORE_MODEL_VERSION);
  const scores = await noiseHistoryDb.list<NoiseScoreWindow>();
  const sessionsWithScores = new Set(
    scores
      .filter((score) => score.modelVersion === NOISE_SCORE_MODEL_VERSION)
      .map((score) => score.captureSessionId)
  );
  const completed = new Set(
    !reset && stored?.configDigest === NOISE_SCORE_MODEL_CONFIG_DIGEST
      ? stored.completedSessionIds.filter((sessionId) =>
          sessions.some((session) => session.captureSessionId === sessionId)
        )
      : []
  );
  for (const session of sessions) {
    const shouldHaveScore =
      session.lastStartSample + session.frameSamples >= session.sampleRate * NOISE_SCORE_WINDOW_SEC;
    if (shouldHaveScore && !sessionsWithScores.has(session.captureSessionId)) {
      completed.delete(session.captureSessionId);
    }
  }
  const pending = sessions.filter((session) => !completed.has(session.captureSessionId));
  pauseRequested = false;
  await saveState(createState("running", sessions, [...completed]));
  try {
    if (pending.length > 0) {
      if (typeof Worker === "function") await runInWorker(sessions, pending, completed);
      else await runInline(sessions, pending, completed);
    }
    if (pauseRequested) {
      await saveState(createState("paused", sessions, [...completed]));
      return;
    }
    await deleteSupersededNoiseScores(NOISE_SCORE_MODEL_VERSION);
    await saveState(createState("complete", sessions, [...completed]));
  } catch (error) {
    await saveState(
      createState("error", sessions, [...completed], {
        sessionId: latestState?.sessionId ?? null,
        chunkSequence: latestState?.chunkSequence ?? 0,
        error: error instanceof Error ? error.message : "历史评分重算失败",
      })
    );
  }
}

export function scheduleNoiseRescore(options: { reset?: boolean } = {}): Promise<void> {
  if (!running) {
    running = run(options.reset === true).finally(() => {
      running = null;
    });
  }
  return running;
}

export async function pauseNoiseRescore(): Promise<void> {
  pauseRequested = true;
  const activeRun = running;
  activeWorker?.terminate();
  activeWorker = null;
  cancelWorkerRun?.();
  cancelWorkerRun = null;
  if (activeRun) {
    await activeRun;
    return;
  }
  if (latestState) await saveState({ ...latestState, status: "paused", updatedAt: Date.now() });
}

export async function getNoiseRescoreState(): Promise<NoiseRescoreState | null> {
  latestState = (await noiseRescoreStateDb.get(NOISE_SCORE_MODEL_VERSION)) ?? null;
  return latestState;
}

export function subscribeNoiseRescoreState(listener: Listener): () => void {
  listeners.add(listener);
  listener(latestState);
  return () => listeners.delete(listener);
}
