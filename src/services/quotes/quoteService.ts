import type {
  HitokotoCategory,
  LocalQuoteChannel,
  Quote,
  QuoteChannel,
  QuoteProviderId,
  RemoteQuoteChannel,
} from "../../types/quote";

import { fetchAdviceSlipQuote, fetchHitokotoQuote, fetchJinrishiciQuote } from "./providers";
import {
  createStableQuoteId,
  isQuoteAbortError,
  quoteContentKey,
  QuoteProviderError,
  type QuoteProvider,
} from "./providerTypes";
import { QuoteRuntimeStore, type QuoteRuntimeStoreOptions } from "./runtimeStorage";

export const DEFAULT_FALLBACK_QUOTE: Quote = {
  id: "local:built-in-fallback",
  text: "保持热爱，奔赴山海。",
  providerId: "local",
  language: "zh",
  fetchedAt: 0,
};

export interface QuoteRequestOptions {
  channels: readonly QuoteChannel[];
  currentQuoteId?: string;
  signal?: AbortSignal;
}

export interface AutomaticQuoteResult {
  immediate: Quote;
  immediateWasFallback: boolean;
  refresh: Promise<Quote | null> | null;
}

export interface QuoteResolution {
  quote: Quote;
  isFallback: boolean;
}

export interface QuoteServiceOptions extends QuoteRuntimeStoreOptions {
  providers?: readonly QuoteProvider[];
  random?: () => number;
}

export const QUOTE_PROVIDER_MIN_INTERVAL_MS: Record<QuoteProviderId, number> = {
  hitokoto: 5000,
  jinrishici: 10 * 60 * 1000,
  "advice-slip": 2000,
};

function createDefaultProviders(): QuoteProvider[] {
  return [
    {
      id: "hitokoto",
      minIntervalMs: QUOTE_PROVIDER_MIN_INTERVAL_MS.hitokoto,
      fetchQuote: (options) =>
        fetchHitokotoQuote({
          categories: options?.hitokotoCategories as HitokotoCategory[] | undefined,
          signal: options?.signal,
        }),
    },
    {
      id: "jinrishici",
      minIntervalMs: QUOTE_PROVIDER_MIN_INTERVAL_MS.jinrishici,
      fetchQuote: (options) => fetchJinrishiciQuote({ signal: options?.signal }),
    },
    {
      id: "advice-slip",
      minIntervalMs: QUOTE_PROVIDER_MIN_INTERVAL_MS["advice-slip"],
      fetchQuote: (options) => fetchAdviceSlipQuote({ signal: options?.signal }),
    },
  ];
}

function isUsableChannel(channel: QuoteChannel): boolean {
  return (
    channel.enabled &&
    Number.isFinite(channel.weight) &&
    channel.weight > 0 &&
    (channel.kind === "remote" || channel.quotes.some((quote) => Boolean(quote.trim())))
  );
}

function splitLocalQuote(value: string): Pick<Quote, "text" | "origin"> {
  const normalized = value.trim();
  const match = normalized.match(/^([\s\S]*?)(?:\s*——\s*)([^\n]+)$/);
  if (!match) return { text: normalized };
  return { text: match[1].trim(), origin: match[2].trim() || undefined };
}

function createLocalQuote(
  channel: LocalQuoteChannel,
  rawQuote: string,
  index: number,
  fetchedAt: number
): Quote {
  const { text, origin } = splitLocalQuote(rawQuote);
  return {
    id: createStableQuoteId("local", `${channel.id}:${index}`, text),
    text,
    origin,
    providerId: "local",
    language: "zh",
    fetchedAt,
  };
}

interface InFlightQuoteRequest {
  controller: AbortController;
  promise: Promise<Quote>;
  settled: boolean;
  subscribers: number;
}

export class QuoteService {
  private readonly providers = new Map<QuoteProviderId, QuoteProvider>();
  private readonly runtimeStore: QuoteRuntimeStore;
  private readonly random: () => number;
  private readonly now: () => number;
  private readonly inFlight = new Map<QuoteProviderId, InFlightQuoteRequest>();

  constructor(options: QuoteServiceOptions = {}) {
    for (const provider of options.providers ?? createDefaultProviders()) {
      this.providers.set(provider.id, provider);
    }
    this.runtimeStore = new QuoteRuntimeStore({ storage: options.storage, now: options.now });
    this.random = options.random ?? Math.random;
    this.now = options.now ?? Date.now;
  }

  private pickWeightedChannel(channels: readonly QuoteChannel[]): QuoteChannel | undefined {
    const candidates = channels.filter(isUsableChannel);
    const totalWeight = candidates.reduce((sum, channel) => sum + channel.weight, 0);
    if (!candidates.length || totalWeight <= 0) return undefined;
    let target = this.random() * totalWeight;
    for (const candidate of candidates) {
      target -= candidate.weight;
      if (target < 0) return candidate;
    }
    return candidates[candidates.length - 1];
  }

  private pickFrom<T>(values: readonly T[]): T | undefined {
    if (!values.length) return undefined;
    const index = Math.min(values.length - 1, Math.floor(this.random() * values.length));
    return values[index];
  }

  private pickLocalQuote(channel: LocalQuoteChannel, currentQuoteId?: string): Quote | undefined {
    const entries = channel.quotes
      .map((value, index) => ({ value: value.trim(), index }))
      .filter((entry) => Boolean(entry.value));
    if (!entries.length) return undefined;

    if (channel.orderMode === "sequential") {
      const start = this.runtimeStore.takeSequentialIndex(channel.id, entries.length);
      for (let offset = 0; offset < entries.length; offset += 1) {
        const entry = entries[(start + offset) % entries.length];
        const quote = createLocalQuote(channel, entry.value, entry.index, this.now());
        if (quote.id !== currentQuoteId && !this.runtimeStore.isRecentlyUsed(quote)) return quote;
      }
      return createLocalQuote(channel, entries[start].value, entries[start].index, this.now());
    }

    const quotes = entries.map((entry) =>
      createLocalQuote(channel, entry.value, entry.index, this.now())
    );
    const fresh = quotes.filter(
      (quote) => quote.id !== currentQuoteId && !this.runtimeStore.isRecentlyUsed(quote)
    );
    return (
      this.pickFrom(fresh.length ? fresh : quotes.filter((quote) => quote.id !== currentQuoteId)) ??
      this.pickFrom(quotes)
    );
  }

  private pickLocalFallback(
    channels: readonly QuoteChannel[],
    currentQuoteId?: string
  ): Quote | undefined {
    const localChannels = channels.filter(
      (channel): channel is LocalQuoteChannel =>
        channel.kind === "local" && isUsableChannel(channel)
    );
    const selected = this.pickWeightedChannel(localChannels);
    return selected?.kind === "local" ? this.pickLocalQuote(selected, currentQuoteId) : undefined;
  }

  private getRemoteFailoverOrder(
    selected: RemoteQuoteChannel,
    channels: readonly QuoteChannel[]
  ): RemoteQuoteChannel[] {
    const remaining = channels.filter(
      (channel): channel is RemoteQuoteChannel =>
        channel.kind === "remote" &&
        isUsableChannel(channel) &&
        channel.providerId !== selected.providerId
    );
    return [selected, ...remaining];
  }

  private subscribeToProviderRequest(
    request: InFlightQuoteRequest,
    signal?: AbortSignal
  ): Promise<Quote> {
    if (signal?.aborted) {
      return Promise.reject(new DOMException("语录请求已取消", "AbortError"));
    }
    request.subscribers += 1;
    return new Promise<Quote>((resolve, reject) => {
      let released = false;
      const release = () => {
        if (released) return;
        released = true;
        request.subscribers = Math.max(0, request.subscribers - 1);
        signal?.removeEventListener("abort", handleAbort);
        if (request.subscribers === 0 && !request.settled) request.controller.abort();
      };
      const handleAbort = () => {
        release();
        reject(new DOMException("语录请求已取消", "AbortError"));
      };
      signal?.addEventListener("abort", handleAbort, { once: true });
      request.promise.then(
        (quote) => {
          if (released) return;
          release();
          resolve(quote);
        },
        (error) => {
          if (released) return;
          release();
          reject(error);
        }
      );
    });
  }

  private async fetchProvider(channel: RemoteQuoteChannel, signal?: AbortSignal): Promise<Quote> {
    const provider = this.providers.get(channel.providerId);
    if (!provider) {
      throw new QuoteProviderError(`未注册语录服务：${channel.providerId}`, {
        code: "unavailable",
        providerId: channel.providerId,
      });
    }
    const existing = this.inFlight.get(provider.id);
    if (existing && !existing.settled && !existing.controller.signal.aborted) {
      return this.subscribeToProviderRequest(existing, signal);
    }
    if (existing) this.inFlight.delete(provider.id);

    const status = this.runtimeStore.getProviderStatus(provider.id);
    const now = this.now();
    if (status.blockedUntil > now || now - status.lastRequestAt < provider.minIntervalMs) {
      throw new QuoteProviderError("语录服务正在冷却", {
        code: "unavailable",
        providerId: provider.id,
      });
    }
    if (signal?.aborted) throw new DOMException("语录请求已取消", "AbortError");

    this.runtimeStore.markRequestStarted(provider.id);
    const controller = new AbortController();
    const task = Promise.resolve()
      .then(() =>
        provider.fetchQuote({
          hitokotoCategories: channel.hitokotoCategories,
          signal: controller.signal,
        })
      )
      .then((quote) => {
        this.runtimeStore.markProviderSucceeded(provider.id);
        this.runtimeStore.addCachedQuote(quote);
        return quote;
      })
      .catch((error) => {
        if (!isQuoteAbortError(error)) this.runtimeStore.markProviderFailed(provider.id, error);
        throw error;
      })
      .finally(() => {
        const current = this.inFlight.get(provider.id);
        if (current?.controller !== controller) return;
        current.settled = true;
        this.inFlight.delete(provider.id);
      });
    const request: InFlightQuoteRequest = {
      controller,
      promise: task,
      settled: false,
      subscribers: 0,
    };
    this.inFlight.set(provider.id, request);
    return this.subscribeToProviderRequest(request, signal);
  }

  private async tryRemoteProviders(
    selected: RemoteQuoteChannel,
    channels: readonly QuoteChannel[],
    currentQuoteId: string | undefined,
    signal: AbortSignal | undefined
  ): Promise<Quote | null> {
    for (const channel of this.getRemoteFailoverOrder(selected, channels)) {
      try {
        const quote = await this.fetchProvider(channel, signal);
        if (quote.id === currentQuoteId || this.runtimeStore.isRecentlyUsed(quote)) continue;
        return quote;
      } catch (error) {
        if (isQuoteAbortError(error)) throw error;
      }
    }
    return null;
  }

  private pickCachedQuote(
    remoteChannels: readonly RemoteQuoteChannel[],
    currentQuoteId?: string
  ): Quote | undefined {
    for (const channel of remoteChannels) {
      const cached = this.runtimeStore
        .getCachedQuotes(channel.providerId)
        .filter((quote) => quote.id !== currentQuoteId && !this.runtimeStore.isRecentlyUsed(quote));
      const selected = this.pickFrom(cached);
      if (selected) return selected;
    }
    return undefined;
  }

  private fallbackQuote(): Quote {
    return { ...DEFAULT_FALLBACK_QUOTE, fetchedAt: this.now() };
  }

  private remember(quote: Quote): Quote {
    this.runtimeStore.rememberQuote(quote);
    return quote;
  }

  startAutomaticQuote(options: QuoteRequestOptions): AutomaticQuoteResult {
    const selected = this.pickWeightedChannel(options.channels);
    if (!selected) {
      return {
        immediate: this.remember(this.fallbackQuote()),
        immediateWasFallback: true,
        refresh: null,
      };
    }
    if (selected.kind === "local") {
      const quote = this.pickLocalQuote(selected, options.currentQuoteId) ?? this.fallbackQuote();
      return {
        immediate: this.remember(quote),
        immediateWasFallback: quote.id === DEFAULT_FALLBACK_QUOTE.id,
        refresh: null,
      };
    }

    const remoteOrder = this.getRemoteFailoverOrder(selected, options.channels);
    const cached = this.pickCachedQuote(remoteOrder, options.currentQuoteId);
    const immediate =
      cached ??
      this.pickLocalFallback(options.channels, options.currentQuoteId) ??
      this.fallbackQuote();
    const refresh = this.tryRemoteProviders(
      selected,
      options.channels,
      options.currentQuoteId,
      options.signal
    );
    return {
      immediate: this.remember(immediate),
      immediateWasFallback: !cached,
      refresh,
    };
  }

  async getManualQuoteResolution(options: QuoteRequestOptions): Promise<QuoteResolution> {
    if (options.signal?.aborted) throw new DOMException("语录请求已取消", "AbortError");
    const remoteChannels = options.channels.filter(
      (channel): channel is RemoteQuoteChannel => channel.kind === "remote"
    );
    const selectedRemote = this.pickWeightedChannel(remoteChannels);
    if (selectedRemote?.kind === "remote") {
      const remoteOrder = this.getRemoteFailoverOrder(selectedRemote, options.channels);
      const remote = await this.tryRemoteProviders(
        selectedRemote,
        options.channels,
        options.currentQuoteId,
        options.signal
      );
      if (remote) return { quote: this.remember(remote), isFallback: false };
      const cached = this.pickCachedQuote(remoteOrder, options.currentQuoteId);
      if (cached) return { quote: this.remember(cached), isFallback: true };
    }

    const local = this.pickLocalFallback(options.channels, options.currentQuoteId);
    return {
      quote: this.remember(local ?? this.fallbackQuote()),
      isFallback: Boolean(selectedRemote) || !local,
    };
  }

  async getManualQuote(options: QuoteRequestOptions): Promise<Quote> {
    return (await this.getManualQuoteResolution(options)).quote;
  }

  markQuoteDisplayed(quote: Quote): void {
    this.runtimeStore.rememberQuote(quote);
  }
}

export function createQuoteService(options: QuoteServiceOptions = {}): QuoteService {
  return new QuoteService(options);
}

export const quoteService = createQuoteService();

export function formatQuoteAttribution(quote: Quote): string {
  if (quote.providerId === "jinrishici" && quote.origin?.includes(" · ")) {
    const [dynasty, ...title] = quote.origin.split(" · ");
    return [dynasty, quote.author, title.join(" · ")].filter(Boolean).join(" · ");
  }
  return [quote.author, quote.origin].filter(Boolean).join(" · ");
}

export function areQuotesEquivalent(left: Quote, right: Quote): boolean {
  return left.id === right.id || quoteContentKey(left.text) === quoteContentKey(right.text);
}
