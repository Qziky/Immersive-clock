/** 噪音报告偏好。报告保留期固定为 14 天，不再持久化为用户设置。 */
import { getAppSettings, updateNoiseSettings } from "./appSettings";
import { logger } from "./logger";

export interface NoiseReportSettings {
  autoPopup: boolean;
}

const DEFAULT_AUTO_POPUP = true;

export function getNoiseReportSettings(): NoiseReportSettings {
  const autoPopup = getAppSettings().noiseControl.reportAutoPopup;
  return { autoPopup: autoPopup ?? DEFAULT_AUTO_POPUP };
}

export function getAutoPopupSetting(): boolean {
  return getNoiseReportSettings().autoPopup;
}

export function setAutoPopupSetting(autoPopup: boolean): void {
  try {
    updateNoiseSettings({ reportAutoPopup: autoPopup });
  } catch (error) {
    logger.error("保存噪音报告设置失败:", error);
  }
}
