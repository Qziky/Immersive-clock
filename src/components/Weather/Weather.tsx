import React, { useState, useEffect, useCallback, useRef } from "react";

import { useAppState } from "../../contexts/AppContext";
import { useComponentAppearance } from "../../contexts/AppearanceContext";
import { useWeatherAlertSnapshot } from "../../hooks/useWeatherAlertSnapshot";
import { useWeatherCoordinatorSnapshot } from "../../hooks/useWeatherCoordinatorSnapshot";
import type { WeatherAlertResponse } from "../../types/weather";
import { logger } from "../../utils/logger";
import { getAdjustedDate } from "../../utils/timeSync";
import {
  buildAlertSignature,
  normalizeStationKey,
  readStationRecord,
  selectLatestAlertsPerStation,
  writeStationRecord,
} from "../../utils/weatherAlert";
import {
  createWeatherLocationKey,
  getWeatherCache,
  updateAlertTag,
} from "../../utils/weatherStorage";

import styles from "./Weather.module.css";
import { resolveWeatherIconCode } from "./weatherDisplay";
import { WeatherPresentation } from "./WeatherPresentation";

const AIR_QUALITY_REMINDER_KEY_PREFIX = "weather.airQuality.reminded.";
const SUNRISE_REMINDER_KEY_PREFIX = "weather.sunrise.reminded.";
const SUNSET_REMINDER_KEY_PREFIX = "weather.sunset.reminded.";

function formatDateYYYYMMDD(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}${m}${day}`;
}

function mapWeatherAlertColorToThemeColor(code?: string | null): string | undefined {
  if (!code) return undefined;
  const normalized = String(code).trim().toLowerCase();
  if (!normalized) return undefined;

  if (normalized === "red" || normalized.includes("红")) return "#ef4444";
  if (normalized === "orange" || normalized.includes("橙")) return "#f97316";
  if (normalized === "yellow" || normalized.includes("黄")) return "#f5a524";
  if (normalized === "blue" || normalized.includes("蓝")) return "#3b82f6";
  if (normalized === "white" || normalized.includes("白")) return "#ffffff";
  return undefined;
}

/**
 * 根据 AQI 数值计算对应的语义颜色（函数级中文注释：按常见 AQI 分级返回用于强调文本的颜色值）
 */
function getAqiColor(aqi: number): string {
  if (!Number.isFinite(aqi)) return "#ffffff";
  if (aqi <= 50) return "#22c55e"; // 优
  if (aqi <= 100) return "#f5a524"; // 良
  if (aqi <= 150) return "#f97316"; // 轻度污染
  if (aqi <= 200) return "#ef4444"; // 中度污染
  if (aqi <= 300) return "#a855f7"; // 重度污染
  return "#7f1d1d"; // 严重污染
}

/**
 * 根据 AQI 数值计算对应的等级描述（函数级中文注释：用于在提醒里展示污染等级文案）
 */
function getAqiLevelText(aqi: number): string {
  if (!Number.isFinite(aqi)) return "";
  if (aqi <= 50) return "优";
  if (aqi <= 100) return "良";
  if (aqi <= 150) return "轻度污染";
  if (aqi <= 200) return "中度污染";
  if (aqi <= 300) return "重度污染";
  return "严重污染";
}

/**
 * 安全读取 SessionStorage 标志
 */
function safeReadSessionFlag(key: string): boolean {
  try {
    return sessionStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}

function safeWriteSessionFlag(key: string, value: boolean): void {
  try {
    sessionStorage.setItem(key, value ? "1" : "0");
  } catch {
    /* 忽略错误 */
  }
}

// 天气数据接口
export interface WeatherData {
  temperature: string;
  text: string;
  location: string;
  icon: string;
}

/**
 * 天气组件（重构版）
 * 完全使用小米天气 + 高德反编码逻辑。
 */
const Weather: React.FC = () => {
  const temperatureAppearance = useComponentAppearance("studyWeather", "temperature");
  const descriptionAppearance = useComponentAppearance("studyWeather", "description");
  const iconAppearance = useComponentAppearance("studyWeather", "icon");
  const [weatherData, setWeatherData] = useState<WeatherData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const { study } = useAppState();
  const coordinator = useWeatherCoordinatorSnapshot();
  const weatherAlerts = useWeatherAlertSnapshot(Boolean(study.weatherAlertEnabled));
  const lastHandledAlertRevisionRef = useRef(weatherAlerts.revision);
  const weatherAlertEnabledRef = useRef(Boolean(study.weatherAlertEnabled));

  const tickWeatherReminders = useCallback(() => {
    const now = getAdjustedDate();
    const todayKey = formatDateYYYYMMDD(now);
    const nowMs = now.getTime();

    if (study.airQualityAlertEnabled) {
      const remindedKey = `${AIR_QUALITY_REMINDER_KEY_PREFIX}${todayKey}`;
      if (!safeReadSessionFlag(remindedKey)) {
        const cache = getWeatherCache();
        const indexes = cache.airQuality?.data?.indexes || [];
        const idx =
          indexes.find(
            (x) =>
              typeof x.aqi === "number" &&
              String(x.name || "")
                .toUpperCase()
                .includes("AQI")
          ) ||
          indexes.find((x) => typeof x.aqi === "number") ||
          null;
        const aqi = typeof idx?.aqi === "number" ? idx.aqi : null;
        if (aqi != null && aqi >= 101) {
          safeWriteSessionFlag(remindedKey, true);
          const aqiColor = getAqiColor(aqi);
          const aqiLevel = idx?.category || getAqiLevelText(aqi);
          window.dispatchEvent(
            new CustomEvent("messagePopup:open", {
              detail: {
                id: `weather:airQuality:${todayKey}`,
                type: "weatherForecast",
                title: "空气污染提醒",
                message: (
                  <div>
                    AQI：<span style={{ color: aqiColor, fontWeight: 700 }}>{aqi}</span>
                    {aqiLevel ? `（${aqiLevel}）` : ""}
                  </div>
                ),
              },
            })
          );
        }
      }
    }

    if (study.sunriseSunsetAlertEnabled) {
      const cache = getWeatherCache();
      const astro = cache.astronomySun;
      if (astro?.date === todayKey) {
        const mkEventMs = (hhmm: string) => {
          const parts = hhmm.split(":");
          const hh = Number(parts[0]);
          const mm = Number(parts[1]);
          if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null;
          const d = getAdjustedDate();
          d.setHours(hh, mm, 0, 0);
          return d.getTime();
        };

        const windowMs = 10 * 60 * 1000;
        const sunrise = typeof astro.data?.sunrise === "string" ? astro.data.sunrise : "";
        const sunset = typeof astro.data?.sunset === "string" ? astro.data.sunset : "";

        const sunriseMs = sunrise ? mkEventMs(sunrise) : null;
        const sunsetMs = sunset ? mkEventMs(sunset) : null;

        if (sunriseMs != null) {
          const remindedKey = `${SUNRISE_REMINDER_KEY_PREFIX}${todayKey}`;
          if (
            !safeReadSessionFlag(remindedKey) &&
            nowMs >= sunriseMs &&
            nowMs - sunriseMs < windowMs
          ) {
            safeWriteSessionFlag(remindedKey, true);
            window.dispatchEvent(
              new CustomEvent("messagePopup:open", {
                detail: {
                  id: `weather:sunrise:${todayKey}`,
                  type: "weatherForecast",
                  title: "日出提醒",
                  message: `日出时间：${sunrise}`,
                },
              })
            );
          }
        }

        if (sunsetMs != null) {
          const remindedKey = `${SUNSET_REMINDER_KEY_PREFIX}${todayKey}`;
          const notifyMs = sunsetMs - 30 * 60 * 1000;
          if (
            !safeReadSessionFlag(remindedKey) &&
            nowMs >= notifyMs &&
            nowMs - notifyMs < windowMs
          ) {
            safeWriteSessionFlag(remindedKey, true);
            window.dispatchEvent(
              new CustomEvent("messagePopup:open", {
                detail: {
                  id: `weather:sunset:${todayKey}`,
                  type: "weatherForecast",
                  title: "日落提醒",
                  message: `太阳要下班啦～ 日落时间：${sunset}`,
                },
              })
            );
          }
        }
      }
    }
  }, [study.airQualityAlertEnabled, study.sunriseSunsetAlertEnabled]);

  /** 使用共享快照处理天气预警弹窗。 */
  const handleWeatherAlerts = useCallback(
    (alertResp: WeatherAlertResponse, coords?: { lat: number; lon: number } | null) => {
      try {
        if (
          study.weatherAlertEnabled &&
          !alertResp.error &&
          alertResp.alerts &&
          alertResp.alerts.length > 0 &&
          !alertResp.metadata?.zeroResult
        ) {
          const latestByStation = selectLatestAlertsPerStation(alertResp.alerts);
          for (const item of latestByStation) {
            const stationKey = normalizeStationKey(item.alert.senderName, coords);
            const signature = buildAlertSignature(item.alert);
            const record = readStationRecord(stationKey);
            if (record && record.sig === signature) {
              continue;
            }
            writeStationRecord(stationKey, signature);
            const themeColor = mapWeatherAlertColorToThemeColor(item.alert.color?.code);
            const ev = new CustomEvent("messagePopup:open", {
              detail: {
                type: "weatherAlert",
                title:
                  item.alert.headline ||
                  (item.alert.eventType?.name ? `${item.alert.eventType.name}预警` : "天气预警"),
                message: item.alert.description || "请注意当前天气预警信息。",
                themeColor,
              },
            });
            window.dispatchEvent(ev);
          }
          if (latestByStation.length === 0 && alertResp.metadata?.tag) {
            const cache = getWeatherCache();
            const lastTag = cache.alertMetadata?.lastTag;

            if (alertResp.metadata.tag !== lastTag) {
              updateAlertTag(alertResp.metadata.tag);
              const first = alertResp.alerts[0];
              const themeColor = mapWeatherAlertColorToThemeColor(first.color?.code);
              const ev = new CustomEvent("messagePopup:open", {
                detail: {
                  type: "weatherAlert",
                  title:
                    first.headline ||
                    (first.eventType?.name ? `${first.eventType.name}预警` : "天气预警"),
                  message: first.description || "请注意当前天气预警信息。",
                  themeColor,
                },
              });
              window.dispatchEvent(ev);
            }
          }
        }
      } catch (e) {
        logger.warn("天气预警处理失败:", e);
      }
    },
    [study.weatherAlertEnabled]
  );

  useEffect(() => {
    const enabled = Boolean(study.weatherAlertEnabled);
    const wasEnabled = weatherAlertEnabledRef.current;
    weatherAlertEnabledRef.current = enabled;
    if (!enabled || !wasEnabled) {
      lastHandledAlertRevisionRef.current = weatherAlerts.revision;
      return;
    }
    if (
      weatherAlerts.status !== "ready" ||
      weatherAlerts.revision <= lastHandledAlertRevisionRef.current
    ) {
      return;
    }
    lastHandledAlertRevisionRef.current = weatherAlerts.revision;
    handleWeatherAlerts(
      {
        alerts: weatherAlerts.alerts.map((item) => item.alert),
        metadata: weatherAlerts.metadata ?? undefined,
      },
      weatherAlerts.coords
    );
  }, [
    handleWeatherAlerts,
    study.weatherAlertEnabled,
    weatherAlerts.alerts,
    weatherAlerts.coords,
    weatherAlerts.metadata,
    weatherAlerts.revision,
    weatherAlerts.status,
  ]);

  useEffect(() => {
    const cache = getWeatherCache();
    const currentLocation = cache.coords
      ? createWeatherLocationKey(cache.coords.lat, cache.coords.lon)
      : null;
    const now =
      currentLocation && cache.details?.location === currentLocation ? cache.now?.data.now : null;
    if (now) {
      const text = now.text ?? "";
      setWeatherData({
        temperature: now.temp ?? "",
        text,
        location: cache.location?.city || "未知",
        icon: resolveWeatherIconCode(text),
      });
    } else {
      setWeatherData(null);
    }
    setLoading(false);
    tickWeatherReminders();
  }, [coordinator.updatedAt, tickWeatherReminders]);

  useEffect(() => {
    const timer = setInterval(tickWeatherReminders, 60 * 1000);
    return () => clearInterval(timer);
  }, [tickWeatherReminders]);

  // 加载状态
  if (loading) {
    return (
      <div className={styles.weather} aria-label="天气">
        <div className={styles.loading}>
          <div className={styles.loadingDot}></div>
        </div>
      </div>
    );
  }

  const displayTempText = weatherData?.temperature ? `${weatherData.temperature}°` : "--";
  const displayTextRaw = weatherData?.text || "--";
  const displayIconCode = weatherData?.icon || null;
  const titleText = weatherData ? `${weatherData.text} ${weatherData.temperature}°C` : "--";

  return (
    <WeatherPresentation
      descriptionAttributes={{ style: descriptionAppearance }}
      iconAttributes={{ style: iconAppearance }}
      iconCode={displayIconCode}
      temperatureAttributes={{ style: temperatureAppearance }}
      temperatureText={displayTempText}
      title={titleText}
      weatherText={displayTextRaw}
    />
  );
};

export default Weather;
