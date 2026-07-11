import type { Quote } from "../../../types/quote";
import {
  createQuoteAbortError,
  createStableQuoteId,
  QuoteProviderError,
  requireNonEmptyString,
} from "../providerTypes";

export const JINRISHICI_SDK_URL = "https://sdk.jinrishici.com/v2/browser/jinrishici.js";

interface JinrishiciOrigin {
  author?: string;
  dynasty?: string;
  title?: string;
}

interface JinrishiciResponse {
  status?: string;
  errCode?: number | string;
  code?: number | string;
  statusCode?: number | string;
  data?: {
    id?: string;
    content?: string;
    origin?: JinrishiciOrigin;
  };
}

function extractHttpStatus(payload: JinrishiciResponse): number | undefined {
  for (const candidate of [payload.errCode, payload.code, payload.statusCode]) {
    const status = Number(candidate);
    if (Number.isInteger(status) && status >= 400 && status <= 599) return status;
  }
  return undefined;
}

export interface JinrishiciSdk {
  load(callback: (result: JinrishiciResponse) => void): void;
}

type BrowserGlobal = typeof globalThis & { jinrishici?: JinrishiciSdk };

let sdkPromise: Promise<JinrishiciSdk> | null = null;

function getLoadedSdk(): JinrishiciSdk | undefined {
  const sdk = (globalThis as BrowserGlobal).jinrishici;
  return sdk && typeof sdk.load === "function" ? sdk : undefined;
}

export function loadJinrishiciSdk(): Promise<JinrishiciSdk> {
  const loaded = getLoadedSdk();
  if (loaded) return Promise.resolve(loaded);
  if (sdkPromise) return sdkPromise;

  sdkPromise = new Promise<JinrishiciSdk>((resolve, reject) => {
    if (typeof document === "undefined") {
      reject(
        new QuoteProviderError("今日诗词 SDK 只能在浏览器中使用", {
          code: "sdk",
          providerId: "jinrishici",
        })
      );
      return;
    }

    const existing = document.querySelector<HTMLScriptElement>(
      `script[src="${JINRISHICI_SDK_URL}"]`
    );
    const script = existing ?? document.createElement("script");
    let settled = false;
    const cleanup = () => {
      clearTimeout(timer);
      script.removeEventListener("load", handleLoad);
      script.removeEventListener("error", handleError);
    };
    const settleWithSdk = () => {
      if (settled) return;
      const sdk = getLoadedSdk();
      if (!sdk) {
        settleWithError("今日诗词 SDK 未正确初始化");
        return;
      }
      settled = true;
      cleanup();
      resolve(sdk);
    };
    const settleWithError = (message: string) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(
        new QuoteProviderError(message, {
          code: "network",
          providerId: "jinrishici",
        })
      );
    };
    const handleLoad = () => settleWithSdk();
    const handleError = () => settleWithError("今日诗词 SDK 加载失败");
    const timer = setTimeout(() => settleWithError("今日诗词 SDK 加载超时"), 5000);

    script.addEventListener("load", handleLoad, { once: true });
    script.addEventListener("error", handleError, { once: true });
    if (!existing) {
      script.src = JINRISHICI_SDK_URL;
      script.async = true;
      script.charset = "utf-8";
      script.dataset.quoteProvider = "jinrishici";
      document.head.appendChild(script);
    }
  }).catch((error) => {
    sdkPromise = null;
    throw error;
  });

  return sdkPromise;
}

export interface FetchJinrishiciQuoteOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
  now?: () => number;
  loadSdk?: () => Promise<JinrishiciSdk>;
}

function adaptJinrishiciResponse(payload: unknown, fetchedAt: number): Quote {
  if (!payload || typeof payload !== "object") {
    throw new QuoteProviderError("今日诗词返回数据格式无效", {
      code: "invalid-payload",
      providerId: "jinrishici",
    });
  }
  const response = payload as JinrishiciResponse;
  if (response.status && response.status !== "success") {
    const status = extractHttpStatus(response);
    throw new QuoteProviderError("今日诗词返回了错误状态", {
      code: status ? "http" : "invalid-payload",
      providerId: "jinrishici",
      status,
    });
  }
  const text = requireNonEmptyString(response.data?.content);
  if (!text) {
    throw new QuoteProviderError("今日诗词返回了空句子", {
      code: "invalid-payload",
      providerId: "jinrishici",
    });
  }
  const origin = response.data?.origin;
  const dynasty = requireNonEmptyString(origin?.dynasty);
  const title = requireNonEmptyString(origin?.title);

  return {
    id: createStableQuoteId("jinrishici", response.data?.id, text),
    text,
    author: requireNonEmptyString(origin?.author),
    origin: [dynasty, title].filter(Boolean).join(" · ") || undefined,
    providerId: "jinrishici",
    language: "zh",
    fetchedAt,
  };
}

export async function fetchJinrishiciQuote(
  options: FetchJinrishiciQuoteOptions = {}
): Promise<Quote> {
  const { signal, timeoutMs = 5000, now = Date.now, loadSdk = loadJinrishiciSdk } = options;
  if (signal?.aborted) throw createQuoteAbortError("jinrishici", signal.reason);
  const sdkPromise = loadSdk();
  const sdk = signal
    ? await new Promise<JinrishiciSdk>((resolve, reject) => {
        const handleAbort = () => reject(createQuoteAbortError("jinrishici", signal.reason));
        signal.addEventListener("abort", handleAbort, { once: true });
        sdkPromise.then(
          (loadedSdk) => {
            signal.removeEventListener("abort", handleAbort);
            resolve(loadedSdk);
          },
          (error) => {
            signal.removeEventListener("abort", handleAbort);
            reject(error);
          }
        );
      })
    : await sdkPromise;
  if (signal?.aborted) throw createQuoteAbortError("jinrishici", signal.reason);

  return new Promise<Quote>((resolve, reject) => {
    let settled = false;
    const cleanup = () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", handleAbort);
    };
    const settle = (handler: () => void) => {
      if (settled) return;
      settled = true;
      cleanup();
      handler();
    };
    const handleAbort = () =>
      settle(() => reject(createQuoteAbortError("jinrishici", signal?.reason)));
    const timer = setTimeout(
      () =>
        settle(() =>
          reject(
            new QuoteProviderError("今日诗词回调超时", {
              code: "timeout",
              providerId: "jinrishici",
            })
          )
        ),
      timeoutMs
    );
    signal?.addEventListener("abort", handleAbort, { once: true });

    try {
      sdk.load((payload) => {
        settle(() => {
          try {
            resolve(adaptJinrishiciResponse(payload, now()));
          } catch (error) {
            reject(error);
          }
        });
      });
    } catch (error) {
      settle(() =>
        reject(
          new QuoteProviderError("今日诗词 SDK 调用失败", {
            code: "sdk",
            providerId: "jinrishici",
            cause: error,
          })
        )
      );
    }
  });
}

export function __resetJinrishiciSdkForTests(): void {
  sdkPromise = null;
}
