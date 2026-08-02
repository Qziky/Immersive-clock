import {
  NOISE_FEATURE_CHECKPOINT_SEC,
  NOISE_FEATURE_EXTRACTOR_VERSION,
  NOISE_FEATURE_WINDOW_MS,
  NOISE_FRAMES_PER_SECOND,
  NOISE_SCORE_UPDATE_SEC,
  NOISE_SCORE_WINDOW_SEC,
} from "../../constants/noise";
import { DEFAULT_NOISE_REPORT_RETENTION_DAYS } from "../../constants/noiseReport";
import {
  NOISE_FEATURE_SCHEMA_VERSION,
  NOISE_SCORE_MODEL_VERSION,
  NOISE_SCORE_SCHEMA_VERSION,
  NOISE_SESSION_SCHEMA_VERSION,
  type NoiseCalibrationProfile,
  type NoiseCalibrationProgress,
  type NoiseCaptureDiagnostics,
  type NoiseCapturedFeatureFrame,
  type NoiseCaptureEndReason,
  type NoiseCaptureSession as NoiseCaptureSessionRecord,
  type NoiseConfidence,
  type NoiseFeatureFrame,
  type NoiseFeatureSample,
  type NoiseMonitoringStatus,
  type NoisePersistenceStatus,
  type NoiseRealtimePoint,
  type NoiseScoringStatus,
  type NoiseSignalHealth,
  type NoiseSliceSummary,
  type NoiseTrackMetadata,
} from "../../types/noise";
import { computeSpectralActivityScore, quantile } from "../../utils/noiseScoreEngine";

import {
  BrowserAudioWorkletCaptureAdapter,
  type NoiseCaptureAdapter,
  type NoiseCaptureSession as BrowserCaptureSession,
} from "./noiseCapture";
import {
  clearNoiseCalibration,
  getNoiseCalibration,
  saveNoiseCalibration,
} from "./noiseDeviceProfileService";
import {
  appendNoiseFeatureFrames,
  createNoiseCaptureSession,
  deleteNoiseCaptureDataBefore,
  finishNoiseCaptureSession,
  readNoiseScoringResumeWindow,
  recoverAbandonedNoiseCaptureSessions,
  type NoiseScoringResumeWindow,
} from "./noiseFeatureRepository";
import { createNoiseRealtimeRingBuffer } from "./noiseRealtimeRingBuffer";
import { NoiseSignalHealthMonitor } from "./noiseSignalHealthMonitor";

const CALIBRATION_SECONDS = 10;

export interface NoiseRuntimeUpdate {
  status: NoiseMonitoringStatus;
  signalHealth: NoiseSignalHealth;
  confidence: NoiseConfidence;
  point: NoiseRealtimePoint | null;
  ringBuffer: NoiseRealtimePoint[];
  latestSlice: NoiseSliceSummary | null;
  captureSessionId: string;
  calibrationAvailable: boolean;
  calibration: NoiseCalibrationProgress;
  diagnostics: NoiseCaptureDiagnostics;
}

export interface NoiseCaptureRuntimeOptions {
  leaderEpoch: string;
  producerId?: string;
  preferredInputDeviceId?: string;
  scoreAlertThreshold: number;
  historyEnabled: boolean;
  onUpdate: (update: NoiseRuntimeUpdate) => void;
  onSlice: (slice: NoiseSliceSummary) => Promise<void>;
  onFatalTrackState: (
    health: Extract<NoiseSignalHealth, "track-muted" | "track-ended" | "audio-context-suspended">
  ) => void;
  captureAdapter?: NoiseCaptureAdapter;
}

interface CalibrationRequest {
  referenceDbA: number;
  frames: NoiseFeatureSample[];
  resolve: (calibration: NoiseCalibrationProfile) => void;
  reject: (error: Error) => void;
}

interface RuntimeScoringFrame extends NoiseFeatureFrame {
  sourceCaptureSessionId: string;
  sourceStartSample: number;
}

function createId(): string {
  return crypto.randomUUID?.() ?? `${Date.now()}:${Math.random().toString(16).slice(2)}`;
}

function energyAverageDb(values: readonly number[]): number {
  if (values.length === 0) return -160;
  const energy = values.reduce((sum, value) => sum + 10 ** (value / 10), 0) / values.length;
  return 10 * Math.log10(Math.max(1e-16, energy));
}

export class NoiseCaptureRuntime {
  readonly captureSessionId = createId();
  private capture: BrowserCaptureSession | null = null;
  private captureRecord: NoiseCaptureSessionRecord | null = null;
  private healthMonitor: NoiseSignalHealthMonitor | null = null;
  private metadata: NoiseTrackMetadata | null = null;
  private latestFeature: NoiseFeatureSample | null = null;
  private startedAt = Date.now();
  private stopped = false;
  private stopReason: NoiseCaptureEndReason = "stopped";
  private latestSlice: NoiseSliceSummary | null = null;
  private latestScore: number | null = null;
  private latestActivity: number | null = null;
  private scoreWindowSequence = 0;
  private scoreFrames: RuntimeScoringFrame[] = [];
  private scoringStartedAt = this.startedAt;
  private pendingPersistence: NoiseCapturedFeatureFrame[] = [];
  private persistenceFlush: Promise<void> = Promise.resolve();
  private persistenceWritable: boolean;
  private captureRecordStored = false;
  private persistence: NoisePersistenceStatus;
  private scoring: NoiseScoringStatus = {
    requiredSeconds: NOISE_SCORE_WINDOW_SEC,
    collectedSeconds: 0,
    progress: 0,
    validSecondCount: 0,
    coverageRatio: 0,
  };
  private lastScoringProgressSecond = -1;
  private calibrationRequest: CalibrationRequest | null = null;
  private calibrationProfile: NoiseCalibrationProfile | null = null;
  private calibrationProgress: NoiseCalibrationProgress = {
    status: "idle",
    progress: 0,
    error: null,
  };
  private readonly ringBuffer = createNoiseRealtimeRingBuffer({
    retentionMs: NOISE_SCORE_WINDOW_SEC * 1000,
    capacity: NOISE_SCORE_WINDOW_SEC * NOISE_FRAMES_PER_SECOND + 16,
  });
  private readonly captureAdapter: NoiseCaptureAdapter;

  constructor(private readonly options: NoiseCaptureRuntimeOptions) {
    this.captureAdapter = options.captureAdapter ?? new BrowserAudioWorkletCaptureAdapter();
    this.persistenceWritable = options.historyEnabled;
    this.persistence = {
      enabled: options.historyEnabled,
      available: options.historyEnabled,
      pendingFrames: 0,
      retainedBytes: null,
      error: null,
    };
  }

  async start(): Promise<void> {
    this.startedAt = Date.now();
    this.scoringStartedAt = this.startedAt;
    this.emit("initializing", "warming-up", "none", null);
    try {
      const pendingFrames: NoiseFeatureFrame[] = [];
      let ready = false;
      const capture = await this.captureAdapter.start({
        preferredInputDeviceId: this.options.preferredInputDeviceId,
        onFeature: (feature) => {
          if (ready) this.handleFeature(feature);
          else pendingFrames.push(feature);
        },
        onCaptureStateChange: (health) => {
          this.stopReason = health;
          this.emit("signal-unavailable", health, "none", null);
          this.options.onFatalTrackState(health);
        },
      });
      if (this.stopped) {
        await this.captureAdapter.stop(capture);
        return;
      }
      this.capture = capture;
      this.metadata = {
        ...capture.metadata,
        frameSamples:
          capture.metadata.frameSamples ??
          Math.max(1, Math.round((capture.metadata.sampleRate * NOISE_FEATURE_WINDOW_MS) / 1000)),
        channelMixMode: capture.metadata.channelMixMode ?? "arithmetic-mean",
      };
      this.healthMonitor = new NoiseSignalHealthMonitor(
        this.metadata.sampleRate,
        this.metadata.processingDisabled
      );
      this.calibrationProfile = getNoiseCalibration(this.metadata);
      this.captureRecord = {
        schemaVersion: NOISE_SESSION_SCHEMA_VERSION,
        id: this.captureSessionId,
        captureSessionId: this.captureSessionId,
        leaderEpoch: this.options.leaderEpoch,
        producerId: this.options.producerId ?? this.options.leaderEpoch,
        startedAt: this.startedAt,
        endedAt: null,
        endReason: null,
        sampleRate: this.metadata.sampleRate,
        frameSamples: this.metadata.frameSamples!,
        featureSchemaVersion: NOISE_FEATURE_SCHEMA_VERSION,
        extractorVersion: NOISE_FEATURE_EXTRACTOR_VERSION,
        deviceKey: this.metadata.deviceKey,
        persistentDeviceKey: this.metadata.persistentDeviceKey,
        channelCount: this.metadata.channelCount,
        channelMixMode: this.metadata.channelMixMode!,
        processingSignature: this.metadata.processingSignature,
        processingRequestedOff: this.metadata.processingRequestedOff,
        processingDisabled: this.metadata.processingDisabled,
        inputSettingsSampleRate: this.metadata.inputSettingsSampleRate ?? null,
        lastFrameSequence: 0,
        lastStartSample: -1,
      };
      let scoringResumeWindow: NoiseScoringResumeWindow | null = null;
      if (this.options.historyEnabled) {
        try {
          await recoverAbandonedNoiseCaptureSessions(this.startedAt);
          scoringResumeWindow = await readNoiseScoringResumeWindow(this.metadata, this.startedAt);
          await deleteNoiseCaptureDataBefore(
            Date.now() - DEFAULT_NOISE_REPORT_RETENTION_DAYS * 24 * 60 * 60 * 1000
          );
          void navigator.storage?.persist?.().catch(() => false);
          await createNoiseCaptureSession(this.captureRecord);
          this.captureRecordStored = true;
        } catch (error) {
          this.markPersistenceUnavailable(error, "无法创建原始帧会话");
        }
      }
      if (scoringResumeWindow) this.restoreScoringWindow(scoringResumeWindow);
      ready = true;
      pendingFrames.forEach((feature) => this.handleFeature(feature));
      this.emit("collecting", "warming-up", "none", null);
    } catch (error) {
      const code =
        error && typeof error === "object" && "code" in error
          ? String((error as { code?: unknown }).code)
          : null;
      this.stopReason = code === "permission-denied" ? "permission-denied" : "error";
      this.emit(
        code === "permission-denied" ? "permission-denied" : "error",
        "track-ended",
        "none",
        null
      );
      throw error;
    }
  }

  async stop(): Promise<void> {
    if (this.stopped) return;
    this.stopped = true;
    if (this.calibrationRequest) {
      this.calibrationRequest.reject(new Error("校准因采集停止而取消"));
      this.calibrationRequest = null;
    }
    try {
      await this.flushPersistence(true);
      if (this.captureRecordStored && this.captureRecord) {
        try {
          await finishNoiseCaptureSession(this.captureRecord, Date.now(), this.stopReason);
        } catch (error) {
          this.markPersistenceUnavailable(error, "无法封存原始帧会话");
        }
      }
    } finally {
      await this.captureAdapter.stop(this.capture);
      this.capture = null;
    }
  }

  calibrate(referenceDbA: number): Promise<NoiseCalibrationProfile> {
    if (!Number.isFinite(referenceDbA) || referenceDbA < 30 || referenceDbA > 120) {
      return Promise.reject(new RangeError("参考声级必须在 30–120 dB(A) 之间"));
    }
    if (!this.metadata) return Promise.reject(new Error("请等待麦克风初始化完成后再校准"));
    if (!this.metadata.processingDisabled) {
      return Promise.reject(new Error("当前设备仍启用了系统音频处理，无法建立可信校准"));
    }
    if (this.calibrationRequest) return Promise.reject(new Error("校准正在进行"));
    this.calibrationProgress = { status: "collecting", progress: 0, error: null };
    return new Promise((resolve, reject) => {
      this.calibrationRequest = { referenceDbA, frames: [], resolve, reject };
      this.emitCurrent();
    });
  }

  clearCalibration(): void {
    if (!this.metadata) return;
    clearNoiseCalibration(this.metadata);
    this.calibrationProfile = null;
    this.calibrationProgress = { status: "idle", progress: 0, error: null };
    this.emitCurrent();
  }

  private handleFeature(feature: NoiseFeatureFrame): void {
    if (this.stopped || !this.healthMonitor || !this.metadata || !this.captureRecord) return;
    const frameSequence = feature.frameSequence;
    if (frameSequence < 1) return;
    const normalized: NoiseCapturedFeatureFrame = {
      ...feature,
      frameSequence,
      leaderEpoch: this.options.leaderEpoch,
      captureSessionId: this.captureSessionId,
    };
    const health = this.healthMonitor.ingest(normalized);
    const sample: NoiseFeatureSample = {
      ...normalized,
      t:
        this.startedAt +
        ((normalized.startSample + this.metadata.frameSamples!) / this.metadata.sampleRate) * 1000,
      health: health.health,
      confidence: health.confidence,
    };
    const scoringFrame: RuntimeScoringFrame = {
      ...sample,
      startSample: this.toScoringSample(
        this.startedAt + (normalized.startSample / this.metadata.sampleRate) * 1000
      ),
      sourceCaptureSessionId: this.captureSessionId,
      sourceStartSample: normalized.startSample,
    };
    this.latestFeature = sample;
    this.collectCalibration(sample);
    this.scoreFrames.push(scoringFrame);
    const endSample = normalized.startSample + this.metadata.frameSamples!;
    const scoringEndSample = scoringFrame.startSample + this.metadata.frameSamples!;
    this.trimScoringFrames(scoringEndSample);
    const progressComputation = this.updateScoringStatus(scoringEndSample, sample.t);
    if (this.persistenceWritable) {
      this.pendingPersistence.push(normalized);
      this.persistence.pendingFrames = this.pendingPersistence.length;
      const checkpointFrames = NOISE_FEATURE_CHECKPOINT_SEC * NOISE_FRAMES_PER_SECOND;
      if (this.pendingPersistence.length >= checkpointFrames) void this.flushPersistence(false);
    }

    let slice: NoiseSliceSummary | null = null;
    if (
      this.scoring.collectedSeconds >= NOISE_SCORE_WINDOW_SEC &&
      frameSequence % (NOISE_SCORE_UPDATE_SEC * NOISE_FRAMES_PER_SECOND) === 0
    ) {
      const computation =
        progressComputation ??
        computeSpectralActivityScore(this.scoreFrames, {
          sampleRate: this.metadata.sampleRate,
          frameSamples: this.metadata.frameSamples!,
          endSample: scoringEndSample,
          processingDisabled: this.metadata.processingDisabled,
        });
      this.latestScore = computation.score;
      this.latestActivity = computation.frameActivity;
      if (endSample >= this.metadata.sampleRate * NOISE_SCORE_WINDOW_SEC) {
        slice = this.createScoreWindow(computation, endSample);
        this.latestSlice = slice;
        if (this.options.historyEnabled) void this.commitSlice(slice);
      }
    }

    const estimatedDbA = this.calibrationProfile
      ? sample.aWeightedDbfs + this.calibrationProfile.offsetDb
      : null;
    const point: NoiseRealtimePoint = {
      t: sample.t,
      dbfsA: sample.aWeightedDbfs,
      activity: this.latestActivity,
      quietnessScore: this.latestScore,
      estimatedDbA,
      signalHealth: sample.health,
      confidence: this.latestScore === null ? "none" : sample.confidence,
    };
    this.ringBuffer.push(point);
    const status =
      sample.health === "signal-anomaly" && sample.confidence === "none"
        ? "signal-unavailable"
        : this.latestScore === null
          ? "collecting"
          : this.latestScore < this.options.scoreAlertThreshold
            ? "noisy"
            : "quiet";
    this.emit(status, sample.health, point.confidence, point);
  }

  private updateScoringStatus(
    endSample: number,
    endedAt: number
  ): ReturnType<typeof computeSpectralActivityScore> | null {
    const metadata = this.metadata!;
    const elapsedSeconds = Math.max(0, (endedAt - this.scoringStartedAt) / 1000);
    this.scoring.collectedSeconds = Math.min(NOISE_SCORE_WINDOW_SEC, elapsedSeconds);
    this.scoring.progress = Math.min(
      100,
      (this.scoring.collectedSeconds / NOISE_SCORE_WINDOW_SEC) * 100
    );
    const elapsedWholeSecond = Math.floor(elapsedSeconds);
    if (elapsedWholeSecond === this.lastScoringProgressSecond) return null;
    this.lastScoringProgressSecond = elapsedWholeSecond;
    const computation = computeSpectralActivityScore(this.scoreFrames, {
      sampleRate: metadata.sampleRate,
      frameSamples: metadata.frameSamples!,
      endSample,
      processingDisabled: metadata.processingDisabled,
    });
    this.scoring.validSecondCount = computation.detail.validSecondCount;
    this.scoring.coverageRatio = computation.detail.coverageRatio;
    if (computation.frameActivity !== null) this.latestActivity = computation.frameActivity;
    return computation;
  }

  private createScoreWindow(
    computation: ReturnType<typeof computeSpectralActivityScore>,
    endSample: number
  ): NoiseSliceSummary {
    const metadata = this.metadata!;
    const sourceFrames = this.scoreFrames.filter(
      (frame) => frame.sourceCaptureSessionId === this.captureSessionId
    );
    const first = sourceFrames[0]!;
    const last = sourceFrames[sourceFrames.length - 1]!;
    const start =
      this.startedAt +
      ((endSample - metadata.sampleRate * NOISE_SCORE_WINDOW_SEC) / metadata.sampleRate) * 1000;
    const end = this.startedAt + (endSample / metadata.sampleRate) * 1000;
    this.scoreWindowSequence += 1;
    const aWeighted = sourceFrames.map((frame) => frame.aWeightedDbfs);
    const estimated = this.calibrationProfile
      ? {
          calibrationId: this.calibrationProfile.id,
          avgDbA: energyAverageDb(aWeighted) + this.calibrationProfile.offsetDb,
          p95DbA: quantile(aWeighted, 0.95) + this.calibrationProfile.offsetDb,
        }
      : null;
    const scoreDetail = computation.detail;
    return {
      schemaVersion: NOISE_SCORE_SCHEMA_VERSION,
      id: `${NOISE_SCORE_MODEL_VERSION}:${this.captureSessionId}:${last.frameSequence}`,
      modelVersion: NOISE_SCORE_MODEL_VERSION,
      captureSessionId: this.captureSessionId,
      leaderEpoch: this.options.leaderEpoch,
      windowSequence: this.scoreWindowSequence,
      sourceStartFrameSequence: first.frameSequence,
      sourceEndFrameSequence: last.frameSequence,
      sourceStartSample: first.sourceStartSample,
      sourceEndSample: endSample,
      start,
      end,
      score: computation.score,
      detail: scoreDetail,
      signalHealth: computation.signalHealth,
      confidence: computation.confidence,
      estimated,
      sourceAvailable: true,
      featureCount: sourceFrames.length,
      coverageRatio: computation.detail.coverageRatio,
    };
  }

  private restoreScoringWindow(window: NoiseScoringResumeWindow): void {
    if (!this.metadata || window.frames.length === 0) return;
    this.scoringStartedAt = Math.min(window.startedAt, this.startedAt);
    this.scoreFrames = window.frames.map((frame) => ({
      ...frame,
      startSample: this.toScoringSample(frame.capturedAt),
      sourceCaptureSessionId: frame.captureSessionId,
      sourceStartSample: frame.startSample,
    }));
    const endSample = this.toScoringSample(this.startedAt);
    this.trimScoringFrames(endSample);
    const computation = this.updateScoringStatus(endSample, this.startedAt);
    if (this.scoring.collectedSeconds < NOISE_SCORE_WINDOW_SEC || !computation) return;
    this.latestScore = computation.score;
    this.latestActivity = computation.frameActivity;
  }

  private toScoringSample(capturedAt: number): number {
    if (!this.metadata) return 0;
    return Math.max(
      0,
      Math.round(((capturedAt - this.scoringStartedAt) / 1000) * this.metadata.sampleRate)
    );
  }

  private trimScoringFrames(endSample: number): void {
    if (!this.metadata) return;
    const oldestSample = endSample - this.metadata.sampleRate * NOISE_SCORE_WINDOW_SEC;
    while (this.scoreFrames.length > 0 && this.scoreFrames[0]!.startSample < oldestSample) {
      this.scoreFrames.shift();
    }
  }

  private collectCalibration(sample: NoiseFeatureSample): void {
    const request = this.calibrationRequest;
    if (!request || !this.metadata) return;
    if (sample.health === "signal-anomaly" || sample.clippedRatio > 0.001) {
      this.failCalibration("校准期间检测到信号异常，请保持参考声源稳定后重试");
      return;
    }
    request.frames.push(sample);
    const target = CALIBRATION_SECONDS * NOISE_FRAMES_PER_SECOND;
    this.calibrationProgress = {
      status: "collecting",
      progress: Math.min(100, Math.round((request.frames.length / target) * 100)),
      error: null,
    };
    if (request.frames.length < target) return;
    const values = request.frames.map((frame) => frame.aWeightedDbfs);
    if (Math.max(...values) - Math.min(...values) > 2) {
      this.failCalibration("参考声场波动超过 2 dB，请保持参考声源稳定后重试");
      return;
    }
    const measuredDbfsA = quantile(values, 0.5);
    const calibration: NoiseCalibrationProfile = {
      id: createId(),
      referenceDbA: request.referenceDbA,
      measuredDbfsA,
      offsetDb: request.referenceDbA - measuredDbfsA,
      sampleRate: this.metadata.sampleRate,
      processingSignature: this.metadata.processingSignature,
      createdAt: Date.now(),
    };
    saveNoiseCalibration(this.metadata, calibration);
    this.calibrationProfile = calibration;
    this.calibrationRequest = null;
    this.calibrationProgress = { status: "complete", progress: 100, error: null };
    request.resolve(calibration);
  }

  private failCalibration(message: string): void {
    const request = this.calibrationRequest;
    if (!request) return;
    this.calibrationRequest = null;
    this.calibrationProgress = { status: "error", progress: 0, error: message };
    request.reject(new Error(message));
    this.emitCurrent();
  }

  private flushPersistence(seal: boolean): Promise<void> {
    if (!this.persistenceWritable || !this.captureRecord || this.pendingPersistence.length === 0) {
      return this.persistenceFlush;
    }
    const frames = this.pendingPersistence.splice(0);
    this.persistence.pendingFrames = 0;
    this.persistenceFlush = this.persistenceFlush.then(async () => {
      try {
        await appendNoiseFeatureFrames(this.captureRecord!, frames, { seal });
        this.persistence.available = true;
        this.persistence.error = null;
      } catch (error) {
        this.markPersistenceUnavailable(error, "原始特征帧写入失败");
      }
    });
    return this.persistenceFlush;
  }

  private markPersistenceUnavailable(error: unknown, fallback: string): void {
    this.persistenceWritable = false;
    this.pendingPersistence.length = 0;
    this.persistence.pendingFrames = 0;
    this.persistence.available = false;
    this.persistence.error = error instanceof Error ? error.message : fallback;
    this.emitCurrent();
  }

  private async commitSlice(slice: NoiseSliceSummary): Promise<void> {
    try {
      await this.persistenceFlush;
      if (!this.persistence.available) return;
      await this.options.onSlice(slice);
    } finally {
      this.emitCurrent();
    }
  }

  private emitCurrent(): void {
    const points = this.ringBuffer.snapshot();
    const point = points.length > 0 ? points[points.length - 1]! : null;
    const status =
      this.latestScore === null
        ? "collecting"
        : this.latestScore < this.options.scoreAlertThreshold
          ? "noisy"
          : "quiet";
    this.emit(status, point?.signalHealth ?? "warming-up", point?.confidence ?? "none", point);
  }

  private emit(
    status: NoiseMonitoringStatus,
    signalHealth: NoiseSignalHealth,
    confidence: NoiseConfidence,
    point: NoiseRealtimePoint | null
  ): void {
    this.options.onUpdate({
      status,
      signalHealth,
      confidence,
      point,
      ringBuffer: this.ringBuffer.snapshot(),
      latestSlice: this.latestSlice,
      captureSessionId: this.captureSessionId,
      calibrationAvailable: this.calibrationProfile !== null,
      calibration: this.calibrationProgress,
      diagnostics: {
        track: this.metadata,
        latestFeature: this.latestFeature,
        persistence: { ...this.persistence },
        scoring: { ...this.scoring },
      },
    });
  }
}
