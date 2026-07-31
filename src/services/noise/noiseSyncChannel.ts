import type {
  NoiseCalibrationProgress,
  NoiseCaptureDiagnostics,
  NoiseConfidence,
  NoiseMonitoringStatus,
  NoiseRealtimePoint,
  NoiseSignalHealth,
  NoiseSliceSummary,
} from "../../types/noise";

const CHANNEL_NAME = "immersive-clock:noise-monitoring:v2";
const STORAGE_KEY = "immersive-clock:noise-monitoring-message:v2";
const MAX_SEEN_MESSAGES = 200;

export interface NoiseSharedSnapshot {
  status: NoiseMonitoringStatus;
  signalHealth: NoiseSignalHealth;
  confidence: NoiseConfidence;
  point: NoiseRealtimePoint | null;
  latestSlice: NoiseSliceSummary | null;
  captureSessionId: string;
  calibrationAvailable: boolean;
  calibration: NoiseCalibrationProgress;
  diagnostics: NoiseCaptureDiagnostics;
}

interface NoiseSyncBase {
  id: string;
  senderId: string;
  sentAt: number;
  protocolVersion: 2;
}

export type NoiseSyncPayload =
  | {
      type: "heartbeat";
      leaderEpoch: string;
      sequence: number;
    }
  | {
      type: "snapshot";
      leaderEpoch: string;
      sequence: number;
      payload: NoiseSharedSnapshot;
    }
  | {
      type: "leader-release";
      leaderEpoch: string;
    }
  | {
      type: "command";
      requestId: string;
      command: "retry" | "calibrate" | "clear-calibration" | "settings-updated";
      referenceDbA?: number;
    }
  | {
      type: "command-result";
      requestId: string;
      ok: boolean;
      error?: string;
    };

type WithNoiseSyncBase<T> = T extends unknown ? T & NoiseSyncBase : never;
export type NoiseSyncMessage = WithNoiseSyncBase<NoiseSyncPayload>;

type Listener = (message: NoiseSyncMessage) => void;

const senderId = crypto.randomUUID?.() ?? `${Date.now()}:${Math.random().toString(16).slice(2)}`;
let messageSequence = 0;
let channel: BroadcastChannel | null = null;
const listeners = new Set<Listener>();
const seenMessageIds = new Set<string>();

function isNoiseSyncMessage(value: unknown): value is NoiseSyncMessage {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const message = value as Partial<NoiseSyncMessage>;
  return (
    message.protocolVersion === 2 &&
    typeof message.id === "string" &&
    typeof message.senderId === "string" &&
    typeof message.sentAt === "number" &&
    (message.type === "heartbeat" ||
      message.type === "snapshot" ||
      message.type === "leader-release" ||
      message.type === "command" ||
      message.type === "command-result")
  );
}

function deliver(value: unknown): void {
  if (!isNoiseSyncMessage(value) || value.senderId === senderId || seenMessageIds.has(value.id)) {
    return;
  }
  seenMessageIds.add(value.id);
  if (seenMessageIds.size > MAX_SEEN_MESSAGES) {
    const oldest = seenMessageIds.values().next().value;
    if (oldest) seenMessageIds.delete(oldest);
  }
  listeners.forEach((listener) => listener(value));
}

function ensureChannel(): BroadcastChannel | null {
  if (channel || typeof BroadcastChannel === "undefined") return channel;
  channel = new BroadcastChannel(CHANNEL_NAME);
  channel.addEventListener("message", (event) => deliver(event.data));
  return channel;
}

function onStorage(event: StorageEvent): void {
  if (event.key !== STORAGE_KEY || !event.newValue) return;
  try {
    deliver(JSON.parse(event.newValue));
  } catch {
    // Ignore malformed cross-tab payloads.
  }
}

export function createNoiseSyncMessage<T extends NoiseSyncPayload>(payload: T): T & NoiseSyncBase {
  messageSequence += 1;
  return {
    ...payload,
    id: `${senderId}:${Date.now()}:${messageSequence}`,
    senderId,
    sentAt: Date.now(),
    protocolVersion: 2,
  };
}

export function broadcastNoiseSyncMessage(message: NoiseSyncMessage): void {
  ensureChannel()?.postMessage(message);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(message));
  } catch {
    // BroadcastChannel remains the primary transport.
  }
}

export function subscribeNoiseSync(listener: Listener): () => void {
  listeners.add(listener);
  ensureChannel();
  if (listeners.size === 1) window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    if (listeners.size > 0) return;
    window.removeEventListener("storage", onStorage);
    channel?.close();
    channel = null;
  };
}

export function getNoiseSyncSenderId(): string {
  return senderId;
}

export function __resetNoiseSyncChannelForTests(): void {
  listeners.clear();
  seenMessageIds.clear();
  channel?.close();
  channel = null;
  messageSequence = 0;
  window.removeEventListener("storage", onStorage);
  localStorage.removeItem(STORAGE_KEY);
}
