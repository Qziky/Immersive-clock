import type { Quote, QuoteProviderId } from "../../types/quote";

import { isQuoteProviderError, quoteContentKey, type QuoteProviderError } from "./providerTypes";

export const QUOTE_RUNTIME_STORAGE_KEY = "immersive-clock.quote-runtime.v2";
export const LEGACY_QUOTE_RUNTIME_STORAGE_KEYS = ["immersive-clock.quote-runtime.v1"] as const;
export const QUOTE_CACHE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
export const QUOTE_CACHE_LIMIT = 20;
export const QUOTE_RECENT_LIMIT = 20;

const PROVIDER_IDS: readonly QuoteProviderId[] = ["hitokoto", "jinrishici", "advice-slip"];

export interface ProviderRuntimeStatus {
  blockedUntil: number;
  failureCount: number;
  lastRequestAt: number;
}

interface ProviderRuntimeState extends ProviderRuntimeStatus {
  quotes: Quote[];
}

interface RecentQuoteRecord {
  contentKey: string;
  displayedAt: number;
}

interface QuoteRuntimeState {
  version: 2;
  providers: Record<QuoteProviderId, ProviderRuntimeState>;
  recentQuotes: RecentQuoteRecord[];
  localCursors: Record<string, number>;
}

export interface QuoteRuntimeStorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface QuoteRuntimeStoreOptions {
  storage?: QuoteRuntimeStorageLike | null;
  now?: () => number;
}

function createProviderState(): ProviderRuntimeState {
  return { quotes: [], blockedUntil: 0, failureCount: 0, lastRequestAt: 0 };
}

function createEmptyState(): QuoteRuntimeState {
  return {
    version: 2,
    providers: {
      hitokoto: createProviderState(),
      jinrishici: createProviderState(),
      "advice-slip": createProviderState(),
    },
    recentQuotes: [],
    localCursors: {},
  };
}

function getDefaultStorage(): QuoteRuntimeStorageLike | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

function toNonNegativeNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : 0;
}

function isValidQuote(value: unknown, providerId: QuoteProviderId, now: number): value is Quote {
  if (!value || typeof value !== "object") return false;
  const quote = value as Partial<Quote>;
  return (
    typeof quote.id === "string" &&
    quote.id.length > 0 &&
    typeof quote.text === "string" &&
    quote.text.trim().length > 0 &&
    quote.providerId === providerId &&
    (quote.language === "zh" || quote.language === "en") &&
    typeof quote.fetchedAt === "number" &&
    Number.isFinite(quote.fetchedAt) &&
    quote.fetchedAt <= now + 60_000 &&
    now - quote.fetchedAt <= QUOTE_CACHE_MAX_AGE_MS &&
    (quote.author === undefined || typeof quote.author === "string") &&
    (quote.origin === undefined || typeof quote.origin === "string")
  );
}

function parseState(value: unknown, now: number): QuoteRuntimeState {
  if (!value || typeof value !== "object") {
    return createEmptyState();
  }
  const version = (value as { version?: unknown }).version;
  if (version !== 1 && version !== 2) return createEmptyState();
  const input = value as Partial<QuoteRuntimeState>;
  const state = createEmptyState();
  for (const providerId of PROVIDER_IDS) {
    const candidate = input.providers?.[providerId] as Partial<ProviderRuntimeState> | undefined;
    if (!candidate || typeof candidate !== "object") continue;
    const seenIds = new Set<string>();
    const seenContent = new Set<string>();
    state.providers[providerId] = {
      blockedUntil: toNonNegativeNumber(candidate.blockedUntil),
      failureCount: Math.floor(toNonNegativeNumber(candidate.failureCount)),
      lastRequestAt: toNonNegativeNumber(candidate.lastRequestAt),
      quotes: Array.isArray(candidate.quotes)
        ? candidate.quotes
            .filter((quote) => isValidQuote(quote, providerId, now))
            .filter((quote) => {
              const contentKey = quoteContentKey(quote.text);
              if (seenIds.has(quote.id) || seenContent.has(contentKey)) return false;
              seenIds.add(quote.id);
              seenContent.add(contentKey);
              return true;
            })
            .slice(-QUOTE_CACHE_LIMIT)
        : [],
    };
  }
  if (version === 2 && Array.isArray(input.recentQuotes)) {
    for (const candidate of input.recentQuotes) {
      if (!candidate || typeof candidate !== "object") continue;
      const record = candidate as Partial<RecentQuoteRecord>;
      if (
        typeof record.contentKey !== "string" ||
        !record.contentKey.trim() ||
        typeof record.displayedAt !== "number" ||
        !Number.isFinite(record.displayedAt) ||
        record.displayedAt > now + 60_000 ||
        now - record.displayedAt > QUOTE_CACHE_MAX_AGE_MS
      ) {
        continue;
      }
      const contentKey = quoteContentKey(record.contentKey);
      state.recentQuotes = [
        ...state.recentQuotes.filter((existing) => existing.contentKey !== contentKey),
        { contentKey, displayedAt: record.displayedAt },
      ].slice(-QUOTE_RECENT_LIMIT);
    }
  }
  if (input.localCursors && typeof input.localCursors === "object") {
    for (const [channelId, cursor] of Object.entries(input.localCursors)) {
      if (!channelId || !Number.isInteger(cursor) || cursor < 0) continue;
      state.localCursors[channelId] = cursor;
    }
  }
  return state;
}

export function getProviderCooldownMs(error: unknown, previousFailureCount: number): number {
  if (!isQuoteProviderError(error)) return 30_000;
  if (error.code === "http" && (error.status === 403 || error.status === 429)) {
    return error.retryAfterMs ?? 10 * 60 * 1000;
  }
  if (
    error.code === "network" ||
    error.code === "timeout" ||
    error.code === "invalid-payload" ||
    error.code === "sdk" ||
    (error.code === "http" && typeof error.status === "number" && error.status >= 500)
  ) {
    return Math.min(30 * 60 * 1000, 30_000 * Math.pow(2, previousFailureCount));
  }
  return 0;
}

export class QuoteRuntimeStore {
  private readonly storage: QuoteRuntimeStorageLike | null;
  private readonly now: () => number;
  private state: QuoteRuntimeState;

  constructor(options: QuoteRuntimeStoreOptions = {}) {
    this.storage = options.storage === undefined ? getDefaultStorage() : options.storage;
    this.now = options.now ?? Date.now;
    this.state = this.load();
  }

  private load(): QuoteRuntimeState {
    if (!this.storage) return createEmptyState();
    for (const key of [QUOTE_RUNTIME_STORAGE_KEY, ...LEGACY_QUOTE_RUNTIME_STORAGE_KEYS]) {
      try {
        const raw = this.storage.getItem(key);
        if (!raw) continue;
        const state = parseState(JSON.parse(raw), this.now());
        try {
          this.storage.setItem(QUOTE_RUNTIME_STORAGE_KEY, JSON.stringify(state));
          if (key !== QUOTE_RUNTIME_STORAGE_KEY) this.storage.removeItem(key);
        } catch {
          // Keep the parsed in-memory state when persistent storage is read-only.
        }
        return state;
      } catch {
        try {
          this.storage.removeItem(key);
        } catch {
          // Storage may be disabled by the browser. The in-memory state remains usable.
        }
      }
    }
    return createEmptyState();
  }

  private persist(): void {
    if (!this.storage) return;
    try {
      this.storage.setItem(QUOTE_RUNTIME_STORAGE_KEY, JSON.stringify(this.state));
    } catch {
      // Runtime storage is an optimization; quota and privacy mode failures are non-fatal.
    }
  }

  getCachedQuotes(providerId: QuoteProviderId): Quote[] {
    const now = this.now();
    const provider = this.state.providers[providerId];
    const valid = provider.quotes.filter(
      (quote) => now - quote.fetchedAt <= QUOTE_CACHE_MAX_AGE_MS
    );
    if (valid.length !== provider.quotes.length) {
      provider.quotes = valid;
      this.persist();
    }
    return valid.map((quote) => ({ ...quote }));
  }

  addCachedQuote(quote: Quote): void {
    if (quote.providerId === "local") return;
    const provider = this.state.providers[quote.providerId];
    const contentKey = quoteContentKey(quote.text);
    provider.quotes = [
      ...provider.quotes.filter(
        (candidate) => candidate.id !== quote.id && quoteContentKey(candidate.text) !== contentKey
      ),
      { ...quote },
    ].slice(-QUOTE_CACHE_LIMIT);
    this.persist();
  }

  getProviderStatus(providerId: QuoteProviderId): ProviderRuntimeStatus {
    const provider = this.state.providers[providerId];
    return {
      blockedUntil: provider.blockedUntil,
      failureCount: provider.failureCount,
      lastRequestAt: provider.lastRequestAt,
    };
  }

  markRequestStarted(providerId: QuoteProviderId): void {
    this.state.providers[providerId].lastRequestAt = this.now();
    this.persist();
  }

  markProviderSucceeded(providerId: QuoteProviderId): void {
    const provider = this.state.providers[providerId];
    provider.blockedUntil = 0;
    provider.failureCount = 0;
    this.persist();
  }

  markProviderFailed(providerId: QuoteProviderId, error: QuoteProviderError | unknown): number {
    const provider = this.state.providers[providerId];
    const cooldownMs = getProviderCooldownMs(error, provider.failureCount);
    if (cooldownMs > 0) {
      provider.failureCount += 1;
      provider.blockedUntil = Math.max(provider.blockedUntil, this.now() + cooldownMs);
    }
    this.persist();
    return cooldownMs;
  }

  isRecentlyUsed(quote: Pick<Quote, "text">): boolean {
    const now = this.now();
    const recentQuotes = this.state.recentQuotes.filter(
      (record) => now - record.displayedAt <= QUOTE_CACHE_MAX_AGE_MS
    );
    if (recentQuotes.length !== this.state.recentQuotes.length) {
      this.state.recentQuotes = recentQuotes;
      this.persist();
    }
    return recentQuotes.some((record) => record.contentKey === quoteContentKey(quote.text));
  }

  rememberQuote(quote: Pick<Quote, "text">): void {
    const contentKey = quoteContentKey(quote.text);
    const now = this.now();
    this.state.recentQuotes = [
      ...this.state.recentQuotes.filter(
        (candidate) =>
          candidate.contentKey !== contentKey &&
          now - candidate.displayedAt <= QUOTE_CACHE_MAX_AGE_MS
      ),
      { contentKey, displayedAt: now },
    ].slice(-QUOTE_RECENT_LIMIT);
    this.persist();
  }

  seedSequentialCursor(channelId: string, cursor: number): void {
    const normalizedId = channelId.trim();
    if (!normalizedId || !Number.isSafeInteger(cursor) || cursor < 0) return;
    if (Object.prototype.hasOwnProperty.call(this.state.localCursors, normalizedId)) return;
    this.state.localCursors[normalizedId] = cursor;
    this.persist();
  }

  takeSequentialIndex(channelId: string, quoteCount: number): number {
    if (quoteCount <= 0) return 0;
    const current = this.state.localCursors[channelId] ?? 0;
    const index = current % quoteCount;
    this.state.localCursors[channelId] = (index + 1) % quoteCount;
    this.persist();
    return index;
  }
}
