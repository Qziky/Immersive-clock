const CHANNEL_NAME = "immersive-clock:weather-cache-sync:v1";
const STORAGE_KEY = "immersive-clock:weather-cache-sync-message:v1";
const MAX_SEEN_MESSAGES = 100;

export interface WeatherCacheSyncMessage {
  id: string;
  location: string | null;
  sentAt: number;
  target: WeatherCacheSyncTarget;
  type: "cache-updated";
}

type SyncListener = (message: WeatherCacheSyncMessage) => void;
export type WeatherCacheSyncTarget = "all" | "minutely";

let broadcastChannel: BroadcastChannel | null = null;
let messageSequence = 0;
let senderId: string | null = null;
const listeners = new Set<SyncListener>();
const seenMessageIds = new Set<string>();

function getSenderId(): string {
  if (senderId) return senderId;
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    senderId = crypto.randomUUID();
  } else {
    senderId = `${Date.now()}:${typeof performance === "undefined" ? 0 : performance.now()}`;
  }
  return senderId;
}

function isSyncMessage(value: unknown): value is WeatherCacheSyncMessage {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const message = value as Partial<WeatherCacheSyncMessage>;
  return (
    message.type === "cache-updated" &&
    (message.target === "all" || message.target === "minutely") &&
    typeof message.id === "string" &&
    typeof message.sentAt === "number" &&
    (message.location == null || typeof message.location === "string")
  );
}

function deliver(value: unknown): void {
  if (!isSyncMessage(value) || seenMessageIds.has(value.id)) return;
  seenMessageIds.add(value.id);
  if (seenMessageIds.size > MAX_SEEN_MESSAGES) {
    const oldest = seenMessageIds.values().next().value;
    if (oldest) seenMessageIds.delete(oldest);
  }
  listeners.forEach((listener) => listener(value));
}

function ensureBroadcastChannel(): BroadcastChannel | null {
  if (broadcastChannel || typeof BroadcastChannel === "undefined") return broadcastChannel;
  broadcastChannel = new BroadcastChannel(CHANNEL_NAME);
  broadcastChannel.addEventListener("message", (event) => deliver(event.data));
  return broadcastChannel;
}

function onStorage(event: StorageEvent): void {
  if (event.key !== STORAGE_KEY || !event.newValue) return;
  try {
    deliver(JSON.parse(event.newValue));
  } catch {
    // Ignore malformed messages written by old or external clients.
  }
}

export function broadcastWeatherCacheUpdate(
  target: WeatherCacheSyncTarget,
  location: string | null
): void {
  const message: WeatherCacheSyncMessage = {
    id: `${getSenderId()}:${Date.now()}:${++messageSequence}`,
    location,
    sentAt: Date.now(),
    target,
    type: "cache-updated",
  };
  ensureBroadcastChannel()?.postMessage(message);
  if (typeof localStorage !== "undefined") {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(message));
    } catch {
      // BroadcastChannel still handles synchronization when storage is unavailable.
    }
  }
}

export function subscribeWeatherCacheSync(listener: SyncListener): () => void {
  listeners.add(listener);
  ensureBroadcastChannel();
  if (typeof window !== "undefined" && listeners.size === 1) {
    window.addEventListener("storage", onStorage);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size > 0) return;
    if (typeof window !== "undefined") window.removeEventListener("storage", onStorage);
    broadcastChannel?.close();
    broadcastChannel = null;
  };
}

export function __resetWeatherSyncChannelForTests(): void {
  listeners.clear();
  seenMessageIds.clear();
  broadcastChannel?.close();
  broadcastChannel = null;
  messageSequence = 0;
  senderId = null;
  if (typeof window !== "undefined") window.removeEventListener("storage", onStorage);
  if (typeof localStorage !== "undefined") localStorage.removeItem(STORAGE_KEY);
}
