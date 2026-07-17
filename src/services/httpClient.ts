import { executeGovernedRequest, type GovernedRequestOptions } from "./apiGovernance";

export type HttpRequestErrorKind = "http" | "invalid-json" | "network" | "timeout";

export class HttpRequestError extends Error {
  constructor(
    message: string,
    public readonly kind: HttpRequestErrorKind,
    public readonly url: string,
    options?: {
      cause?: unknown;
      responsePreview?: string;
      retryAfterMs?: number;
      status?: number;
    }
  ) {
    super(message);
    this.name = "HttpRequestError";
    this.requestCause = options?.cause;
    this.responsePreview = options?.responsePreview;
    this.retryAfterMs = options?.retryAfterMs;
    this.status = options?.status;
  }

  readonly responsePreview?: string;
  readonly requestCause?: unknown;
  readonly retryAfterMs?: number;
  readonly status?: number;
}

function parseRetryAfter(value: string | null, now = Date.now()): number | undefined {
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.round(seconds * 1000);
  const retryAt = Date.parse(value);
  if (!Number.isFinite(retryAt)) return undefined;
  return Math.max(0, retryAt - now);
}

/**
 * 通过 fetch 获取 JSON 数据
 * 包含超时控制与异常处理
 */
export async function httpGetJson(
  url: string,
  headers?: Record<string, string>,
  timeoutMs = 10000,
  governance?: GovernedRequestOptions
): Promise<unknown> {
  if (governance) {
    return executeGovernedRequest(governance, () => requestJson(url, headers, timeoutMs));
  }
  return requestJson(url, headers, timeoutMs);
}

async function requestJson(
  url: string,
  headers?: Record<string, string>,
  timeoutMs = 10000
): Promise<unknown> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const resp = await fetch(url, {
      headers: headers || {},
      signal: controller.signal,
    });
    const text = await resp.text();
    const preview = String(text || "")
      .replace(/\s+/g, " ")
      .slice(0, 300);

    let parsed: unknown | null = null;
    if (text) {
      try {
        parsed = JSON.parse(text) as unknown;
      } catch {
        parsed = null;
      }
    }

    if (!resp.ok) {
      throw new HttpRequestError(
        `HTTP ${resp.status} ${resp.statusText}：${url}${preview ? `｜${preview}` : ""}`,
        "http",
        url,
        {
          responsePreview: preview || undefined,
          retryAfterMs: parseRetryAfter(resp.headers?.get?.("Retry-After") ?? null),
          status: resp.status,
        }
      );
    }

    if (parsed == null) {
      throw new HttpRequestError(
        `响应非 JSON：${url}${preview ? `｜${preview}` : ""}`,
        "invalid-json",
        url,
        { responsePreview: preview || undefined, status: resp.status }
      );
    }

    return parsed;
  } catch (error: unknown) {
    if (error instanceof HttpRequestError) throw error;
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new HttpRequestError(`请求超时：${url}`, "timeout", url, { cause: error });
    }
    throw new HttpRequestError(`网络请求失败：${url}`, "network", url, { cause: error });
  } finally {
    clearTimeout(timeout);
  }
}
