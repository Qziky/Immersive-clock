import { afterEach, describe, expect, it, vi } from "vitest";

import onRequest from "../../../edge-functions/api/xiaomi-weather/[[path]]";

describe("EdgeOne weather proxy", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("forwards the weather path and query to the fixed upstream", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response('{"weather":"sunny"}', {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    const response = await onRequest({
      request: new Request("https://clock.example/api/xiaomi-weather/wtr-v3/weather/all?city=1"),
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://weatherapi.market.xiaomi.com/wtr-v3/weather/all?city=1",
      { redirect: "manual" }
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/json");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ weather: "sunny" });
  });

  it("passes rate limits and retry information to the client", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response("slow down", {
          status: 429,
          headers: { "Retry-After": "60" },
        })
      )
    );
    const response = await onRequest({
      request: new Request("https://clock.example/api/xiaomi-weather/wtr-v3/weather/all"),
    });
    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("60");
  });

  it("rejects other paths, methods, and upstream redirects", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 302 }));
    vi.stubGlobal("fetch", fetchMock);
    const invalidPath = await onRequest({
      request: new Request("https://clock.example/api/xiaomi-weather/other"),
    });
    const post = await onRequest({
      request: new Request("https://clock.example/api/xiaomi-weather/wtr-v3/weather/all", {
        method: "POST",
      }),
    });
    expect(invalidPath.status).toBe(404);
    expect(post.status).toBe(405);
    expect(fetchMock).not.toHaveBeenCalled();
    const redirect = await onRequest({
      request: new Request("https://clock.example/api/xiaomi-weather/wtr-v3/weather/all"),
    });
    expect(redirect.status).toBe(502);
  });
});
