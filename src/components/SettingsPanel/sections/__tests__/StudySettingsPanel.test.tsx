import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import StudySettingsPanel from "../StudySettingsPanel";

const noiseControlMocks = vi.hoisted(() => ({
  get: vi.fn(),
  save: vi.fn(),
}));

const noiseReportMocks = vi.hoisted(() => ({
  get: vi.fn(),
  save: vi.fn(),
}));

const inputDeviceMocks = vi.hoisted(() => ({
  list: vi.fn(),
  requestAccess: vi.fn(),
  subscribe: vi.fn(() => () => undefined),
}));

const noiseStreamMocks = vi.hoisted(() => ({
  useNoiseStream: vi.fn(),
}));

vi.mock("../../../../contexts/AppContext", () => ({
  useAppState: () => ({ study: { errorPopupEnabled: false } }),
}));

vi.mock("../../../../hooks/useNoiseStream", () => ({
  useNoiseStream: noiseStreamMocks.useNoiseStream.mockReturnValue({
    calibration: { status: "idle", progress: 0, error: null },
    calibrationAvailable: false,
    calibrate: vi.fn(),
    clearCalibration: vi.fn(),
  }),
}));

vi.mock("../../../../services/noise/noiseInputDeviceService", () => ({
  listNoiseInputDevices: inputDeviceMocks.list,
  requestNoiseInputDeviceAccess: inputDeviceMocks.requestAccess,
  subscribeNoiseInputDeviceChanges: inputDeviceMocks.subscribe,
}));

vi.mock("../../../../ui", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../../ui")>();
  return {
    ...actual,
    useFeedback: () => ({ confirm: vi.fn() }),
  };
});

vi.mock("../../../../utils/appSettings", () => ({
  getAppSettings: () => ({
    noiseControl: {
      baselineDisplayDb: 0,
      baselineRms: 0,
    },
  }),
  updateNoiseSettings: vi.fn(),
}));

vi.mock("../../../../utils/noiseControlSettings", () => ({
  getNoiseControlSettings: noiseControlMocks.get,
  saveNoiseControlSettings: noiseControlMocks.save,
}));

vi.mock("../../../../utils/noiseReportSettings", () => ({
  getNoiseReportSettings: noiseReportMocks.get,
  saveNoiseReportSettings: noiseReportMocks.save,
}));

vi.mock("../../../NoiseSettings/NoiseStatsSummary", () => ({
  NoiseStatsSummary: () => <div>统计内容</div>,
}));

vi.mock("../../../NoiseSettings/RealTimeNoiseChart", () => ({
  RealTimeNoiseChart: () => <div>实时内容</div>,
}));

describe("StudySettingsPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    noiseControlMocks.get.mockReturnValue({
      alertSoundEnabled: false,
      historyEnabled: true,
      monitoringEnabled: true,
      preferredInputDevice: null,
      primaryMetric: "quietness-score",
      scoreAlertThreshold: 70,
      showRealtimeValue: true,
      autoHidePersistentAnomaly: true,
    });
    noiseReportMocks.get.mockReturnValue({ autoPopup: true, autoCloseMinutes: 10 });
    inputDeviceMocks.list.mockResolvedValue([
      { deviceId: "built-in", label: "内置麦克风" },
      { deviceId: "usb-mic", label: "USB 麦克风" },
    ]);
    inputDeviceMocks.requestAccess.mockResolvedValue([
      { deviceId: "built-in", label: "内置麦克风" },
      { deviceId: "usb-mic", label: "USB 麦克风" },
    ]);
    noiseStreamMocks.useNoiseStream.mockClear();
  });

  it("通过四个内部标签隔离噪音功能、合并监测内容并保留草稿", async () => {
    const user = userEvent.setup();
    render(<StudySettingsPanel />);

    const tablist = screen.getByRole("tablist", { name: "噪音设置分类" });
    expect(
      within(tablist)
        .getAllByRole("tab")
        .map((tab) => tab.textContent)
    ).toEqual(["控制", "校准", "报告", "监测"]);

    const realtimeSwitch = screen.getByRole("switch", { name: "显示实时数值" });
    expect(realtimeSwitch).toBeChecked();
    await user.click(realtimeSwitch);
    expect(realtimeSwitch).not.toBeChecked();

    const sections = [
      ["校准", "校准与修正"],
      ["报告", "噪音报告"],
    ] as const;
    for (const [tabName, heading] of sections) {
      await user.click(within(tablist).getByRole("tab", { name: tabName }));
      expect(screen.getByRole("heading", { name: heading })).toBeVisible();
      expect(screen.queryByRole("heading", { name: "噪音控制" })).not.toBeInTheDocument();
    }

    await user.click(within(tablist).getByRole("tab", { name: "监测" }));
    expect(screen.getByRole("heading", { name: "实时监控" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "统计数据" })).toBeVisible();
    expect(screen.getByText("实时内容")).toBeVisible();
    expect(screen.getByText("统计内容")).toBeVisible();
    expect(screen.queryByRole("heading", { name: "噪音控制" })).not.toBeInTheDocument();

    const controlTab = within(tablist).getByRole("tab", { name: "控制" });
    await user.click(controlTab);
    const panel = document.getElementById(controlTab.getAttribute("aria-controls") || "");
    if (!panel) throw new Error("控制标签缺少关联面板");
    expect(panel).toHaveAttribute("aria-labelledby", controlTab.id);
    expect(screen.getByRole("heading", { name: "噪音控制" })).toBeVisible();
    expect(screen.getByRole("switch", { name: "显示实时数值" })).not.toBeChecked();
  });

  it("隐藏的设置分区不订阅麦克风数据流", () => {
    render(<StudySettingsPanel isActive={false} />);

    expect(noiseStreamMocks.useNoiseStream).toHaveBeenCalledWith(false);
    expect(inputDeviceMocks.list).not.toHaveBeenCalled();
  });

  it("自动关闭时长保留为统一保存草稿，并随自动弹出开关禁用", async () => {
    const user = userEvent.setup();
    let saveHandler: (() => void) | undefined;
    render(
      <StudySettingsPanel
        onRegisterSave={(handler) => {
          saveHandler = handler;
        }}
      />
    );

    await user.click(screen.getByRole("tab", { name: "报告" }));
    const autoPopupSwitch = screen.getByRole("switch", { name: "自动弹出报告" });
    const autoCloseSlider = screen.getByRole("slider", { name: "报告自动关闭时长" });

    expect(autoCloseSlider).toHaveValue("10");
    fireEvent.change(autoCloseSlider, { target: { value: "12" } });
    expect(autoCloseSlider).toHaveValue("12");
    expect(noiseReportMocks.save).not.toHaveBeenCalled();

    await user.click(autoPopupSwitch);
    expect(autoCloseSlider).toBeDisabled();
    expect(autoCloseSlider).toHaveValue("12");

    act(() => saveHandler?.());
    expect(noiseReportMocks.save).toHaveBeenCalledWith({
      autoPopup: false,
      autoCloseMinutes: 12,
    });
  });

  it("麦克风异常自动隐藏默认开启，并随统一保存提交", async () => {
    const user = userEvent.setup();
    let saveHandler: (() => void) | undefined;
    render(
      <StudySettingsPanel
        onRegisterSave={(handler) => {
          saveHandler = handler;
        }}
      />
    );

    const autoHideSwitch = screen.getByRole("switch", { name: "麦克风异常后自动隐藏" });
    expect(autoHideSwitch).toBeChecked();
    await user.click(autoHideSwitch);
    expect(autoHideSwitch).not.toBeChecked();
    expect(noiseControlMocks.save).not.toHaveBeenCalled();

    act(() => saveHandler?.());
    expect(noiseControlMocks.save).toHaveBeenCalledWith(
      expect.objectContaining({ autoHidePersistentAnomaly: false })
    );
  });

  it("为校准引导暴露真实标签、区域、状态和开始按钮标记", async () => {
    const user = userEvent.setup();
    render(<StudySettingsPanel />);

    const calibrationTab = screen.getByRole("tab", { name: "校准" });
    expect(calibrationTab).toHaveAttribute("id", "noise-settings-tabs-tab-calibration");
    await user.click(calibrationTab);

    const calibrationRegion = document.querySelector('[data-tour="noise-calibration"]');
    expect(calibrationRegion).not.toHaveAttribute("hidden");
    expect(document.querySelector('[data-tour="noise-calibration-status"]')).toBeVisible();
    expect(document.querySelector('[data-tour="noise-calibrate-button"]')).toHaveTextContent(
      "开始校准"
    );
  });

  it("把麦克风选择保留为草稿，并只在统一保存时提交设备偏好", async () => {
    const user = userEvent.setup();
    let saveHandler: (() => void) | undefined;
    const registerSave = vi.fn((handler: () => void) => {
      saveHandler = handler;
    });
    render(<StudySettingsPanel onRegisterSave={registerSave} />);

    const dropdown = await screen.findByRole("button", { name: "麦克风设备" });
    expect(dropdown).toHaveTextContent("系统默认");
    const registrationCount = registerSave.mock.calls.length;
    await user.click(dropdown);
    await user.click(screen.getByRole("option", { name: "USB 麦克风" }));

    expect(noiseControlMocks.save).not.toHaveBeenCalled();
    await waitFor(() => expect(registerSave.mock.calls.length).toBeGreaterThan(registrationCount));
    act(() => saveHandler?.());

    expect(noiseControlMocks.save).toHaveBeenCalledWith(
      expect.objectContaining({
        preferredInputDevice: { deviceId: "usb-mic", label: "USB 麦克风" },
      })
    );
  });

  it("保留并标记当前不可用的已选麦克风", async () => {
    noiseControlMocks.get.mockReturnValue({
      alertSoundEnabled: false,
      historyEnabled: true,
      monitoringEnabled: true,
      preferredInputDevice: { deviceId: "missing-mic", label: "会议室麦克风" },
      primaryMetric: "quietness-score",
      scoreAlertThreshold: 70,
      showRealtimeValue: true,
      autoHidePersistentAnomaly: true,
    });
    inputDeviceMocks.list.mockResolvedValue([{ deviceId: "built-in", label: "内置麦克风" }]);

    render(<StudySettingsPanel />);

    const dropdown = await screen.findByRole("button", { name: "麦克风设备" });
    expect(dropdown).toHaveTextContent("会议室麦克风（当前不可用）");
    await userEvent.setup().click(dropdown);
    expect(screen.getByRole("option", { name: "会议室麦克风（当前不可用）" })).toBeVisible();
    expect(screen.getByText("所选设备当前不可用，采集时将使用系统默认。")).toBeVisible();
  });
});
