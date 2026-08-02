import {
  NOISE_MIN_VALID_FRAMES_PER_SECOND,
  NOISE_MIN_VALID_SECONDS,
  NOISE_SCORE_DEFAULTS,
  NOISE_SCORE_WEIGHTS,
  NOISE_SCORE_WINDOW_SEC,
} from "../constants/noise";
import type {
  NoiseConfidence,
  NoiseFeatureFrame,
  NoiseScoreDetail,
  NoiseScoreQuality,
  NoiseSignalHealth,
} from "../types/noise";

export interface NoiseScoreSessionGeometry {
  sampleRate: number;
  frameSamples: number;
  startSample?: number;
  endSample?: number;
  processingDisabled?: boolean;
}

export interface SpectralActivityOptions {
  windowSeconds?: number;
  coverageRequired?: number;
  minValidFramesPerSecond?: number;
  minValidSeconds?: number;
}

export interface NoiseScoreComputation {
  score: number | null;
  detail: NoiseScoreDetail;
  secondActivities: Array<number | null>;
  validFrameCount: number;
  frameActivity: number | null;
  signalHealth: NoiseSignalHealth;
  confidence: NoiseConfidence;
}

function clamp(value: number, min = 0, max = 1): number {
  return Math.max(min, Math.min(max, value));
}

export function quantile(values: readonly number[], percentile: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const position = (sorted.length - 1) * clamp(percentile);
  const low = Math.floor(position);
  const high = Math.ceil(position);
  if (low === high) return sorted[low] ?? 0;
  const weight = position - low;
  return (sorted[low] ?? 0) * (1 - weight) + (sorted[high] ?? 0) * weight;
}

/** Maps the relative position of A-weighted energy between P01 and RMS to activity. */
export function computeFrameActivity(frame: NoiseFeatureFrame): number | null {
  const values = [
    frame.rmsDbfs,
    frame.aWeightedDbfs,
    frame.sampleP01Dbfs,
    frame.zeroRatio,
    frame.clippedRatio,
  ];
  if (!values.every(Number.isFinite)) return null;
  const denominator = frame.rmsDbfs - frame.sampleP01Dbfs;
  if (denominator <= Number.EPSILON) return 0;
  const k = clamp((frame.aWeightedDbfs - frame.sampleP01Dbfs) / denominator);
  const x = clamp((k - NOISE_SCORE_DEFAULTS.activityStartK) / NOISE_SCORE_DEFAULTS.activityRangeK);
  return x * x * (3 - 2 * x);
}

function findInvalidZeroSignalFrames(
  frames: readonly NoiseFeatureFrame[],
  geometry: NoiseScoreSessionGeometry
): Set<NoiseFeatureFrame> {
  const invalidFrames = new Set<NoiseFeatureFrame>();
  const ordered = [...frames].sort((left, right) => left.startSample - right.startSample);
  let run: NoiseFeatureFrame[] = [];
  const commit = () => {
    const first = run[0];
    const last = run[run.length - 1];
    if (
      first &&
      last &&
      last.startSample + geometry.frameSamples - first.startSample >= geometry.sampleRate * 3
    ) {
      run.forEach((frame) => invalidFrames.add(frame));
    }
    run = [];
  };
  for (const frame of ordered) {
    const previous = run[run.length - 1];
    if (
      frame.zeroRatio >= 0.95 &&
      (!previous || frame.startSample - previous.startSample <= geometry.frameSamples * 1.5)
    ) {
      run.push(frame);
    } else {
      commit();
      if (frame.zeroRatio >= 0.95) run.push(frame);
    }
  }
  commit();
  return invalidFrames;
}

function isClipped(frame: NoiseFeatureFrame): boolean {
  return frame.clippedRatio > 0.001;
}

function eventCount(secondActivities: readonly (number | null)[]): number {
  let count = 0;
  let inEvent = false;
  let lowRun = 0;
  let lastEventEnd = -Infinity;

  for (let index = 0; index < secondActivities.length; index += 1) {
    const activity = secondActivities[index];
    if (activity !== null && activity >= NOISE_SCORE_DEFAULTS.activityEnter) {
      if (!inEvent) {
        if (index - lastEventEnd > NOISE_SCORE_DEFAULTS.eventMergeGapSec) count += 1;
        inEvent = true;
      }
      lowRun = 0;
      continue;
    }
    if (!inEvent) continue;
    if (activity === null) {
      inEvent = false;
      lastEventEnd = index - 1;
      lowRun = 0;
      continue;
    }
    if (activity < NOISE_SCORE_DEFAULTS.activityExit) lowRun += 1;
    else lowRun = 0;
    if (lowRun >= 2) {
      inEvent = false;
      lastEventEnd = index - 1;
      lowRun = 0;
    }
  }
  return count;
}

function getQuality(
  frames: readonly NoiseFeatureFrame[],
  validSeconds: number,
  totalSeconds: number,
  processingDisabled: boolean | undefined
): NoiseScoreQuality {
  if (validSeconds < totalSeconds * NOISE_SCORE_DEFAULTS.coverageRequired) return "insufficient";
  if (!processingDisabled || frames.some(isClipped)) return "low";
  if (frames.some((frame) => frame.zeroRatio > 0.2)) return "medium";
  return "high";
}

function healthFor(
  hasSignalAnomaly: boolean,
  validSeconds: number,
  totalSeconds: number
): NoiseSignalHealth {
  if (validSeconds < totalSeconds * NOISE_SCORE_DEFAULTS.coverageRequired) {
    return "insufficient-coverage";
  }
  return hasSignalAnomaly ? "signal-anomaly" : "healthy";
}

export function computeSpectralActivityScore(
  frames: readonly NoiseFeatureFrame[],
  geometry: NoiseScoreSessionGeometry,
  options: SpectralActivityOptions = {}
): NoiseScoreComputation {
  const totalSeconds = Math.max(1, Math.round(options.windowSeconds ?? NOISE_SCORE_WINDOW_SEC));
  const minFrames = Math.max(
    1,
    Math.round(options.minValidFramesPerSecond ?? NOISE_MIN_VALID_FRAMES_PER_SECOND)
  );
  const minSeconds = Math.max(
    1,
    Math.round(options.minValidSeconds ?? Math.min(NOISE_MIN_VALID_SECONDS, totalSeconds))
  );
  const coverageRequired = clamp(options.coverageRequired ?? NOISE_SCORE_DEFAULTS.coverageRequired);
  const sampleRate = Math.max(1, geometry.sampleRate);
  const windowSamples = sampleRate * totalSeconds;
  const firstSample =
    geometry.endSample !== undefined
      ? geometry.endSample - windowSamples
      : frames.length > 0
        ? (frames[0]?.startSample ?? 0)
        : 0;
  const buckets: number[][] = Array.from({ length: totalSeconds }, () => []);
  let validFrameCount = 0;
  let latestActivity: number | null = null;
  const invalidZeroSignalFrames = findInvalidZeroSignalFrames(frames, geometry);

  for (const frame of frames) {
    if (invalidZeroSignalFrames.has(frame)) continue;
    const activity = computeFrameActivity(frame);
    if (activity === null) continue;
    const bucket = Math.floor((frame.startSample - firstSample) / sampleRate);
    if (bucket < 0 || bucket >= totalSeconds) continue;
    buckets[bucket]!.push(activity);
    validFrameCount += 1;
    latestActivity = activity;
  }

  const secondActivities = buckets.map((values) =>
    values.length >= minFrames ? quantile(values, 0.5) : null
  );
  const validSeconds = secondActivities.filter((value): value is number => value !== null).length;
  const coverageRatio = validSeconds / totalSeconds;
  const usableActivities = secondActivities.filter((value): value is number => value !== null);
  const activityMean =
    usableActivities.length > 0
      ? usableActivities.reduce((sum, value) => sum + value, 0) / usableActivities.length
      : 0;
  const activityFloor = quantile(usableActivities, 0.2);
  const segments = eventCount(secondActivities);
  const eventFactor = clamp(segments / NOISE_SCORE_DEFAULTS.eventCountAtMax);
  const score =
    validSeconds >= minSeconds && coverageRatio >= coverageRequired
      ? 100 *
        clamp(
          1 -
            NOISE_SCORE_WEIGHTS.activityMean * activityMean -
            NOISE_SCORE_WEIGHTS.activityFloor * activityFloor -
            NOISE_SCORE_WEIGHTS.eventFactor * eventFactor
        )
      : null;
  const quality = getQuality(frames, validSeconds, totalSeconds, geometry.processingDisabled);
  const detail: NoiseScoreDetail = {
    activityMean,
    activityFloor,
    eventFactor,
    eventCount: segments,
    durationMs: totalSeconds * 1000,
    sampledDurationMs: validSeconds * 1000,
    coverageRatio,
    validSecondCount: validSeconds,
    totalSecondCount: totalSeconds,
    quality,
    thresholdsUsed: {
      activityEnter: NOISE_SCORE_DEFAULTS.activityEnter,
      activityExit: NOISE_SCORE_DEFAULTS.activityExit,
      eventMergeGapSec: NOISE_SCORE_DEFAULTS.eventMergeGapSec,
      coverageRequired,
    },
  };

  return {
    score: score === null ? null : Math.round(score * 10) / 10,
    detail,
    secondActivities,
    validFrameCount,
    frameActivity: latestActivity,
    signalHealth: healthFor(
      invalidZeroSignalFrames.size > 0 || quality === "low",
      validSeconds,
      totalSeconds
    ),
    confidence:
      quality === "high"
        ? "high"
        : quality === "medium"
          ? "medium"
          : quality === "low"
            ? "low"
            : "none",
  };
}
