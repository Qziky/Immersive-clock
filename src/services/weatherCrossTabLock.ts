const LOCK_NAME = "immersive-clock:xiaomi-weather-request";
const LEASE_STORAGE_PREFIX = "immersive-clock:xiaomi-weather-lease:v1:";
const CONTENDER_STORAGE_PREFIX = "immersive-clock:xiaomi-weather-contender:v1:";
const LEASE_TTL_MS = 30_000;
const LEASE_HEARTBEAT_MS = 5_000;
const LEASE_SETTLE_MS = 40;
const LEASE_RETRY_MS = 120;

interface LeaseRecord {
  expiresAt: number;
  owner: string;
}

interface ContenderRecord extends LeaseRecord {
  requestedAt: number;
}

interface LockManagerLike {
  request<T>(name: string, options: { mode: "exclusive" }, callback: () => Promise<T>): Promise<T>;
}

let ownerSequence = 0;

function waitFor(durationMs: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, durationMs)));
}

function createOwnerId(): string {
  ownerSequence += 1;
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `${crypto.randomUUID()}:${ownerSequence}`;
  }
  return `${Date.now()}:${typeof performance === "undefined" ? 0 : performance.now()}:${ownerSequence}`;
}

function readRecord<T extends LeaseRecord>(key: string): T | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const value = JSON.parse(localStorage.getItem(key) || "null") as Partial<T> | null;
    if (
      !value ||
      typeof value.owner !== "string" ||
      typeof value.expiresAt !== "number" ||
      !Number.isFinite(value.expiresAt)
    ) {
      return null;
    }
    return value as T;
  } catch {
    return null;
  }
}

function removeIfOwned(key: string, owner: string): void {
  if (typeof localStorage === "undefined") return;
  if (readRecord(key)?.owner === owner) localStorage.removeItem(key);
}

function listActiveContenders(now: number, contenderPrefix: string): ContenderRecord[] {
  if (typeof localStorage === "undefined") return [];
  const contenders: ContenderRecord[] = [];
  for (let index = localStorage.length - 1; index >= 0; index -= 1) {
    const key = localStorage.key(index);
    if (!key?.startsWith(contenderPrefix)) continue;
    const contender = readRecord<ContenderRecord>(key);
    if (!contender || contender.expiresAt <= now || !Number.isFinite(contender.requestedAt)) {
      localStorage.removeItem(key);
      continue;
    }
    contenders.push(contender);
  }
  return contenders.sort(
    (left, right) => left.requestedAt - right.requestedAt || left.owner.localeCompare(right.owner)
  );
}

async function withLocalStorageLease<T>(task: () => Promise<T>, requestKey: string): Promise<T> {
  if (typeof localStorage === "undefined") return task();
  const owner = createOwnerId();
  const keySuffix = encodeURIComponent(requestKey);
  const leaseKey = `${LEASE_STORAGE_PREFIX}${keySuffix}`;
  const contenderPrefix = `${CONTENDER_STORAGE_PREFIX}${keySuffix}:`;
  const contenderKey = `${contenderPrefix}${owner}`;
  const requestedAt = Date.now();

  try {
    while (true) {
      const now = Date.now();
      const activeLease = readRecord<LeaseRecord>(leaseKey);
      if (activeLease && activeLease.expiresAt > now && activeLease.owner !== owner) {
        await waitFor(Math.min(LEASE_RETRY_MS, activeLease.expiresAt - now));
        continue;
      }

      const contender: ContenderRecord = {
        expiresAt: now + LEASE_TTL_MS,
        owner,
        requestedAt,
      };
      localStorage.setItem(contenderKey, JSON.stringify(contender));
      await waitFor(LEASE_SETTLE_MS);

      const leaseAfterSettle = readRecord<LeaseRecord>(leaseKey);
      if (
        leaseAfterSettle &&
        leaseAfterSettle.expiresAt > Date.now() &&
        leaseAfterSettle.owner !== owner
      ) {
        await waitFor(LEASE_RETRY_MS);
        continue;
      }

      const winner = listActiveContenders(Date.now(), contenderPrefix)[0];
      if (winner?.owner !== owner) {
        await waitFor(LEASE_RETRY_MS);
        continue;
      }

      localStorage.setItem(
        leaseKey,
        JSON.stringify({ expiresAt: Date.now() + LEASE_TTL_MS, owner } satisfies LeaseRecord)
      );
      await waitFor(LEASE_SETTLE_MS);
      if (readRecord<LeaseRecord>(leaseKey)?.owner !== owner) {
        await waitFor(LEASE_RETRY_MS);
        continue;
      }

      const heartbeat = setInterval(() => {
        if (readRecord<LeaseRecord>(leaseKey)?.owner !== owner) return;
        const expiresAt = Date.now() + LEASE_TTL_MS;
        localStorage.setItem(leaseKey, JSON.stringify({ expiresAt, owner } satisfies LeaseRecord));
        localStorage.setItem(
          contenderKey,
          JSON.stringify({ expiresAt, owner, requestedAt } satisfies ContenderRecord)
        );
      }, LEASE_HEARTBEAT_MS);

      try {
        return await task();
      } finally {
        clearInterval(heartbeat);
        removeIfOwned(leaseKey, owner);
      }
    }
  } finally {
    removeIfOwned(contenderKey, owner);
  }
}

function getLockManager(): LockManagerLike | null {
  if (typeof navigator === "undefined") return null;
  const locks = (navigator as Navigator & { locks?: LockManagerLike }).locks;
  return locks && typeof locks.request === "function" ? locks : null;
}

export function withWeatherCrossTabLock<T>(
  task: () => Promise<T>,
  requestKey = "global"
): Promise<T> {
  const lockManager = getLockManager();
  if (lockManager) {
    return lockManager.request(`${LOCK_NAME}:${requestKey}`, { mode: "exclusive" }, task);
  }
  return withLocalStorageLease(task, requestKey);
}

export function __resetWeatherCrossTabLockForTests(): void {
  ownerSequence = 0;
  if (typeof localStorage === "undefined") return;
  for (let index = localStorage.length - 1; index >= 0; index -= 1) {
    const key = localStorage.key(index);
    if (key?.startsWith(CONTENDER_STORAGE_PREFIX) || key?.startsWith(LEASE_STORAGE_PREFIX)) {
      localStorage.removeItem(key);
    }
  }
}
