/**
 * Noise data contracts are split into capture facts and derived score data.
 * Capture facts deliberately do not contain health, confidence, calibration or score fields.
 */
export const NOISE_FEATURE_SCHEMA_VERSION = 1 as const;
export const NOISE_SESSION_SCHEMA_VERSION = 1 as const;
export const NOISE_FEATURE_CHUNK_SCHEMA_VERSION = 1 as const;
export const NOISE_SCORE_SCHEMA_VERSION = 1 as const;
export const NOISE_SCORE_MODEL_VERSION = "spectral-activity-v2" as const;

export type NoiseConfidence = "high" | "medium" | "low" | "none";

export type NoiseSignalHealth =
  | "warming-up"
  | "healthy"
  | "below-range"
  | "signal-anomaly"
  | "track-muted"
  | "track-ended"
  | "audio-context-suspended"
  | "insufficient-coverage";

export type NoiseMonitoringRole = "leader" | "follower" | "none";

export type NoiseMonitoringStatus =
  | "disabled"
  | "electing"
  | "initializing"
  | "collecting"
  | "quiet"
  | "noisy"
  | "signal-unavailable"
  | "permission-denied"
  | "error";

export interface NoiseInputDevicePreference {
  deviceId: string;
  label: string;
}

/** The only values produced by the AudioWorklet for one 100 ms window. */
export interface NoiseFeatureFrame {
  frameSequence: number;
  startSample: number;
  rmsDbfs: number;
  aWeightedDbfs: number;
  sampleP01Dbfs: number;
  zeroRatio: number;
  clippedRatio: number;
}

/** Main-thread envelope used by the recorder and realtime scorer. */
export interface NoiseCapturedFeatureFrame extends NoiseFeatureFrame {
  leaderEpoch: string;
  captureSessionId: string;
}

export interface NoiseFeatureSample extends NoiseFeatureFrame {
  leaderEpoch?: string;
  captureSessionId?: string;
  t: number;
  health: NoiseSignalHealth;
  confidence: NoiseConfidence;
}

export interface NoiseTrackMetadata {
  deviceKey: string;
  persistentDeviceKey: boolean;
  sampleRate: number;
  frameSamples: number;
  channelCount: number;
  processingSignature: string;
  processingRequestedOff: boolean;
  processingDisabled: boolean;
  channelMixMode?: "arithmetic-mean";
  inputSettingsSampleRate?: number | null;
}

export type NoiseCaptureEndReason =
  | "stopped"
  | "leader-lost"
  | "track-muted"
  | "track-ended"
  | "audio-context-suspended"
  | "permission-denied"
  | "error"
  | "recovered-after-crash";

export interface NoiseCaptureSession {
  schemaVersion: typeof NOISE_SESSION_SCHEMA_VERSION;
  id: string;
  captureSessionId: string;
  leaderEpoch: string;
  producerId: string;
  startedAt: number;
  endedAt: number | null;
  endReason: NoiseCaptureEndReason | null;
  sampleRate: number;
  frameSamples: number;
  featureSchemaVersion: typeof NOISE_FEATURE_SCHEMA_VERSION;
  extractorVersion: "spectral-features-v1";
  deviceKey: string;
  persistentDeviceKey: boolean;
  channelCount: number;
  channelMixMode: "arithmetic-mean";
  processingSignature: string;
  processingRequestedOff: boolean;
  processingDisabled: boolean;
  inputSettingsSampleRate: number | null;
  lastFrameSequence: number;
  lastStartSample: number;
}

export interface NoiseFeatureChunk {
  schemaVersion: typeof NOISE_FEATURE_CHUNK_SCHEMA_VERSION;
  id: string;
  captureSessionId: string;
  leaderEpoch: string;
  chunkSequence: number;
  firstFrameSequence: number;
  firstStartSample: number;
  frameCount: number;
  startAt: number;
  endAt: number;
  sealed: boolean;
  sequenceOffsets: Uint32Array;
  startSampleOffsets: Uint32Array;
  rmsDbfs: Float32Array;
  aWeightedDbfs: Float32Array;
  sampleP01Dbfs: Float32Array;
  zeroRatio: Float32Array;
  clippedRatio: Float32Array;
}

export type NoiseScoreQuality = "high" | "medium" | "low" | "insufficient";

export interface NoiseScoreDetail {
  activityMean: number;
  activityFloor: number;
  eventFactor: number;
  eventCount: number;
  durationMs: number;
  sampledDurationMs: number;
  coverageRatio: number;
  validSecondCount: number;
  totalSecondCount: number;
  quality: NoiseScoreQuality;
  thresholdsUsed: {
    activityEnter: number;
    activityExit: number;
    eventMergeGapSec: number;
    coverageRequired: number;
  };
}

export interface NoiseScoreWindow {
  schemaVersion: typeof NOISE_SCORE_SCHEMA_VERSION;
  id: string;
  modelVersion: typeof NOISE_SCORE_MODEL_VERSION;
  captureSessionId: string;
  leaderEpoch: string;
  windowSequence: number;
  sourceStartFrameSequence: number;
  sourceEndFrameSequence: number;
  sourceStartSample: number;
  sourceEndSample: number;
  start: number;
  end: number;
  score: number | null;
  detail: NoiseScoreDetail;
  signalHealth: NoiseSignalHealth;
  confidence: NoiseConfidence;
  estimated: NoiseEstimatedStats | null;
  sourceAvailable: boolean;
  featureCount: number;
  coverageRatio: number;
}

export type NoiseSliceSummary = NoiseScoreWindow;

export interface NoiseCalibrationProfile {
  id: string;
  referenceDbA: number;
  measuredDbfsA: number;
  offsetDb: number;
  sampleRate: number;
  processingSignature: string;
  createdAt: number;
}

export interface NoiseEstimatedStats {
  calibrationId: string;
  avgDbA: number;
  p95DbA: number;
}

export interface NoiseCaptureDiagnostics {
  track: NoiseTrackMetadata | null;
  latestFeature: NoiseFeatureSample | null;
  persistence: NoisePersistenceStatus;
  scoring: NoiseScoringStatus;
}

export interface NoisePersistenceStatus {
  enabled: boolean;
  available: boolean;
  pendingFrames: number;
  retainedBytes: number | null;
  error: string | null;
}

export interface NoiseScoringStatus {
  requiredSeconds: number;
  collectedSeconds: number;
  progress: number;
  validSecondCount: number;
  coverageRatio: number;
}

export interface NoiseCalibrationProgress {
  status: "idle" | "collecting" | "complete" | "error";
  progress: number;
  error: string | null;
}

export interface NoiseRealtimePoint {
  t: number;
  dbfsA: number | null;
  activity: number | null;
  quietnessScore: number | null;
  estimatedDbA: number | null;
  signalHealth: NoiseSignalHealth;
  confidence: NoiseConfidence;
}

export interface NoiseMonitoringSnapshot {
  role: NoiseMonitoringRole;
  status: NoiseMonitoringStatus;
  signalHealth: NoiseSignalHealth;
  confidence: NoiseConfidence;
  quietnessScore: number | null;
  estimatedDbA: number | null;
  realtimeDbfsA: number | null;
  showRealtimeValue: boolean;
  primaryMetric: "quietness-score" | "estimated-dba";
  scoreAlertThreshold: number;
  alertSoundEnabled: boolean;
  leaderEpoch: string | null;
  captureSessionId: string | null;
  ringBuffer: NoiseRealtimePoint[];
  latestSlice: NoiseSliceSummary | null;
  calibrationAvailable: boolean;
  calibration: NoiseCalibrationProgress;
  diagnostics: NoiseCaptureDiagnostics;
}

export interface NoiseScoreBreakdown extends NoiseScoreDetail {}
