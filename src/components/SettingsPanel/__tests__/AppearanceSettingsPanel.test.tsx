import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { FeedbackProvider } from "../../../ui";
import { createDefaultAppearance } from "../../../utils/appearanceModel";
import clockStyles from "../../Clock/Clock.module.css";
import quoteStyles from "../../MotivationalQuote/MotivationalQuote.module.css";
import noiseStyles from "../../NoiseMonitor/NoiseMonitor.module.css";
import studyStyles from "../../Study/Study.module.css";
import weatherStyles from "../../Weather/Weather.module.css";
import {
  calculatePreviewCanvasHeight,
  calculatePreviewStageMetrics,
} from "../sections/AppearancePreview";
import { AppearanceSettingsPanel } from "../sections/AppearanceSettingsPanel";

const contextMocks = vi.hoisted(() => ({
  useAppearance: vi.fn(),
  useAppState: vi.fn(),
}));

const assetMocks = vi.hoisted(() => ({
  listener: null as ((revision: number) => void) | null,
  loadAppearanceAssetCatalog: vi.fn(),
  loadBackgroundAsset: vi.fn(),
  removeAppearanceAsset: vi.fn(),
  saveBackgroundAsset: vi.fn(),
  subscribeAppearanceAssetsChanged: vi.fn((listener: (revision: number) => void) => {
    assetMocks.listener = listener;
    return () => {
      if (assetMocks.listener === listener) assetMocks.listener = null;
    };
  }),
}));

const fontMocks = vi.hoisted(() => ({
  importFontFile: vi.fn(),
  removeImportedFont: vi.fn(),
}));

vi.mock("../../../contexts/AppContext", () => ({
  useAppState: contextMocks.useAppState,
}));

vi.mock("../../../contexts/AppearanceContext", () => ({
  useAppearance: contextMocks.useAppearance,
}));

vi.mock("../../../utils/appearanceAssets", () => ({
  loadAppearanceAssetCatalog: assetMocks.loadAppearanceAssetCatalog,
  loadBackgroundAsset: assetMocks.loadBackgroundAsset,
  removeAppearanceAsset: assetMocks.removeAppearanceAsset,
  saveBackgroundAsset: assetMocks.saveBackgroundAsset,
  subscribeAppearanceAssetsChanged: assetMocks.subscribeAppearanceAssetsChanged,
}));

vi.mock("../../../utils/studyFontStorage", () => ({
  importFontFile: fontMocks.importFontFile,
  removeImportedFont: fontMocks.removeImportedFont,
}));

function expectPlainFormSection(name: string): HTMLElement {
  const section = screen.getByRole("heading", { name, level: 3 }).closest("section");
  expect(section).not.toBeNull();
  expect(section?.className).toContain("formSectionPlain");
  return section as HTMLElement;
}

describe("AppearanceSettingsPanel", () => {
  it("按组件区域自动取景并限制最大放大比例", () => {
    expect(
      calculatePreviewStageMetrics(400, 200, 1440, 900, {
        height: 100,
        left: 100,
        top: 50,
        width: 200,
      })
    ).toEqual({
      height: 900,
      left: -144,
      scale: 1.72,
      top: -72,
      width: 1440,
    });
    expect(
      calculatePreviewStageMetrics(400, 200, 640, 480, {
        height: 10,
        left: 0,
        top: 0,
        width: 20,
      }).scale
    ).toBe(12);
    expect(
      calculatePreviewCanvasHeight(188, 320, {
        height: 28,
        left: 0,
        top: 0,
        width: 75,
      })
    ).toBe(88);
    expect(
      calculatePreviewCanvasHeight(
        832,
        1440,
        {
          height: 50,
          left: 0,
          top: 0,
          width: 1440,
        },
        { minHeight: 0, verticalPadding: 2 }
      )
    ).toBe(32);
  });

  beforeEach(() => {
    vi.clearAllMocks();
    assetMocks.listener = null;
    const activeAppearance = createDefaultAppearance();
    activeAppearance.global.background = { type: "image" };
    contextMocks.useAppState.mockReturnValue({ mode: "clock", study: { countdownItems: [] } });
    contextMocks.useAppearance.mockReturnValue({
      activeAppearance,
      beginAppearancePreview: vi.fn(),
      getBackgroundImage: vi.fn(),
      resetAppearance: vi.fn(),
      setPreviewScene: vi.fn(),
      updateAppearanceDraft: vi.fn(),
    });
    assetMocks.loadBackgroundAsset.mockResolvedValue(undefined);
    assetMocks.removeAppearanceAsset.mockResolvedValue(undefined);
    fontMocks.removeImportedFont.mockResolvedValue(undefined);
  });

  it("用整体样式和视觉角色呈现共享字体与背景", async () => {
    assetMocks.loadAppearanceAssetCatalog.mockResolvedValue({ backgrounds: [], fonts: [] });

    render(
      <FeedbackProvider>
        <AppearanceSettingsPanel />
      </FeedbackProvider>
    );

    expect(screen.getByRole("heading", { name: "实时预览" })).toBeInTheDocument();
    const appearancePreview = screen.getByLabelText("时钟外观预览");
    expect(appearancePreview).toHaveTextContent("12:45:09");
    expect(within(appearancePreview).getByText("12:45:09")).toHaveClass(clockStyles.time);
    expect(within(appearancePreview).getByText("2026年7月13日星期一")).toHaveClass(
      clockStyles.date
    );
    expect(appearancePreview).not.toHaveTextContent("26°C");
    expect(screen.getByRole("heading", { name: "字体设置" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "整体背景" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "主显示字体" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "信息字体" })).toBeInTheDocument();
    expect(screen.getByLabelText("主显示字体预览")).toHaveTextContent("12:45:09");
    expect(screen.getByLabelText("信息字体预览")).toHaveTextContent("周一 · 7月13日 · 26°C");
    expect(screen.queryByText("数字字体")).not.toBeInTheDocument();
    expect(screen.queryByText("文本字体")).not.toBeInTheDocument();
    expect(screen.queryByText("基本")).not.toBeInTheDocument();
    for (const sectionName of [
      "实时预览",
      "字体设置",
      "整体背景",
      "字体资源",
      "资源清单",
      "恢复外观",
    ]) {
      expectPlainFormSection(sectionName);
    }

    await waitFor(() => expect(assetMocks.loadAppearanceAssetCatalog).toHaveBeenCalled());
  });

  it("在时间显示中用对象标签、覆盖状态和分层设置编辑样式", async () => {
    const activeAppearance = createDefaultAppearance();
    activeAppearance.scenes.clock.components.clock = {
      slots: { date: { color: "#ff3366" } },
    };
    const resetAppearance = vi.fn();
    contextMocks.useAppearance.mockReturnValue({
      activeAppearance,
      beginAppearancePreview: vi.fn(),
      getBackgroundImage: vi.fn(),
      resetAppearance,
      setPreviewScene: vi.fn(),
      updateAppearanceDraft: vi.fn(),
    });
    assetMocks.loadAppearanceAssetCatalog.mockResolvedValue({ backgrounds: [], fonts: [] });

    render(
      <FeedbackProvider>
        <AppearanceSettingsPanel section="time" />
      </FeedbackProvider>
    );

    expect(screen.getByRole("radiogroup", { name: "时间显示类型" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "时钟" })).toBeChecked();
    expectPlainFormSection("显示内容");
    expectPlainFormSection("时钟");
    expectPlainFormSection("时钟页面背景");
    fireEvent.click(screen.getByRole("tab", { name: "日期，已单独调整" }));

    const preview = screen.getByLabelText("时钟外观预览");
    expect(within(preview).getByText("2026年7月13日星期一")).toHaveAttribute(
      "data-preview-highlighted",
      "true"
    );
    expect(screen.getByText("已单独调整 1 项")).toBeInTheDocument();
    expect(screen.getByText("更多文字设置").closest("details")).not.toHaveAttribute("open");

    fireEvent.click(screen.getByRole("button", { name: "恢复颜色" }));
    expect(resetAppearance).toHaveBeenCalledWith({
      type: "property",
      path: ["scenes", "clock", "components", "clock", "slots", "date", "color"],
    });
    fireEvent.click(screen.getByRole("button", { name: "恢复此对象" }));
    expect(resetAppearance).toHaveBeenCalledWith({
      type: "property",
      path: ["scenes", "clock", "components", "clock", "slots", "date"],
    });
    expect(screen.queryByText("子元素")).not.toBeInTheDocument();
  });

  it("将组件状态从调整对象中分离并写入状态路径", async () => {
    const activeAppearance = createDefaultAppearance();
    const updateAppearanceDraft = vi.fn();
    contextMocks.useAppearance.mockReturnValue({
      activeAppearance,
      beginAppearancePreview: vi.fn(),
      getBackgroundImage: vi.fn(),
      resetAppearance: vi.fn(),
      setPreviewScene: vi.fn(),
      updateAppearanceDraft,
    });
    assetMocks.loadAppearanceAssetCatalog.mockResolvedValue({ backgrounds: [], fonts: [] });

    render(
      <FeedbackProvider>
        <AppearanceSettingsPanel section="countdown" />
      </FeedbackProvider>
    );

    expectPlainFormSection("倒计时");
    const stateSection = expectPlainFormSection("状态样式");
    expect(within(stateSection).getByText("作用于：时间")).toBeInTheDocument();
    expect(within(stateSection).getByRole("tab", { name: "警告状态" })).toHaveAttribute(
      "aria-selected",
      "true"
    );

    fireEvent.change(within(stateSection).getByLabelText("颜色代码"), {
      target: { value: "#123456" },
    });
    expect(updateAppearanceDraft).toHaveBeenCalledWith(
      ["scenes", "countdown", "components", "countdown", "states", "warning", "color"],
      "#123456"
    );
    expect(screen.queryByText("状态覆盖")).not.toBeInTheDocument();
  });

  it("在顶部信息栏中切换栏体与辅助信息，并复用真实天气样式", async () => {
    contextMocks.useAppState.mockReturnValue({
      mode: "study",
      study: { countdownItems: [] },
    });
    assetMocks.loadAppearanceAssetCatalog.mockResolvedValue({ backgrounds: [], fonts: [] });

    render(
      <FeedbackProvider>
        <AppearanceSettingsPanel section="studyTopDock" />
      </FeedbackProvider>
    );

    const contentSelector = screen.getByRole("radiogroup", { name: "顶部信息栏内容" });
    for (const optionName of ["栏体", "天气", "噪音监测", "顶部进度与信息", "事件倒计时"]) {
      expect(within(contentSelector).getByRole("radio", { name: optionName })).toBeInTheDocument();
    }
    expect(within(contentSelector).getByRole("radio", { name: "栏体" })).toBeChecked();
    expectPlainFormSection("信息栏内容");
    expectPlainFormSection("顶部信息栏");
    expect(screen.getByLabelText("顶部信息栏外观预览")).toBeInTheDocument();

    fireEvent.click(within(contentSelector).getByRole("radio", { name: "天气" }));
    const preview = screen.getByLabelText("天气外观预览");
    expect(preview.querySelector('[data-preview-component="study-top-dock"]')).toHaveClass(
      studyStyles.topDock
    );
    expect(within(preview).getByText("26°")).toHaveClass(weatherStyles.temperature);
    expect(within(preview).getByText("晴")).toHaveClass(weatherStyles.weatherText);
    expect(preview.querySelector('img[alt="晴朗"]')).toHaveClass(weatherStyles.weatherIcon);

    fireEvent.click(within(contentSelector).getByRole("radio", { name: "顶部进度与信息" }));
    const progressPreview = screen.getByLabelText("顶部进度与信息外观预览");
    const dayProgress = progressPreview.querySelector('[role="progressbar"]');
    expect(dayProgress).not.toBeNull();
    expect(dayProgress).toHaveAttribute("aria-label", "今日进度");
    expect(dayProgress).toHaveAttribute("aria-valuenow", "50");
    expect(dayProgress).toHaveAttribute("aria-valuetext", "中午好，还剩 12 小时");
    expect(within(progressPreview).getByText("今日进度")).toBeInTheDocument();
    expect(within(progressPreview).getByText("中午好 (｡•ㅅ•｡)")).toBeInTheDocument();
    expect(within(progressPreview).getByText("还剩 12 小时")).toBeInTheDocument();
    expect(within(progressPreview).getByText("50%")).toBeInTheDocument();
  });

  it("噪音预览复用真实展示层并跟随状态切换", async () => {
    contextMocks.useAppState.mockReturnValue({
      mode: "study",
      study: { countdownItems: [] },
    });
    assetMocks.loadAppearanceAssetCatalog.mockResolvedValue({ backgrounds: [], fonts: [] });

    render(
      <FeedbackProvider>
        <AppearanceSettingsPanel section="studyNoise" />
      </FeedbackProvider>
    );

    const preview = screen.getByLabelText("噪音监测外观预览");
    expect(within(preview).getByText("安静")).toHaveClass(
      noiseStyles.statusText,
      noiseStyles.quiet
    );
    expect(within(preview).getByText("42 dB")).toHaveClass(noiseStyles.statusSubtext);

    const stateSection = screen.getByRole("heading", { name: "状态样式" }).closest("section");
    expect(stateSection).not.toBeNull();
    fireEvent.click(within(stateSection as HTMLElement).getByRole("tab", { name: "嘈杂" }));

    expect(within(preview).getByText("吵闹")).toHaveClass(
      noiseStyles.statusText,
      noiseStyles.noisy
    );
    expect(within(preview).getByText("68 dB")).toHaveClass(noiseStyles.statusSubtext);
    expect(within(preview).queryByText("安静")).not.toBeInTheDocument();
  });

  it("语录预览复用正式 QuoteReveal 结构并保留槽位高亮", async () => {
    contextMocks.useAppState.mockReturnValue({
      mode: "study",
      study: { countdownItems: [] },
    });
    assetMocks.loadAppearanceAssetCatalog.mockResolvedValue({ backgrounds: [], fonts: [] });

    render(
      <FeedbackProvider>
        <AppearanceSettingsPanel section="studyQuote" />
      </FeedbackProvider>
    );

    const preview = screen.getByLabelText("励志语录外观预览");
    expect(preview.querySelector('[data-quote-reveal="true"]')).toHaveClass(
      quoteStyles.quoteReveal
    );
    expect(within(preview).getByText("专注当下，让时间沉淀答案。").parentElement).toHaveClass(
      quoteStyles.quoteText
    );

    fireEvent.click(screen.getByRole("tab", { name: "光标" }));
    expect(within(preview).getByText("|")).toHaveAttribute("data-preview-highlighted", "true");
  });

  it("先选择事件作用范围再编辑指定倒计时", async () => {
    const activeAppearance = createDefaultAppearance();
    const updateAppearanceDraft = vi.fn();
    contextMocks.useAppState.mockReturnValue({
      mode: "study",
      study: {
        countdownItems: [
          { id: "exam", kind: "custom", name: "期末考试", targetDate: "2026-12-20" },
        ],
      },
    });
    contextMocks.useAppearance.mockReturnValue({
      activeAppearance,
      beginAppearancePreview: vi.fn(),
      getBackgroundImage: vi.fn(),
      resetAppearance: vi.fn(),
      setPreviewScene: vi.fn(),
      updateAppearanceDraft,
    });
    assetMocks.loadAppearanceAssetCatalog.mockResolvedValue({ backgrounds: [], fonts: [] });

    render(
      <FeedbackProvider>
        <AppearanceSettingsPanel section="studyCountdown" />
      </FeedbackProvider>
    );

    const preview = screen.getByLabelText("事件倒计时外观预览");
    const highlightedCard = preview.querySelector('[data-preview-highlighted="true"]');
    expect(highlightedCard).not.toBeNull();

    fireEvent.click(screen.getByRole("radio", { name: "指定事件" }));
    expect(screen.getByRole("button", { name: "指定事件" })).toHaveTextContent("期末考试");
    fireEvent.click(screen.getByRole("tab", { name: "天数" }));
    expect(screen.getByText("使用所有事件的样式")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("颜色代码"), {
      target: { value: "#abcdef" },
    });
    expect(updateAppearanceDraft).toHaveBeenCalledWith(
      ["instances", "studyCountdown", "exam", "slots", "digit", "color"],
      "#abcdef"
    );
  });

  it("目录 revision 变化后同时刷新背景与字体 metadata", async () => {
    assetMocks.loadAppearanceAssetCatalog
      .mockResolvedValueOnce({
        backgrounds: [
          {
            id: "background-1",
            kind: "background",
            name: "背景一",
            mimeType: "image/png",
          },
        ],
        fonts: [
          {
            id: "font-1",
            kind: "font",
            name: "字体一",
            mimeType: "font/woff2",
            family: "字体一",
            format: "woff2",
          },
        ],
      })
      .mockResolvedValueOnce({
        backgrounds: [
          {
            id: "background-2",
            kind: "background",
            name: "背景二",
            mimeType: "image/png",
          },
        ],
        fonts: [
          {
            id: "font-2",
            kind: "font",
            name: "字体二",
            mimeType: "font/woff2",
            family: "字体二",
            format: "woff2",
          },
        ],
      });

    render(
      <FeedbackProvider>
        <AppearanceSettingsPanel />
      </FeedbackProvider>
    );

    expect(await screen.findByText("字体一")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "已导入背景" }));
    expect(screen.getByRole("option", { name: "背景一" })).toBeInTheDocument();

    act(() => assetMocks.listener?.(2));

    await waitFor(() => expect(screen.getByText("字体二")).toBeInTheDocument());
    expect(screen.queryByText("字体一")).not.toBeInTheDocument();
    expect(screen.getByRole("option", { name: "背景二" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "背景一" })).not.toBeInTheDocument();
  });

  it("资源清单标记引用状态，并支持按需预览、重新应用和安全删除", async () => {
    const activeAppearance = createDefaultAppearance();
    activeAppearance.global.background = {
      type: "image",
      assetId: "background-used",
      imageFileName: "使用中背景",
    };
    activeAppearance.global.numeric = {
      font: { id: "font-used", family: "使用中字体", source: "imported" },
    };
    const updateAppearanceDraft = vi.fn();
    contextMocks.useAppearance.mockReturnValue({
      activeAppearance,
      beginAppearancePreview: vi.fn(),
      getBackgroundImage: vi.fn(),
      resetAppearance: vi.fn(),
      setPreviewScene: vi.fn(),
      updateAppearanceDraft,
    });
    assetMocks.loadAppearanceAssetCatalog.mockResolvedValue({
      backgrounds: [
        {
          id: "background-used",
          kind: "background",
          name: "使用中背景",
          mimeType: "image/png",
        },
        {
          id: "background-unused",
          kind: "background",
          name: "闲置背景",
          mimeType: "image/png",
        },
      ],
      fonts: [
        {
          id: "font-used",
          kind: "font",
          name: "使用中字体",
          mimeType: "font/woff2",
          family: "使用中字体",
          format: "woff2",
        },
        {
          id: "font-unused",
          kind: "font",
          name: "闲置字体",
          mimeType: "font/woff2",
          family: "闲置字体",
          format: "woff2",
        },
      ],
    });
    assetMocks.loadBackgroundAsset.mockResolvedValue({
      id: "background-unused",
      kind: "background",
      name: "闲置背景",
      mimeType: "image/png",
      dataUrl: "data:image/png;base64,AA==",
    });

    render(
      <FeedbackProvider>
        <AppearanceSettingsPanel />
      </FeedbackProvider>
    );

    const usedBackground = await screen.findByLabelText("背景资源 使用中背景");
    const unusedBackground = screen.getByLabelText("背景资源 闲置背景");
    expect(within(usedBackground).getByText("正在使用")).toBeInTheDocument();
    expect(within(unusedBackground).getByText("未使用")).toBeInTheDocument();
    expect(
      within(usedBackground).getByRole("button", { name: "删除背景 使用中背景" })
    ).toBeDisabled();
    expect(
      within(screen.getByLabelText("字体资源 使用中字体")).getByRole("button", {
        name: "删除字体 使用中字体",
      })
    ).toBeDisabled();

    fireEvent.click(within(unusedBackground).getByRole("button", { name: "预览背景 闲置背景" }));
    expect(await screen.findByRole("img", { name: "闲置背景预览" })).toBeInTheDocument();
    expect(assetMocks.loadBackgroundAsset).toHaveBeenCalledWith("background-unused");

    fireEvent.click(within(unusedBackground).getByRole("button", { name: "应用背景 闲置背景" }));
    expect(updateAppearanceDraft).toHaveBeenCalledWith(["global", "background"], {
      type: "image",
      assetId: "background-unused",
      imageFileName: "闲置背景",
    });

    fireEvent.click(within(unusedBackground).getByRole("button", { name: "删除背景 闲置背景" }));
    const dialog = await screen.findByRole("dialog", { name: "删除背景资源" });
    fireEvent.click(within(dialog).getByRole("button", { name: "删除资源" }));
    await waitFor(() =>
      expect(assetMocks.removeAppearanceAsset).toHaveBeenCalledWith(
        "background-unused",
        "background"
      )
    );
  });
});
