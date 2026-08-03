import { CapacitorHttp, type HttpResponse } from "@capacitor/core";

import { HttpRequestError } from "./httpClient";

function createResponsePreview(data: unknown): string | undefined {
  let text: string;
  if (typeof data === "string") {
    text = data;
  } else {
    try {
      text = JSON.stringify(data);
    } catch {
      text = String(data);
    }
  }

  const preview = text.replace(/\s+/g, " ").slice(0, 300);
  return preview || undefined;
}

function getHeader(headers: Record<string, string>, name: string): string | null {
  const target = name.toLowerCase();
  const entry = Object.entries(headers).find(([key]) => key.toLowerCase() === target);
  return entry?.[1] ?? null;
}

function parseRetryAfter(value: string | null, now = Date.now()): number | undefined {
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.round(seconds * 1000);
  const retryAt = Date.parse(value);
  if (!Number.isFinite(retryAt)) return undefined;
  return Math.max(0, retryAt - now);
}

function parseResponseData(response: HttpResponse): unknown {
  if (typeof response.data !== "string") return response.data;
  if (!response.data) return null;

  try {
    return JSON.parse(response.data) as unknown;
  } catch {
    return null;
  }
}

function isTimeoutError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { code?: unknown; message?: unknown };
  const code = typeof candidate.code === "string" ? candidate.code : "";
  const message = typeof candidate.message === "string" ? candidate.message : "";
  return /timeout|timed.?out/i.test(`${code} ${message}`);
}

export async function capacitorHttpGetJson(
  url: string,
  headers?: Record<string, string>,
  timeoutMs = 10000
): Promise<unknown> {
  try {
    const response = await CapacitorHttp.get({
      url,
      headers: headers ?? {},
      connectTimeout: timeoutMs,
      readTimeout: timeoutMs,
      responseType: "text",
    });
    const preview = createResponsePreview(response.data);

    if (response.status < 200 || response.status >= 300) {
      throw new HttpRequestError(
        `HTTP ${response.status}：${url}${preview ? `｜${preview}` : ""}`,
        "http",
        url,
        {
          responsePreview: preview,
          retryAfterMs: parseRetryAfter(getHeader(response.headers, "Retry-After")),
          status: response.status,
        }
      );
    }

    const parsed = parseResponseData(response);
    if (parsed == null) {
      throw new HttpRequestError(
        `响应非 JSON：${url}${preview ? `｜${preview}` : ""}`,
        "invalid-json",
        url,
        { responsePreview: preview, status: response.status }
      );
    }

    return parsed;
  } catch (error: unknown) {
    if (error instanceof HttpRequestError) throw error;
    if (isTimeoutError(error)) {
      throw new HttpRequestError(`请求超时：${url}`, "timeout", url, { cause: error });
    }
    throw new HttpRequestError(`网络请求失败：${url}`, "network", url, { cause: error });
  }
}
