import { beforeEach, describe, expect, it } from "vitest";

import {
  QUOTE_CACHE_MAX_AGE_MS,
  QUOTE_RUNTIME_STORAGE_KEY,
  QuoteProviderError,
  QuoteRuntimeStore,
} from "..";
import type { Quote } from "../../../types/quote";

function quote(id: string, text: string, fetchedAt: number): Quote {
  return { id, text, providerId: "hitokoto", language: "zh", fetchedAt };
}

describe("QuoteRuntimeStore", () => {
  beforeEach(() => localStorage.clear());

  it("存储损坏时静默恢复并移除坏数据", () => {
    localStorage.setItem(QUOTE_RUNTIME_STORAGE_KEY, "{broken-json");

    const store = new QuoteRuntimeStore({ storage: localStorage });

    expect(store.getCachedQuotes("hitokoto")).toEqual([]);
    expect(localStorage.getItem(QUOTE_RUNTIME_STORAGE_KEY)).toBeNull();
  });

  it("把 v1 运行时游标迁移到 v2，并丢弃没有时间戳的最近正文", () => {
    localStorage.setItem(
      "immersive-clock.quote-runtime.v1",
      JSON.stringify({
        version: 1,
        providers: {},
        recentContentKeys: ["无法确认年龄的旧正文"],
        localCursors: { custom: 2 },
      })
    );

    const store = new QuoteRuntimeStore({ storage: localStorage });

    expect(store.takeSequentialIndex("custom", 3)).toBe(2);
    expect(store.isRecentlyUsed({ text: "无法确认年龄的旧正文" })).toBe(false);
    expect(localStorage.getItem("immersive-clock.quote-runtime.v1")).toBeNull();
    expect(localStorage.getItem(QUOTE_RUNTIME_STORAGE_KEY)).not.toBeNull();
  });

  it("丢弃超过七天的缓存并把每个提供商限制为 20 条", () => {
    const now = 1_000_000_000;
    const store = new QuoteRuntimeStore({ storage: localStorage, now: () => now });
    store.addCachedQuote(quote("hitokoto:old", "过期句子", now - QUOTE_CACHE_MAX_AGE_MS - 1));
    for (let index = 0; index < 23; index += 1) {
      store.addCachedQuote(quote(`hitokoto:${index}`, `句子 ${index}`, now - index));
    }

    const cached = new QuoteRuntimeStore({ storage: localStorage, now: () => now }).getCachedQuotes(
      "hitokoto"
    );

    expect(cached).toHaveLength(20);
    expect(cached.some((candidate) => candidate.text === "过期句子")).toBe(false);
    expect(cached[0].id).toBe("hitokoto:3");
    expect(localStorage.getItem(QUOTE_RUNTIME_STORAGE_KEY)).not.toContain("过期句子");
  });

  it("用规范化正文跨提供商记录最近 20 条", () => {
    const store = new QuoteRuntimeStore({ storage: localStorage });
    store.rememberQuote({ text: "  Keep   going. " });

    expect(store.isRecentlyUsed({ text: "keep going." })).toBe(true);
  });

  it("最近展示记录超过七天后自动删除", () => {
    let now = 1_000_000_000;
    const store = new QuoteRuntimeStore({ storage: localStorage, now: () => now });
    store.rememberQuote({ text: "会过期的展示记录" });
    now += QUOTE_CACHE_MAX_AGE_MS + 1;

    expect(store.isRecentlyUsed({ text: "会过期的展示记录" })).toBe(false);
    expect(localStorage.getItem(QUOTE_RUNTIME_STORAGE_KEY)).not.toContain("会过期的展示记录");
  });

  it("持久化本地顺序频道游标", () => {
    const first = new QuoteRuntimeStore({ storage: localStorage });
    expect(first.takeSequentialIndex("custom", 3)).toBe(0);

    const second = new QuoteRuntimeStore({ storage: localStorage });
    expect(second.takeSequentialIndex("custom", 3)).toBe(1);
  });

  it("迁移游标只在运行时频道尚无进度时写入", () => {
    const first = new QuoteRuntimeStore({ storage: localStorage });
    first.seedSequentialCursor("custom", 2);
    first.seedSequentialCursor("custom", 1);

    const second = new QuoteRuntimeStore({ storage: localStorage });
    expect(second.takeSequentialIndex("custom", 3)).toBe(2);
  });

  it("按失败类型计算指数冷却，并尊重 Retry-After", () => {
    let now = 5_000_000;
    const store = new QuoteRuntimeStore({ storage: localStorage, now: () => now });
    const networkError = new QuoteProviderError("offline", {
      code: "network",
      providerId: "hitokoto",
    });

    expect(store.markProviderFailed("hitokoto", networkError)).toBe(30_000);
    now += 31_000;
    expect(store.markProviderFailed("hitokoto", networkError)).toBe(60_000);
    expect(store.getProviderStatus("hitokoto").failureCount).toBe(2);

    const limited = new QuoteProviderError("limited", {
      code: "http",
      providerId: "hitokoto",
      status: 429,
      retryAfterMs: 12_345,
    });
    expect(store.markProviderFailed("hitokoto", limited)).toBe(12_345);

    const limitedWithoutHeader = new QuoteProviderError("limited", {
      code: "http",
      providerId: "advice-slip",
      status: 429,
    });
    expect(store.markProviderFailed("advice-slip", limitedWithoutHeader)).toBe(10 * 60 * 1000);
  });
});
