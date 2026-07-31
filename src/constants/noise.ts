export const NOISE_FEATURE_WINDOW_MS = 100;
export const NOISE_REALTIME_WINDOW_SEC = 60;
export const NOISE_SCORE_UPDATE_SEC = 5;
export const NOISE_FRAMES_PER_SECOND = 10;
export const NOISE_SCORE_WINDOW_SEC = 60;
export const NOISE_FEATURE_CHUNK_SEC = 60;
export const NOISE_FEATURE_CHECKPOINT_SEC = 5;
export const NOISE_MIN_VALID_FRAMES_PER_SECOND = 8;
export const NOISE_MIN_VALID_SECONDS = 48;
export const NOISE_WARMUP_SEC = 2;
export const NOISE_SIGNAL_ANOMALY_WINDOW_SEC = 3;
export const NOISE_MIN_COVERAGE_RATIO = 0.8;

export const NOISE_SCORE_DEFAULTS = {
  activityEnter: 0.78,
  activityExit: 0.4,
  activityStartK: 0.68,
  activityRangeK: 0.22,
  eventMergeGapSec: 3,
  eventCountAtMax: 15,
  coverageRequired: NOISE_MIN_COVERAGE_RATIO,
} as const;

export const NOISE_SCORE_MODEL_CONFIG_DIGEST =
  "spectral-activity-v2:k0.68:r0.22:e0.78:x0.40:g3:n15:c0.80:f8:s48:w60:u5";

export const NOISE_FEATURE_EXTRACTOR_VERSION = "spectral-features-v1" as const;
