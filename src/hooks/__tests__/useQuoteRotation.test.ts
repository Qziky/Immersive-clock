import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Quote, QuoteChannel, QuoteSettingsState } from "../../types/quote";
import { useQuoteRotation } from "../useQuoteRotation";

const quoteServiceMocks = vi.hoisted(() => ({
  getManualQuoteResolution: vi.fn(),
  markQuoteDisplayed: vi.fn(),
  startAutomaticQuote: vi.fn(),
}));

vi.mock("../../services/quotes", () => ({
  DEFAULT_FALLBACK_QUOTE: {
    id: "local:built-in-fallback",
    text: "保持热爱，奔赴山海。",
    providerId: "local",
    language: "zh",
    fetchedAt: 0,
  },
  isQuoteAbortError: (error: unknown) =>
    error instanceof DOMException && error.name === "AbortError",
  quoteService: quoteServiceMocks,
}));

const DEFAULT_QUOTE: Quote = {
  id: "local:built-in-fallback",
  text: "保持热爱，奔赴山海。",
  providerId: "local",
  language: "zh",
  fetchedAt: 0,
};

const IMMEDIATE_QUOTE: Quote = {
  id: "local:immediate",
  text: "先行一步。",
  providerId: "local",
  language: "zh",
  fetchedAt: 1,
};

const REMOTE_QUOTE: Quote = {
  id: "hitokoto:remote",
  text: "路虽远，行则将至。",
  author: "一言作者",
  providerId: "hitokoto",
  language: "zh",
  fetchedAt: 2,
};

const CHANNELS: QuoteChannel[] = [
  {
    id: "local-test",
    name: "本地测试",
    kind: "local",
    weight: 40,
    enabled: true,
    builtIn: true,
    quotes: [IMMEDIATE_QUOTE.text],
    orderMode: "random",
  },
  {
    id: "hitokoto-test",
    name: "一言",
    kind: "remote",
    providerId: "hitokoto",
    language: "zh",
    description: "测试在线频道",
    weight: 20,
    enabled: true,
    builtIn: true,
  },
];

const MANUAL_SETTINGS: QuoteSettingsState = {
  autoRefreshEnabled: false,
  autoRefreshIntervalSec: 30,
  animationMode: "typewriter",
  typingSpeed: "normal",
  typewriterBackspaceEnabled: true,
};

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
}

function runInitialAutomaticRequest() {
  act(() => {
    vi.advanceTimersByTime(0);
  });
}

describe("useQuoteRotation", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    quoteServiceMocks.startAutomaticQuote.mockReturnValue({
      immediate: IMMEDIATE_QUOTE,
      immediateWasFallback: false,
      refresh: null,
    });
    quoteServiceMocks.getManualQuoteResolution.mockResolvedValue({
      quote: REMOTE_QUOTE,
      isFallback: false,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("先立即展示可用句子，并在首次远程请求成功后替换临时内容", async () => {
    const freshQuote = deferred<Quote | null>();
    quoteServiceMocks.startAutomaticQuote.mockReturnValue({
      immediate: IMMEDIATE_QUOTE,
      immediateWasFallback: true,
      refresh: freshQuote.promise,
    });

    const { result } = renderHook(() => useQuoteRotation(CHANNELS, MANUAL_SETTINGS));

    expect(result.current.quote).toEqual(DEFAULT_QUOTE);
    runInitialAutomaticRequest();
    expect(result.current.quote).toEqual(IMMEDIATE_QUOTE);

    await act(async () => {
      freshQuote.resolve(REMOTE_QUOTE);
      await freshQuote.promise;
      await Promise.resolve();
    });

    expect(result.current.quote).toEqual(REMOTE_QUOTE);
    expect(quoteServiceMocks.markQuoteDisplayed).toHaveBeenCalledWith(IMMEDIATE_QUOTE);
    expect(quoteServiceMocks.markQuoteDisplayed).toHaveBeenCalledWith(REMOTE_QUOTE);
  });

  it("首轮选中本地频道后，首次有效在线结果仍可替换临时内容", async () => {
    const freshQuote = deferred<Quote | null>();
    quoteServiceMocks.startAutomaticQuote
      .mockReturnValueOnce({
        immediate: IMMEDIATE_QUOTE,
        immediateWasFallback: false,
        refresh: null,
      })
      .mockReturnValueOnce({
        immediate: IMMEDIATE_QUOTE,
        immediateWasFallback: true,
        refresh: freshQuote.promise,
      });
    const automaticSettings: QuoteSettingsState = {
      ...MANUAL_SETTINGS,
      autoRefreshEnabled: true,
    };
    const { result } = renderHook(() => useQuoteRotation(CHANNELS, automaticSettings));

    runInitialAutomaticRequest();
    expect(result.current.quote).toEqual(IMMEDIATE_QUOTE);
    act(() => {
      vi.advanceTimersByTime(30_000);
    });

    await act(async () => {
      freshQuote.resolve(REMOTE_QUOTE);
      await freshQuote.promise;
      await Promise.resolve();
    });

    expect(result.current.quote).toEqual(REMOTE_QUOTE);
  });

  it("配置变化中止旧请求后，新的首次在线结果仍可替换临时内容", async () => {
    const staleRefresh = deferred<Quote | null>();
    const latestRefresh = deferred<Quote | null>();
    const latestQuote: Quote = {
      ...REMOTE_QUOTE,
      id: "advice-slip:replacement",
      text: "A fresh configuration wins.",
      providerId: "advice-slip",
      language: "en",
    };
    quoteServiceMocks.startAutomaticQuote
      .mockReturnValueOnce({
        immediate: IMMEDIATE_QUOTE,
        immediateWasFallback: true,
        refresh: staleRefresh.promise,
      })
      .mockReturnValueOnce({
        immediate: IMMEDIATE_QUOTE,
        immediateWasFallback: true,
        refresh: latestRefresh.promise,
      });
    const { result, rerender } = renderHook(
      ({ channels }: { channels: QuoteChannel[] }) => useQuoteRotation(channels, MANUAL_SETTINGS),
      { initialProps: { channels: CHANNELS } }
    );
    runInitialAutomaticRequest();
    const staleSignal = quoteServiceMocks.startAutomaticQuote.mock.calls[0][0]
      .signal as AbortSignal;

    rerender({ channels: [...CHANNELS] });
    runInitialAutomaticRequest();
    expect(staleSignal.aborted).toBe(true);

    await act(async () => {
      staleRefresh.resolve(REMOTE_QUOTE);
      await staleRefresh.promise;
      latestRefresh.resolve(latestQuote);
      await latestRefresh.promise;
      await Promise.resolve();
    });

    expect(result.current.quote).toEqual(latestQuote);
  });

  it("仅在开启自动刷新后按最低 30 秒间隔轮换", () => {
    const { rerender } = renderHook(
      ({ settings }: { settings: QuoteSettingsState }) => useQuoteRotation(CHANNELS, settings),
      { initialProps: { settings: MANUAL_SETTINGS } }
    );
    runInitialAutomaticRequest();
    expect(quoteServiceMocks.startAutomaticQuote).toHaveBeenCalledTimes(1);

    act(() => {
      vi.advanceTimersByTime(30_000);
    });
    expect(quoteServiceMocks.startAutomaticQuote).toHaveBeenCalledTimes(1);

    rerender({
      settings: {
        ...MANUAL_SETTINGS,
        autoRefreshEnabled: true,
        autoRefreshIntervalSec: 5,
      },
    });
    act(() => {
      vi.advanceTimersByTime(29_999);
    });
    expect(quoteServiceMocks.startAutomaticQuote).toHaveBeenCalledTimes(1);

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(quoteServiceMocks.startAutomaticQuote).toHaveBeenCalledTimes(2);
  });

  it("手动刷新只得到 fallback 时保留当前句子", async () => {
    quoteServiceMocks.getManualQuoteResolution.mockResolvedValue({
      quote: DEFAULT_QUOTE,
      isFallback: true,
    });
    const { result } = renderHook(() => useQuoteRotation(CHANNELS, MANUAL_SETTINGS));
    runInitialAutomaticRequest();

    await act(async () => {
      await result.current.refresh();
    });

    expect(result.current.quote).toEqual(IMMEDIATE_QUOTE);
    expect(result.current.isRefreshing).toBe(false);
    expect(quoteServiceMocks.markQuoteDisplayed).toHaveBeenCalledTimes(1);
  });

  it("快速连续手动刷新时只有最后一次结果可以更新界面", async () => {
    const firstResolution = deferred<{ quote: Quote; isFallback: boolean }>();
    const secondResolution = deferred<{ quote: Quote; isFallback: boolean }>();
    const olderQuote: Quote = { ...REMOTE_QUOTE, id: "hitokoto:older", text: "旧请求" };
    const latestQuote: Quote = {
      ...REMOTE_QUOTE,
      id: "advice-slip:latest",
      text: "Latest request wins.",
      providerId: "advice-slip",
      language: "en",
    };
    quoteServiceMocks.getManualQuoteResolution
      .mockImplementationOnce(() => firstResolution.promise)
      .mockImplementationOnce(() => secondResolution.promise);
    const { result } = renderHook(() => useQuoteRotation(CHANNELS, MANUAL_SETTINGS));
    runInitialAutomaticRequest();

    let firstRequest!: Promise<void>;
    let secondRequest!: Promise<void>;
    act(() => {
      firstRequest = result.current.refresh();
      secondRequest = result.current.refresh();
    });

    const firstSignal = quoteServiceMocks.getManualQuoteResolution.mock.calls[0][0]
      .signal as AbortSignal;
    expect(firstSignal.aborted).toBe(true);

    await act(async () => {
      secondResolution.resolve({ quote: latestQuote, isFallback: false });
      await secondRequest;
    });
    expect(result.current.quote).toEqual(latestQuote);

    await act(async () => {
      firstResolution.resolve({ quote: olderQuote, isFallback: false });
      await firstRequest;
    });
    expect(result.current.quote).toEqual(latestQuote);
  });

  it("卸载时中止仍在进行的手动请求", () => {
    const pendingResolution = deferred<{ quote: Quote; isFallback: boolean }>();
    let requestSignal: AbortSignal | undefined;
    quoteServiceMocks.getManualQuoteResolution.mockImplementation(
      ({ signal }: { signal?: AbortSignal }) => {
        requestSignal = signal;
        return pendingResolution.promise;
      }
    );
    const { result, unmount } = renderHook(() => useQuoteRotation(CHANNELS, MANUAL_SETTINGS));
    runInitialAutomaticRequest();

    act(() => {
      void result.current.refresh();
    });
    expect(requestSignal?.aborted).toBe(false);

    unmount();
    expect(requestSignal?.aborted).toBe(true);
  });
});
