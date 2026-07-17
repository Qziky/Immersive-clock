import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import StudySettingsPanel from "../StudySettingsPanel";

vi.mock("../../../../contexts/AppContext", () => ({
  useAppState: () => ({ study: { errorPopupEnabled: false } }),
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
  getNoiseControlSettings: () => ({
    alertSoundEnabled: false,
    avgWindowSec: 1,
    baselineDb: 40,
    maxLevelDb: 55,
    showRealtimeDb: true,
  }),
  saveNoiseControlSettings: vi.fn(),
}));

vi.mock("../../../../utils/noiseReportSettings", () => ({
  estimateMaxRetentionDaysByQuota: () => Promise.resolve(365),
  getNoiseReportSettings: () => ({ autoPopup: true, retentionDays: 14 }),
  setAutoPopupSetting: vi.fn(),
  setRetentionDaysSetting: vi.fn(),
}));

vi.mock("../../../../utils/settingsEvents", () => ({
  broadcastSettingsEvent: vi.fn(),
  SETTINGS_EVENTS: { NoiseBaselineUpdated: "noiseBaselineUpdated" },
  subscribeSettingsEvent: () => vi.fn(),
}));

vi.mock("../../../NoiseSettings/NoiseStatsSummary", () => ({
  NoiseStatsSummary: () => <div>统计内容</div>,
}));

vi.mock("../../../NoiseSettings/RealTimeNoiseChart", () => ({
  RealTimeNoiseChart: () => <div>实时内容</div>,
}));

describe("StudySettingsPanel", () => {
  it("通过四个内部标签隔离噪音功能、合并监测内容并保留草稿", async () => {
    const user = userEvent.setup();
    render(<StudySettingsPanel />);

    const tablist = screen.getByRole("tablist", { name: "噪音设置分类" });
    expect(
      within(tablist)
        .getAllByRole("tab")
        .map((tab) => tab.textContent)
    ).toEqual(["控制", "校准", "报告", "监测"]);

    const realtimeSwitch = screen.getByRole("switch", { name: "显示实时分贝" });
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
    expect(screen.getByRole("switch", { name: "显示实时分贝" })).not.toBeChecked();
  });
});
