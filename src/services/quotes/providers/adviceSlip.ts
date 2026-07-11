import type { Quote } from "../../../types/quote";
import {
  createStableQuoteId,
  type FetchImplementation,
  QuoteProviderError,
  requestQuoteJson,
  requireNonEmptyString,
} from "../providerTypes";

export const ADVICE_SLIP_ENDPOINT = "https://api.adviceslip.com/advice";

interface AdviceSlipResponse {
  slip?: {
    id?: number | string;
    advice?: string;
  };
}

export interface FetchAdviceSlipQuoteOptions {
  signal?: AbortSignal;
  fetchImplementation?: FetchImplementation;
  timeoutMs?: number;
  now?: () => number;
}

export async function fetchAdviceSlipQuote(
  options: FetchAdviceSlipQuoteOptions = {}
): Promise<Quote> {
  const now = options.now ?? Date.now;
  const payload = (await requestQuoteJson({
    providerId: "advice-slip",
    url: ADVICE_SLIP_ENDPOINT,
    fetchImplementation: options.fetchImplementation,
    signal: options.signal,
    timeoutMs: options.timeoutMs,
    now,
  })) as AdviceSlipResponse;
  const text = requireNonEmptyString(payload?.slip?.advice);
  if (!text) {
    throw new QuoteProviderError("Advice Slip 返回了空句子", {
      code: "invalid-payload",
      providerId: "advice-slip",
    });
  }

  return {
    id: createStableQuoteId("advice-slip", payload.slip?.id, text),
    text,
    origin: "Advice Slip",
    providerId: "advice-slip",
    language: "en",
    fetchedAt: now(),
  };
}
