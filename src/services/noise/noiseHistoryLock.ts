const LOCK_NAME = "immersive-clock:noise-history-write:v2";
const LEASE_KEY = "immersive-clock:noise-history-write-lease:v2";
const LEASE_TTL_MS = 5000;
const RETRY_MS = 50;

interface LeaseRecord {
  owner: string;
  expiresAt: number;
}

function wait(durationMs: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, durationMs));
}

function readLease(): LeaseRecord | null {
  try {
    const value = JSON.parse(
      localStorage.getItem(LEASE_KEY) ?? "null"
    ) as Partial<LeaseRecord> | null;
    return value && typeof value.owner === "string" && typeof value.expiresAt === "number"
      ? (value as LeaseRecord)
      : null;
  } catch {
    return null;
  }
}

async function withLease<T>(task: () => Promise<T>): Promise<T> {
  const owner = crypto.randomUUID?.() ?? `${Date.now()}:${Math.random()}`;
  while (true) {
    const current = readLease();
    if (!current || current.expiresAt <= Date.now()) {
      localStorage.setItem(
        LEASE_KEY,
        JSON.stringify({ owner, expiresAt: Date.now() + LEASE_TTL_MS })
      );
      await wait(20);
      if (readLease()?.owner === owner) break;
    }
    await wait(RETRY_MS);
  }
  const heartbeat = window.setInterval(() => {
    if (readLease()?.owner === owner) {
      localStorage.setItem(
        LEASE_KEY,
        JSON.stringify({ owner, expiresAt: Date.now() + LEASE_TTL_MS })
      );
    }
  }, 1000);
  try {
    return await task();
  } finally {
    window.clearInterval(heartbeat);
    if (readLease()?.owner === owner) localStorage.removeItem(LEASE_KEY);
  }
}

export function withNoiseHistoryWriteLock<T>(task: () => Promise<T>): Promise<T> {
  if (navigator.locks && typeof navigator.locks.request === "function") {
    return navigator.locks.request(LOCK_NAME, { mode: "exclusive" }, task);
  }
  return withLease(task);
}
