import {
  NOISE_FRAMES_PER_SECOND,
  NOISE_SIGNAL_ANOMALY_WINDOW_SEC,
  NOISE_WARMUP_SEC,
} from "../../constants/noise";
import type { NoiseConfidence, NoiseFeatureFrame, NoiseSignalHealth } from "../../types/noise";

export interface NoiseSignalHealthResult {
  health: NoiseSignalHealth;
  confidence: NoiseConfidence;
}

export class NoiseSignalHealthMonitor {
  private readonly frames: NoiseFeatureFrame[] = [];
  private totalSamples = 0;
  private readonly frameSamples: number;

  constructor(
    private readonly sampleRate: number,
    private readonly processingDisabled: boolean
  ) {
    this.frameSamples = Math.max(1, Math.round(sampleRate / NOISE_FRAMES_PER_SECOND));
  }

  private samples(): number {
    return this.frameSamples;
  }

  ingest(frame: NoiseFeatureFrame): NoiseSignalHealthResult {
    this.totalSamples += this.samples();
    this.frames.push(frame);
    const windowSamples = this.sampleRate * NOISE_SIGNAL_ANOMALY_WINDOW_SEC;
    let retainedSamples = this.frames.reduce((sum) => sum + this.samples(), 0);
    while (this.frames.length > 1 && retainedSamples - this.samples() >= windowSamples) {
      retainedSamples -= this.samples();
      this.frames.shift();
    }

    if (this.totalSamples < this.sampleRate * NOISE_WARMUP_SEC) {
      return { health: "warming-up", confidence: "none" };
    }

    let gateTruncationSuspected = false;
    if (retainedSamples >= windowSamples * 0.95) {
      const zeroRatio =
        this.frames.reduce((sum, item) => sum + item.zeroRatio * this.samples(), 0) /
        retainedSamples;
      if (zeroRatio >= 0.95) {
        return { health: "signal-anomaly", confidence: "none" };
      }
      const levels = this.frames.map((item) => item.aWeightedDbfs);
      const dynamicRange = Math.max(...levels) - Math.min(...levels);
      gateTruncationSuspected = zeroRatio >= 0.2 && dynamicRange >= 12;
    }

    const clippedRatio =
      this.frames.reduce((sum, item) => sum + item.clippedRatio * this.samples(), 0) /
      Math.max(1, retainedSamples);
    const belowRange = frame.aWeightedDbfs <= -90;
    if (!this.processingDisabled || gateTruncationSuspected) {
      return { health: "signal-anomaly", confidence: "low" };
    }
    if (clippedRatio > 0.001) {
      return { health: "signal-anomaly", confidence: "low" };
    }
    if (belowRange) return { health: "below-range", confidence: "medium" };
    return { health: "healthy", confidence: "high" };
  }
}
