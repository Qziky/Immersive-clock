import { NoiseFeatureExtractor } from "./noiseFeatureExtractor";

declare const sampleRate: number;
declare abstract class AudioWorkletProcessor {
  readonly port: MessagePort;
  abstract process(
    inputs: Float32Array[][],
    outputs: Float32Array[][],
    parameters: Record<string, Float32Array>
  ): boolean;
}
declare function registerProcessor(name: string, processorCtor: typeof AudioWorkletProcessor): void;

class NoiseFeatureProcessor extends AudioWorkletProcessor {
  private readonly extractor = new NoiseFeatureExtractor({
    sampleRate,
    onFeature: (feature) => this.port.postMessage(feature),
  });

  process(inputs: Float32Array[][]): boolean {
    const channels = inputs[0];
    if (!channels || channels.length === 0) return true;
    const first = channels[0];
    if (!first) return true;

    if (channels.length === 1) {
      this.extractor.process(first);
      return true;
    }

    const mixed = new Float32Array(first.length);
    for (let index = 0; index < mixed.length; index += 1) {
      let sum = 0;
      for (const channel of channels) sum += channel[index] ?? 0;
      mixed[index] = sum / channels.length;
    }
    this.extractor.process(mixed);
    return true;
  }
}

registerProcessor("immersive-clock-noise-feature-v2", NoiseFeatureProcessor);
