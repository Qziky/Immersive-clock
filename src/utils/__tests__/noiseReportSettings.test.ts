import { beforeEach, describe, expect, it, vi } from "vitest";

import { getNoiseReportSettings, saveNoiseReportSettings } from "../noiseReportSettings";

const mocks = vi.hoisted(() => ({
  getAppSettings: vi.fn(),
  updateNoiseSettings: vi.fn(),
}));

vi.mock("../appSettings", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../appSettings")>();
  return {
    ...actual,
    getAppSettings: mocks.getAppSettings,
    updateNoiseSettings: mocks.updateNoiseSettings,
  };
});

describe("noiseReportSettings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("缺失自动关闭时长时返回 10 分钟默认值", () => {
    mocks.getAppSettings.mockReturnValue({
      noiseControl: { reportAutoPopup: true, reportAutoCloseMinutes: undefined },
    });

    expect(getNoiseReportSettings()).toEqual({ autoPopup: true, autoCloseMinutes: 10 });
  });

  it("统一保存自动弹出开关，并把自动关闭时长限制在 1–60 分钟", () => {
    saveNoiseReportSettings({ autoPopup: false, autoCloseMinutes: 72.4 });

    expect(mocks.updateNoiseSettings).toHaveBeenCalledOnce();
    expect(mocks.updateNoiseSettings).toHaveBeenCalledWith({
      reportAutoPopup: false,
      reportAutoCloseMinutes: 60,
    });
  });
});
