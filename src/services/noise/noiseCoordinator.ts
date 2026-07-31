import type { NoiseMonitoringRole } from "../../types/noise";

const LOCK_NAME = "immersive-clock:noise-capture:v2";
const LEASE_KEY = "immersive-clock:noise-capture-lease:v2";
const LEASE_TTL_MS = 4000;
const HEARTBEAT_MS = 1000;
const RETRY_MS = 250;
const CLAIM_SETTLE_MS = 40;

interface LeaseRecord {
  owner: string;
  epoch: string;
  expiresAt: number;
}

export interface NoiseLeadershipContext {
  epoch: string;
  signal: AbortSignal;
  ownsLeadership: () => boolean;
}

export interface NoiseCoordinatorOptions {
  onRoleChange: (role: NoiseMonitoringRole, epoch: string | null) => void;
  runAsLeader: (context: NoiseLeadershipContext) => Promise<void>;
}

function createId(): string {
  return crypto.randomUUID?.() ?? `${Date.now()}:${Math.random().toString(16).slice(2)}`;
}

function wait(durationMs: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, durationMs));
}

function readLease(): LeaseRecord | null {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(LEASE_KEY) ?? "null");
    if (!value || typeof value !== "object") return null;
    const lease = value as Partial<LeaseRecord>;
    if (
      typeof lease.owner !== "string" ||
      typeof lease.epoch !== "string" ||
      typeof lease.expiresAt !== "number"
    ) {
      return null;
    }
    return lease as LeaseRecord;
  } catch {
    return null;
  }
}

export class NoiseCoordinator {
  private readonly owner = createId();
  private active = false;
  private loopAbort: AbortController | null = null;
  private leadershipAbort: AbortController | null = null;
  private releaseLeadershipPromise: (() => void) | null = null;
  private currentEpoch: string | null = null;

  constructor(private readonly options: NoiseCoordinatorOptions) {}

  start(): void {
    if (this.active) return;
    this.active = true;
    this.loopAbort = new AbortController();
    this.options.onRoleChange("follower", null);
    window.addEventListener("pagehide", this.handlePageHide);
    const lockManager = navigator.locks;
    if (lockManager && typeof lockManager.request === "function") {
      void this.runWebLockLoop(this.loopAbort.signal);
    } else {
      void this.runLeaseLoop(this.loopAbort.signal);
    }
  }

  async stop(): Promise<void> {
    if (!this.active) return;
    this.active = false;
    window.removeEventListener("pagehide", this.handlePageHide);
    this.loopAbort?.abort();
    this.releaseLeadership();
    this.removeOwnedLease();
    this.options.onRoleChange("none", null);
  }

  releaseLeadership(): void {
    this.leadershipAbort?.abort();
    this.releaseLeadershipPromise?.();
    this.releaseLeadershipPromise = null;
  }

  ownsLeadership(epoch?: string): boolean {
    if (!this.active || !this.currentEpoch) return false;
    if (epoch && epoch !== this.currentEpoch) return false;
    const usingWebLocks = Boolean(navigator.locks && typeof navigator.locks.request === "function");
    if (usingWebLocks) return !this.leadershipAbort?.signal.aborted;
    const lease = readLease();
    return (
      lease?.owner === this.owner &&
      lease.epoch === this.currentEpoch &&
      lease.expiresAt > Date.now()
    );
  }

  private readonly handlePageHide = () => this.releaseLeadership();

  private async runWebLockLoop(signal: AbortSignal): Promise<void> {
    while (this.active && !signal.aborted) {
      try {
        await navigator.locks.request(LOCK_NAME, { mode: "exclusive", signal }, async () =>
          this.holdLeadership()
        );
      } catch {
        if (!signal.aborted) await wait(RETRY_MS);
      }
      if (this.active && !signal.aborted) {
        this.options.onRoleChange("follower", null);
        await wait(RETRY_MS);
      }
    }
  }

  private async runLeaseLoop(signal: AbortSignal): Promise<void> {
    while (this.active && !signal.aborted) {
      const epoch = createId();
      if (await this.tryClaimLease(epoch)) {
        const heartbeat = window.setInterval(() => {
          const lease = readLease();
          if (lease?.owner !== this.owner || lease.epoch !== epoch) {
            this.releaseLeadership();
            return;
          }
          localStorage.setItem(
            LEASE_KEY,
            JSON.stringify({ owner: this.owner, epoch, expiresAt: Date.now() + LEASE_TTL_MS })
          );
        }, HEARTBEAT_MS);
        try {
          await this.holdLeadership(epoch);
        } finally {
          window.clearInterval(heartbeat);
          this.removeOwnedLease(epoch);
        }
      }
      if (this.active && !signal.aborted) {
        this.options.onRoleChange("follower", null);
        await wait(RETRY_MS);
      }
    }
  }

  private async tryClaimLease(epoch: string): Promise<boolean> {
    const current = readLease();
    if (current && current.expiresAt > Date.now() && current.owner !== this.owner) return false;
    try {
      localStorage.setItem(
        LEASE_KEY,
        JSON.stringify({ owner: this.owner, epoch, expiresAt: Date.now() + LEASE_TTL_MS })
      );
      await wait(CLAIM_SETTLE_MS);
      const claimed = readLease();
      return claimed?.owner === this.owner && claimed.epoch === epoch;
    } catch {
      return false;
    }
  }

  private async holdLeadership(epoch = createId()): Promise<void> {
    this.currentEpoch = epoch;
    this.leadershipAbort = new AbortController();
    this.options.onRoleChange("leader", epoch);
    const released = new Promise<void>((resolve) => {
      this.releaseLeadershipPromise = resolve;
    });
    try {
      await this.options.runAsLeader({
        epoch,
        signal: this.leadershipAbort.signal,
        ownsLeadership: () => this.ownsLeadership(epoch),
      });
      await released;
    } finally {
      this.leadershipAbort.abort();
      this.releaseLeadershipPromise = null;
      this.currentEpoch = null;
      this.leadershipAbort = null;
    }
  }

  private removeOwnedLease(epoch?: string): void {
    try {
      const lease = readLease();
      if (lease?.owner === this.owner && (!epoch || lease.epoch === epoch)) {
        localStorage.removeItem(LEASE_KEY);
      }
    } catch {
      // Lease expiry is the final fallback.
    }
  }
}
