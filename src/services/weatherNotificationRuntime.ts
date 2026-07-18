import type { WeatherAlertResponse } from "../types/weather";
import { getAppSettings } from "../utils/appSettings";
import { getAdjustedDate } from "../utils/timeSync";
import {
  buildAlertSignature,
  normalizeStationKey,
  readStationRecord,
  selectLatestAlertsPerStation,
  writeStationRecord,
} from "../utils/weatherAlert";
import type { WeatherCache } from "../utils/weatherStorage";

const AIR_QUALITY_REMINDER_KEY_PREFIX = "weather.airQuality.reminded.";
const SUNRISE_REMINDER_KEY_PREFIX = "weather.sunrise.reminded.";
const SUNSET_REMINDER_KEY_PREFIX = "weather.sunset.reminded.";

function dateKey(date: Date): string {
  return `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, "0")}${String(
    date.getDate()
  ).padStart(2, "0")}`;
}

function hasSessionFlag(key: string): boolean {
  try {
    return sessionStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}

function setSessionFlag(key: string): void {
  try {
    sessionStorage.setItem(key, "1");
  } catch {
    // 提醒去重写入失败不应中断天气运行时。
  }
}

function openMessage(detail: Record<string, unknown>): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("messagePopup:open", { detail }));
}

function alertColor(code?: string | null): string | undefined {
  const value = String(code || "").toLowerCase();
  if (value.includes("红") || value.includes("red")) return "#ef4444";
  if (value.includes("橙") || value.includes("orange")) return "#f97316";
  if (value.includes("黄") || value.includes("yellow")) return "#f5a524";
  if (value.includes("蓝") || value.includes("blue")) return "#3b82f6";
  return undefined;
}

function processAlerts(cache: WeatherCache, response?: WeatherAlertResponse | null): void {
  if (!response?.alerts?.length || response.error || response.metadata?.zeroResult) return;
  const settings = getAppSettings();
  if (!settings.study.alerts.weatherAlert) return;
  const coords = cache.activeLocation?.coords ?? cache.coords;
  for (const item of selectLatestAlertsPerStation(response.alerts)) {
    const stationKey = normalizeStationKey(item.alert.senderName, coords ?? null);
    const signature = buildAlertSignature(item.alert);
    if (readStationRecord(stationKey)?.sig === signature) continue;
    writeStationRecord(stationKey, signature);
    openMessage({
      message: item.alert.description || "请注意当前天气预警信息。",
      themeColor: alertColor(item.alert.color?.code),
      title:
        item.alert.headline ||
        (item.alert.eventType?.name ? `${item.alert.eventType.name}预警` : "天气预警"),
      type: "weatherAlert",
    });
  }
}

function processAirQuality(cache: WeatherCache, today: string): void {
  const settings = getAppSettings();
  if (!settings.study.alerts.airQuality) return;
  const key = `${AIR_QUALITY_REMINDER_KEY_PREFIX}${today}`;
  if (hasSessionFlag(key)) return;
  const indexes = cache.airQuality?.data.indexes ?? [];
  const item = indexes.find((index) => typeof index.aqi === "number");
  if (typeof item?.aqi !== "number" || item.aqi < 101) return;
  setSessionFlag(key);
  openMessage({
    id: `weather:airQuality:${today}`,
    message: `AQI：${item.aqi}${item.category ? `（${item.category}）` : ""}`,
    title: "空气污染提醒",
    type: "weatherForecast",
  });
}

function eventTime(now: Date, value?: string): number | null {
  if (!value) return null;
  const [hour, minute] = value.split(":").map(Number);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;
  const next = new Date(now);
  next.setHours(hour, minute, 0, 0);
  return next.getTime();
}

function processSun(cache: WeatherCache, now: Date, today: string): void {
  const settings = getAppSettings();
  if (!settings.study.alerts.sunriseSunset || cache.astronomySun?.date !== today) return;
  const current = now.getTime();
  const windowMs = 10 * 60 * 1000;
  const sunrise = cache.astronomySun.data.sunrise;
  const sunriseAt = eventTime(now, sunrise);
  const sunriseKey = `${SUNRISE_REMINDER_KEY_PREFIX}${today}`;
  if (
    sunriseAt != null &&
    !hasSessionFlag(sunriseKey) &&
    current >= sunriseAt &&
    current - sunriseAt < windowMs
  ) {
    setSessionFlag(sunriseKey);
    openMessage({
      id: `weather:sunrise:${today}`,
      message: `日出时间：${sunrise}`,
      title: "日出提醒",
      type: "weatherForecast",
    });
  }

  const sunset = cache.astronomySun.data.sunset;
  const sunsetAt = eventTime(now, sunset);
  const sunsetKey = `${SUNSET_REMINDER_KEY_PREFIX}${today}`;
  const notifyAt = sunsetAt == null ? null : sunsetAt - 30 * 60 * 1000;
  if (
    notifyAt != null &&
    !hasSessionFlag(sunsetKey) &&
    current >= notifyAt &&
    current - notifyAt < windowMs
  ) {
    setSessionFlag(sunsetKey);
    openMessage({
      id: `weather:sunset:${today}`,
      message: `日落时间：${sunset}`,
      title: "日落提醒",
      type: "weatherForecast",
    });
  }
}

export function processWeatherNotifications(
  cache: WeatherCache,
  alerts?: WeatherAlertResponse | null
): void {
  const now = getAdjustedDate();
  const today = dateKey(now);
  processAlerts(cache, alerts);
  processAirQuality(cache, today);
  processSun(cache, now, today);
}
