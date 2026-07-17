import { afterEach, describe, expect, it, vi } from "vitest";

import { httpGetJson, HttpRequestError } from "../httpClient";

describe("httpClient", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("解析秒数形式的 Retry-After", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("limited", { status: 429, headers: { "Retry-After": "120" } }))
    );

    const error = await httpGetJson("/weather").catch((reason: unknown) => reason);

    expect(error).toBeInstanceOf(HttpRequestError);
    expect(error).toMatchObject({ retryAfterMs: 120_000, status: 429 });
  });

  it("解析 HTTP 日期形式的 Retry-After", async () => {
    vi.setSystemTime("2026-07-17T10:00:00+08:00");
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response("limited", {
            status: 429,
            headers: { "Retry-After": "Fri, 17 Jul 2026 02:05:00 GMT" },
          })
      )
    );

    const error = await httpGetJson("/weather").catch((reason: unknown) => reason);

    expect(error).toMatchObject({ retryAfterMs: 5 * 60_000, status: 429 });
    vi.useRealTimers();
  });
});
