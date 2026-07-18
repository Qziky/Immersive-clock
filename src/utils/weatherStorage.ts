import type {
  AirQualityCurrentResponse,
  AstronomySunResponse,
  GeolocationDiagnostics,
  MinutelyPrecipResponse,
  WeatherDaily3dResponse,
  WeatherDetailsResponse,
  WeatherHourly72hResponse,
  WeatherNow,
  WeatherLocation,
} from "../types/weather";

import { logger } from "./logger";

const STORAGE_KEY = "weather-cache";

// 缓存有效期常量
const COORDS_TTL = 12 * 60 * 60 * 1000; // 12小时
const ALERT_TTL = 12 * 60 * 60 * 1000; // 12小时
const MINUTELY_TTL = 5 * 60 * 1000; // 5分钟
const DAILY_TTL = 3 * 60 * 60 * 1000; // 3小时
const DETAILS_TTL = 3 * 60 * 60 * 1000; // 3小时
const HOURLY72H_TTL = 60 * 60 * 1000; // 1小时
const AIR_QUALITY_TTL = 60 * 60 * 1000; // 1小时
const ASTRONOMY_TTL = 12 * 60 * 60 * 1000; // 12小时
const XIAOMI_LOCATION_TTL = 24 * 60 * 60 * 1000; // 24小时

export interface XiaomiLocationCacheData {
  affiliation?: string;
  lat: number;
  locationKey: string;
  lon: number;
  name?: string;
}

export interface WeatherCache {
  version?: 2;
  activeLocation?: WeatherLocation;
  // 1. 坐标与定位缓存
  coords?: {
    lat: number;
    lon: number;
    accuracy?: number;
    source: string;
    updatedAt: number;
  };

  // 1.1 浏览器定位诊断信息
  geolocation?: {
    diagnostics: GeolocationDiagnostics;
    updatedAt: number;
  };

  // 2. 按坐标签名缓存的小米城市结果
  xiaomiLocations?: Record<
    string,
    {
      data: XiaomiLocationCacheData;
      updatedAt: number;
    }
  >;

  // 3. 实时天气快照
  now?: {
    data: WeatherNow;
    updatedAt: number;
  };

  // 3.1 全量天气详情与供应商原始响应
  details?: {
    data: WeatherDetailsResponse;
    location: string;
    updatedAt: number;
  };

  // 4. 分钟级降水缓存
  minutely?: {
    data: MinutelyPrecipResponse;
    location: string; // 位置 (lon,lat)
    updatedAt: number;
    lastApiFetchAt?: number; // 上次 API 请求时间
    lastCriticalFetchAt?: number; // 上次关键窗口加密请求时间
  };

  // 4.1 三日天气预报缓存
  daily3d?: {
    data: WeatherDaily3dResponse;
    location: string; // 位置 (lon,lat)
    updatedAt: number;
  };

  // 4.1.1 小时级天气预报缓存（72小时）
  hourly72h?: {
    data: WeatherHourly72hResponse;
    location: string; // 位置 (lon,lat)
    updatedAt: number;
    lastApiFetchAt?: number; // 上次 API 请求时间
  };

  // 4.2 空气质量缓存
  airQuality?: {
    data: AirQualityCurrentResponse;
    signature: string; // 坐标签名 (lat,lon)
    updatedAt: number;
  };

  // 4.3 日出日落缓存
  astronomySun?: {
    data: AstronomySunResponse;
    location: string; // 位置 (lon,lat)
    date: string; // 日期 (yyyyMMdd)
    updatedAt: number;
  };

  // 5. 预警去重记录
  alerts?: Record<string, { sig: string; ts: number }>; // 键为站点 ID

  // 6. 预警元数据
  alertMetadata?: {
    lastTag?: string; // 预警数据标识，用于检测变化
  };
}

/**
 * 获取完整天气缓存
 */
export function getWeatherCache(): WeatherCache {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch (error) {
    logger.warn("Failed to read weather cache", error);
    return {};
  }
}

/**
 * 保存部分天气缓存
 */
function saveWeatherCache(
  partial: Partial<WeatherCache> | ((current: WeatherCache) => Partial<WeatherCache>)
) {
  try {
    const current = getWeatherCache();
    const updates = typeof partial === "function" ? partial(current) : partial;
    const next = { ...current, ...updates };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch (error) {
    logger.error("Failed to save weather cache", error);
  }
}

/**
 * 更新坐标缓存
 */
export function updateCoordsCache(lat: number, lon: number, source: string) {
  saveWeatherCache({
    coords: {
      lat,
      lon,
      source,
      updatedAt: Date.now(),
    },
  });
}

export interface WeatherRuntimeBundleCacheInput {
  airQuality?: AirQualityCurrentResponse | null;
  astronomySun?: AstronomySunResponse | null;
  daily3d?: WeatherDaily3dResponse | null;
  details?: WeatherDetailsResponse | null;
  location: WeatherLocation;
  minutely?: MinutelyPrecipResponse | null;
  weather: WeatherNow;
}

/** 全量天气成功后一次性写入同一位置的所有数据，避免消费者观察到半更新状态。 */
export function updateWeatherRuntimeBundle(
  input: WeatherRuntimeBundleCacheInput,
  astronomyDate: string,
  updatedAt = Date.now()
): WeatherCache {
  const locationKey = createWeatherLocationKey(
    input.location.coords.lat,
    input.location.coords.lon
  );
  const current = getWeatherCache();
  const next: WeatherCache = {
    version: 2,
    activeLocation: input.location,
    coords: {
      accuracy: input.location.coords.accuracy,
      lat: input.location.coords.lat,
      lon: input.location.coords.lon,
      source: input.location.source,
      updatedAt: input.location.resolvedAt,
    },
    geolocation: current.geolocation,
    xiaomiLocations: {
      ...getFreshXiaomiLocations(current, updatedAt),
      [locationKey]: {
        data: {
          affiliation: input.location.city.affiliation,
          lat: input.location.coords.lat,
          locationKey: input.location.city.locationKey,
          lon: input.location.coords.lon,
          name: input.location.city.name,
        },
        updatedAt: input.location.resolvedAt,
      },
    },
    now: { data: input.weather, updatedAt },
    alerts: current.alerts,
    alertMetadata: current.alertMetadata,
    ...(input.details && !input.details.error
      ? { details: { data: input.details, location: locationKey, updatedAt } }
      : {}),
    ...(input.daily3d && !input.daily3d.error
      ? { daily3d: { data: input.daily3d, location: locationKey, updatedAt } }
      : {}),
    ...(input.airQuality && !input.airQuality.error
      ? {
          airQuality: {
            data: input.airQuality,
            signature: `${input.location.coords.lat.toFixed(4)},${input.location.coords.lon.toFixed(4)}`,
            updatedAt,
          },
        }
      : {}),
    ...(input.astronomySun && !input.astronomySun.error
      ? {
          astronomySun: {
            data: input.astronomySun,
            date: astronomyDate,
            location: locationKey,
            updatedAt,
          },
        }
      : {}),
    ...(input.minutely
      ? {
          minutely: {
            data: input.minutely,
            lastApiFetchAt: updatedAt,
            location: locationKey,
            updatedAt,
          },
        }
      : {}),
  };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch (error) {
    logger.error("Failed to save weather runtime bundle", error);
  }
  return next;
}

/**
 * 更新浏览器定位诊断信息缓存
 */
export function updateGeolocationDiagnostics(diagnostics: GeolocationDiagnostics) {
  saveWeatherCache({
    geolocation: {
      diagnostics,
      updatedAt: Date.now(),
    },
  });
}

/**
 * 更新实时天气快照
 */
export function updateWeatherNowSnapshot(data: WeatherNow) {
  saveWeatherCache({
    now: {
      data,
      updatedAt: Date.now(),
    },
  });
}

export function createWeatherLocationKey(lat: number, lon: number): string {
  return `${lon.toFixed(4)},${lat.toFixed(4)}`;
}

function getFreshXiaomiLocations(
  cache: WeatherCache,
  now = Date.now()
): NonNullable<WeatherCache["xiaomiLocations"]> {
  const fresh = Object.fromEntries(
    Object.entries(cache.xiaomiLocations ?? {}).filter(
      ([, entry]) => now - entry.updatedAt < XIAOMI_LOCATION_TTL
    )
  );
  const legacy = (
    cache as WeatherCache & {
      xiaomiLocation?: { data?: XiaomiLocationCacheData; location?: string; updatedAt?: number };
    }
  ).xiaomiLocation;
  if (
    legacy?.data?.locationKey &&
    legacy.location &&
    typeof legacy.updatedAt === "number" &&
    now - legacy.updatedAt < XIAOMI_LOCATION_TTL
  ) {
    fresh[legacy.location] = { data: legacy.data, updatedAt: legacy.updatedAt };
  }
  return fresh;
}

export function updateXiaomiLocationCache(data: XiaomiLocationCacheData): void {
  saveWeatherCache((current) => {
    const now = Date.now();
    const updates: Partial<WeatherCache> & { xiaomiLocation?: undefined } = {
      xiaomiLocation: undefined,
      xiaomiLocations: {
        ...getFreshXiaomiLocations(current, now),
        [createWeatherLocationKey(data.lat, data.lon)]: { data, updatedAt: now },
      },
    };
    return updates;
  });
}

export function getValidXiaomiLocation(lat: number, lon: number): XiaomiLocationCacheData | null {
  const cache = getWeatherCache();
  return getFreshXiaomiLocations(cache)[createWeatherLocationKey(lat, lon)]?.data ?? null;
}

export function updateWeatherDetailsCache(location: string, data: WeatherDetailsResponse) {
  saveWeatherCache({
    details: {
      data,
      location,
      updatedAt: Date.now(),
    },
  });
}

/**
 * 更新分钟级降水缓存
 */
export function updateMinutelyCache(
  location: string,
  data: MinutelyPrecipResponse,
  lastApiFetchAt?: number
) {
  saveWeatherCache((current) => {
    const existing = current.minutely?.location === location ? current.minutely : undefined;
    return {
      minutely: {
        data,
        location,
        updatedAt: Date.now(),
        lastApiFetchAt: lastApiFetchAt ?? existing?.lastApiFetchAt,
        lastCriticalFetchAt: existing?.lastCriticalFetchAt,
      },
    };
  });
}

/**
 * 更新三日天气预报缓存
 * @param location 位置 (lon,lat)
 * @param data 天气数据
 */
export function updateDaily3dCache(location: string, data: WeatherDaily3dResponse) {
  saveWeatherCache({
    daily3d: {
      data,
      location,
      updatedAt: Date.now(),
    },
  });
}

/**
 * 更新空气质量缓存
 * @param lat 纬度
 * @param lon 经度
 * @param data 空气质量数据
 */
export function updateAirQualityCache(lat: number, lon: number, data: AirQualityCurrentResponse) {
  const signature = `${lat.toFixed(2)},${lon.toFixed(2)}`;
  saveWeatherCache({
    airQuality: {
      data,
      signature,
      updatedAt: Date.now(),
    },
  });
}

/**
 * 更新日出日落缓存
 * @param location 位置 (lon,lat)
 * @param date 日期 (yyyyMMdd)
 * @param data 天文数据
 */
export function updateAstronomySunCache(
  location: string,
  date: string,
  data: AstronomySunResponse
) {
  saveWeatherCache({
    astronomySun: {
      data,
      location,
      date,
      updatedAt: Date.now(),
    },
  });
}

/**
 * 更新分钟级降水API最后请求时间
 */
export function updateMinutelyLastFetch(lastApiFetchAt: number) {
  saveWeatherCache((current) => {
    if (!current.minutely) return {};
    return {
      minutely: {
        ...current.minutely,
        lastApiFetchAt,
      },
    };
  });
}

/**
 * 更新分钟级降水关键窗口最后请求时间
 */
export function updateMinutelyCriticalFetch(lastCriticalFetchAt: number) {
  saveWeatherCache((current) => {
    if (!current.minutely) return {};
    return {
      minutely: {
        ...current.minutely,
        lastCriticalFetchAt,
      },
    };
  });
}

export function updateHourly72hCache(
  location: string,
  data: WeatherHourly72hResponse,
  lastApiFetchAt?: number
) {
  saveWeatherCache((current) => {
    return {
      hourly72h: {
        data,
        location,
        updatedAt: Date.now(),
        lastApiFetchAt: lastApiFetchAt ?? current.hourly72h?.lastApiFetchAt,
      },
    };
  });
}

export function updateHourly72hLastFetch(lastApiFetchAt: number) {
  saveWeatherCache((current) => {
    if (!current.hourly72h) return {};
    return {
      hourly72h: {
        ...current.hourly72h,
        lastApiFetchAt,
      },
    };
  });
}

/**
 * 更新预警 Tag
 */
export function updateAlertTag(tag: string) {
  saveWeatherCache({
    alertMetadata: {
      lastTag: tag,
    },
  });
}

/**
 * 读取并清理过期的坐标缓存
 */
export function getValidCoords() {
  const cache = getWeatherCache();
  if (cache.coords && Date.now() - cache.coords.updatedAt < COORDS_TTL) {
    return cache.coords;
  }
  return null;
}

/**
 * 读取有效的分钟级降水缓存
 */
export function getValidMinutely(location: string) {
  const cache = getWeatherCache();
  if (
    cache.minutely &&
    cache.minutely.location === location &&
    Date.now() - cache.minutely.updatedAt < MINUTELY_TTL
  ) {
    return cache.minutely.data;
  }
  return null;
}

/**
 * 获取有效的三日天气预报缓存
 * @param location 位置 (lon,lat)
 */
export function getValidDaily3d(location: string) {
  const cache = getWeatherCache();
  if (
    cache.daily3d &&
    cache.daily3d.location === location &&
    Date.now() - cache.daily3d.updatedAt < DAILY_TTL
  ) {
    return cache.daily3d.data;
  }
  return null;
}

export function getValidWeatherDetails(location: string) {
  const cache = getWeatherCache();
  if (
    cache.details &&
    cache.details.location === location &&
    Date.now() - cache.details.updatedAt < DETAILS_TTL
  ) {
    return cache.details.data;
  }
  return null;
}

export function getValidHourly72h(location: string) {
  const cache = getWeatherCache();
  if (
    cache.hourly72h &&
    cache.hourly72h.location === location &&
    Date.now() - cache.hourly72h.updatedAt < HOURLY72H_TTL
  ) {
    return cache.hourly72h.data;
  }
  return null;
}

/**
 * 获取有效的空气质量缓存
 * @param lat 纬度
 * @param lon 经度
 */
export function getValidAirQuality(lat: number, lon: number) {
  const cache = getWeatherCache();
  const signature = `${lat.toFixed(2)},${lon.toFixed(2)}`;
  if (
    cache.airQuality &&
    cache.airQuality.signature === signature &&
    Date.now() - cache.airQuality.updatedAt < AIR_QUALITY_TTL
  ) {
    return cache.airQuality.data;
  }
  return null;
}

/**
 * 获取有效的日出日落缓存
 * @param location 位置 (lon,lat)
 * @param date 日期 (yyyyMMdd)
 */
export function getValidAstronomySun(location: string, date: string) {
  const cache = getWeatherCache();
  if (
    cache.astronomySun &&
    cache.astronomySun.location === location &&
    cache.astronomySun.date === date &&
    Date.now() - cache.astronomySun.updatedAt < ASTRONOMY_TTL
  ) {
    return cache.astronomySun.data;
  }
  return null;
}

/**
 * 读取站点预警记录
 */
export function readStationAlertRecord(stationKey: string) {
  const cache = getWeatherCache();
  const record = cache.alerts?.[stationKey];
  if (record && Date.now() - record.ts < ALERT_TTL) {
    return record;
  }
  return null;
}

/**
 * 写入站点预警记录
 */
export function writeStationAlertRecord(stationKey: string, sig: string) {
  saveWeatherCache((current) => {
    const alerts = current.alerts || {};
    // 简单的内存清理：移除过期记录
    const now = Date.now();
    const cleanAlerts: Record<string, { sig: string; ts: number }> = {};

    // 保留未过期的
    Object.entries(alerts).forEach(([k, v]) => {
      if (now - v.ts < ALERT_TTL) {
        cleanAlerts[k] = v;
      }
    });

    // 添加新记录
    cleanAlerts[stationKey] = { sig, ts: now };

    return { alerts: cleanAlerts };
  });
}

/**
 * 全局清理：移除所有过期数据
 */
export function cleanupWeatherCache() {
  const now = Date.now();
  saveWeatherCache((current) => {
    const updates: Partial<WeatherCache> = {};
    let changed = false;

    if ("location" in current) {
      (updates as Partial<WeatherCache> & { location?: undefined }).location = undefined;
      changed = true;
    }

    // 清理坐标
    if (current.coords && now - current.coords.updatedAt > COORDS_TTL) {
      updates.coords = undefined;
      changed = true;
    }

    const freshXiaomiLocations = getFreshXiaomiLocations(current, now);
    if (
      Object.keys(freshXiaomiLocations).length !==
        Object.keys(current.xiaomiLocations ?? {}).length ||
      "xiaomiLocation" in current
    ) {
      (updates as Partial<WeatherCache> & { xiaomiLocation?: undefined }).xiaomiLocation =
        undefined;
      updates.xiaomiLocations =
        Object.keys(freshXiaomiLocations).length > 0 ? freshXiaomiLocations : undefined;
      changed = true;
    }

    // 清理分钟级降水
    if (current.minutely && now - current.minutely.updatedAt > MINUTELY_TTL) {
      updates.minutely = undefined;
      changed = true;
    }

    if (current.daily3d && now - current.daily3d.updatedAt > DAILY_TTL) {
      updates.daily3d = undefined;
      changed = true;
    }

    if (current.details && now - current.details.updatedAt > DETAILS_TTL) {
      updates.details = undefined;
      changed = true;
    }

    if (current.hourly72h && now - current.hourly72h.updatedAt > HOURLY72H_TTL) {
      updates.hourly72h = undefined;
      changed = true;
    }

    if (current.airQuality && now - current.airQuality.updatedAt > AIR_QUALITY_TTL) {
      updates.airQuality = undefined;
      changed = true;
    }

    if (current.astronomySun && now - current.astronomySun.updatedAt > ASTRONOMY_TTL) {
      updates.astronomySun = undefined;
      changed = true;
    }

    // 清理预警 (在 writeStationAlertRecord 中已有部分清理，这里做彻底检查)
    if (current.alerts) {
      const cleanAlerts: Record<string, { sig: string; ts: number }> = {};
      let alertCount = 0;
      let alertChanged = false;

      Object.entries(current.alerts).forEach(([k, v]) => {
        if (now - v.ts < ALERT_TTL) {
          cleanAlerts[k] = v;
          alertCount++;
        } else {
          alertChanged = true;
        }
      });

      if (alertChanged) {
        updates.alerts = alertCount > 0 ? cleanAlerts : undefined;
        changed = true;
      }
    }

    return changed ? updates : {};
  });
}

/**
 * 清除所有天气缓存（用于手动刷新定位）
 */
export function clearWeatherCache() {
  localStorage.removeItem(STORAGE_KEY);
}
