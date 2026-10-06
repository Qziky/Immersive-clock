import { getRuntimePlatform } from "../utils/runtimePlatform";

import { withDevicePermissionRequest } from "./devicePermissionRequestQueue";

export type DynamicAudioSource = "microphone" | "computer";
export type DynamicAudioStatus = "idle" | "requesting" | "listening" | "suspended";

export interface DynamicAudioSnapshot {
  status: DynamicAudioStatus;
  source: DynamicAudioSource | null;
  message: string;
}

const listeners = new Set<() => void>();
let snapshot: DynamicAudioSnapshot = { status: "idle", source: null, message: "" };
let mediaStream: MediaStream | null = null;
let audioContext: AudioContext | null = null;
let analyser: AnalyserNode | null = null;
let startRevision = 0;
let detachTrackListeners: (() => void) | null = null;
let resumingContext: AudioContext | null = null;
let resumePromise: Promise<void> | null = null;

function publish(next: DynamicAudioSnapshot): void {
  snapshot = next;
  listeners.forEach((listener) => listener());
}

function platformCanCaptureComputerAudio(): boolean {
  if (getRuntimePlatform() === "android") return false;
  const browser = window as typeof window & { electronAPI?: { platform?: string } };
  if (getRuntimePlatform() === "electron") return browser.electronAPI?.platform === "win32";
  return Boolean(
    navigator.mediaDevices &&
    typeof Reflect.get(navigator.mediaDevices, "getDisplayMedia") === "function" &&
    window.isSecureContext
  );
}

function isDocumentHidden(): boolean {
  return document.visibilityState === "hidden";
}

function releaseCurrentSession(): void {
  startRevision += 1;
  detachTrackListeners?.();
  detachTrackListeners = null;
  const previousStream = mediaStream;
  const previousContext = audioContext;
  if (previousContext) previousContext.onstatechange = null;
  resumingContext = null;
  resumePromise = null;
  mediaStream = null;
  audioContext = null;
  analyser = null;
  if (previousStream) {
    previousStream.getTracks().forEach((track) => {
      track.onended = null;
      track.stop();
    });
  }
  if (previousContext && previousContext.state !== "closed") {
    void previousContext.close().catch(() => undefined);
  }
}

function isCurrentSession(context: AudioContext, revision: number): boolean {
  return revision === startRevision && audioContext === context && context.state !== "closed";
}

function markAudioContextSuspended(context: AudioContext, revision: number): void {
  if (!isCurrentSession(context, revision)) return;
  if (snapshot.status !== "listening" && snapshot.status !== "suspended") return;
  publish({
    ...snapshot,
    status: "suspended",
    message: "浏览器暂停了音频分析，请点击“恢复监听”重试",
  });
}

async function resumeAudioContext(context: AudioContext, revision: number): Promise<void> {
  if (!isCurrentSession(context, revision) || isDocumentHidden() || snapshot.status === "idle") {
    return;
  }

  try {
    if (context.state !== "running") {
      if (resumingContext !== context || !resumePromise) {
        resumingContext = context;
        resumePromise = context.resume().finally(() => {
          if (resumingContext === context) {
            resumingContext = null;
            resumePromise = null;
          }
        });
      }
      await resumePromise;
    }
  } catch {
    markAudioContextSuspended(context, revision);
    return;
  }

  if (!isCurrentSession(context, revision)) return;
  if (isDocumentHidden()) {
    if (context.state === "running") void context.suspend().catch(() => undefined);
    return;
  }
  if (context.state === "running" && snapshot.status === "suspended") {
    publish({ ...snapshot, status: "listening", message: "正在监听" });
  } else if (context.state !== "running") {
    markAudioContextSuspended(context, revision);
  }
}

function syncAudioContextVisibility(): void {
  const context = audioContext;
  if (!context || context.state === "closed") return;
  const revision = startRevision;
  if (isDocumentHidden()) {
    if (context.state === "running") void context.suspend().catch(() => undefined);
    return;
  }
  if (snapshot.status !== "idle") void resumeAudioContext(context, revision);
}

export function getDynamicAudioSnapshot(): DynamicAudioSnapshot {
  return snapshot;
}

export function subscribeDynamicAudio(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function canCaptureComputerAudio(): boolean {
  return platformCanCaptureComputerAudio();
}

export async function startDynamicAudioCapture(source: DynamicAudioSource): Promise<void> {
  releaseCurrentSession();
  const revision = startRevision;
  if (source === "computer" && !platformCanCaptureComputerAudio()) {
    publish({ status: "idle", source: null, message: "此环境不支持电脑音频监听" });
    throw new Error("此环境不支持电脑音频监听");
  }

  if (typeof window.AudioContext === "undefined") {
    publish({ status: "idle", source: null, message: "此设备不支持音频分析" });
    throw new Error("此设备不支持音频分析");
  }

  publish({ status: "requesting", source, message: "等待音频授权" });
  let capture: Promise<MediaStream>;
  let context: AudioContext;
  let openedStream: MediaStream | null = null;
  try {
    context = new window.AudioContext();
    audioContext = context;
    context.onstatechange = () => {
      if (
        isCurrentSession(context, revision) &&
        document.visibilityState === "visible" &&
        context.state === "suspended"
      ) {
        void resumeAudioContext(context, revision);
      }
    };
  } catch (error) {
    audioContext = null;
    publish({ status: "idle", source: null, message: "无法启动音频分析" });
    throw error;
  }
  try {
    capture =
      source === "microphone"
        ? withDevicePermissionRequest(() =>
            navigator.mediaDevices.getUserMedia({
              audio: {
                autoGainControl: false,
                echoCancellation: false,
                noiseSuppression: false,
              },
              video: false,
            })
          )
        : navigator.mediaDevices.getDisplayMedia({
            audio: true,
            video: { frameRate: 1, width: { max: 320 }, height: { max: 240 } },
          });
  } catch (error) {
    if (audioContext === context) audioContext = null;
    if (context.state !== "closed") void context.close();
    publish({ status: "idle", source: null, message: "无法启动音频授权" });
    throw error;
  }

  try {
    const stream = await capture;
    openedStream = stream;
    if (revision !== startRevision) {
      stream.getTracks().forEach((track) => track.stop());
      if (context.state !== "closed") void context.close();
      return;
    }
    const audioTracks = stream.getAudioTracks();
    if (audioTracks.length === 0) {
      stream.getTracks().forEach((track) => track.stop());
      if (context.state !== "closed") void context.close();
      if (audioContext === context) audioContext = null;
      publish({
        status: "idle",
        source: null,
        message: "未共享任何音轨，请重新选择带音频的标签页",
      });
      return;
    }
    stream.getVideoTracks().forEach((track) => {
      track.onended = null;
      track.stop();
    });
    mediaStream = stream;

    const sourceNodeValue = context.createMediaStreamSource(stream);
    const analyserValue = context.createAnalyser();
    const output = context.createGain();
    analyserValue.fftSize = 512;
    analyserValue.smoothingTimeConstant = 0.82;
    output.gain.value = 0;
    sourceNodeValue.connect(analyserValue);
    analyserValue.connect(output);
    output.connect(context.destination);
    const ended = () => {
      if (revision === startRevision) stopDynamicAudioCapture("音频共享已结束");
    };
    const mute = () => {
      if (revision === startRevision && snapshot.status === "listening") {
        publish({ ...snapshot, message: "音源暂时没有声音" });
      }
    };
    const unmute = () => {
      if (revision === startRevision && snapshot.status === "listening") {
        publish({ ...snapshot, message: "正在监听" });
      }
    };
    audioTracks.forEach((track) => {
      track.addEventListener("ended", ended);
      track.addEventListener("mute", mute);
      track.addEventListener("unmute", unmute);
    });
    detachTrackListeners = () =>
      audioTracks.forEach((track) => {
        track.removeEventListener("ended", ended);
        track.removeEventListener("mute", mute);
        track.removeEventListener("unmute", unmute);
      });
    if (audioTracks.some((track) => track.readyState === "ended")) {
      stopDynamicAudioCapture("音频共享已结束");
      return;
    }
    if (document.visibilityState === "hidden") void context.suspend();
    else await context.resume();
    if (revision !== startRevision) {
      stream.getTracks().forEach((track) => track.stop());
      void context.close();
      return;
    }
    mediaStream = stream;
    audioContext = context;
    analyser = analyserValue;
    publish({ status: "listening", source, message: "正在监听" });
  } catch (error) {
    if (revision !== startRevision) return;
    detachTrackListeners?.();
    detachTrackListeners = null;
    openedStream?.getTracks().forEach((track) => track.stop());
    if (mediaStream === openedStream) mediaStream = null;
    if (audioContext === context) {
      audioContext = null;
      analyser = null;
    }
    if (context.state !== "closed") void context.close().catch(() => undefined);
    const cancelled = error instanceof DOMException && error.name === "NotAllowedError";
    publish({
      status: "idle",
      source: null,
      message: cancelled ? "授权已取消或被拒绝" : "音频启动失败，请重试",
    });
    throw error;
  }
}

export function stopDynamicAudioCapture(message = "已停止监听"): void {
  releaseCurrentSession();
  publish({ status: "idle", source: null, message });
}

export function readDynamicAudioFrame(
  frequencyData: Uint8Array<ArrayBuffer>,
  waveformData: Uint8Array<ArrayBuffer>
): boolean {
  if (!analyser || snapshot.status !== "listening") {
    frequencyData.fill(0);
    waveformData.fill(128);
    return false;
  }
  analyser.getByteFrequencyData(frequencyData);
  analyser.getByteTimeDomainData(waveformData);
  return true;
}

if (typeof document !== "undefined" && typeof window !== "undefined") {
  document.addEventListener("visibilitychange", syncAudioContextVisibility);
  document.addEventListener("resume", syncAudioContextVisibility);
  window.addEventListener("focus", syncAudioContextVisibility);
  window.addEventListener("pageshow", syncAudioContextVisibility);
}
