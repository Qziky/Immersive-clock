import {
  NOISE_FRAMES_PER_SECOND,
  NOISE_SCORE_UPDATE_SEC,
  NOISE_SCORE_WINDOW_SEC,
} from "../../constants/noise";
import {
  NOISE_SCORE_MODEL_VERSION,
  NOISE_SCORE_SCHEMA_VERSION,
  type NoiseCaptureSession,
  type NoiseCapturedFeatureFrame,
  type NoiseScoreWindow,
} from "../../types/noise";
import { computeSpectralActivityScore } from "../../utils/noiseScoreEngine";

export function buildNoiseScoreWindows(
  session: NoiseCaptureSession,
  sourceFrames: readonly NoiseCapturedFeatureFrame[]
): NoiseScoreWindow[] {
  const frames = sourceFrames
    .filter((frame) => frame.captureSessionId === session.captureSessionId)
    .slice()
    .sort((left, right) => left.startSample - right.startSample);
  const windows: NoiseScoreWindow[] = [];
  let windowSequence = 0;
  let windowStartIndex = 0;

  for (let endIndex = 0; endIndex < frames.length; endIndex += 1) {
    const endFrame = frames[endIndex]!;
    const endSample = endFrame.startSample + session.frameSamples;
    if (endSample < session.sampleRate * NOISE_SCORE_WINDOW_SEC) continue;
    if (endFrame.frameSequence % (NOISE_SCORE_UPDATE_SEC * NOISE_FRAMES_PER_SECOND) !== 0) continue;
    const windowStartSample = endSample - session.sampleRate * NOISE_SCORE_WINDOW_SEC;
    while (
      windowStartIndex < endIndex &&
      frames[windowStartIndex]!.startSample < windowStartSample
    ) {
      windowStartIndex += 1;
    }
    const windowFrames = frames.slice(windowStartIndex, endIndex + 1);
    const first = windowFrames[0];
    if (!first) continue;
    const computation = computeSpectralActivityScore(windowFrames, {
      sampleRate: session.sampleRate,
      frameSamples: session.frameSamples,
      endSample,
      processingDisabled: session.processingDisabled,
    });
    windowSequence += 1;
    windows.push({
      schemaVersion: NOISE_SCORE_SCHEMA_VERSION,
      id: `${NOISE_SCORE_MODEL_VERSION}:${session.captureSessionId}:${endFrame.frameSequence}`,
      modelVersion: NOISE_SCORE_MODEL_VERSION,
      captureSessionId: session.captureSessionId,
      leaderEpoch: session.leaderEpoch,
      windowSequence,
      sourceStartFrameSequence: first.frameSequence,
      sourceEndFrameSequence: endFrame.frameSequence,
      sourceStartSample: first.startSample,
      sourceEndSample: endSample,
      start: session.startedAt + (windowStartSample / session.sampleRate) * 1000,
      end: session.startedAt + (endSample / session.sampleRate) * 1000,
      score: computation.score,
      detail: computation.detail,
      signalHealth: computation.signalHealth,
      confidence: computation.confidence,
      estimated: null,
      sourceAvailable: true,
      featureCount: windowFrames.length,
      coverageRatio: computation.detail.coverageRatio,
    });
  }
  return windows;
}
