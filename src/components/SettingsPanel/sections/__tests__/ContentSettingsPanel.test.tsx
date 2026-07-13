import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { QuoteSettingsState } from "../../../../types";
import { ContentSettingsPanel } from "../ContentSettingsPanel";

const mockQuoteSettings = vi.hoisted<QuoteSettingsState>(() => ({
  autoRefreshEnabled: false,
  autoRefreshIntervalSec: 600,
  animationMode: "typewriter",
  typingSpeed: "normal",
}));

const channelSave = vi.hoisted(() => vi.fn());

vi.mock("../../../../contexts/AppContext", () => ({
  useAppState: () => ({ quoteSettings: mockQuoteSettings }),
}));

vi.mock("../../../MotivationalQuote", () => ({
  QuoteReveal: ({
    animationMode,
    quote,
    replayKey,
    typingSpeed,
  }: {
    animationMode: string;
    quote: { id: string; text: string };
    replayKey: number;
    typingSpeed: string;
  }) => (
    <span
      data-testid="quote-reveal"
      data-animation-mode={animationMode}
      data-quote-id={quote.id}
      data-replay-key={replayKey}
      data-typing-speed={typingSpeed}
    >
      {quote.text}
    </span>
  ),
}));

vi.mock("../../../QuoteChannelManager", () => ({
  QuoteChannelManager: ({
    onRegisterSave,
  }: {
    onRegisterSave?: (save: (settings: QuoteSettingsState) => void) => void;
  }) => {
    onRegisterSave?.(channelSave);
    return <div data-testid="quote-channel-manager" />;
  },
}));

describe("ContentSettingsPanel", () => {
  let registeredSave: (() => void) | undefined;

  beforeEach(() => {
    mockQuoteSettings.autoRefreshEnabled = false;
    mockQuoteSettings.autoRefreshIntervalSec = 600;
    mockQuoteSettings.animationMode = "typewriter";
    mockQuoteSettings.typingSpeed = "normal";
    channelSave.mockReset();
    registeredSave = undefined;
  });

  function renderEffects() {
    return render(
      <ContentSettingsPanel
        section="effects"
        onRegisterSave={(save) => {
          registeredSave = save;
        }}
      />
    );
  }

  it("提供两个语义化选项组，并在非打字模式下禁用但保留速度", async () => {
    const user = userEvent.setup();
    renderEffects();

    expect(screen.getAllByRole("radiogroup")).toHaveLength(2);
    expect(screen.getByRole("radiogroup", { name: "出现动画" })).toBeInTheDocument();
    expect(screen.getByRole("radiogroup", { name: "打字速度" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "自然打字" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "标准" })).toBeChecked();

    await user.click(screen.getByRole("radio", { name: "平滑显示" }));

    const speedGroup = screen.getByRole("radiogroup", { name: "打字速度" });
    for (const radio of within(speedGroup).getAllByRole("radio")) {
      expect(radio).toBeDisabled();
    }
    expect(screen.getByRole("radio", { name: "标准" })).toBeChecked();
  });

  it("切换选项和点击重播时轮换示例并重新播放", async () => {
    const user = userEvent.setup();
    renderEffects();

    const reveal = screen.getByTestId("quote-reveal");
    expect(reveal).toHaveAttribute("data-quote-id", "quote-animation-preview-focus");
    expect(reveal).toHaveAttribute("data-replay-key", "0");

    await user.click(screen.getByRole("radio", { name: "快速" }));
    expect(reveal).toHaveAttribute("data-quote-id", "quote-animation-preview-patience");
    expect(reveal).toHaveAttribute("data-replay-key", "1");
    expect(reveal).toHaveAttribute("data-typing-speed", "fast");

    const replayButton = screen.getByRole("button", { name: "重播语录动画预览" });
    expect(replayButton).toHaveAttribute("title", "重播语录动画预览");
    await user.click(replayButton);

    expect(replayButton).toHaveFocus();
    expect(reveal).toHaveAttribute("data-quote-id", "quote-animation-preview-focus");
    expect(reveal).toHaveAttribute("data-replay-key", "2");
  });

  it("只在统一保存时提交完整语录草稿", async () => {
    const user = userEvent.setup();
    renderEffects();

    await user.click(screen.getByRole("radio", { name: "快速" }));
    await user.click(screen.getByRole("radio", { name: "直接显示" }));
    expect(channelSave).not.toHaveBeenCalled();

    act(() => registeredSave?.());

    expect(channelSave).toHaveBeenCalledTimes(1);
    expect(channelSave).toHaveBeenCalledWith({
      autoRefreshEnabled: false,
      autoRefreshIntervalSec: 600,
      animationMode: "none",
      typingSpeed: "fast",
    });
  });
});
