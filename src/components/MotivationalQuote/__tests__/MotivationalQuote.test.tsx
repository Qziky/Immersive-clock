import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Quote } from "../../../types/quote";
import { MotivationalQuote } from "../MotivationalQuote";

const componentMocks = vi.hoisted(() => ({
  refresh: vi.fn(),
  useAppState: vi.fn(),
  useComponentAppearance: vi.fn(),
  useQuoteRotation: vi.fn(),
}));

vi.mock("../../../contexts/AppContext", () => ({
  useAppState: componentMocks.useAppState,
}));

vi.mock("../../../contexts/AppearanceContext", () => ({
  useComponentAppearance: componentMocks.useComponentAppearance,
}));

vi.mock("../../../hooks/useQuoteRotation", () => ({
  useQuoteRotation: componentMocks.useQuoteRotation,
}));

const POEM_QUOTE: Quote = {
  id: "jinrishici:test",
  text: "床前明月光",
  author: "李白",
  origin: "唐 · 静夜思",
  providerId: "jinrishici",
  language: "zh",
  fetchedAt: 1,
};

function mockReducedMotion(matches: boolean) {
  vi.stubGlobal(
    "matchMedia",
    vi.fn(
      (query: string) =>
        ({
          matches,
          media: query,
          onchange: null,
          addEventListener: vi.fn(),
          addListener: vi.fn(),
          dispatchEvent: vi.fn(),
          removeEventListener: vi.fn(),
          removeListener: vi.fn(),
        }) as MediaQueryList
    )
  );
}

describe("MotivationalQuote", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockReducedMotion(true);
    componentMocks.useAppState.mockReturnValue({
      quoteChannels: { channels: [] },
      quoteSettings: {
        animationMode: "typewriter",
        autoRefreshEnabled: false,
        autoRefreshIntervalSec: 30,
        typewriterBackspaceEnabled: true,
        typingSpeed: "normal",
      },
    });
    componentMocks.useComponentAppearance.mockReturnValue({ color: "rgb(1, 2, 3)" });
    componentMocks.useQuoteRotation.mockReturnValue({
      quote: POEM_QUOTE,
      isRefreshing: false,
      refresh: componentMocks.refresh,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("分别渲染正文和来源，并由按钮触发刷新", () => {
    render(<MotivationalQuote />);

    const quoteText = screen.getByText(POEM_QUOTE.text);
    const attribution = screen.getByText("—— 唐 · 李白 · 静夜思");
    expect(quoteText).not.toBe(attribution);
    expect(screen.getByRole("status")).toHaveTextContent("床前明月光，来源：唐 · 李白 · 静夜思");

    const refreshButton = screen.getByRole("button", { name: "刷新语录" });
    expect(refreshButton).toHaveAttribute("aria-busy", "false");
    fireEvent.click(refreshButton);
    expect(componentMocks.refresh).toHaveBeenCalledTimes(1);
  });

  it("刷新期间保留按钮焦点语义并暴露 busy 状态", () => {
    componentMocks.useQuoteRotation.mockReturnValue({
      quote: POEM_QUOTE,
      isRefreshing: true,
      refresh: componentMocks.refresh,
    });

    render(<MotivationalQuote />);

    const refreshButton = screen.getByRole("button", { name: "刷新语录" });
    expect(refreshButton).toHaveAttribute("aria-busy", "true");
    expect(refreshButton).toHaveAttribute("title", "正在刷新语录");
  });

  it("将设置中的动画模式、速度和回删开关传给展示层", () => {
    componentMocks.useAppState.mockReturnValue({
      quoteChannels: { channels: [] },
      quoteSettings: {
        animationMode: "none",
        autoRefreshEnabled: false,
        autoRefreshIntervalSec: 30,
        typewriterBackspaceEnabled: false,
        typingSpeed: "fast",
      },
    });

    const { container } = render(<MotivationalQuote />);

    expect(container.querySelector('[data-quote-reveal="true"]')).toHaveAttribute(
      "data-animation-mode",
      "none"
    );
    expect(container.querySelector('[data-quote-reveal="true"]')).toHaveAttribute(
      "data-typewriter-backspace-enabled",
      "false"
    );
    expect(container.querySelector("[data-quote-layout-copy]")).not.toBeInTheDocument();
  });
});
