import { isUsableMinutelyResponse } from "../utils/minutelyPrecipLogic";
import { getAdjustedDate } from "../utils/timeSync";
import {
  createWeatherLocationKey,
  getWeatherCache,
  updateAirQualityCache,
  updateAstronomySunCache,
  updateDaily3dCache,
  updateMinutelyCache,
  updateWeatherDetailsCache,
  updateWeatherNowSnapshot,
} from "../utils/weatherStorage";

import { WeatherRequestDeferredError } from "./weatherRequestGuard";
import {
  buildWeatherFlow,
  type WeatherFlowOptions,
  type WeatherFlowResult,
} from "./weatherService";

let refreshPromise: Promise<WeatherFlowResult> | null = null;

function formatDateYYYYMMDD(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}${month}${day}`;
}

function dispatchRefreshDone(detail: Record<string, unknown>): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("weatherRefreshDone", { detail }));
}

async function runWeatherRefresh(options?: WeatherFlowOptions): Promise<WeatherFlowResult> {
  try {
    const result = await buildWeatherFlow({
      ...options,
      fetchAirQuality: true,
      fetchAstronomySun: true,
      fetchDaily3d: true,
    });

    if (!result.coords) throw new Error("定位失败，无法获取天气");
    if (!result.weather) throw new Error("天气获取失败: 无天气响应");
    if (result.weather.error) throw new Error(`天气获取失败: ${result.weather.error}`);
    if (result.weather.code !== "200") {
      throw new Error(`天气获取失败: ${result.weather.code || "无状态码"}`);
    }
    if (!result.weather.now) throw new Error("天气获取失败: 天气响应缺少实时数据");

    const location = createWeatherLocationKey(result.coords.lat, result.coords.lon);
    updateWeatherNowSnapshot(result.weather);
    if (result.details && !result.details.error) {
      updateWeatherDetailsCache(
        createWeatherLocationKey(result.coords.lat, result.coords.lon),
        result.details
      );
    }
    if (result.daily3d && !result.daily3d.error) {
      updateDaily3dCache(location, result.daily3d);
    }
    if (result.astronomySun && !result.astronomySun.error) {
      updateAstronomySunCache(location, formatDateYYYYMMDD(getAdjustedDate()), result.astronomySun);
    }
    if (result.airQuality && !result.airQuality.error) {
      updateAirQualityCache(result.coords.lat, result.coords.lon, result.airQuality);
    }
    if (isUsableMinutelyResponse(result.embeddedMinutely)) {
      updateMinutelyCache(location, result.embeddedMinutely);
    }

    const geolocationDiagnostics = getWeatherCache().geolocation?.diagnostics || null;
    dispatchRefreshDone({
      address: result.addressInfo?.address || "",
      airQuality: result.airQuality || null,
      alerts: result.alerts || null,
      astronomySun: result.astronomySun || null,
      coords: result.coords,
      coordsSource: result.coordsSource || null,
      daily3d: result.daily3d || null,
      details: result.details || null,
      geolocationDiagnostics,
      now: result.weather.now,
      refer: result.weather.refer || null,
      status: "成功",
      ts: Date.now(),
    });

    return result;
  } catch (error: unknown) {
    if (error instanceof WeatherRequestDeferredError) throw error;
    const errorMessage = error instanceof Error ? error.message : String(error);
    const cache = getWeatherCache();
    dispatchRefreshDone({
      address: cache.location?.address || "",
      coords: cache.coords ? { lat: cache.coords.lat, lon: cache.coords.lon } : null,
      coordsSource: cache.coords?.source || null,
      errorMessage,
      geolocationDiagnostics: cache.geolocation?.diagnostics || null,
      status: "失败",
      ts: Date.now(),
    });
    throw error;
  }
}

/** @internal Called only by weatherCoordinator. */
export function refreshWeatherBundle(options?: WeatherFlowOptions): Promise<WeatherFlowResult> {
  if (refreshPromise) return refreshPromise;
  refreshPromise = runWeatherRefresh(options).finally(() => {
    refreshPromise = null;
  });
  return refreshPromise;
}
