import { NOISE_FEATURE_WINDOW_MS } from "../../constants/noise";
import type { NoiseFeatureFrame } from "../../types/noise";

const ZERO_SAMPLE_THRESHOLD = 1e-7;
const CLIPPED_SAMPLE_THRESHOLD = 0.999;
const MIN_DBFS = -160;

interface FirstOrderFilterState {
  b0: number;
  b1: number;
  a1: number;
  x1: number;
  y1: number;
}

function createFirstOrderFilter(
  sampleRate: number,
  cutoffHz: number,
  type: "highpass" | "lowpass"
): FirstOrderFilterState {
  const k = 2 * sampleRate;
  const warped = 2 * sampleRate * Math.tan((Math.PI * cutoffHz) / sampleRate);
  const denominator = k + warped;
  const b0 = type === "highpass" ? k / denominator : warped / denominator;
  return {
    b0,
    b1: type === "highpass" ? -b0 : b0,
    a1: (warped - k) / denominator,
    x1: 0,
    y1: 0,
  };
}

function getFilterMagnitude(
  filter: FirstOrderFilterState,
  frequencyHz: number,
  sampleRate: number
) {
  const omega = (2 * Math.PI * frequencyHz) / sampleRate;
  const cos = Math.cos(omega);
  const sin = Math.sin(omega);
  const numeratorReal = filter.b0 + filter.b1 * cos;
  const numeratorImaginary = -filter.b1 * sin;
  const denominatorReal = 1 + filter.a1 * cos;
  const denominatorImaginary = -filter.a1 * sin;
  return (
    Math.hypot(numeratorReal, numeratorImaginary) /
    Math.max(1e-12, Math.hypot(denominatorReal, denominatorImaginary))
  );
}

/** IEC A-weighting analogue pole layout, bilinear-transformed for the active sample rate. */
export class AWeightingFilter {
  private readonly filters: FirstOrderFilterState[];
  private readonly gain: number;

  constructor(private readonly sampleRate: number) {
    this.filters = [
      createFirstOrderFilter(sampleRate, 20.6, "highpass"),
      createFirstOrderFilter(sampleRate, 20.6, "highpass"),
      createFirstOrderFilter(sampleRate, 107.7, "highpass"),
      createFirstOrderFilter(sampleRate, 737.9, "highpass"),
      createFirstOrderFilter(sampleRate, 12_200, "lowpass"),
      createFirstOrderFilter(sampleRate, 12_200, "lowpass"),
    ];
    const magnitudeAt1Khz = this.filters.reduce(
      (magnitude, filter) => magnitude * getFilterMagnitude(filter, 1000, sampleRate),
      1
    );
    this.gain = 1 / Math.max(1e-12, magnitudeAt1Khz);
  }

  process(sample: number): number {
    let value = sample;
    for (const filter of this.filters) {
      const output = filter.b0 * value + filter.b1 * filter.x1 - filter.a1 * filter.y1;
      filter.x1 = value;
      filter.y1 = output;
      value = output;
    }
    return value * this.gain;
  }

  getMagnitudeAt(frequencyHz: number): number {
    return (
      this.filters.reduce(
        (magnitude, filter) => magnitude * getFilterMagnitude(filter, frequencyHz, this.sampleRate),
        1
      ) * this.gain
    );
  }
}

function amplitudeToDbfs(amplitude: number): number {
  return Math.max(MIN_DBFS, Math.min(0, 20 * Math.log10(Math.max(1e-12, amplitude))));
}

function sortedQuantile(values: Float32Array, percentile: number): number {
  const position = (values.length - 1) * Math.max(0, Math.min(1, percentile));
  const low = Math.floor(position);
  const high = Math.ceil(position);
  const lowValue = values[low] ?? 0;
  if (low === high) return lowValue;
  const weight = position - low;
  return lowValue * (1 - weight) + (values[high] ?? lowValue) * weight;
}

export interface NoiseFeatureExtractorOptions {
  sampleRate: number;
  windowMs?: number;
  onFeature: (feature: NoiseFeatureFrame) => void;
}

/** Converts PCM into compact feature frames; PCM is never retained after the current window. */
export class NoiseFeatureExtractor {
  private readonly filter: AWeightingFilter;
  private readonly windowSamples: number;
  private readonly absoluteSamples: Float32Array;
  private sumSquares = 0;
  private weightedSumSquares = 0;
  private zeroSamples = 0;
  private clippedSamples = 0;
  private samplesInWindow = 0;
  private processedSamples = 0;
  private sequence = 0;

  constructor(private readonly options: NoiseFeatureExtractorOptions) {
    this.filter = new AWeightingFilter(options.sampleRate);
    this.windowSamples = Math.max(
      1,
      Math.round((options.sampleRate * (options.windowMs ?? NOISE_FEATURE_WINDOW_MS)) / 1000)
    );
    this.absoluteSamples = new Float32Array(this.windowSamples);
  }

  process(samples: Float32Array): void {
    for (let index = 0; index < samples.length; index += 1) {
      const sample = samples[index] ?? 0;
      const absolute = Math.abs(sample);
      const weighted = this.filter.process(sample);
      this.sumSquares += sample * sample;
      this.weightedSumSquares += weighted * weighted;
      this.absoluteSamples[this.samplesInWindow] = absolute;
      if (absolute <= ZERO_SAMPLE_THRESHOLD) this.zeroSamples += 1;
      if (absolute >= CLIPPED_SAMPLE_THRESHOLD) this.clippedSamples += 1;
      this.samplesInWindow += 1;
      this.processedSamples += 1;

      if (this.samplesInWindow >= this.windowSamples) this.emitWindow();
    }
  }

  private emitWindow(): void {
    const sampleCount = this.samplesInWindow;
    const rms = Math.sqrt(this.sumSquares / sampleCount);
    const weightedRms = Math.sqrt(this.weightedSumSquares / sampleCount);
    this.absoluteSamples.sort();
    this.sequence += 1;
    this.options.onFeature({
      frameSequence: this.sequence,
      startSample: this.processedSamples - sampleCount,
      rmsDbfs: amplitudeToDbfs(rms),
      aWeightedDbfs: amplitudeToDbfs(weightedRms),
      sampleP01Dbfs: amplitudeToDbfs(sortedQuantile(this.absoluteSamples, 0.01)),
      zeroRatio: this.zeroSamples / sampleCount,
      clippedRatio: this.clippedSamples / sampleCount,
    });
    this.sumSquares = 0;
    this.weightedSumSquares = 0;
    this.zeroSamples = 0;
    this.clippedSamples = 0;
    this.samplesInWindow = 0;
  }
}
