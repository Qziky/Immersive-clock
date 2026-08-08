import type {
  ChinesePoetryDynasty,
  ChinesePoetryType,
  Quote,
  QuoteProviderId,
} from "../../types/quote";

export type QuoteProviderErrorCode =
  "aborted" | "http" | "invalid-payload" | "network" | "sdk" | "timeout" | "unavailable";

export interface QuoteProviderErrorOptions {
  code: QuoteProviderErrorCode;
  providerId: QuoteProviderId;
  status?: number;
  retryAfterMs?: number;
  cause?: unknown;
}

export class QuoteProviderError extends Error {
  readonly code: QuoteProviderErrorCode;
  readonly providerId: QuoteProviderId;
  readonly status?: number;
  readonly retryAfterMs?: number;

  constructor(message: string, options: QuoteProviderErrorOptions) {
    super(message);
    this.name = "QuoteProviderError";
    if (options.cause !== undefined) {
      (this as Error & { cause?: unknown }).cause = options.cause;
    }
    this.code = options.code;
    this.providerId = options.providerId;
    this.status = options.status;
    this.retryAfterMs = options.retryAfterMs;
  }
}

export interface QuoteProviderRequestOptions {
  signal?: AbortSignal;
  hitokotoCategories?: string[];
  chinesePoetryDynasty?: ChinesePoetryDynasty;
  chinesePoetryTypes?: readonly ChinesePoetryType[];
}

export interface QuoteProvider {
  readonly id: QuoteProviderId;
  readonly minIntervalMs: number;
  fetchQuote(options?: QuoteProviderRequestOptions): Promise<Quote>;
}

export type FetchImplementation = typeof fetch;

export function isQuoteProviderError(error: unknown): error is QuoteProviderError {
  return error instanceof QuoteProviderError;
}

export function isQuoteAbortError(error: unknown): boolean {
  return (
    (error instanceof QuoteProviderError && error.code === "aborted") ||
    (error instanceof DOMException && error.name === "AbortError")
  );
}

export function createQuoteAbortError(
  providerId: QuoteProviderId,
  cause?: unknown
): QuoteProviderError {
  return new QuoteProviderError("语录请求已取消", {
    code: "aborted",
    providerId,
    cause,
  });
}

export function quoteContentKey(text: string): string {
  return text.trim().replace(/\s+/g, " ").toLocaleLowerCase();
}

export function createStableQuoteId(
  providerId: QuoteProviderId | "local",
  upstreamId: unknown,
  text: string
): string {
  const normalizedId =
    typeof upstreamId === "string" || typeof upstreamId === "number"
      ? String(upstreamId).trim()
      : "";
  if (normalizedId) return `${providerId}:${normalizedId}`;

  let hash = 2166136261;
  for (const character of quoteContentKey(text)) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return `${providerId}:text-${(hash >>> 0).toString(36)}`;
}

function parseRetryAfter(value: string | null, now: number): number | undefined {
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.round(seconds * 1000);
  const date = Date.parse(value);
  if (!Number.isFinite(date)) return undefined;
  return Math.max(0, date - now);
}

interface RequestJsonOptions {
  providerId: QuoteProviderId;
  url: string;
  fetchImplementation?: FetchImplementation;
  signal?: AbortSignal;
  timeoutMs?: number;
  now?: () => number;
}

export async function requestQuoteJson(options: RequestJsonOptions): Promise<unknown> {
  const {
    providerId,
    url,
    signal,
    timeoutMs = 5000,
    fetchImplementation = globalThis.fetch,
    now = Date.now,
  } = options;
  if (signal?.aborted) throw createQuoteAbortError(providerId, signal.reason);
  if (typeof fetchImplementation !== "function") {
    throw new QuoteProviderError("当前环境不支持网络请求", {
      code: "network",
      providerId,
    });
  }

  const controller = new AbortController();
  let didTimeout = false;
  const abortFromCaller = () => controller.abort(signal?.reason);
  signal?.addEventListener("abort", abortFromCaller, { once: true });
  const timeout = setTimeout(() => {
    didTimeout = true;
    controller.abort();
  }, timeoutMs);

  try {
    const response = await fetchImplementation(url, {
      cache: "no-store",
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new QuoteProviderError(`语录服务返回 HTTP ${response.status}`, {
        code: "http",
        providerId,
        status: response.status,
        retryAfterMs: parseRetryAfter(response.headers.get("Retry-After"), now()),
      });
    }

    try {
      return await response.json();
    } catch (error) {
      throw new QuoteProviderError("语录服务返回了无法解析的数据", {
        code: "invalid-payload",
        providerId,
        cause: error,
      });
    }
  } catch (error) {
    if (error instanceof QuoteProviderError) throw error;
    if (signal?.aborted) throw createQuoteAbortError(providerId, error);
    if (didTimeout) {
      throw new QuoteProviderError("语录请求超时", {
        code: "timeout",
        providerId,
        cause: error,
      });
    }
    throw new QuoteProviderError("语录网络请求失败", {
      code: "network",
      providerId,
      cause: error,
    });
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener("abort", abortFromCaller);
  }
}

export function requireNonEmptyString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim();
  return normalized || undefined;
}
