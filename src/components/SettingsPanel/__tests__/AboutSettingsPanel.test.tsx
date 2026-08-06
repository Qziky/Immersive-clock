import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import AboutSettingsPanel from "../sections/AboutSettingsPanel";

const aboutMocks = vi.hoisted(() => ({
  analyticsEnabled: true,
  developerModeEnabled: false,
  dispatch: vi.fn(),
  errorCenterMode: "off" as "off" | "memory" | "persist",
  initializeClarityIfAllowed: vi.fn(async () => true),
  revokeClarityConsent: vi.fn(),
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
    general: {
      analytics: { experienceProgramEnabled: aboutMocks.analyticsEnabled },
      developerModeEnabled: aboutMocks.developerModeEnabled,
    },
  }),
  updateGeneralSettings: aboutMocks.updateGeneralSettings,
}));

vi.mock("../../../services/clarityAnalytics", () => ({
  initializeClarityIfAllowed: aboutMocks.initializeClarityIfAllowed,
  isClarityDeploymentConfigured: () => true,
  revokeClarityConsent: aboutMocks.revokeClarityConsent,
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
    aboutMocks.analyticsEnabled = true;
    aboutMocks.developerModeEnabled = false;
    aboutMocks.errorCenterMode = "off";
    aboutMocks.runtimePlatform = "web";
  });

  it("在项目信息中展示开源许可、第三方声明与服务边界", () => {
    render(<AboutSettingsPanel section="project" />);

    expect(screen.getByRole("link", { name: "Qziky" })).toHaveAttribute(
      "href",
      "https://github.com/Qziky"
    );
    expect(
      screen.getByRole("link", { name: "https://github.com/Qziky/Immersive-clock" })
    ).toHaveAttribute("href", "https://github.com/Qziky/Immersive-clock");
    expect(screen.getByRole("link", { name: "查看 GPLv3 许可证" })).toHaveAttribute(
      "href",
      "https://github.com/Qziky/Immersive-clock/blob/main/LICENSE"
    );
    expect(screen.getByRole("link", { name: "查看第三方声明" })).toHaveAttribute(
      "href",
      "https://github.com/Qziky/Immersive-clock/blob/main/THIRD_PARTY_NOTICES.md"
    );
    expect(screen.getByText("开源许可")).toBeInTheDocument();
    expect(screen.getByText(/修改与再分发须遵守许可证/)).toHaveTextContent("本软件按“原样”提供");
    expect(screen.getByText("服务与隐私说明")).toBeInTheDocument();
    expect(screen.getByText(/今日诗词免费版仅限非商业使用/)).toHaveTextContent(
      "该限制只适用于这一可选第三方服务"
    );
    expect(screen.getByText(/今日诗词免费版仅限非商业使用/)).toHaveTextContent("Token/Cookie");
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

  it("关闭用户体验改进计划前进行挽留，确认后保存并要求刷新", () => {
    let save: (() => void) | undefined;
    const onAnalyticsReloadRequired = vi.fn();
    render(
      <AboutSettingsPanel
        section="privacy"
        onAnalyticsReloadRequired={onAnalyticsReloadRequired}
        onRegisterSave={(registeredSave) => {
          save = registeredSave;
        }}
      />
    );

    const experienceSwitch = screen.getByRole("switch", { name: "用户体验改进计划" });
    expect(experienceSwitch).toBeChecked();

    fireEvent.click(experienceSwitch);
    expect(screen.getByRole("dialog", { name: "要关闭用户体验改进计划吗？" })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "继续帮助改进" }));
    expect(experienceSwitch).toBeChecked();

    fireEvent.click(experienceSwitch);
    fireEvent.click(screen.getByRole("button", { name: "仍然关闭" }));
    expect(experienceSwitch).not.toBeChecked();

    act(() => save?.());
    expect(aboutMocks.updateGeneralSettings).toHaveBeenCalledWith({
      analytics: { experienceProgramEnabled: false },
    });
    expect(aboutMocks.revokeClarityConsent).toHaveBeenCalledTimes(1);
    expect(onAnalyticsReloadRequired).toHaveBeenCalledTimes(1);
  });
});
