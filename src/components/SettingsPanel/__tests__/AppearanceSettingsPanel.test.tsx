import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { FeedbackProvider } from "../../../ui";
import { createDefaultAppearance } from "../../../utils/appearanceModel";
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

describe("AppearanceSettingsPanel asset catalog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    assetMocks.listener = null;
    const activeAppearance = createDefaultAppearance();
    activeAppearance.global.background = { type: "image" };
    contextMocks.useAppState.mockReturnValue({ mode: "clock", study: { countdownItems: [] } });
    contextMocks.useAppearance.mockReturnValue({
      activeAppearance,
      beginAppearancePreview: vi.fn(),
      resetAppearance: vi.fn(),
      setPreviewScene: vi.fn(),
      updateAppearanceDraft: vi.fn(),
    });
    assetMocks.loadBackgroundAsset.mockResolvedValue(undefined);
    assetMocks.removeAppearanceAsset.mockResolvedValue(undefined);
    fontMocks.removeImportedFont.mockResolvedValue(undefined);
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
