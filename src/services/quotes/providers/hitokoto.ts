import type { HitokotoCategory, Quote } from "../../../types/quote";
import {
  createStableQuoteId,
  type FetchImplementation,
  isQuoteProviderError,
  QuoteProviderError,
  requestQuoteJson,
  requireNonEmptyString,
} from "../providerTypes";

export const HITOKOTO_PRIMARY_ENDPOINT = "https://v1.hitokoto.cn/";
export const HITOKOTO_INTERNATIONAL_ENDPOINT = "https://international.v1.hitokoto.cn/";

interface HitokotoResponse {
  id?: number;
  uuid?: string;
  hitokoto?: string;
  from?: string;
  from_who?: string | null;
}

export interface FetchHitokotoQuoteOptions {
  categories?: readonly HitokotoCategory[];
  signal?: AbortSignal;
  fetchImplementation?: FetchImplementation;
  timeoutMs?: number;
  now?: () => number;
}

function createHitokotoUrl(endpoint: string, categories: readonly HitokotoCategory[]): string {
  const url = new URL(endpoint);
  categories.forEach((category) => url.searchParams.append("c", category));
  url.searchParams.set("max_length", "100");
  return url.toString();
}

function adaptHitokotoResponse(payload: unknown, fetchedAt: number): Quote {
  if (!payload || typeof payload !== "object") {
    throw new QuoteProviderError("一言返回数据格式无效", {
      code: "invalid-payload",
      providerId: "hitokoto",
    });
  }
  const response = payload as HitokotoResponse;
  const text = requireNonEmptyString(response.hitokoto);
  if (!text) {
    throw new QuoteProviderError("一言返回了空句子", {
      code: "invalid-payload",
      providerId: "hitokoto",
    });
  }

  return {
    id: createStableQuoteId("hitokoto", response.uuid ?? response.id, text),
    text,
    author: requireNonEmptyString(response.from_who),
    origin: requireNonEmptyString(response.from),
    providerId: "hitokoto",
    language: "zh",
    fetchedAt,
  };
}

function shouldTryInternationalEndpoint(error: unknown): boolean {
  if (!isQuoteProviderError(error)) return false;
  return (
    error.code === "network" ||
    error.code === "timeout" ||
    (error.code === "http" && typeof error.status === "number" && error.status >= 500)
  );
}

export async function fetchHitokotoQuote(options: FetchHitokotoQuoteOptions = {}): Promise<Quote> {
  const categories: readonly HitokotoCategory[] = options.categories?.length
    ? options.categories
    : ["d", "i", "k"];
  const now = options.now ?? Date.now;
  const request = (endpoint: string) =>
    requestQuoteJson({
      providerId: "hitokoto",
      url: createHitokotoUrl(endpoint, categories),
      fetchImplementation: options.fetchImplementation,
      signal: options.signal,
      timeoutMs: options.timeoutMs,
      now,
    });

  try {
    return adaptHitokotoResponse(await request(HITOKOTO_PRIMARY_ENDPOINT), now());
  } catch (error) {
    if (!shouldTryInternationalEndpoint(error)) throw error;
    return adaptHitokotoResponse(await request(HITOKOTO_INTERNATIONAL_ENDPOINT), now());
  }
}
