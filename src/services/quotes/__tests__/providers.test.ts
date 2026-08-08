import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  __resetJinrishiciSdkForTests,
  CHINESE_POETRY_ENDPOINT,
  createChinesePoetryCacheScope,
  fetchAdviceSlipQuote,
  fetchChinesePoetryQuote,
  fetchHitokotoQuote,
  fetchJinrishiciQuote,
  formatQuoteAttribution,
  HITOKOTO_INTERNATIONAL_ENDPOINT,
  HITOKOTO_PRIMARY_ENDPOINT,
  isQuoteProviderError,
  type JinrishiciSdk,
  loadJinrishiciSdk,
} from "..";

function jsonResponse(value: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { "Content-Type": "application/json" },
    ...init,
  });
}

function createAbortablePendingFetch() {
  return vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
    return new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener(
        "abort",
        () => reject(new DOMException("aborted", "AbortError")),
        { once: true }
      );
    });
  });
}

describe("quote providers", () => {
  beforeEach(() => {
    __resetJinrishiciSdkForTests();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    delete (globalThis as typeof globalThis & { jinrishici?: JinrishiciSdk }).jinrishici;
  });

  it("将一言响应映射为统一 Quote，并重复发送分类参数", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        uuid: "quote-1",
        hitokoto: "所谓无底深渊，下去，也是前程万里。",
        from_who: "木心",
        from: "素履之往",
      })
    );

    const quote = await fetchHitokotoQuote({
      categories: ["a", "h", "j"],
      fetchImplementation: fetchMock as unknown as typeof fetch,
      now: () => 123,
    });

    const url = new URL(String(fetchMock.mock.calls[0][0]));
    expect(url.origin + url.pathname).toBe(HITOKOTO_PRIMARY_ENDPOINT);
    expect(url.searchParams.getAll("c")).toEqual(["a", "h", "j"]);
    expect(url.searchParams.get("max_length")).toBe("100");
    expect(quote).toEqual({
      id: "hitokoto:quote-1",
      text: "所谓无底深渊，下去，也是前程万里。",
      author: "木心",
      origin: "素履之往",
      providerId: "hitokoto",
      language: "zh",
      fetchedAt: 123,
    });
    expect(formatQuoteAttribution(quote)).toBe("木心 · 素履之往");
  });

  it("一言主站网络错误或 5xx 时切换到国际线路", async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("network down"))
      .mockResolvedValueOnce(jsonResponse({ id: 2, hitokoto: "国际线路句子" }));

    await expect(
      fetchHitokotoQuote({ fetchImplementation: fetchMock as unknown as typeof fetch })
    ).resolves.toMatchObject({ text: "国际线路句子", providerId: "hitokoto" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[1][0])).toContain(HITOKOTO_INTERNATIONAL_ENDPOINT);
  });

  it("一言主站返回 5xx 时切换到国际线路", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("upstream error", { status: 503 }))
      .mockResolvedValueOnce(jsonResponse({ uuid: "intl", hitokoto: "备用线路可用" }));

    await expect(
      fetchHitokotoQuote({ fetchImplementation: fetchMock as unknown as typeof fetch })
    ).resolves.toMatchObject({ id: "hitokoto:intl", text: "备用线路可用" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[1][0])).toContain(HITOKOTO_INTERNATIONAL_ENDPOINT);
  });

  it("一言收到 429 时保留 Retry-After 且不切换线路", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response("limited", {
        status: 429,
        headers: { "Retry-After": "17" },
      })
    );

    const error = await fetchHitokotoQuote({
      fetchImplementation: fetchMock as unknown as typeof fetch,
    }).catch((caught: unknown) => caught);

    expect(isQuoteProviderError(error)).toBe(true);
    if (isQuoteProviderError(error)) {
      expect(error.status).toBe(429);
      expect(error.retryAfterMs).toBe(17_000);
    }
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("一言坏 payload 不切换线路", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ hitokoto: "  " }));

    await expect(
      fetchHitokotoQuote({ fetchImplementation: fetchMock as unknown as typeof fetch })
    ).rejects.toMatchObject({ code: "invalid-payload" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("一言拒绝坏 JSON，且不把解析错误伪装成线路故障", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response("not-json", {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    await expect(
      fetchHitokotoQuote({ fetchImplementation: fetchMock as unknown as typeof fetch })
    ).rejects.toMatchObject({ code: "invalid-payload", providerId: "hitokoto" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("一言主线路和国际线路均超时时返回超时错误", async () => {
    vi.useFakeTimers();
    const fetchMock = createAbortablePendingFetch();
    const request = fetchHitokotoQuote({
      fetchImplementation: fetchMock as unknown as typeof fetch,
      timeoutMs: 25,
    });
    const rejection = expect(request).rejects.toMatchObject({
      code: "timeout",
      providerId: "hitokoto",
    });

    await vi.advanceTimersByTimeAsync(25);
    await vi.advanceTimersByTimeAsync(25);
    await rejection;
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("一言收到调用方 Abort 后不尝试国际线路", async () => {
    const controller = new AbortController();
    const fetchMock = createAbortablePendingFetch();
    const request = fetchHitokotoQuote({
      fetchImplementation: fetchMock as unknown as typeof fetch,
      signal: controller.signal,
    });

    controller.abort();

    await expect(request).rejects.toMatchObject({ code: "aborted", providerId: "hitokoto" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("今日诗词适配正文、朝代、作者和标题", async () => {
    const sdk: JinrishiciSdk = {
      load(callback) {
        callback({
          status: "success",
          data: {
            id: "poem-1",
            content: "长风破浪会有时，直挂云帆济沧海。",
            origin: { dynasty: "唐", author: "李白", title: "行路难" },
          },
        });
      },
    };

    const quote = await fetchJinrishiciQuote({ loadSdk: async () => sdk, now: () => 456 });
    expect(quote).toEqual({
      id: "jinrishici:poem-1",
      text: "长风破浪会有时，直挂云帆济沧海。",
      author: "李白",
      origin: "唐 · 行路难",
      providerId: "jinrishici",
      language: "zh",
      fetchedAt: 456,
    });
    expect(formatQuoteAttribution(quote)).toBe("唐 · 李白 · 行路难");
  });

  it.each([
    { name: "空正文", payload: { status: "success", data: { content: "  " } } },
    { name: "损坏响应", payload: {} },
  ])("今日诗词拒绝$name", async ({ payload }) => {
    const sdk: JinrishiciSdk = {
      load(callback) {
        callback(payload);
      },
    };

    await expect(fetchJinrishiciQuote({ loadSdk: async () => sdk })).rejects.toMatchObject({
      code: "invalid-payload",
      providerId: "jinrishici",
    });
  });

  it.each([429, 503])("今日诗词把错误状态 %s 保留为 HTTP 错误", async (statusCode) => {
    const sdk: JinrishiciSdk = {
      load(callback) {
        callback({ status: "error", statusCode });
      },
    };

    await expect(fetchJinrishiciQuote({ loadSdk: async () => sdk })).rejects.toMatchObject({
      code: "http",
      providerId: "jinrishici",
      status: statusCode,
    });
  });

  it("今日诗词 SDK 回调超时后返回结构化错误", async () => {
    vi.useFakeTimers();
    const sdk: JinrishiciSdk = { load: vi.fn() };
    const request = fetchJinrishiciQuote({ loadSdk: async () => sdk, timeoutMs: 5000 });
    const rejection = expect(request).rejects.toMatchObject({
      code: "timeout",
      providerId: "jinrishici",
    });

    await vi.advanceTimersByTimeAsync(5000);
    await rejection;
  });

  it("复用已经加载的今日诗词全局 SDK", async () => {
    const sdk: JinrishiciSdk = { load: vi.fn() };
    (globalThis as typeof globalThis & { jinrishici?: JinrishiciSdk }).jinrishici = sdk;

    const [first, second] = await Promise.all([loadJinrishiciSdk(), loadJinrishiciSdk()]);

    expect(first).toBe(sdk);
    expect(second).toBe(sdk);
    expect(document.querySelector(`script[data-quote-provider="jinrishici"]`)).toBeNull();
  });

  it("今日诗词 SDK 加载过程中可以被调用方取消", async () => {
    const controller = new AbortController();
    const request = fetchJinrishiciQuote({
      signal: controller.signal,
      loadSdk: () => new Promise<JinrishiciSdk>(() => undefined),
    });

    controller.abort();

    await expect(request).rejects.toMatchObject({ code: "aborted" });
  });

  it("诗泉发送朝代和重复体裁参数，并从有效正文中确定性随机选句", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        data: {
          id: 100,
          title: "静夜思",
          content: ["床前明月光，疑是地上霜。", "  ", "举头望明月，低头思故乡。"],
          author: { id: 1, name: "李白" },
          dynasty: { id: 6, name: "唐" },
          type: { id: 11, name: "五言绝句" },
        },
        lang: "zh-Hans",
      })
    );

    const quote = await fetchChinesePoetryQuote({
      dynasty: "唐",
      types: ["七言绝句", "宋词"],
      fetchImplementation: fetchMock as unknown as typeof fetch,
      now: () => 654,
      random: () => 0.75,
    });

    const url = new URL(String(fetchMock.mock.calls[0][0]));
    expect(url.origin + url.pathname).toBe(CHINESE_POETRY_ENDPOINT);
    expect(url.searchParams.get("lang")).toBe("zh-Hans");
    expect(url.searchParams.get("dynasty")).toBe("唐");
    expect(url.searchParams.getAll("type")).toEqual(["七言绝句", "宋词"]);
    expect(quote).toEqual({
      id: "chinese-poetry:100:2",
      text: "举头望明月，低头思故乡。",
      author: "李白",
      origin: "唐 · 静夜思",
      cacheScope: createChinesePoetryCacheScope({
        dynasty: "唐",
        types: ["七言绝句", "宋词"],
      }),
      providerId: "chinese-poetry",
      language: "zh",
      fetchedAt: 654,
    });
    expect(formatQuoteAttribution(quote)).toBe("唐 · 李白 · 静夜思");
  });

  it.each([
    { name: "缺少 data", payload: {} },
    { name: "正文不是数组", payload: { data: { content: "明月" } } },
    { name: "正文为空", payload: { data: { content: [" ", null] } } },
  ])("诗泉拒绝$name", async ({ payload }) => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(payload));

    await expect(
      fetchChinesePoetryQuote({ fetchImplementation: fetchMock as unknown as typeof fetch })
    ).rejects.toMatchObject({ code: "invalid-payload", providerId: "chinese-poetry" });
  });

  it.each([429, 503])("诗泉保留 HTTP %s 状态", async (status) => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("error", { status }));

    await expect(
      fetchChinesePoetryQuote({ fetchImplementation: fetchMock as unknown as typeof fetch })
    ).rejects.toMatchObject({ code: "http", providerId: "chinese-poetry", status });
  });

  it("诗泉请求超时后返回结构化错误", async () => {
    vi.useFakeTimers();
    const fetchMock = createAbortablePendingFetch();
    const request = fetchChinesePoetryQuote({
      fetchImplementation: fetchMock as unknown as typeof fetch,
      timeoutMs: 25,
    });
    const rejection = expect(request).rejects.toMatchObject({
      code: "timeout",
      providerId: "chinese-poetry",
    });

    await vi.advanceTimersByTimeAsync(25);
    await rejection;
  });

  it("诗泉将调用方 AbortSignal 传递到实际网络请求", async () => {
    const controller = new AbortController();
    const fetchMock = createAbortablePendingFetch();
    const request = fetchChinesePoetryQuote({
      fetchImplementation: fetchMock as unknown as typeof fetch,
      signal: controller.signal,
    });

    controller.abort();

    await expect(request).rejects.toMatchObject({
      code: "aborted",
      providerId: "chinese-poetry",
    });
  });

  it("Advice Slip 适配 ID 与英文正文，并拒绝坏 JSON", async () => {
    const success = vi
      .fn()
      .mockResolvedValue(jsonResponse({ slip: { id: 42, advice: "Keep going." } }));
    const quote = await fetchAdviceSlipQuote({
      fetchImplementation: success as unknown as typeof fetch,
      now: () => 789,
    });
    expect(quote).toEqual({
      id: "advice-slip:42",
      text: "Keep going.",
      origin: "Advice Slip",
      providerId: "advice-slip",
      language: "en",
      fetchedAt: 789,
    });
    expect(formatQuoteAttribution(quote)).toBe("Advice Slip");

    const invalidJson = vi
      .fn()
      .mockResolvedValue(
        new Response("not-json", { status: 200, headers: { "Content-Type": "application/json" } })
      );
    await expect(
      fetchAdviceSlipQuote({ fetchImplementation: invalidJson as unknown as typeof fetch })
    ).rejects.toMatchObject({ code: "invalid-payload" });
  });

  it("Advice Slip 拒绝空字段", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ slip: { id: 42, advice: " " } }));

    await expect(
      fetchAdviceSlipQuote({ fetchImplementation: fetchMock as unknown as typeof fetch })
    ).rejects.toMatchObject({ code: "invalid-payload", providerId: "advice-slip" });
  });

  it("Advice Slip 请求超时后返回结构化错误", async () => {
    vi.useFakeTimers();
    const fetchMock = createAbortablePendingFetch();
    const request = fetchAdviceSlipQuote({
      fetchImplementation: fetchMock as unknown as typeof fetch,
      timeoutMs: 25,
    });
    const rejection = expect(request).rejects.toMatchObject({
      code: "timeout",
      providerId: "advice-slip",
    });

    await vi.advanceTimersByTimeAsync(25);
    await rejection;
  });

  it.each([429, 503])("Advice Slip 保留 HTTP %s 状态", async (status) => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("error", { status }));

    await expect(
      fetchAdviceSlipQuote({ fetchImplementation: fetchMock as unknown as typeof fetch })
    ).rejects.toMatchObject({ code: "http", providerId: "advice-slip", status });
  });

  it("将调用方 AbortSignal 传递到实际网络请求", async () => {
    const controller = new AbortController();
    const fetchMock = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () =>
          reject(new DOMException("aborted", "AbortError"))
        );
      });
    });
    const request = fetchAdviceSlipQuote({
      fetchImplementation: fetchMock as unknown as typeof fetch,
      signal: controller.signal,
    });

    controller.abort();

    await expect(request).rejects.toMatchObject({ code: "aborted" });
  });
});
