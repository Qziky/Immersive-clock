import {
  NOISE_FRAMES_PER_SECOND,
  NOISE_REALTIME_WINDOW_SEC,
  NOISE_SCORE_WINDOW_SEC,
} from "../../constants/noise";
import type {
  NoiseCaptureDiagnostics,
  NoiseMonitoringSnapshot,
  NoiseRealtimePoint,
} from "../../types/noise";
import { getNoiseControlSettings } from "../../utils/noiseControlSettings";
import { writeNoiseSlice } from "../../utils/noiseSliceService";
import { SETTINGS_EVENTS, subscribeSettingsEvent } from "../../utils/settingsEvents";

import { NoiseCaptureRuntime, type NoiseRuntimeUpdate } from "./noiseCaptureRuntime";
import { NoiseCoordinator, type NoiseLeadershipContext } from "./noiseCoordinator";
import { createNoiseRealtimeRingBuffer } from "./noiseRealtimeRingBuffer";
import {
  broadcastNoiseSyncMessage,
  createNoiseSyncMessage,
  getNoiseSyncSenderId,
  subscribeNoiseSync,
  type NoiseSharedSnapshot,
  type NoiseSyncMessage,
} from "./noiseSyncChannel";

export type NoiseStreamSnapshot = NoiseMonitoringSnapshot;
type Listener = () => void;

const STOP_DEBOUNCE_MS = 400;
const SNAPSHOT_BROADCAST_MS = 250;
const HEARTBEAT_MS = 1000;
const REMOTE_STALE_MS = 3000;
const COMMAND_TIMEOUT_MS = 20_000;

const listeners = new Set<Listener>();
let debugSessionCount = 0;
const followerRingBuffer = createNoiseRealtimeRingBuffer({
  retentionMs: NOISE_REALTIME_WINDOW_SEC * 1000,
  capacity: NOISE_REALTIME_WINDOW_SEC * NOISE_FRAMES_PER_SECOND + 16,
});
const pendingCommands = new Map<
  string,
  { resolve: () => void; reject: (error: Error) => void; timeout: number }
>();

function readSettings() {
  return getNoiseControlSettings();
}

function shouldMonitor(): boolean {
  return readSettings().monitoringEnabled || debugSessionCount > 0;
}

function createInitialSnapshot(): NoiseMonitoringSnapshot {
  const settings = readSettings();
  return {
    role: "none",
    status: settings.monitoringEnabled ? "electing" : "disabled",
    signalHealth: "warming-up",
    confidence: "none",
    quietnessScore: null,
    estimatedDbA: null,
    realtimeDbfsA: null,
    showRealtimeValue: settings.showRealtimeValue,
    autoHidePersistentAnomaly: settings.autoHidePersistentAnomaly,
    primaryMetric: settings.primaryMetric,
    scoreAlertThreshold: settings.scoreAlertThreshold,
    alertSoundEnabled: settings.alertSoundEnabled,
    leaderEpoch: null,
    captureSessionId: null,
    ringBuffer: [],
    latestSlice: null,
    calibrationAvailable: false,
    calibration: { status: "idle", progress: 0, error: null },
    diagnostics: {
      track: null,
      latestFeature: null,
      persistence: {
        enabled: settings.historyEnabled,
        available: settings.historyEnabled,
        pendingFrames: 0,
        retainedBytes: null,
        error: null,
      },
      scoring: {
        requiredSeconds: NOISE_SCORE_WINDOW_SEC,
        collectedSeconds: 0,
        progress: 0,
        validSecondCount: 0,
        coverageRatio: 0,
      },
    },
  };
}

function normalizeDiagnostics(
  diagnostics: Partial<NoiseCaptureDiagnostics> | null | undefined
): NoiseCaptureDiagnostics {
  return {
    track: diagnostics?.track ?? null,
    latestFeature: diagnostics?.latestFeature ?? null,
    persistence: diagnostics?.persistence ?? {
      enabled: false,
      available: false,
      pendingFrames: 0,
      retainedBytes: null,
      error: null,
    },
    scoring: diagnostics?.scoring ?? {
      requiredSeconds: NOISE_SCORE_WINDOW_SEC,
      collectedSeconds: 0,
      progress: 0,
      validSecondCount: 0,
      coverageRatio: 0,
    },
  };
}

let snapshot = createInitialSnapshot();
let coordinator: NoiseCoordinator | null = null;
let runtime: NoiseCaptureRuntime | null = null;
let syncUnsubscribe: (() => void) | null = null;
let settingsUnsubscribe: (() => void) | null = null;
let stopTimer: number | null = null;
let staleTimer: number | null = null;
let heartbeatTimer: number | null = null;
let snapshotTimer: number | null = null;
let latestRuntimeUpdate: NoiseRuntimeUpdate | null = null;
let remoteEpoch: string | null = null;
let remoteSequence = -1;
let lastRemoteHeartbeatAt = 0;
let outgoingSequence = 0;

function emit(): void {
  listeners.forEach((listener) => listener());
}

function patchSnapshot(patch: Partial<NoiseMonitoringSnapshot>): void {
  snapshot = { ...snapshot, ...patch };
  emit();
}

function pointToSnapshot(point: NoiseRealtimePoint | null): Partial<NoiseMonitoringSnapshot> {
  return {
    quietnessScore: point?.quietnessScore ?? null,
    estimatedDbA: point?.estimatedDbA ?? null,
    realtimeDbfsA: point?.dbfsA ?? null,
  };
}

function clearTimer(timer: number | null): void {
  if (timer !== null) window.clearTimeout(timer);
}

function cleanupSettingsSubscriptionIfIdle(): void {
  if (listeners.size > 0 || debugSessionCount > 0) return;
  settingsUnsubscribe?.();
  settingsUnsubscribe = null;
}

function sendHeartbeat(epoch: string): void {
  outgoingSequence += 1;
  broadcastNoiseSyncMessage(
    createNoiseSyncMessage({
      type: "heartbeat",
      leaderEpoch: epoch,
      sequence: outgoingSequence,
    })
  );
}

function sendSharedSnapshot(epoch: string): void {
  if (!latestRuntimeUpdate) return;
  outgoingSequence += 1;
  const payload: NoiseSharedSnapshot = {
    status: latestRuntimeUpdate.status,
    signalHealth: latestRuntimeUpdate.signalHealth,
    confidence: latestRuntimeUpdate.confidence,
    point: latestRuntimeUpdate.point,
    latestSlice: latestRuntimeUpdate.latestSlice,
    captureSessionId: latestRuntimeUpdate.captureSessionId,
    calibrationAvailable: latestRuntimeUpdate.calibrationAvailable,
    calibration: latestRuntimeUpdate.calibration,
    diagnostics: latestRuntimeUpdate.diagnostics,
  };
  broadcastNoiseSyncMessage(
    createNoiseSyncMessage({
      type: "snapshot",
      leaderEpoch: epoch,
      sequence: outgoingSequence,
      payload,
    })
  );
}

function scheduleSharedSnapshot(epoch: string): void {
  if (snapshotTimer !== null) return;
  snapshotTimer = window.setTimeout(() => {
    snapshotTimer = null;
    sendSharedSnapshot(epoch);
  }, SNAPSHOT_BROADCAST_MS);
}

async function runAsLeader(context: NoiseLeadershipContext): Promise<void> {
  followerRingBuffer.clear();
  outgoingSequence = 0;
  const settings = readSettings();
  const nextRuntime = new NoiseCaptureRuntime({
    leaderEpoch: context.epoch,
    producerId: getNoiseSyncSenderId(),
    preferredInputDeviceId: settings.preferredInputDevice?.deviceId,
    scoreAlertThreshold: settings.scoreAlertThreshold,
    historyEnabled: settings.monitoringEnabled && settings.historyEnabled,
    onUpdate: (update) => {
      if (!context.ownsLeadership()) return;
      latestRuntimeUpdate = update;
      patchSnapshot({
        role: "leader",
        status: update.status,
        signalHealth: update.signalHealth,
        confidence: update.confidence,
        ...pointToSnapshot(update.point),
        leaderEpoch: context.epoch,
        captureSessionId: update.captureSessionId,
        ringBuffer: update.ringBuffer,
        latestSlice: update.latestSlice,
        calibrationAvailable: update.calibrationAvailable,
        calibration: update.calibration,
        diagnostics: update.diagnostics,
      });
      scheduleSharedSnapshot(context.epoch);
    },
    onSlice: async (slice) => {
      if (!context.ownsLeadership() || slice.leaderEpoch !== context.epoch) return;
      await writeNoiseSlice(slice);
    },
    onFatalTrackState: () => coordinator?.releaseLeadership(),
  });
  runtime = nextRuntime;
  heartbeatTimer = window.setInterval(() => sendHeartbeat(context.epoch), HEARTBEAT_MS);
  sendHeartbeat(context.epoch);
  try {
    await nextRuntime.start();
  } catch {
    // Runtime already published the specific permission/error state; wait for retry or teardown.
  }
  await new Promise<void>((resolve) => {
    if (context.signal.aborted) resolve();
    else context.signal.addEventListener("abort", () => resolve(), { once: true });
  });
  clearTimer(snapshotTimer);
  snapshotTimer = null;
  if (heartbeatTimer !== null) window.clearInterval(heartbeatTimer);
  heartbeatTimer = null;
  await nextRuntime.stop();
  if (runtime === nextRuntime) runtime = null;
  latestRuntimeUpdate = null;
  broadcastNoiseSyncMessage(
    createNoiseSyncMessage({ type: "leader-release", leaderEpoch: context.epoch })
  );
}

function applySettings(restartLeader: boolean): void {
  const settings = readSettings();
  patchSnapshot({
    showRealtimeValue: settings.showRealtimeValue,
    autoHidePersistentAnomaly: settings.autoHidePersistentAnomaly,
    primaryMetric: settings.primaryMetric,
    scoreAlertThreshold: settings.scoreAlertThreshold,
    alertSoundEnabled: settings.alertSoundEnabled,
  });
  if (!shouldMonitor()) {
    void stopClient("disabled");
    return;
  }
  if (!coordinator) startClient();
  else if (restartLeader && snapshot.role === "leader") coordinator.releaseLeadership();
}

function acceptRemoteEpoch(message: Extract<NoiseSyncMessage, { type: "heartbeat" | "snapshot" }>) {
  if (snapshot.role === "leader") return false;
  const now = Date.now();
  if (remoteEpoch !== message.leaderEpoch) {
    if (remoteEpoch && now - lastRemoteHeartbeatAt <= REMOTE_STALE_MS) return false;
    remoteEpoch = message.leaderEpoch;
    remoteSequence = -1;
    followerRingBuffer.clear();
  }
  if (message.sequence <= remoteSequence) return false;
  remoteSequence = message.sequence;
  lastRemoteHeartbeatAt = now;
  return true;
}

async function handleCommand(message: Extract<NoiseSyncMessage, { type: "command" }>) {
  if (message.command === "settings-updated") {
    applySettings(true);
    return;
  }
  if (snapshot.role !== "leader" || !runtime) return;
  try {
    if (message.command === "retry") {
      broadcastNoiseSyncMessage(
        createNoiseSyncMessage({ type: "command-result", requestId: message.requestId, ok: true })
      );
      coordinator?.releaseLeadership();
      return;
    }
    if (message.command === "calibrate") {
      await runtime.calibrate(message.referenceDbA ?? Number.NaN);
    } else {
      runtime.clearCalibration();
    }
    broadcastNoiseSyncMessage(
      createNoiseSyncMessage({ type: "command-result", requestId: message.requestId, ok: true })
    );
  } catch (error) {
    broadcastNoiseSyncMessage(
      createNoiseSyncMessage({
        type: "command-result",
        requestId: message.requestId,
        ok: false,
        error: error instanceof Error ? error.message : "操作失败",
      })
    );
  }
}

function handleSyncMessage(message: NoiseSyncMessage): void {
  if (message.type === "command") {
    void handleCommand(message);
    return;
  }
  if (message.type === "command-result") {
    const pending = pendingCommands.get(message.requestId);
    if (!pending) return;
    window.clearTimeout(pending.timeout);
    pendingCommands.delete(message.requestId);
    if (message.ok) pending.resolve();
    else pending.reject(new Error(message.error ?? "操作失败"));
    return;
  }
  if (message.type === "leader-release") {
    if (message.leaderEpoch === remoteEpoch) {
      lastRemoteHeartbeatAt = 0;
      patchSnapshot({ status: "electing", leaderEpoch: null, captureSessionId: null });
    }
    return;
  }
  if (!acceptRemoteEpoch(message)) return;
  if (message.type === "heartbeat") {
    patchSnapshot({ role: "follower", leaderEpoch: message.leaderEpoch });
    return;
  }
  const point = message.payload.point;
  if (point) followerRingBuffer.push(point);
  patchSnapshot({
    role: "follower",
    status: message.payload.status,
    signalHealth: message.payload.signalHealth,
    confidence: message.payload.confidence,
    ...pointToSnapshot(point),
    leaderEpoch: message.leaderEpoch,
    captureSessionId: message.payload.captureSessionId,
    ringBuffer: followerRingBuffer.snapshot(),
    latestSlice: message.payload.latestSlice,
    calibrationAvailable: message.payload.calibrationAvailable,
    calibration: message.payload.calibration,
    diagnostics: normalizeDiagnostics(message.payload.diagnostics),
  });
}

function startClient(): void {
  if (coordinator || !shouldMonitor()) return;
  syncUnsubscribe = subscribeNoiseSync(handleSyncMessage);
  coordinator = new NoiseCoordinator({
    onRoleChange: (role, epoch) => {
      patchSnapshot({
        role,
        status: role === "none" ? "disabled" : role === "follower" ? "electing" : "initializing",
        leaderEpoch: epoch,
      });
    },
    runAsLeader,
  });
  coordinator.start();
  staleTimer = window.setInterval(() => {
    if (
      snapshot.role === "follower" &&
      lastRemoteHeartbeatAt > 0 &&
      Date.now() - lastRemoteHeartbeatAt > REMOTE_STALE_MS
    ) {
      patchSnapshot({ status: "electing", leaderEpoch: null, captureSessionId: null });
    }
  }, HEARTBEAT_MS);
}

async function stopClient(status: "disabled" | "electing" = "electing"): Promise<void> {
  const activeCoordinator = coordinator;
  coordinator = null;
  await activeCoordinator?.stop();
  syncUnsubscribe?.();
  syncUnsubscribe = null;
  if (staleTimer !== null) window.clearInterval(staleTimer);
  staleTimer = null;
  followerRingBuffer.clear();
  patchSnapshot({
    ...createInitialSnapshot(),
    status,
    role: "none",
    ringBuffer: [],
  });
}

function sendCommand(
  command: "retry" | "calibrate" | "clear-calibration",
  referenceDbA?: number
): Promise<void> {
  const requestId = crypto.randomUUID?.() ?? `${Date.now()}:${Math.random()}`;
  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      pendingCommands.delete(requestId);
      reject(new Error("未能连接到正在采集的标签页"));
    }, COMMAND_TIMEOUT_MS);
    pendingCommands.set(requestId, { resolve, reject, timeout });
    broadcastNoiseSyncMessage(
      createNoiseSyncMessage({
        type: "command",
        requestId,
        command,
        ...(typeof referenceDbA === "number" ? { referenceDbA } : {}),
      })
    );
  });
}

export function subscribeNoiseStream(listener: Listener): () => void {
  listeners.add(listener);
  if (!settingsUnsubscribe) {
    settingsUnsubscribe = subscribeSettingsEvent(SETTINGS_EVENTS.NoiseControlSettingsUpdated, () =>
      applySettings(true)
    );
  }
  clearTimer(stopTimer);
  stopTimer = null;
  if (shouldMonitor()) startClient();
  else patchSnapshot({ status: "disabled", role: "none" });
  return () => {
    listeners.delete(listener);
    if (listeners.size > 0) return;
    stopTimer = window.setTimeout(() => {
      stopTimer = null;
      if (listeners.size === 0 && debugSessionCount === 0) {
        void stopClient(readSettings().monitoringEnabled ? "electing" : "disabled");
        cleanupSettingsSubscriptionIfIdle();
      }
    }, STOP_DEBOUNCE_MS);
  };
}

export function getNoiseStreamSnapshot(): NoiseStreamSnapshot {
  return {
    ...snapshot,
    ringBuffer: snapshot.ringBuffer.slice(),
    diagnostics: normalizeDiagnostics(snapshot.diagnostics),
  };
}

export function acquireNoiseDebugSession(): () => void {
  debugSessionCount += 1;
  clearTimer(stopTimer);
  stopTimer = null;
  startClient();

  let released = false;
  return () => {
    if (released) return;
    released = true;
    debugSessionCount = Math.max(0, debugSessionCount - 1);
    if (!shouldMonitor()) {
      void stopClient("disabled").finally(cleanupSettingsSubscriptionIfIdle);
    }
  };
}

export async function restartNoiseStream(): Promise<void> {
  if (!shouldMonitor()) {
    applySettings(false);
    return;
  }
  if (snapshot.role === "leader") {
    coordinator?.releaseLeadership();
    return;
  }
  await sendCommand("retry");
}

export async function calibrateNoiseStream(referenceDbA: number): Promise<void> {
  if (snapshot.role === "leader" && runtime) {
    await runtime.calibrate(referenceDbA);
    return;
  }
  await sendCommand("calibrate", referenceDbA);
}

export async function clearNoiseStreamCalibration(): Promise<void> {
  if (snapshot.role === "leader" && runtime) {
    runtime.clearCalibration();
    return;
  }
  await sendCommand("clear-calibration");
}
