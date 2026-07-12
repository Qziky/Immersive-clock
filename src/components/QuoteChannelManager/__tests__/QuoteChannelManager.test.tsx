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
      quoteSettings: { autoRefreshEnabled: false, autoRefreshIntervalSec: 30 },
    });
  });

  it("展示五个内置频道和三个在线来源", () => {
    render(<QuoteChannelManager />);

    expect(screen.getAllByRole("article")).toHaveLength(5);
    expect(screen.getAllByText("在线")).toHaveLength(3);
    expect(screen.getByRole("heading", { name: "一言" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "今日诗词" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Advice Slip" })).toBeInTheDocument();
    expect(screen.getByText("English")).toBeInTheDocument();
    expect(screen.queryByText(/今日诗词免费版仅限非商业使用/)).not.toBeInTheDocument();

    const categoryButtons = screen.getAllByRole("button", { name: "分类设置" });
    expect(categoryButtons).toHaveLength(1);
    expect(
      within(getChannelCard("今日诗词")).queryByRole("button", { name: "分类设置" })
    ).not.toBeInTheDocument();
    expect(
      within(getChannelCard("Advice Slip")).queryByRole("button", { name: "分类设置" })
    ).not.toBeInTheDocument();

    expect(categoryButtons[0]).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(categoryButtons[0]);
    expect(categoryButtons[0]).toHaveAttribute("aria-expanded", "true");
    expect(
      within(getChannelCard("一言")).getByRole("switch", { name: "文学分类" })
    ).toBeInTheDocument();
    expect(
      within(getChannelCard("一言")).getByRole("switch", { name: "动画分类" })
    ).toBeInTheDocument();
    expect(
      within(getChannelCard("一言")).getByRole("switch", { name: "影视分类" })
    ).toBeInTheDocument();
    expect(
      within(getChannelCard("一言")).getByRole("switch", { name: "网易云分类" })
    ).toBeInTheDocument();
    expect(
      within(getChannelCard("一言")).getByRole("switch", { name: "诗词分类" })
    ).toBeInTheDocument();
    expect(
      within(getChannelCard("一言")).getByRole("switch", { name: "哲学分类" })
    ).toBeInTheDocument();
  });

  it("频道切换、权重与顺序修改保留为草稿，并通过注册回调一次保存", () => {
    let registeredSave: ((refreshSettings: QuoteSettingsState) => void) | undefined;
    const onRegisterSave = vi.fn((save: (refreshSettings: QuoteSettingsState) => void) => {
      registeredSave = save;
    });
    render(<QuoteChannelManager onRegisterSave={onRegisterSave} />);

    const hitokotoCard = getChannelCard("一言");
    fireEvent.click(within(hitokotoCard).getByRole("switch", { name: "停用一言" }));
    fireEvent.change(within(hitokotoCard).getByRole("spinbutton"), {
      target: { value: "73" },
    });

    const localCard = getChannelCard("本地励志语录");
    const editButton = within(localCard).getByRole("button", { name: "编辑语录" });
    expect(editButton).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(editButton);
    expect(editButton).toHaveAttribute("aria-expanded", "true");
    fireEvent.click(within(localCard).getByRole("radio", { name: "顺序" }));

    expect(within(hitokotoCard).getByRole("switch", { name: "启用一言" })).toHaveAttribute(
      "aria-checked",
      "false"
    );
    expect(within(hitokotoCard).getByRole("spinbutton")).toHaveValue(73);
    expect(within(localCard).getByRole("radio", { name: "顺序" })).toBeChecked();
    expect(managerMocks.saveQuoteSettings).not.toHaveBeenCalled();
    expect(managerMocks.dispatch).not.toHaveBeenCalled();
    expect(registeredSave).toBeTypeOf("function");

    const refreshSettings: QuoteSettingsState = {
      autoRefreshEnabled: true,
      autoRefreshIntervalSec: 90,
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
    expect(managerMocks.dispatch).toHaveBeenNthCalledWith(1, {
      type: "UPDATE_QUOTE_CHANNELS",
      payload: expect.any(Array),
    });
    expect(managerMocks.dispatch).toHaveBeenNthCalledWith(2, {
      type: "SET_QUOTE_REFRESH_SETTINGS",
      payload: refreshSettings,
    });
  });
});
