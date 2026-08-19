import { beforeEach, describe, expect, it, vi } from "vitest";

import { saveNoiseControlSettings, type NoiseControlSettings } from "../noiseControlSettings";

const mocks = vi.hoisted(() => ({
  broadcastNoiseSyncMessage: vi.fn(),
  broadcastSettingsEvent: vi.fn(),
  getAppSettings: vi.fn(),
  updateNoiseSettings: vi.fn(),
}));

vi.mock("../appSettings", () => ({
  getAppSettings: mocks.getAppSettings,
  updateNoiseSettings: mocks.updateNoiseSettings,
}));

vi.mock("../settingsEvents", () => ({
  broadcastSettingsEvent: mocks.broadcastSettingsEvent,
  SETTINGS_EVENTS: { NoiseControlSettingsUpdated: "noiseControlSettingsUpdated" },
}));

vi.mock("../../services/noise/noiseSyncChannel", () => ({
  broadcastNoiseSyncMessage: mocks.broadcastNoiseSyncMessage,
  createNoiseSyncMessage: <T>(payload: T) => payload,
}));

const CURRENT_SETTINGS: NoiseControlSettings = {
  monitoringEnabled: true,
  historyEnabled: true,
  preferredInputDevice: { deviceId: "usb-mic", label: "USB 麦克风" },
  primaryMetric: "quietness-score",
  showRealtimeValue: true,
  autoHidePersistentAnomaly: true,
  scoreAlertThreshold: 70,
  alertSoundEnabled: false,
};

describe("noiseControlSettings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getAppSettings.mockReturnValue({ noiseControl: CURRENT_SETTINGS });
  });

  it("设置值未变化时不写入也不广播更新", () => {
    saveNoiseControlSettings({
      ...CURRENT_SETTINGS,
      preferredInputDevice: { deviceId: "usb-mic", label: "USB 麦克风" },
    });

    expect(mocks.updateNoiseSettings).not.toHaveBeenCalled();
    expect(mocks.broadcastSettingsEvent).not.toHaveBeenCalled();
    expect(mocks.broadcastNoiseSyncMessage).not.toHaveBeenCalled();
  });

  it("设置值变化时仍写入并广播更新", () => {
    saveNoiseControlSettings({ autoHidePersistentAnomaly: false });

    const next = { ...CURRENT_SETTINGS, autoHidePersistentAnomaly: false };
    expect(mocks.updateNoiseSettings).toHaveBeenCalledWith(next);
    expect(mocks.broadcastSettingsEvent).toHaveBeenCalledWith("noiseControlSettingsUpdated", {
      settings: next,
    });
    expect(mocks.broadcastNoiseSyncMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: "command", command: "settings-updated" })
    );
  });
});
