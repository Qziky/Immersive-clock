import { NOISE_FEATURE_CHUNK_SEC, NOISE_FRAMES_PER_SECOND } from "../../constants/noise";

import { listNoiseCaptureSessions, readNoiseFeatureFrames } from "./noiseFeatureRepository";
import { buildNoiseScoreWindows } from "./noiseRescoreCore";

interface RunMessage {
  type: "run";
  sessionIds: string[];
}

const workerScope = self as unknown as {
  onmessage: ((event: MessageEvent<RunMessage>) => void) | null;
  postMessage: (message: unknown) => void;
};

workerScope.onmessage = (event) => {
  if (event.data.type !== "run") return;
  void (async () => {
    try {
      const requested = new Set(event.data.sessionIds);
      const sessions = (await listNoiseCaptureSessions())
        .filter((session) => requested.has(session.captureSessionId) && session.endedAt !== null)
        .sort((left, right) => right.startedAt - left.startedAt);
      for (const session of sessions) {
        const frames = await readNoiseFeatureFrames(session.captureSessionId);
        workerScope.postMessage({
          type: "session",
          sessionId: session.captureSessionId,
          chunkSequence: Math.max(
            0,
            Math.ceil(frames.length / (NOISE_FEATURE_CHUNK_SEC * NOISE_FRAMES_PER_SECOND)) - 1
          ),
          windows: buildNoiseScoreWindows(session, frames),
        });
      }
      workerScope.postMessage({ type: "complete" });
    } catch (error) {
      workerScope.postMessage({
        type: "error",
        error: error instanceof Error ? error.message : "历史评分重算失败",
      });
    }
  })();
};
