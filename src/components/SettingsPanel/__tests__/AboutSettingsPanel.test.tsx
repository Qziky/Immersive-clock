import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import AboutSettingsPanel from "../sections/AboutSettingsPanel";

const aboutMocks = vi.hoisted(() => ({
  developerModeEnabled: false,
  dispatch: vi.fn(),
  errorCenterMode: "off" as "off" | "memory" | "persist",
  runtimePlatform: "web" as "android" | "electron" | "web",
  updateGeneralSettings: vi.fn(),
}));

vi.mock("../../../contexts/AppContext", () => ({
  useAppDispatch: () => aboutMocks.dispatch,
  useAppState: () => ({
    study: {
      errorCenterMode: aboutMocks.errorCenterMode,
      errorPopupEnabled: false,
    },
  }),
}));

vi.mock("../../../utils/errorCenter", () => ({
  clearErrorCenter: vi.fn(),
  exportErrorCenterJson: vi.fn(() => "{}"),
  getErrorCenterRecords: vi.fn(() => []),
  subscribeErrorCenter: vi.fn(() => () => undefined),
}));

vi.mock("../../../utils/appSettings", () => ({
  getAppSettings: () => ({
    general: { developerModeEnabled: aboutMocks.developerModeEnabled },
  }),
  updateGeneralSettings: aboutMocks.updateGeneralSettings,
}));

vi.mock("../../../utils/weatherStorage", () => ({
  getWeatherCache: vi.fn(() => ({})),
}));

vi.mock("../../../utils/runtimePlatform", () => ({
  getRuntimePlatform: () => aboutMocks.runtimePlatform,
}));

describe("AboutSettingsPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    aboutMocks.developerModeEnabled = false;
    aboutMocks.errorCenterMode = "off";
    aboutMocks.runtimePlatform = "web";
  });

  it("在项目信息中展示今日诗词服务与隐私说明", () => {
    render(<AboutSettingsPanel section="project" />);

    expect(screen.getByText("服务与隐私说明")).toBeInTheDocument();
    expect(
      screen.getByText(/今日诗词免费版仅限非商业使用。启用后会由服务方处理公开 IP/)
    ).toHaveTextContent("Token/Cookie");
  });

  it("仅在开发者模式草稿开启后展示调试页面，并在保存时持久化", () => {
    let save: (() => void) | undefined;
    render(
      <AboutSettingsPanel
        section="debug"
        onRegisterSave={(registeredSave) => {
          save = registeredSave;
        }}
      />
    );

    const developerModeSwitch = screen.getByRole("switch", { name: "开发者模式" });
    expect(developerModeSwitch).not.toBeChecked();
    expect(screen.queryByRole("heading", { name: "调试页面" })).not.toBeInTheDocument();

    fireEvent.click(developerModeSwitch);

    expect(developerModeSwitch).toBeChecked();
    expect(screen.getByRole("heading", { name: "调试页面" })).toBeVisible();
    expect(screen.getByRole("button", { name: "保存后可打开组件规范" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "保存后可打开音频诊断" })).toBeDisabled();

    act(() => save?.());
    expect(aboutMocks.updateGeneralSettings).toHaveBeenCalledWith({ developerModeEnabled: true });
  });

  it("已保存开发者模式时提供可用的组件规范与音频诊断入口", () => {
    aboutMocks.developerModeEnabled = true;

    render(<AboutSettingsPanel section="debug" />);

    expect(screen.getByRole("switch", { name: "开发者模式" })).toBeChecked();
    expect(screen.getByRole("button", { name: "打开组件规范" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "打开音频诊断" })).toBeEnabled();
    expect(screen.getByText("组件规范")).toBeVisible();
    expect(screen.getByText("音频诊断")).toBeVisible();
  });

  it("在 Android 容器中显示 Android 运行环境", () => {
    aboutMocks.developerModeEnabled = true;
    aboutMocks.errorCenterMode = "memory";
    aboutMocks.runtimePlatform = "android";

    render(<AboutSettingsPanel section="debug" />);

    expect(screen.getByText(/环境：\s*Android/)).toBeVisible();
  });
});
