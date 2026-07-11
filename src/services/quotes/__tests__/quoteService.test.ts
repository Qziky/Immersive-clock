import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  createQuoteService,
  DEFAULT_FALLBACK_QUOTE,
  QuoteProviderError,
  type QuoteProvider,
  QuoteRuntimeStore,
} from "..";
import type {
  LocalQuoteChannel,
  Quote,
  QuoteChannel,
  QuoteProviderId,
  RemoteQuoteChannel,
} from "../../../types/quote";

function localChannel(overrides: Partial<LocalQuoteChannel> = {}): LocalQuoteChannel {
  return {
    id: "local",
    name: "本地",
    kind: "local",
    weight: 10,
    enabled: true,
    builtIn: true,
    quotes: ["本地句子一", "本地句子二——本地来源"],
    orderMode: "random",
    ...overrides,
  };
}

function remoteChannel(
  providerId: QuoteProviderId,
  overrides: Partial<RemoteQuoteChannel> = {}
): RemoteQuoteChannel {
  return {
    id: `${providerId}-channel`,
    name: providerId,
    kind: "remote",
    providerId,
    language: providerId === "advice-slip" ? "en" : "zh",
    description: "test",
    weight: 10,
    enabled: true,
    builtIn: true,
    ...overrides,
  };
}

function remoteQuote(providerId: QuoteProviderId, text: string, fetchedAt: number): Quote {
  return {
    id: `${providerId}:${text}`,
    text,
    providerId,
    language: providerId === "advice-slip" ? "en" : "zh",
    fetchedAt,
  };
}

function provider(
  id: QuoteProviderId,
  fetchQuote: QuoteProvider["fetchQuote"],
  minIntervalMs = 0
): QuoteProvider {
  return { id, minIntervalMs, fetchQuote };
}

function networkError(providerId: QuoteProviderId): QuoteProviderError {
  return new QuoteProviderError("offline", { code: "network", providerId });
}

describe("QuoteService", () => {
  beforeEach(() => localStorage.clear());

  it("按权重挑选本地频道并持久化顺序游标", async () => {
    const channels: QuoteChannel[] = [
      localChannel({ id: "disabled", enabled: false, weight: 999 }),
      localChannel({ id: "sequential", orderMode: "sequential" }),
    ];
    const firstService = createQuoteService({
      storage: localStorage,
      random: () => 0,
      now: () => 100,
    });
    const first = await firstService.getManualQuote({ channels });
    const secondService = createQuoteService({
      storage: localStorage,
      random: () => 0,
      now: () => 200,
    });
    const second = await secondService.getManualQuote({ channels });

    expect(first.text).toBe("本地句子一");
    expect(second.text).toBe("本地句子二");
    expect(second.origin).toBe("本地来源");
  });

  it("在多个可用频道间按权重选择", async () => {
    const service = createQuoteService({
      storage: localStorage,
      random: () => 0.75,
      now: () => 100,
    });

    const quote = await service.getManualQuote({
      channels: [
        localChannel({ id: "low", weight: 1, quotes: ["低权重"] }),
        localChannel({ id: "high", weight: 3, quotes: ["高权重"] }),
      ],
    });

    expect(quote.text).toBe("高权重");
  });

  it("手动刷新优先请求在线频道，即使本地频道权重更高", async () => {
    const fetchQuote = vi.fn().mockResolvedValue(remoteQuote("hitokoto", "联网优先", 100));
    const service = createQuoteService({
      storage: localStorage,
      random: () => 0,
      now: () => 1_000_000,
      providers: [provider("hitokoto", fetchQuote)],
    });

    const result = await service.getManualQuoteResolution({
      channels: [localChannel({ weight: 9999 }), remoteChannel("hitokoto", { weight: 1 })],
    });

    expect(result).toMatchObject({ quote: { text: "联网优先" }, isFallback: false });
    expect(fetchQuote).toHaveBeenCalledTimes(1);
  });

  it("在线源失败后切换到另一个健康在线源", async () => {
    const first = vi.fn().mockRejectedValue(networkError("hitokoto"));
    const second = vi.fn().mockResolvedValue(remoteQuote("advice-slip", "Try another way.", 100));
    const service = createQuoteService({
      storage: localStorage,
      random: () => 0,
      now: () => 1_000_000,
      providers: [provider("hitokoto", first), provider("advice-slip", second)],
    });

    const result = await service.getManualQuoteResolution({
      channels: [remoteChannel("hitokoto"), remoteChannel("advice-slip"), localChannel()],
    });

    expect(result).toMatchObject({ quote: { text: "Try another way." }, isFallback: false });
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);
  });

  it("所有在线源失败后依次使用持久缓存和本地频道", async () => {
    const now = 2_000_000;
    const runtime = new QuoteRuntimeStore({ storage: localStorage, now: () => now });
    runtime.addCachedQuote(remoteQuote("hitokoto", "缓存句子", now - 1000));
    const failing = vi.fn().mockRejectedValue(networkError("hitokoto"));
    const channels = [remoteChannel("hitokoto"), localChannel()];

    const cachedService = createQuoteService({
      storage: localStorage,
      random: () => 0,
      now: () => now,
      providers: [provider("hitokoto", failing)],
    });
    const cached = await cachedService.getManualQuoteResolution({ channels });
    expect(cached).toMatchObject({ quote: { text: "缓存句子" }, isFallback: true });

    localStorage.clear();
    const localService = createQuoteService({
      storage: localStorage,
      random: () => 0,
      now: () => now,
      providers: [provider("hitokoto", failing)],
    });
    const local = await localService.getManualQuoteResolution({ channels });
    expect(local).toMatchObject({ quote: { providerId: "local" }, isFallback: true });
  });

  it("没有任何可用内容时返回不可删除的内置句", async () => {
    const service = createQuoteService({ storage: localStorage, random: () => 0, now: () => 100 });

    const quote = await service.getManualQuote({ channels: [] });

    expect(quote.id).toBe(DEFAULT_FALLBACK_QUOTE.id);
    expect(quote.text).toBe(DEFAULT_FALLBACK_QUOTE.text);
  });

  it("自动模式立即返回本地内容并在后台刷新选中的在线源", async () => {
    const fetchQuote = vi.fn().mockResolvedValue(remoteQuote("hitokoto", "联网新句", 500));
    const service = createQuoteService({
      storage: localStorage,
      random: () => 0,
      now: () => 1_000_000,
      providers: [provider("hitokoto", fetchQuote)],
    });

    const result = service.startAutomaticQuote({
      channels: [remoteChannel("hitokoto"), localChannel()],
    });

    expect(result.immediate.providerId).toBe("local");
    expect(result.immediateWasFallback).toBe(true);
    await expect(result.refresh).resolves.toMatchObject({ text: "联网新句" });
  });

  it("每个 provider 的并发请求只执行一次", async () => {
    let resolveRequest: (quote: Quote) => void = () => undefined;
    const fetchQuote = vi.fn(
      () =>
        new Promise<Quote>((resolve) => {
          resolveRequest = resolve;
        })
    );
    const service = createQuoteService({
      storage: localStorage,
      random: () => 0,
      now: () => 1_000_000,
      providers: [provider("hitokoto", fetchQuote, 5000)],
    });
    const channels = [remoteChannel("hitokoto"), localChannel()];

    const first = service.getManualQuote({ channels });
    const second = service.getManualQuote({ channels });
    await Promise.resolve();
    expect(fetchQuote).toHaveBeenCalledTimes(1);
    resolveRequest(remoteQuote("hitokoto", "共享请求", 1_000_000));

    await expect(Promise.all([first, second])).resolves.toHaveLength(2);
    expect(fetchQuote).toHaveBeenCalledTimes(1);
  });

  it("单个订阅者取消时不终止其他订阅者共享的请求", async () => {
    let upstreamSignal: AbortSignal | undefined;
    let resolveRequest: (quote: Quote) => void = () => undefined;
    const fetchQuote = vi.fn((options) => {
      upstreamSignal = options?.signal;
      return new Promise<Quote>((resolve) => {
        resolveRequest = resolve;
      });
    });
    const service = createQuoteService({
      storage: localStorage,
      random: () => 0,
      now: () => 1_000_000,
      providers: [provider("hitokoto", fetchQuote, 5000)],
    });
    const firstController = new AbortController();
    const secondController = new AbortController();
    const channels = [remoteChannel("hitokoto")];

    const first = service.getManualQuote({ channels, signal: firstController.signal });
    const second = service.getManualQuote({ channels, signal: secondController.signal });
    firstController.abort();
    await expect(first).rejects.toMatchObject({ name: "AbortError" });
    await Promise.resolve();
    expect(upstreamSignal?.aborted).toBe(false);

    resolveRequest(remoteQuote("hitokoto", "第二个订阅者仍可收到", 1_000_000));
    await expect(second).resolves.toMatchObject({ text: "第二个订阅者仍可收到" });
    expect(fetchQuote).toHaveBeenCalledTimes(1);
  });

  it("提供商失败后进入独立冷却，不影响其他提供商", async () => {
    let now = 1_000_000;
    const hitokoto = vi.fn().mockRejectedValue(networkError("hitokoto"));
    const advice = vi.fn().mockResolvedValue(remoteQuote("advice-slip", "Still available.", now));
    const service = createQuoteService({
      storage: localStorage,
      random: () => 0,
      now: () => now,
      providers: [provider("hitokoto", hitokoto), provider("advice-slip", advice)],
    });
    const channels = [remoteChannel("hitokoto"), remoteChannel("advice-slip")];

    await service.getManualQuote({ channels });
    now += 1000;
    await service.getManualQuote({ channels });

    expect(hitokoto).toHaveBeenCalledTimes(1);
    expect(advice).toHaveBeenCalledTimes(2);
  });

  it("跨提供商跳过最近展示过的相同正文", async () => {
    const now = 3_000_000;
    const runtime = new QuoteRuntimeStore({ storage: localStorage, now: () => now });
    runtime.rememberQuote({ text: "重复正文" });
    const hitokoto = vi.fn().mockResolvedValue(remoteQuote("hitokoto", "重复正文", now));
    const advice = vi.fn().mockResolvedValue(remoteQuote("advice-slip", "Unique advice.", now));
    const service = createQuoteService({
      storage: localStorage,
      random: () => 0,
      now: () => now,
      providers: [provider("hitokoto", hitokoto), provider("advice-slip", advice)],
    });

    const result = await service.getManualQuote({
      channels: [remoteChannel("hitokoto"), remoteChannel("advice-slip")],
    });

    expect(result.text).toBe("Unique advice.");
    expect(advice).toHaveBeenCalledTimes(1);
  });

  it("取消信号会中止实际 provider 请求并向调用方抛出 AbortError", async () => {
    const fetchQuote = vi.fn((options) => {
      return new Promise<Quote>((_resolve, reject) => {
        options?.signal?.addEventListener("abort", () =>
          reject(new DOMException("aborted", "AbortError"))
        );
      });
    });
    const service = createQuoteService({
      storage: localStorage,
      random: () => 0,
      now: () => 1_000_000,
      providers: [provider("hitokoto", fetchQuote)],
    });
    const controller = new AbortController();
    const request = service.getManualQuote({
      channels: [remoteChannel("hitokoto")],
      signal: controller.signal,
    });

    controller.abort();

    await expect(request).rejects.toMatchObject({ name: "AbortError" });
  });

  it("唯一订阅者取消后可立即启动新的 provider 请求", async () => {
    let callCount = 0;
    const fetchQuote = vi.fn((options) => {
      callCount += 1;
      if (callCount === 2) {
        return Promise.resolve(remoteQuote("hitokoto", "重新请求成功", 1_000_001));
      }
      return new Promise<Quote>((_resolve, reject) => {
        options?.signal?.addEventListener("abort", () =>
          reject(new DOMException("aborted", "AbortError"))
        );
      });
    });
    const service = createQuoteService({
      storage: localStorage,
      random: () => 0,
      now: () => 1_000_000,
      providers: [provider("hitokoto", fetchQuote)],
    });
    const channels = [remoteChannel("hitokoto")];
    const firstController = new AbortController();
    const first = service.getManualQuote({ channels, signal: firstController.signal });

    firstController.abort();
    const second = service.getManualQuote({ channels });

    await expect(first).rejects.toMatchObject({ name: "AbortError" });
    await expect(second).resolves.toMatchObject({ text: "重新请求成功" });
    expect(fetchQuote).toHaveBeenCalledTimes(2);
  });
});
