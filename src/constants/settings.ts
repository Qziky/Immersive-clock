/** 应用设置的当前持久化 schema 版本。 */
export const CURRENT_SETTINGS_VERSION = 23;

/** 中央时间字号相对响应式默认值的缩放范围。 */
export const DEFAULT_CENTRAL_TIME_SCALE = 1;
export const MIN_CENTRAL_TIME_SCALE = 0.75;
export const MAX_CENTRAL_TIME_SCALE = 1.5;

export const DEFAULT_OLED_PROTECTION = {
  enabled: false,
  idleMinutes: 5,
  brightnessPercent: 40,
} as const;
export const OLED_PROTECTION_IDLE_MINUTES = [1, 3, 5, 10] as const;
export const MIN_OLED_PROTECTION_BRIGHTNESS = 20;
export const MAX_OLED_PROTECTION_BRIGHTNESS = 80;
