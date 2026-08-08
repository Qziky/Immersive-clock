import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { getDefaultQuoteChannels } from "../../../services/quotes/quoteRegistry";
import type { QuoteChannel, QuoteSettingsState } from "../../../types/quote";
import { QuoteChannelManager } from "../QuoteChannelManager";

const managerMocks = vi.hoisted(() => ({
  dispatch: vi.fn(),
  saveQuoteSettings: vi.fn(),
  useAppDispatch: vi.fn(),
  useAppState: vi.fn(),
}));

vi.mock("../../../contexts/AppContext", () => ({
  useAppDispatch: managerMocks.useAppDispatch,
  useAppState: managerMocks.useAppState,
}));

vi.mock("../../../utils/appSettings", () => ({
  saveQuoteSettings: managerMocks.saveQuoteSettings,
}));

function getChannelCard(name: string): HTMLElement {
  const card = screen.getByRole("heading", { name }).closest("article");
  if (!card) throw new Error(`找不到频道卡片：${name}`);
  return card;
}

describe("QuoteChannelManager", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    managerMocks.useAppDispatch.mockReturnValue(managerMocks.dispatch);
    managerMocks.useAppState.mockReturnValue({
      quoteChannels: { channels: getDefaultQuoteChannels() },
      quoteSettings: {
        autoRefreshEnabled: false,
        autoRefreshIntervalSec: 30,
        animationMode: "typewriter",
        typingSpeed: "normal",
        typewriterBackspaceEnabled: true,
      },
    });
  });

  it("展示六个内置频道和四个在线来源", () => {
    render(<QuoteChannelManager />);

    expect(screen.getAllByRole("article")).toHaveLength(6);
    expect(screen.getAllByText("在线")).toHaveLength(4);
    expect(screen.getByRole("heading", { name: "一言" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "今日诗词" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "诗泉" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Advice Slip" })).toBeInTheDocument();
    expect(screen.getByText("English")).toBeInTheDocument();
    expect(screen.queryByText(/今日诗词免费版仅限非商业使用/)).not.toBeInTheDocument();

    const hitokotoCard = getChannelCard("一言");
    expect(within(hitokotoCard).getByRole("spinbutton", { name: "权重" })).toHaveValue(20);

    const categoryButtons = screen.getAllByRole("button", { name: "分类设置" });
    expect(categoryButtons).toHaveLength(1);
    expect(screen.getByRole("button", { name: "诗词筛选" })).toBeInTheDocument();
    expect(
      within(getChannelCard("今日诗词")).queryByRole("button", { name: "分类设置" })
    ).not.toBeInTheDocument();
    expect(
      within(getChannelCard("Advice Slip")).queryByRole("button", { name: "分类设置" })
    ).not.toBeInTheDocument();

    const categoryButton = categoryButtons[0];
    const categoryDetailsId = "quote-channel-categories-hitokoto-api";
    const categoryDetails = document.getElementById(categoryDetailsId);
    expect(categoryButton).toHaveAttribute("aria-expanded", "false");
    expect(categoryButton).toHaveAttribute("aria-controls", categoryDetailsId);
    expect(categoryDetails).toHaveAttribute("aria-hidden", "true");
    fireEvent.click(categoryButton);
    expect(categoryButton).toHaveAttribute("aria-expanded", "true");
    expect(categoryDetails).toHaveAttribute("aria-hidden", "false");
    expect(within(hitokotoCard).getByRole("switch", { name: "文学分类" })).toBeInTheDocument();
    expect(within(hitokotoCard).getByRole("switch", { name: "动画分类" })).toBeInTheDocument();
    expect(within(hitokotoCard).getByRole("switch", { name: "影视分类" })).toBeInTheDocument();
    expect(within(hitokotoCard).getByRole("switch", { name: "网易云分类" })).toBeInTheDocument();
    expect(within(hitokotoCard).getByRole("switch", { name: "诗词分类" })).toBeInTheDocument();
    expect(within(hitokotoCard).getByRole("switch", { name: "哲学分类" })).toBeInTheDocument();

    fireEvent.click(categoryButton);
    expect(categoryButton).toHaveAttribute("aria-expanded", "false");
    expect(categoryDetails).toHaveAttribute("aria-hidden", "true");
  });

  it("频道切换、权重与顺序修改保留为草稿，并通过注册回调一次保存", () => {
    let registeredSave: ((refreshSettings: QuoteSettingsState) => void) | undefined;
    const onRegisterSave = vi.fn((save: (refreshSettings: QuoteSettingsState) => void) => {
      registeredSave = save;
    });
    render(<QuoteChannelManager onRegisterSave={onRegisterSave} />);

    const hitokotoCard = getChannelCard("一言");
    fireEvent.click(within(hitokotoCard).getByRole("switch", { name: "停用一言" }));
    fireEvent.change(within(hitokotoCard).getByRole("spinbutton", { name: "权重" }), {
      target: { value: "73" },
    });

    const localCard = getChannelCard("本地励志语录");
    expect(within(localCard).getByRole("spinbutton", { name: "权重" })).toHaveValue(40);
    const editButton = within(localCard).getByRole("button", { name: "编辑语录" });
    const editorDetailsId = "quote-channel-editor-local-inspirational";
    const editorDetails = document.getElementById(editorDetailsId);
    expect(editButton).toHaveAttribute("aria-expanded", "false");
    expect(editButton).toHaveAttribute("aria-controls", editorDetailsId);
    expect(editorDetails).toHaveAttribute("aria-hidden", "true");
    fireEvent.click(editButton);
    expect(editButton).toHaveAttribute("aria-expanded", "true");
    expect(editorDetails).toHaveAttribute("aria-hidden", "false");
    fireEvent.click(within(localCard).getByRole("radio", { name: "顺序" }));

    const chinesePoetryCard = getChannelCard("诗泉");
    const poetryFilterButton = within(chinesePoetryCard).getByRole("button", {
      name: "诗词筛选",
    });
    fireEvent.click(poetryFilterButton);
    fireEvent.click(within(chinesePoetryCard).getByRole("button", { name: "朝代" }));
    fireEvent.click(screen.getByRole("option", { name: "宋" }));
    fireEvent.click(within(chinesePoetryCard).getByRole("button", { name: "体裁" }));
    fireEvent.click(screen.getByRole("option", { name: "宋词" }));
    fireEvent.click(screen.getByRole("option", { name: "七言绝句" }));

    expect(within(hitokotoCard).getByRole("switch", { name: "启用一言" })).toHaveAttribute(
      "aria-checked",
      "false"
    );
    expect(within(hitokotoCard).getByRole("spinbutton", { name: "权重" })).toHaveValue(73);
    expect(within(localCard).getByRole("radio", { name: "顺序" })).toBeChecked();
    expect(poetryFilterButton).toHaveAttribute("aria-expanded", "true");
    expect(within(chinesePoetryCard).getByRole("button", { name: "朝代" })).toHaveTextContent("宋");
    expect(within(chinesePoetryCard).getByRole("button", { name: "体裁" })).toHaveTextContent(
      "七言绝句、宋词"
    );
    fireEvent.click(editButton);
    expect(editButton).toHaveAttribute("aria-expanded", "false");
    expect(editorDetails).toHaveAttribute("aria-hidden", "true");
    expect(managerMocks.saveQuoteSettings).not.toHaveBeenCalled();
    expect(managerMocks.dispatch).not.toHaveBeenCalled();
    expect(registeredSave).toBeTypeOf("function");

    const refreshSettings: QuoteSettingsState = {
      autoRefreshEnabled: true,
      autoRefreshIntervalSec: 90,
      animationMode: "crossfade",
      typingSpeed: "fast",
      typewriterBackspaceEnabled: false,
    };
    act(() => {
      registeredSave?.(refreshSettings);
    });

    expect(managerMocks.saveQuoteSettings).toHaveBeenCalledTimes(1);
    const [savedChannels, savedRefreshSettings] = managerMocks.saveQuoteSettings.mock.calls[0] as [
      QuoteChannel[],
      QuoteSettingsState,
    ];
    expect(savedRefreshSettings).toEqual(refreshSettings);
    expect(savedChannels.find((channel) => channel.id === "hitokoto-api")).toMatchObject({
      enabled: false,
      weight: 73,
    });
    expect(savedChannels.find((channel) => channel.id === "local-inspirational")).toMatchObject({
      orderMode: "sequential",
    });
    expect(savedChannels.find((channel) => channel.id === "chinese-poetry-api")).toMatchObject({
      chinesePoetryDynasty: "宋",
      chinesePoetryTypes: ["宋词", "七言绝句"],
    });
    expect(managerMocks.dispatch).toHaveBeenNthCalledWith(1, {
      type: "UPDATE_QUOTE_CHANNELS",
      payload: expect.any(Array),
    });
    expect(managerMocks.dispatch).toHaveBeenNthCalledWith(2, {
      type: "SET_QUOTE_SETTINGS",
      payload: refreshSettings,
    });
  });

  it("诗泉筛选可清空为不限", () => {
    let registeredSave: ((refreshSettings: QuoteSettingsState) => void) | undefined;
    render(
      <QuoteChannelManager
        onRegisterSave={(save) => {
          registeredSave = save;
        }}
      />
    );

    const poetryCard = getChannelCard("诗泉");
    fireEvent.click(within(poetryCard).getByRole("button", { name: "诗词筛选" }));
    fireEvent.click(within(poetryCard).getByRole("button", { name: "朝代" }));
    fireEvent.click(screen.getByRole("option", { name: "宋" }));
    fireEvent.click(within(poetryCard).getByRole("button", { name: "体裁" }));
    fireEvent.click(screen.getByRole("option", { name: "宋词" }));
    fireEvent.click(within(poetryCard).getByRole("button", { name: "体裁" }));

    fireEvent.click(within(poetryCard).getByRole("button", { name: "朝代" }));
    fireEvent.click(screen.getByRole("option", { name: "不限朝代" }));
    fireEvent.click(within(poetryCard).getByRole("button", { name: "体裁" }));
    fireEvent.click(screen.getByRole("option", { name: "宋词" }));

    expect(within(poetryCard).getByRole("button", { name: "朝代" })).toHaveTextContent("不限朝代");
    expect(within(poetryCard).getByRole("button", { name: "体裁" })).toHaveTextContent("不限体裁");

    act(() => {
      registeredSave?.({
        autoRefreshEnabled: false,
        autoRefreshIntervalSec: 30,
        animationMode: "typewriter",
        typingSpeed: "normal",
        typewriterBackspaceEnabled: true,
      });
    });

    const [savedChannels] = managerMocks.saveQuoteSettings.mock.calls[0] as [QuoteChannel[]];
    const poetry = savedChannels.find((channel) => channel.id === "chinese-poetry-api");
    expect(poetry).toMatchObject({ chinesePoetryTypes: [] });
    expect(poetry?.kind === "remote" ? poetry.chinesePoetryDynasty : "unexpected").toBeUndefined();
  });
});
