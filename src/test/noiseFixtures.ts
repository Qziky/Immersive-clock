import {
  NOISE_SCORE_MODEL_VERSION,
  NOISE_SCORE_SCHEMA_VERSION,
  type NoiseScoreDetail,
  type NoiseSliceSummary,
} from "../types/noise";

export function createNoiseSliceFixture(
  overrides: Partial<NoiseSliceSummary> = {}
): NoiseSliceSummary {
  const start = overrides.start ?? 1_000;
  const end = overrides.end ?? start + 60_000;
  const sequence = overrides.windowSequence ?? 1;
  const captureSessionId = overrides.captureSessionId ?? "capture-test";
  const detail: NoiseScoreDetail = overrides.detail ?? {
    activityMean: 0.1,
    activityFloor: 0.05,
    eventFactor: 0.1,
    eventCount: 1,
    durationMs: end - start,
    sampledDurationMs: end - start,
    coverageRatio: 1,
    validSecondCount: 60,
    totalSecondCount: 60,
    quality: "high",
    thresholdsUsed: {
      activityEnter: 0.78,
      activityExit: 0.4,
      eventMergeGapSec: 3,
      coverageRequired: 0.8,
    },
  };
  return {
    schemaVersion: NOISE_SCORE_SCHEMA_VERSION,
    id: overrides.id ?? `${NOISE_SCORE_MODEL_VERSION}:${captureSessionId}:${sequence * 50}`,
    modelVersion: NOISE_SCORE_MODEL_VERSION,
    captureSessionId,
    leaderEpoch: "epoch-test",
    windowSequence: sequence,
    sourceStartFrameSequence: 1,
    sourceEndFrameSequence: 600,
    sourceStartSample: 0,
    sourceEndSample: 2_880_000,
    start,
    end,
    featureCount: 600,
    coverageRatio: detail.coverageRatio,
    signalHealth: "healthy",
    confidence: "high",
    estimated: null,
    score: 87.5,
    detail,
    sourceAvailable: true,
    ...overrides,
  };
}
