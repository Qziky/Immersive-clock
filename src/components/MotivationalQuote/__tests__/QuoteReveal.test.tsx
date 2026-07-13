import { act, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { Quote, QuoteTypingSpeed } from "../../../types/quote";
import styles from "../MotivationalQuote.module.css";
import { QuoteReveal } from "../QuoteReveal";

function createQuote(text: string, id = text, author?: string): Quote {
  return {
    id,
    text,
    author,
    providerId: "local",
    language: "zh",
    fetchedAt: 1,
  };
}

function installReducedMotion(initialMatches = false) {
  let matches = initialMatches;
  const listeners = new Set<(event: MediaQueryListEvent) => void>();
  const mediaQuery = {
    get matches() {
      return matches;
    },
    media: "(prefers-reduced-motion: reduce)",
    onchange: null,
    addEventListener: (_type: string, listener: (event: MediaQueryListEvent) => void) => {
      listeners.add(listener);
    },
    addListener: (listener: (event: MediaQueryListEvent) => void) => listeners.add(listener),
    dispatchEvent: vi.fn(),
    removeEventListener: (_type: string, listener: (event: MediaQueryListEvent) => void) => {
      listeners.delete(listener);
    },
    removeListener: (listener: (event: MediaQueryListEvent) => void) => listeners.delete(listener),
  } as unknown as MediaQueryList;
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => mediaQuery)
  );

  return {
    setMatches(nextMatches: boolean) {
      matches = nextMatches;
      act(() => {
        listeners.forEach((listener) =>
          listener({ matches, media: mediaQuery.media } as MediaQueryListEvent)
        );
      });
    },
  };
}

function installAnimationFrameController() {
  let currentTime = 0;
  let nextId = 1;
  const callbacks = new Map<number, FrameRequestCallback>();
  vi.spyOn(window.performance, "now").mockImplementation(() => currentTime);
  vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
    const id = nextId;
    nextId += 1;
    callbacks.set(id, callback);
    return id;
  });
  vi.spyOn(window, "cancelAnimationFrame").mockImplementation((id) => {
    callbacks.delete(id);
  });

  return {
    pendingCount: () => callbacks.size,
    step(milliseconds: number) {
      currentTime += milliseconds;
      const queuedCallbacks = Array.from(callbacks.values());
      callbacks.clear();
      act(() => queuedCallbacks.forEach((callback) => callback(currentTime)));
    },
  };
}

function getCurrentLayer(container: HTMLElement): HTMLElement {
  const layer = container.querySelector<HTMLElement>('[data-quote-layer="current"]');
  if (!layer) throw new Error("未找到当前语录层");
  return layer;
}

function getVisibleText(container: HTMLElement): string {
  return (
    getCurrentLayer(container).querySelector('[data-quote-visible-text="true"]')?.textContent ?? ""
  );
}

function getVisibleAttribution(container: HTMLElement): string {
  return (
    getCurrentLayer(container).querySelector('[data-quote-visible-attribution="true"]')
      ?.textContent ?? ""
  );
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("QuoteReveal", () => {
  it("自然打字首帧只显示光标，并用不可见完整文本稳定排版", () => {
    installReducedMotion();
    const animationFrames = installAnimationFrameController();
    const { container } = render(
      <QuoteReveal
        animationMode="typewriter"
        quote={createQuote("山高水长", "layout")}
        typingSpeed="normal"
      />
    );

    expect(getVisibleText(container)).toBe("");
    expect(getCurrentLayer(container)).toHaveTextContent("|");
    const unrevealedText = container.querySelector('[data-quote-unrevealed-text="true"]');
    const layoutCopy = container.querySelector('[data-quote-layout-copy="true"]');
    const cursor = getCurrentLayer(container).querySelector("span[class*='cursor']");
    expect(unrevealedText).toHaveTextContent("山高水长");
    expect(unrevealedText).toHaveClass(styles.unrevealed);
    expect(layoutCopy).toHaveTextContent("山高水长");
    expect(layoutCopy).toHaveClass(styles.layoutCopy);
    expect(cursor).toHaveClass(styles.cursor);
    expect(animationFrames.pendingCount()).toBe(1);
  });

  it("按字素显示组合字符，避免拆开 emoji", () => {
    installReducedMotion();
    const animationFrames = installAnimationFrameController();
    const familyEmoji = "👨‍👩‍👧‍👦";
    const { container } = render(
      <QuoteReveal
        animationMode="typewriter"
        quote={createQuote(`A${familyEmoji}B`, "grapheme")}
        typingSpeed="normal"
      />
    );

    animationFrames.step(60);
    expect(getVisibleText(container)).toBe("A");
    animationFrames.step(60);
    expect(getVisibleText(container)).toBe(`A${familyEmoji}`);
  });

  it("正文结束后停顿，再逐字显示完整来源", () => {
    installReducedMotion();
    const animationFrames = installAnimationFrameController();
    const { container } = render(
      <QuoteReveal
        animationMode="typewriter"
        quote={createQuote("甲", "attribution", "乙")}
        typingSpeed="normal"
      />
    );

    animationFrames.step(100);
    expect(getVisibleText(container)).toBe("甲");
    expect(getVisibleAttribution(container)).toBe("");
    expect(getCurrentLayer(container)).toHaveTextContent("|");

    animationFrames.step(290);
    expect(getVisibleAttribution(container)).toBe("—");
    expect(getCurrentLayer(container)).toHaveTextContent("—|");

    animationFrames.step(1_000);
    expect(getVisibleAttribution(container)).toBe("—— 乙");
    expect(getCurrentLayer(container)).not.toHaveTextContent("|");
  });

  it("正文以句末标点结束时，在来源前保留额外句末停顿", () => {
    installReducedMotion();
    const animationFrames = installAnimationFrameController();
    const { container } = render(
      <div>
        <div data-sample="plain-source">
          <QuoteReveal
            animationMode="typewriter"
            quote={createQuote("甲", "plain-source", "乙")}
            typingSpeed="normal"
          />
        </div>
        <div data-sample="sentence-source">
          <QuoteReveal
            animationMode="typewriter"
            quote={createQuote("甲。", "sentence-source", "乙")}
            typingSpeed="normal"
          />
        </div>
      </div>
    );

    animationFrames.step(500);
    expect(
      getVisibleAttribution(container.querySelector<HTMLElement>('[data-sample="plain-source"]')!)
    ).not.toBe("");
    expect(
      getVisibleAttribution(
        container.querySelector<HTMLElement>('[data-sample="sentence-source"]')!
      )
    ).toBe("");
  });

  it("慢速、标准、快速在相同时间内依次显示更多字素", () => {
    installReducedMotion();
    const animationFrames = installAnimationFrameController();
    const speeds: QuoteTypingSpeed[] = ["slow", "normal", "fast"];
    const { container } = render(
      <div>
        {speeds.map((speed) => (
          <div data-speed={speed} key={speed}>
            <QuoteReveal
              animationMode="typewriter"
              quote={createQuote("ABCDEFGHIJKLMN", speed)}
              typingSpeed={speed}
            />
          </div>
        ))}
      </div>
    );

    animationFrames.step(200);
    const visibleLength = (speed: QuoteTypingSpeed) =>
      getVisibleText(container.querySelector<HTMLElement>(`[data-speed="${speed}"]`)!).length;
    expect(visibleLength("slow")).toBeLessThan(visibleLength("normal"));
    expect(visibleLength("normal")).toBeLessThan(visibleLength("fast"));
  });

  it("逗号后加入额外停顿", () => {
    installReducedMotion();
    const animationFrames = installAnimationFrameController();
    const { container } = render(
      <div>
        <div data-sample="plain">
          <QuoteReveal
            animationMode="typewriter"
            quote={createQuote("甲乙丙", "plain")}
            typingSpeed="normal"
          />
        </div>
        <div data-sample="comma">
          <QuoteReveal
            animationMode="typewriter"
            quote={createQuote("甲，乙", "comma")}
            typingSpeed="normal"
          />
        </div>
      </div>
    );

    animationFrames.step(260);
    expect(getVisibleText(container.querySelector<HTMLElement>('[data-sample="plain"]')!)).toBe(
      "甲乙丙"
    );
    expect(getVisibleText(container.querySelector<HTMLElement>('[data-sample="comma"]')!)).toBe(
      "甲，"
    );
  });

  it("长语录会压缩时间轴，并在对应档位上限内完成", () => {
    installReducedMotion();
    const animationFrames = installAnimationFrameController();
    const quote = createQuote("长".repeat(300), "duration-cap");
    const { container } = render(
      <QuoteReveal animationMode="typewriter" quote={quote} typingSpeed="normal" />
    );

    animationFrames.step(8_001);
    expect(getVisibleText(container)).toBe(quote.text);
    expect(getCurrentLayer(container)).toHaveAttribute("data-typing-complete", "true");
    expect(getCurrentLayer(container)).not.toHaveTextContent("|");
  });

  it("标签页长时间停顿后按已用时间直接追上进度", () => {
    installReducedMotion();
    const animationFrames = installAnimationFrameController();
    const quote = createQuote("重新回到此刻", "elapsed-time");
    const { container } = render(
      <QuoteReveal animationMode="typewriter" quote={quote} typingSpeed="normal" />
    );

    animationFrames.step(10_000);
    expect(getVisibleText(container)).toBe(quote.text);
    expect(animationFrames.pendingCount()).toBe(0);
  });

  it("相同内容的新对象不会重播，replayKey 则会明确重播", () => {
    installReducedMotion();
    const animationFrames = installAnimationFrameController();
    const firstQuote = createQuote("ABCD", "first-id");
    const { container, rerender } = render(
      <QuoteReveal animationMode="typewriter" quote={firstQuote} typingSpeed="normal" />
    );
    animationFrames.step(60);
    expect(getVisibleText(container)).toBe("A");

    rerender(
      <QuoteReveal
        animationMode="typewriter"
        quote={{ ...firstQuote, id: "second-id", fetchedAt: 2 }}
        typingSpeed="normal"
      />
    );
    expect(getVisibleText(container)).toBe("A");

    rerender(
      <QuoteReveal
        animationMode="typewriter"
        quote={{ ...firstQuote, id: "second-id", fetchedAt: 2 }}
        replayKey={1}
        typingSpeed="normal"
      />
    );
    expect(getVisibleText(container)).toBe("");
  });

  it("快速更新时取消旧时间轴，不会把旧语录串入新内容", () => {
    installReducedMotion();
    const animationFrames = installAnimationFrameController();
    const { container, rerender } = render(
      <QuoteReveal
        animationMode="typewriter"
        quote={createQuote("旧内容", "old")}
        typingSpeed="normal"
      />
    );
    animationFrames.step(100);

    const latestQuote = createQuote("全新语录", "latest");
    rerender(<QuoteReveal animationMode="typewriter" quote={latestQuote} typingSpeed="normal" />);
    expect(getVisibleText(container)).toBe("");
    expect(animationFrames.pendingCount()).toBe(1);

    animationFrames.step(10_000);
    expect(getVisibleText(container)).toBe(latestQuote.text);
    expect(getCurrentLayer(container)).not.toHaveTextContent("旧内容");
  });

  it("平滑显示连续更新时最多保留新旧两层，并在 240ms 后清理", () => {
    vi.useFakeTimers();
    installReducedMotion();
    const { container, rerender } = render(
      <QuoteReveal
        animationMode="crossfade"
        quote={createQuote("第一条", "first")}
        typingSpeed="normal"
      />
    );

    rerender(
      <QuoteReveal
        animationMode="crossfade"
        quote={createQuote("第二条", "second")}
        typingSpeed="normal"
      />
    );
    rerender(
      <QuoteReveal
        animationMode="crossfade"
        quote={createQuote("第三条", "third")}
        typingSpeed="normal"
      />
    );

    expect(container.querySelector('[data-quote-animation="crossfade"]')).toBeInTheDocument();
    const layers = container.querySelectorAll("[data-quote-reveal-layer]");
    expect(layers).toHaveLength(2);
    expect(container.querySelector('[data-quote-layer="previous"]')).toHaveTextContent("第二条");
    expect(getCurrentLayer(container)).toHaveTextContent("第三条");

    act(() => vi.advanceTimersByTime(240));
    expect(container.querySelectorAll("[data-quote-reveal-layer]")).toHaveLength(1);
    expect(getCurrentLayer(container)).toHaveTextContent("第三条");
  });

  it("平滑显示时旧层脱离布局，由最新内容决定容器高度", () => {
    vi.useFakeTimers();
    installReducedMotion();
    const longQuote = "旧语录会占据多行空间。".repeat(12);
    const { container, rerender } = render(
      <QuoteReveal
        animationMode="crossfade"
        quote={createQuote(longQuote, "long")}
        typingSpeed="normal"
      />
    );

    rerender(
      <QuoteReveal
        animationMode="crossfade"
        quote={createQuote("短句", "short")}
        typingSpeed="normal"
      />
    );

    const previousLayer = container.querySelector<HTMLElement>('[data-quote-layer="previous"]');
    const currentLayer = getCurrentLayer(container);
    const layoutCopy = container.querySelector<HTMLElement>('[data-quote-layout-copy="true"]');
    expect(previousLayer).toHaveClass(styles.previousLayer);
    expect(previousLayer).toHaveTextContent(longQuote);
    expect(currentLayer).not.toHaveClass(styles.previousLayer);
    expect(currentLayer).toHaveTextContent("短句");
    expect(layoutCopy).toHaveTextContent("短句");
    expect(layoutCopy).not.toHaveTextContent(longQuote);
  });

  it("直接显示不创建动画任务，也支持空来源", () => {
    installReducedMotion();
    const requestAnimationFrameSpy = vi.spyOn(window, "requestAnimationFrame");
    const setTimeoutSpy = vi.spyOn(window, "setTimeout");
    const { container } = render(
      <QuoteReveal
        animationMode="none"
        quote={createQuote("立即出现", "none")}
        typingSpeed="fast"
      />
    );

    expect(getVisibleText(container)).toBe("立即出现");
    expect(getVisibleAttribution(container)).toBe("");
    expect(requestAnimationFrameSpy).not.toHaveBeenCalled();
    expect(setTimeoutSpy).not.toHaveBeenCalled();
  });

  it("动态减少动效会立即完成，切回后从下一条语录再恢复动画", () => {
    const reducedMotion = installReducedMotion();
    const animationFrames = installAnimationFrameController();
    const { container, rerender } = render(
      <QuoteReveal
        animationMode="typewriter"
        quote={createQuote("当前语录", "current")}
        typingSpeed="normal"
      />
    );
    animationFrames.step(100);
    expect(getVisibleText(container)).not.toBe("当前语录");

    reducedMotion.setMatches(true);
    expect(getVisibleText(container)).toBe("当前语录");
    expect(animationFrames.pendingCount()).toBe(0);

    reducedMotion.setMatches(false);
    expect(getVisibleText(container)).toBe("当前语录");
    expect(animationFrames.pendingCount()).toBe(0);

    rerender(
      <QuoteReveal
        animationMode="typewriter"
        quote={createQuote("下一条", "next")}
        typingSpeed="normal"
      />
    );
    expect(getVisibleText(container)).toBe("");
    expect(animationFrames.pendingCount()).toBe(1);
  });
});
