import {
  broadcastNoiseSyncMessage,
  createNoiseSyncMessage,
} from "../services/noise/noiseSyncChannel";
import type { NoiseInputDevicePreference } from "../types/noise";

import { getAppSettings, updateNoiseSettings } from "./appSettings";
import { logger } from "./logger";
import { broadcastSettingsEvent, SETTINGS_EVENTS } from "./settingsEvents";

export interface NoiseControlSettings {
  monitoringEnabled: boolean;
  historyEnabled: boolean;
  preferredInputDevice: NoiseInputDevicePreference | null;
  primaryMetric: "quietness-score" | "estimated-dba";
  showRealtimeValue: boolean;
  autoHidePersistentAnomaly: boolean;
  scoreAlertThreshold: number;
  alertSoundEnabled: boolean;
}

const DEFAULT_SETTINGS: NoiseControlSettings = {
  monitoringEnabled: true,
  historyEnabled: true,
  preferredInputDevice: null,
  primaryMetric: "quietness-score",
  showRealtimeValue: true,
  autoHidePersistentAnomaly: true,
  scoreAlertThreshold: 70,
  alertSoundEnabled: false,
};

function normalize(settings: Partial<NoiseControlSettings>): NoiseControlSettings {
  return {
    monitoringEnabled:
      typeof settings.monitoringEnabled === "boolean"
        ? settings.monitoringEnabled
        : DEFAULT_SETTINGS.monitoringEnabled,
    historyEnabled:
      typeof settings.historyEnabled === "boolean"
        ? settings.historyEnabled
        : DEFAULT_SETTINGS.historyEnabled,
    preferredInputDevice: settings.preferredInputDevice
      ? { ...settings.preferredInputDevice }
      : null,
    primaryMetric: settings.primaryMetric === "estimated-dba" ? "estimated-dba" : "quietness-score",
    showRealtimeValue:
      typeof settings.showRealtimeValue === "boolean"
        ? settings.showRealtimeValue
        : DEFAULT_SETTINGS.showRealtimeValue,
    autoHidePersistentAnomaly:
      typeof settings.autoHidePersistentAnomaly === "boolean"
        ? settings.autoHidePersistentAnomaly
        : DEFAULT_SETTINGS.autoHidePersistentAnomaly,
    scoreAlertThreshold:
      typeof settings.scoreAlertThreshold === "number" &&
      Number.isFinite(settings.scoreAlertThreshold)
        ? Math.max(0, Math.min(100, settings.scoreAlertThreshold))
        : DEFAULT_SETTINGS.scoreAlertThreshold,
    alertSoundEnabled:
      typeof settings.alertSoundEnabled === "boolean"
        ? settings.alertSoundEnabled
        : DEFAULT_SETTINGS.alertSoundEnabled,
  };
}
function areNoiseControlSettingsEqual(
  current: NoiseControlSettings,
  next: NoiseControlSettings
): boolean {
  return (
    current.monitoringEnabled === next.monitoringEnabled &&
    current.historyEnabled === next.historyEnabled &&
    current.preferredInputDevice?.deviceId === next.preferredInputDevice?.deviceId &&
    current.preferredInputDevice?.label === next.preferredInputDevice?.label &&
    current.primaryMetric === next.primaryMetric &&
    current.showRealtimeValue === next.showRealtimeValue &&
    current.autoHidePersistentAnomaly === next.autoHidePersistentAnomaly &&
    current.scoreAlertThreshold === next.scoreAlertThreshold &&
    current.alertSoundEnabled === next.alertSoundEnabled
  );
}

export function getNoiseControlSettings(): NoiseControlSettings {
  return normalize(getAppSettings().noiseControl);
}

export function saveNoiseControlSettings(settings: Partial<NoiseControlSettings>): void {
  try {
    const current = getNoiseControlSettings();
    const next = normalize({ ...current, ...settings });
    if (areNoiseControlSettingsEqual(current, next)) return;

    updateNoiseSettings(next);
    broadcastSettingsEvent(SETTINGS_EVENTS.NoiseControlSettingsUpdated, { settings: next });
    broadcastNoiseSyncMessage(
      createNoiseSyncMessage({
        type: "command",
        requestId: crypto.randomUUID?.() ?? `${Date.now()}:${Math.random()}`,
        command: "settings-updated",
      })
    );
  } catch (error) {
    logger.error("保存噪音控制设置失败:", error);
  }
}

export function resetNoiseControlSettings(): void {
  saveNoiseControlSettings(DEFAULT_SETTINGS);
}
