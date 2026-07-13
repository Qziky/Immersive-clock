import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useEffect, useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AppContextProvider } from "../../../contexts/AppContext";
import { AppearanceProvider, useAppearance } from "../../../contexts/AppearanceContext";
import { FeedbackProvider } from "../../../ui";
import { SettingsPanel } from "../SettingsPanel";

const saveCalls = vi.hoisted(() => [] as string[]);

vi.mock("../sections/BasicSettingsPanel", () => ({
  default: function BasicSettingsPanelMock({
    section,
    onRegisterSave,
  }: {
    section: string;
    onRegisterSave?: (save: () => void) => void;
  }) {
    const [scheduleDraft, setScheduleDraft] = useState("已保存课程");

    useEffect(() => {
      onRegisterSave?.(() => saveCalls.push(`basic:${scheduleDraft}`));
    }, [onRegisterSave, scheduleDraft]);

    return (
      <div data-testid="basic-panel" data-section={section}>
        <input
          aria-label="课程草稿"
          hidden={section !== "schedule"}
          value={scheduleDraft}
          onChange={(event) => setScheduleDraft(event.target.value)}
        />
      </div>
    );
  },
}));

vi.mock("../sections/AppearanceSettingsPanel", () => ({
  AppearanceSettingsPanel: function AppearanceSettingsPanelMock({ section }: { section: string }) {
    return <div data-testid="appearance-panel" data-section={section} />;
  },
}));

vi.mock("../sections/WeatherSettingsPanel", () => ({
  default: function WeatherSettingsPanelMock({
    section,
    onRegisterSave,
  }: {
    section: string;
    onRegisterSave?: (save: () => void) => void;
  }) {
    useEffect(() => onRegisterSave?.(() => saveCalls.push("weather")), [onRegisterSave]);
    return <div data-testid="weather-panel" data-section={section} />;
  },
}));

vi.mock("../sections/StudySettingsPanel", () => ({
  default: function StudySettingsPanelMock({
    section,
    onRegisterSave,
  }: {
    section: string;
    onRegisterSave?: (save: () => void) => void;
  }) {
    useEffect(() => onRegisterSave?.(() => saveCalls.push("monitor")), [onRegisterSave]);
    return <div data-testid="monitor-panel" data-section={section} />;
  },
}));

vi.mock("../sections/ContentSettingsPanel", () => ({
  default: function ContentSettingsPanelMock({
    section,
    onRegisterSave,
  }: {
    section: string;
    onRegisterSave?: (save: () => void) => void;
  }) {
    useEffect(() => onRegisterSave?.(() => saveCalls.push("quotes")), [onRegisterSave]);
    return <div data-testid="quotes-panel" data-section={section} />;
  },
}));

vi.mock("../sections/AboutSettingsPanel", () => ({
  default: function AboutSettingsPanelMock({
    section,
    onRegisterSave,
  }: {
    section: string;
    onRegisterSave?: (save: () => void) => void;
  }) {
    useEffect(() => onRegisterSave?.(() => saveCalls.push("about")), [onRegisterSave]);
    return <div data-testid="about-panel" data-section={section} />;
  },
}));

vi.mock("../sections/DataSettingsPanel", () => ({
  default: function DataSettingsPanelMock({
    hasUnsavedAppearanceChanges,
    onBusyChange,
    onReloadRequired,
  }: {
    hasUnsavedAppearanceChanges: boolean;
    onBusyChange: (isBusy: boolean) => void;
    onReloadRequired: () => void;
  }) {
    return (
      <div
        data-testid="data-panel"
        data-unsaved-appearance={hasUnsavedAppearanceChanges ? "true" : "false"}
      >
        <button type="button" onClick={() => onBusyChange(true)}>
          模拟数据操作开始
        </button>
        <button type="button" onClick={() => onBusyChange(false)}>
          模拟数据操作结束
        </button>
        <button type="button" onClick={onReloadRequired}>
          模拟恢复并刷新
        </button>
      </div>
    );
  },
}));

function AppearanceDraftControl() {
  const { updateAppearanceDraft } = useAppearance();
  return (
    <button
      data-testid="make-appearance-dirty"
      type="button"
      onClick={() =>
        updateAppearanceDraft(["global", "background"], { type: "color", color: "#123456" })
      }
    >
      模拟外观草稿
    </button>
  );
}

function renderSettings(onClose = vi.fn()) {
  render(
    <AppContextProvider>
      <AppearanceProvider>
        <AppearanceDraftControl />
        <FeedbackProvider>
          <SettingsPanel isOpen onClose={onClose} />
        </FeedbackProvider>
      </AppearanceProvider>
    </AppContextProvider>
  );
  return onClose;
}

function ReopenSettingsHarness() {
  const [isOpen, setIsOpen] = useState(true);

  return (
    <>
      <button data-testid="reopen-settings" type="button" onClick={() => setIsOpen(true)}>
        重新打开设置
      </button>
      <SettingsPanel isOpen={isOpen} onClose={() => setIsOpen(false)} />
    </>
  );
}

describe("SettingsPanel", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("支持折叠并重新展开当前桌面导航分组", () => {
    renderSettings();

    const dialog = screen.getByRole("dialog", { name: "设置" });
    const navigation = within(within(dialog).getByRole("complementary", { name: "设置导航" }));
    const workspaceGroup = navigation.getByRole("button", { name: /常用工作台/ });
    const workspacePanes = navigation.getByRole("group", { name: "常用工作台" });
    const workspaceRegion = workspacePanes.parentElement as HTMLElement;

    expect(workspaceGroup).toHaveAttribute("aria-expanded", "true");
    expect(workspaceRegion).toHaveAttribute("aria-hidden", "false");
    expect(workspaceRegion).not.toHaveAttribute("inert");
    expect(navigation.getByRole("button", { name: "启动页面" })).toBeInTheDocument();

    fireEvent.click(workspaceGroup);
    expect(workspaceGroup).toHaveAttribute("aria-expanded", "false");
    expect(workspaceRegion).toHaveAttribute("aria-hidden", "true");
    expect(workspaceRegion).toHaveAttribute("inert");
    expect(navigation.queryByRole("button", { name: "启动页面" })).not.toBeInTheDocument();
    expect(within(dialog).getByRole("heading", { name: "启动页面" })).toBeInTheDocument();

    fireEvent.click(workspaceGroup);
    expect(workspaceGroup).toHaveAttribute("aria-expanded", "true");
    expect(navigation.getByRole("button", { name: "启动页面" })).toBeInTheDocument();
  });

  it("紧凑导航忽略悬停并通过单次点击打开二级菜单", () => {
    renderSettings();

    const dialog = screen.getByRole("dialog", { name: "设置" });
    const compactNavigation = within(dialog).getByRole("navigation", { name: "设置紧凑导航" });
    const appearanceGroup = within(compactNavigation).getByRole("button", { name: "视觉外观" });

    expect(appearanceGroup).toHaveAttribute("aria-expanded", "false");
    expect(within(dialog).queryByRole("navigation", { name: "视觉外观子分类" })).toBeNull();

    fireEvent.mouseEnter(appearanceGroup);
    expect(appearanceGroup).toHaveAttribute("aria-expanded", "false");
    expect(within(dialog).queryByRole("navigation", { name: "视觉外观子分类" })).toBeNull();

    fireEvent.click(appearanceGroup);
    expect(appearanceGroup).toHaveAttribute("aria-expanded", "true");
    expect(within(dialog).getByRole("navigation", { name: "视觉外观子分类" })).toBeInTheDocument();

    fireEvent.mouseLeave(compactNavigation.parentElement as HTMLElement);
    expect(within(dialog).queryByRole("navigation", { name: "视觉外观子分类" })).toBeNull();

    fireEvent.click(appearanceGroup);
    const appearancePanes = within(dialog).getByRole("navigation", {
      name: "视觉外观子分类",
    });
    fireEvent.click(within(appearancePanes).getByRole("button", { name: "整体样式" }));

    expect(within(dialog).getByRole("heading", { name: "整体样式" })).toBeInTheDocument();
    expect(within(dialog).queryByRole("navigation", { name: "视觉外观子分类" })).toBeNull();
  });

  it("紧凑子菜单退出期间保留节点但立即停止交互", () => {
    vi.useFakeTimers();
    renderSettings();

    const dialog = screen.getByRole("dialog", { name: "设置" });
    const compactNavigation = within(dialog).getByRole("navigation", { name: "设置紧凑导航" });
    fireEvent.click(
      within(compactNavigation).getByRole("button", {
        name: "视觉外观",
      })
    );

    const submenu = within(dialog)
      .getByRole("navigation", { name: "视觉外观子分类" })
      .closest("section") as HTMLElement;
    const scrim = within(dialog).getByRole("button", { name: "关闭设置子菜单" });
    fireEvent.click(scrim);

    expect(submenu).toHaveAttribute("aria-hidden", "true");
    expect(submenu).toHaveAttribute("inert");

    act(() => {
      vi.advanceTimersByTime(179);
    });
    expect(submenu).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(submenu).not.toBeInTheDocument();
  });

  it("记住分组内最后子页并在跨分组切换时保留课程表草稿", () => {
    saveCalls.length = 0;
    renderSettings();

    const dialog = screen.getByRole("dialog", { name: "设置" });
    const navigation = within(within(dialog).getByRole("complementary", { name: "设置导航" }));

    fireEvent.click(navigation.getByRole("button", { name: /课程表/ }));
    fireEvent.change(screen.getByLabelText("课程草稿"), { target: { value: "晚间自习" } });

    fireEvent.click(navigation.getByRole("button", { name: /视觉外观/ }));
    fireEvent.click(navigation.getByRole("button", { name: "整体样式" }));
    fireEvent.click(navigation.getByRole("button", { name: /常用工作台/ }));

    expect(screen.getByTestId("basic-panel")).toHaveAttribute("data-section", "schedule");
    expect(screen.getByLabelText("课程草稿")).toHaveValue("晚间自习");

    fireEvent.click(navigation.getByRole("button", { name: /视觉外观/ }));
    expect(screen.getByTestId("appearance-panel")).toHaveAttribute("data-section", "overview");
  });

  it("按刷新、显示、渠道顺序展示语录设置并保留点击焦点", async () => {
    const user = userEvent.setup();
    renderSettings();

    const dialog = screen.getByRole("dialog", { name: "设置" });
    const navigation = within(within(dialog).getByRole("complementary", { name: "设置导航" }));
    await user.click(navigation.getByRole("button", { name: /内容语录/ }));

    const quotePanes = navigation.getByRole("group", { name: "内容语录" });
    expect(
      within(quotePanes)
        .getAllByRole("button")
        .map((button) => button.textContent)
    ).toEqual(["刷新策略", "显示效果", "语录渠道"]);

    const effectsButton = within(quotePanes).getByRole("button", { name: "显示效果" });
    await user.click(effectsButton);

    expect(effectsButton).toHaveFocus();
    expect(effectsButton).toHaveAttribute("aria-current", "page");
    expect(screen.getByTestId("quotes-panel")).toHaveAttribute("data-section", "effects");
    expect(within(dialog).getByRole("heading", { name: "显示效果" })).toBeInTheDocument();
  });

  it("统一保存会提交所有已挂载设置面板", () => {
    saveCalls.length = 0;
    const onClose = renderSettings();
    const dialog = screen.getByRole("dialog", { name: "设置" });
    const navigation = within(within(dialog).getByRole("complementary", { name: "设置导航" }));

    fireEvent.click(navigation.getByRole("button", { name: /环境提醒/ }));
    fireEvent.click(navigation.getByRole("button", { name: "噪音控制" }));
    fireEvent.click(navigation.getByRole("button", { name: /内容语录/ }));
    fireEvent.click(navigation.getByRole("button", { name: /系统数据/ }));
    fireEvent.click(navigation.getByRole("button", { name: "项目信息" }));

    fireEvent.click(within(dialog).getByRole("button", { name: "保存" }));
    expect(saveCalls).toEqual(["basic:已保存课程", "weather", "monitor", "quotes", "about"]);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("取消设置不会提交任何面板草稿", () => {
    saveCalls.length = 0;
    const onClose = renderSettings();
    const dialog = screen.getByRole("dialog", { name: "设置" });

    fireEvent.click(within(dialog).getByRole("button", { name: "取消" }));

    expect(saveCalls).toEqual([]);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("数据恢复请求刷新时立即关闭并锁定设置底栏", () => {
    vi.useFakeTimers();
    const onClose = renderSettings();
    const dialog = screen.getByRole("dialog", { name: "设置" });
    const navigation = within(within(dialog).getByRole("complementary", { name: "设置导航" }));

    fireEvent.click(navigation.getByRole("button", { name: /系统数据/ }));
    fireEvent.click(navigation.getByRole("button", { name: "设置数据" }));
    fireEvent.click(screen.getByRole("button", { name: "模拟恢复并刷新" }));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(within(dialog).getByRole("button", { name: "取消" })).toBeDisabled();
    expect(within(dialog).getByRole("button", { name: "保存" })).toBeDisabled();
  });

  it("数据操作期间锁定对话框关闭、导航和统一保存", () => {
    saveCalls.length = 0;
    const onClose = renderSettings();
    const dialog = screen.getByRole("dialog", { name: "设置" });
    const navigation = within(within(dialog).getByRole("complementary", { name: "设置导航" }));

    fireEvent.click(navigation.getByRole("button", { name: /系统数据/ }));
    fireEvent.click(navigation.getByRole("button", { name: "设置数据" }));
    fireEvent.click(screen.getByRole("button", { name: "模拟数据操作开始" }));

    expect(document.getElementById("settings-panel-container")).toHaveAttribute(
      "aria-busy",
      "true"
    );
    expect(navigation.getByRole("button", { name: /系统数据/ })).toBeDisabled();
    expect(navigation.getByRole("button", { name: "设置数据" })).toBeDisabled();
    expect(
      within(within(dialog).getByRole("navigation", { name: "设置紧凑导航" })).getByRole("button", {
        name: "系统数据",
      })
    ).toBeDisabled();
    expect(within(dialog).getByRole("button", { name: "关闭设置" })).toBeDisabled();
    expect(within(dialog).getByRole("button", { name: "取消" })).toBeDisabled();
    expect(within(dialog).getByRole("button", { name: "保存" })).toBeDisabled();

    fireEvent.keyDown(document, { key: "Escape" });
    fireEvent.click(within(dialog).getByRole("button", { name: "取消" }));
    expect(onClose).not.toHaveBeenCalled();
    expect(saveCalls).toEqual([]);

    fireEvent.click(screen.getByRole("button", { name: "模拟数据操作结束" }));
    expect(document.getElementById("settings-panel-container")).not.toHaveAttribute("aria-busy");
    expect(within(dialog).getByRole("button", { name: "取消" })).toBeEnabled();
    expect(within(dialog).getByRole("button", { name: "保存" })).toBeEnabled();
  });

  it("把未保存的外观草稿状态传给数据面板", () => {
    renderSettings();
    fireEvent.click(screen.getByTestId("make-appearance-dirty"));

    const dialog = screen.getByRole("dialog", { name: "设置" });
    const navigation = within(within(dialog).getByRole("complementary", { name: "设置导航" }));
    fireEvent.click(navigation.getByRole("button", { name: /系统数据/ }));
    fireEvent.click(navigation.getByRole("button", { name: "设置数据" }));

    expect(screen.getByTestId("data-panel")).toHaveAttribute("data-unsaved-appearance", "true");
  });

  it("退出动画期间重新打开会重置基础设置和课程表草稿", () => {
    render(
      <AppContextProvider>
        <AppearanceProvider>
          <FeedbackProvider>
            <ReopenSettingsHarness />
          </FeedbackProvider>
        </AppearanceProvider>
      </AppContextProvider>
    );

    let dialog = screen.getByRole("dialog", { name: "设置" });
    let navigation = within(within(dialog).getByRole("complementary", { name: "设置导航" }));
    fireEvent.click(navigation.getByRole("button", { name: /课程表/ }));
    fireEvent.change(screen.getByLabelText("课程草稿"), { target: { value: "未保存课程" } });

    fireEvent.click(within(dialog).getByRole("button", { name: "取消" }));
    fireEvent.click(screen.getByTestId("reopen-settings"));

    dialog = screen.getByRole("dialog", { name: "设置" });
    navigation = within(within(dialog).getByRole("complementary", { name: "设置导航" }));
    fireEvent.click(navigation.getByRole("button", { name: /课程表/ }));
    expect(screen.getByLabelText("课程草稿")).toHaveValue("已保存课程");
  });

  it("退出动画期间保留当前分区并在结束后卸载", () => {
    vi.useFakeTimers();
    render(
      <AppContextProvider>
        <AppearanceProvider>
          <FeedbackProvider>
            <ReopenSettingsHarness />
          </FeedbackProvider>
        </AppearanceProvider>
      </AppContextProvider>
    );

    const dialog = screen.getByRole("dialog", { name: "设置" });
    const navigation = within(within(dialog).getByRole("complementary", { name: "设置导航" }));
    fireEvent.click(navigation.getByRole("button", { name: /视觉外观/ }));
    fireEvent.click(navigation.getByRole("button", { name: "时间显示" }));
    fireEvent.click(within(dialog).getByRole("button", { name: "取消" }));

    const exitingDialog = screen.getByRole("dialog", { hidden: true });
    expect(exitingDialog).toHaveAttribute("data-ui-presence", "exiting");
    expect(
      within(exitingDialog).getByRole("heading", { name: "时间显示", hidden: true })
    ).toBeVisible();

    act(() => {
      vi.advanceTimersByTime(179);
    });
    expect(exitingDialog).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(screen.queryByRole("dialog", { hidden: true })).toBeNull();
  });
});
