import { NOISE_FRAMES_PER_SECOND } from "../../constants/noise";
import type { NoiseFeatureFrame, NoiseSignalHealth, NoiseTrackMetadata } from "../../types/noise";

// eslint-disable-next-line import/no-unresolved -- Vite resolves this AudioWorklet URL at build time.
import workletUrl from "./noiseAudioWorklet.ts?worker&url";
import { createNoiseDeviceIdentity } from "./noiseDeviceProfileService";
import { openNoiseInputStream } from "./noiseInputDeviceService";

export interface NoiseCaptureOptions {
  preferredInputDeviceId?: string;
  onFeature: (feature: NoiseFeatureFrame) => void;
  onCaptureStateChange?: (
    health: Extract<NoiseSignalHealth, "track-muted" | "track-ended" | "audio-context-suspended">
  ) => void;
}

export interface NoiseCaptureAdapter {
  start: (options: NoiseCaptureOptions) => Promise<NoiseCaptureSession>;
  stop: (session: NoiseCaptureSession | null | undefined) => Promise<void>;
}

export interface NoiseCaptureSession {
  audioContext: AudioContext;
  stream: MediaStream;
  source: MediaStreamAudioSourceNode;
  worklet: AudioWorkletNode;
  silentOutput: GainNode;
  metadata: NoiseTrackMetadata;
}

function readBooleanSetting(settings: MediaTrackSettings, key: string): boolean | undefined {
  const value = (settings as Record<string, unknown>)[key];
  return typeof value === "boolean" ? value : undefined;
}

export async function startNoiseCapture(
  options: NoiseCaptureOptions
): Promise<NoiseCaptureSession> {
  const AudioContextImpl =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextImpl) throw new Error("AudioContext not supported");

  const audioContext = new AudioContextImpl();
  try {
    const stream = await openNoiseInputStream(options.preferredInputDeviceId);
    const track = stream.getAudioTracks()[0];
    if (!track) throw new Error("No microphone audio track");
    const settings = track.getSettings();
    const identity = await createNoiseDeviceIdentity(settings, track.label);
    const processingValues = [
      readBooleanSetting(settings, "echoCancellation"),
      readBooleanSetting(settings, "noiseSuppression"),
      readBooleanSetting(settings, "autoGainControl"),
    ];
    const processingDisabled = processingValues.every((value) => value === false);
    const processingRequestedOff = true;
    const sampleRate = audioContext.sampleRate;
    const channelCount = settings.channelCount ?? 1;
    const processingSignature = JSON.stringify({
      autoGainControl: processingValues[2] ?? null,
      channelCount,
      echoCancellation: processingValues[0] ?? null,
      noiseSuppression: processingValues[1] ?? null,
      sampleRate,
    });

    await audioContext.audioWorklet.addModule(workletUrl);
    const source = audioContext.createMediaStreamSource(stream);
    const worklet = new AudioWorkletNode(audioContext, "immersive-clock-noise-feature-v2", {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      outputChannelCount: [1],
    });
    const silentOutput = audioContext.createGain();
    silentOutput.gain.value = 0;
    worklet.port.addEventListener("message", (event: MessageEvent<NoiseFeatureFrame>) => {
      options.onFeature(event.data);
    });
    worklet.port.start();
    source.connect(worklet);
    worklet.connect(silentOutput);
    silentOutput.connect(audioContext.destination);

    track.addEventListener("mute", () => options.onCaptureStateChange?.("track-muted"));
    track.addEventListener("ended", () => options.onCaptureStateChange?.("track-ended"));
    if (audioContext.state === "suspended") await audioContext.resume();
    audioContext.addEventListener("statechange", () => {
      if (audioContext.state === "suspended") {
        options.onCaptureStateChange?.("audio-context-suspended");
      }
    });

    return {
      audioContext,
      stream,
      source,
      worklet,
      silentOutput,
      metadata: {
        deviceKey: identity.deviceKey,
        persistentDeviceKey: identity.persistent,
        sampleRate,
        frameSamples: Math.max(1, Math.round(sampleRate / NOISE_FRAMES_PER_SECOND)),
        channelCount,
        processingSignature,
        processingRequestedOff,
        processingDisabled,
        channelMixMode: "arithmetic-mean",
        inputSettingsSampleRate: settings.sampleRate ?? null,
      },
    };
  } catch (error) {
    await stopNoiseCapture({ audioContext });
    const name =
      error && typeof error === "object" && "name" in error
        ? String((error as { name?: unknown }).name)
        : undefined;
    if (name === "NotAllowedError" || name === "SecurityError") {
      throw Object.assign(new Error("Microphone permission denied"), {
        code: "permission-denied",
      });
    }
    throw error;
  }
}

export async function stopNoiseCapture(
  session:
    | NoiseCaptureSession
    | { audioContext?: AudioContext | null; stream?: MediaStream | null }
    | null
    | undefined
): Promise<void> {
  try {
    session?.stream?.getTracks().forEach((track) => track.stop());
  } catch {
    // Resource cleanup is best effort.
  }
  try {
    const context = session?.audioContext;
    if (context && context.state !== "closed") await context.close();
  } catch {
    // Resource cleanup is best effort.
  }
}

export class BrowserAudioWorkletCaptureAdapter implements NoiseCaptureAdapter {
  start(options: NoiseCaptureOptions): Promise<NoiseCaptureSession> {
    return startNoiseCapture(options);
  }

  stop(session: NoiseCaptureSession | null | undefined): Promise<void> {
    return stopNoiseCapture(session);
  }
}
