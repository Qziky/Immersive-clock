type ApiClass = "amap" | "xiaomiWeather" | "free" | "timesync";

type Policy = {
  minIntervalMs: number;
  softTtlMs: number;
};

type CacheEntry<T> = {
  value: T;
  at: number;
};

const FIXED_GOVERNANCE_MODE = "balanced";

const DEFAULT_POLICIES: Record<ApiClass, Policy> = {
  amap: {
    minIntervalMs: 12000,
    softTtlMs: 5 * 60 * 1000,
  },
  xiaomiWeather: {
    minIntervalMs: 500,
    softTtlMs: 20 * 1000,
  },
  free: {
    minIntervalMs: 2500,
    softTtlMs: 60 * 1000,
  },
  timesync: {
    minIntervalMs: 30 * 1000,
    softTtlMs: 5 * 60 * 1000,
  },
};

const inFlightMap = new Map<string, Promise<unknown>>();
const lastRequestAtMap = new Map<string, number>();
const memoryCacheMap = new Map<string, CacheEntry<unknown>>();

export type GovernedRequestOptions = {
  apiClass: ApiClass;
  requestKey: string;
  minIntervalMs?: number;
  softTtlMs?: number;
  bypassSoftCache?: boolean;
};

function nowMs(): number {
  return Date.now();
}

function getPolicy(
  apiClass: ApiClass,
  overrides?: { minIntervalMs?: number; softTtlMs?: number }
): Policy {
  const base = DEFAULT_POLICIES[apiClass];
  return {
    ...base,
    minIntervalMs: overrides?.minIntervalMs ?? base.minIntervalMs,
    softTtlMs: overrides?.softTtlMs ?? base.softTtlMs,
  };
}

function guardRequestBeforeRun(options: GovernedRequestOptions, policy: Policy): string | null {
  const now = nowMs();
  const lastAt = lastRequestAtMap.get(options.requestKey) ?? 0;
  const intervalGap = now - lastAt;
  if (intervalGap < policy.minIntervalMs) {
    return "API_GOVERNANCE_MIN_INTERVAL";
  }

  return null;
}

export async function executeGovernedRequest<T>(
  options: GovernedRequestOptions,
  runner: () => Promise<T>
): Promise<T> {
  const policy = getPolicy(options.apiClass, {
    minIntervalMs: options.minIntervalMs,
    softTtlMs: options.softTtlMs,
  });

  const cached = memoryCacheMap.get(options.requestKey) as CacheEntry<T> | undefined;
  const now = nowMs();
  if (!options.bypassSoftCache && cached && now - cached.at < policy.softTtlMs) {
    return cached.value;
  }

  const inFlight = inFlightMap.get(options.requestKey) as Promise<T> | undefined;
  if (inFlight) {
    return inFlight;
  }

  const guard = guardRequestBeforeRun(options, policy);
  if (guard) {
    if (cached) {
      return cached.value;
    }
    throw new Error(`${guard}｜mode=${FIXED_GOVERNANCE_MODE}｜key=${options.requestKey}`);
  }

  const task = (async () => {
    try {
      const result = await runner();
      lastRequestAtMap.set(options.requestKey, nowMs());
      memoryCacheMap.set(options.requestKey, { value: result, at: nowMs() });
      return result;
    } finally {
      inFlightMap.delete(options.requestKey);
    }
  })();

  inFlightMap.set(options.requestKey, task);
  return task;
}

export function __resetApiGovernanceForTests(): void {
  inFlightMap.clear();
  lastRequestAtMap.clear();
  memoryCacheMap.clear();
}
