/** 噪音报告偏好。报告保留期固定为 14 天，不再持久化为用户设置。 */
import {
  getAppSettings,
  normalizeNoiseReportAutoCloseMinutes,
  updateNoiseSettings,
} from "./appSettings";
import { logger } from "./logger";

export interface NoiseReportSettings {
  autoPopup: boolean;
  autoCloseMinutes: number;
}

const DEFAULT_AUTO_POPUP = true;

export function getNoiseReportSettings(): NoiseReportSettings {
  const settings = getAppSettings().noiseControl;
  return {
    autoPopup: settings.reportAutoPopup ?? DEFAULT_AUTO_POPUP,
    autoCloseMinutes: normalizeNoiseReportAutoCloseMinutes(settings.reportAutoCloseMinutes),
  };
}

export function getAutoPopupSetting(): boolean {
  return getNoiseReportSettings().autoPopup;
}

export function saveNoiseReportSettings(settings: NoiseReportSettings): void {
  try {
    updateNoiseSettings({
      reportAutoPopup: settings.autoPopup,
      reportAutoCloseMinutes: normalizeNoiseReportAutoCloseMinutes(settings.autoCloseMinutes),
    });
  } catch (error) {
    logger.error("保存噪音报告设置失败:", error);
  }
}
