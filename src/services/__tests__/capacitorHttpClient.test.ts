import { beforeEach, describe, expect, it, vi } from "vitest";

import { HttpRequestError } from "../httpClient";

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
}));

vi.mock("@capacitor/core", () => ({
  CapacitorHttp: {
    get: mocks.get,
  },
}));

describe("capacitorHttpClient", () => {
  beforeEach(() => {
    mocks.get.mockReset();
  });

  it("使用原生超时参数并解析 JSON 文本", async () => {
    mocks.get.mockResolvedValue({
      data: '{"status":0}',
      headers: {},
      status: 200,
      url: "https://example.test/weather",
    });
    const { capacitorHttpGetJson } = await import("../capacitorHttpClient");

    await expect(
      capacitorHttpGetJson("https://example.test/weather", undefined, 4321)
    ).resolves.toEqual({ status: 0 });
    expect(mocks.get).toHaveBeenCalledWith({
      url: "https://example.test/weather",
      headers: {},
      connectTimeout: 4321,
      readTimeout: 4321,
      responseType: "text",
    });
  });

  it("保留原生 HTTP 状态码和 Retry-After", async () => {
    mocks.get.mockResolvedValue({
      data: "limited",
      headers: { "retry-after": "30" },
      status: 429,
      url: "https://example.test/weather",
    });
    const { capacitorHttpGetJson } = await import("../capacitorHttpClient");

    const error = await capacitorHttpGetJson("https://example.test/weather").catch(
      (reason: unknown) => reason
    );

    expect(error).toBeInstanceOf(HttpRequestError);
    expect(error).toMatchObject({ kind: "http", retryAfterMs: 30000, status: 429 });
  });

  it("将非 JSON 响应映射为现有错误类型", async () => {
    mocks.get.mockResolvedValue({
      data: "not-json",
      headers: {},
      status: 200,
      url: "https://example.test/weather",
    });
    const { capacitorHttpGetJson } = await import("../capacitorHttpClient");

    await expect(capacitorHttpGetJson("https://example.test/weather")).rejects.toMatchObject({
      kind: "invalid-json",
      status: 200,
    });
  });

  it("区分原生超时和普通网络错误", async () => {
    const { capacitorHttpGetJson } = await import("../capacitorHttpClient");

    mocks.get.mockRejectedValueOnce(new Error("Read timed out"));
    await expect(capacitorHttpGetJson("https://example.test/weather")).rejects.toMatchObject({
      kind: "timeout",
    });

    mocks.get.mockRejectedValueOnce(new Error("connection reset"));
    await expect(capacitorHttpGetJson("https://example.test/weather")).rejects.toMatchObject({
      kind: "network",
    });
  });
});
