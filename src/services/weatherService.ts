import type {
  AirQualityCurrentResponse,
  AstronomySunResponse,
  Coords,
  GeolocationDiagnostics,
  GeolocationPermissionState,
  GeolocationResult,
  MinutelyPrecipResponse,
  WeatherCurrentDetail,
  WeatherDetailsResponse,
  WeatherAlertResponse,
  WeatherDaily3dResponse,
  WeatherNow,
  WeatherLocation,
  WeatherScalarDetail,
  XiaomiEmbeddedMinutely,
  XiaomiMinutelyPrecipitation,
  XiaomiMinutelyResponse,
  XiaomiValueUnit,
  XiaomiWeatherAllResponse,
} from "../types/weather";

import { withXiaomiWeatherParams, xiaomiWeatherGetJson } from "./xiaomiWeatherClient";

export type {
  AirQualityCurrentResponse,
  AstronomySunResponse,
  Coords,
  GeolocationDiagnostics,
  GeolocationPermissionState,
  GeolocationResult,
  MinutelyPrecipResponse,
  WeatherDetailsResponse,
  WeatherAlertResponse,
  WeatherDaily3dResponse,
  WeatherNow,
};

export interface WeatherFlowOptions {
  fetchDaily3d?: boolean;
  fetchAstronomySun?: boolean;
  fetchAirQuality?: boolean;
  location: WeatherLocation;
}

export interface XiaomiResolvedLocation {
  lat: number;
  lon: number;
  locationKey: string;
  name?: string;
}

function isWeatherRequestDeferredError(error: unknown): boolean {
  return (
    error instanceof Error &&
    error.name === "WeatherRequestDeferredError" &&
    typeof (error as Error & { retryAt?: unknown }).retryAt === "number"
  );
}

const WEATHER_TEXT_MAP: Record<string, string> = {
  "0": "晴",
  "1": "多云",
  "2": "阴",
  "3": "阵雨",
  "4": "雷阵雨",
  "5": "雷阵雨伴有冰雹",
  "6": "雨夹雪",
  "7": "小雨",
  "8": "中雨",
  "9": "大雨",
  "10": "暴雨",
  "13": "阵雪",
  "14": "小雪",
  "15": "中雪",
  "16": "大雪",
  "18": "雾",
  "19": "冻雨",
  "20": "沙尘暴",
  "29": "浮尘",
  "30": "扬沙",
  "31": "强沙尘暴",
  "53": "霾",
};

function valueToString(value: unknown): string | undefined {
  if (value == null) return undefined;
  if (typeof value === "string") return value;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return undefined;
}

function parseLocationParam(location: string): Coords | null {
  const [lonRaw, latRaw] = location.split(",");
  const lon = Number.parseFloat(lonRaw);
  const lat = Number.parseFloat(latRaw);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  return { lat, lon };
}

function normalizeTimestamp(value: unknown): string | undefined {
  if (value == null) return undefined;
  if (typeof value === "string") return value;
  if (typeof value === "number" && Number.isFinite(value)) return new Date(value).toISOString();
  return undefined;
}

function formatDateFromOffset(offset: number): string {
  const date = new Date();
  date.setDate(date.getDate() + offset);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function normalizeDateKey(date: string): string | null {
  const trimmed = date.trim();
  const match = /^(\d{4})-?(\d{2})-?(\d{2})$/.exec(trimmed);
  if (!match) return null;
  const [, year, month, day] = match;
  const parsed = new Date(Number(year), Number(month) - 1, Number(day));
  if (
    parsed.getFullYear() !== Number(year) ||
    parsed.getMonth() !== Number(month) - 1 ||
    parsed.getDate() !== Number(day)
  ) {
    return null;
  }
  return `${year}${month}${day}`;
}

function dateKeyFromOffset(offset: number): string {
  return formatDateFromOffset(offset).replace(/-/g, "");
}

function weatherText(code: unknown): string | undefined {
  const key = valueToString(code);
  if (!key) return undefined;
  return WEATHER_TEXT_MAP[key] || key;
}

function weatherIcon(code: unknown): string | undefined {
  const key = valueToString(code);
  if (!key) return undefined;
  return key.padStart(3, "0");
}

function normalizeUnitValue(
  input: XiaomiValueUnit | string | number | undefined,
  fallbackUnit?: string
): WeatherScalarDetail | undefined {
  const rawValue =
    typeof input === "object" && input != null
      ? input.value
      : (input as string | number | undefined);
  const value = valueToString(rawValue);
  const unit =
    typeof input === "object" && input != null
      ? valueToString(input.unit) || fallbackUnit
      : fallbackUnit;
  if (value == null && unit == null) return undefined;
  return { value, unit };
}

function normalizeDirection(value: unknown): number | null {
  const raw =
    typeof value === "object" && value != null && "value" in value
      ? (value as { value?: unknown }).value
      : value;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return null;
  return ((parsed % 360) + 360) % 360;
}

function windDirectionText(value: unknown): string | undefined {
  const direction = normalizeDirection(value);
  if (direction == null) return undefined;
  const labels = ["北", "东北", "东", "东南", "南", "西南", "西", "西北"];
  return `${labels[Math.round(direction / 45) % labels.length]}风`;
}

function aqiCategory(value: unknown): string | undefined {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return undefined;
  if (parsed <= 50) return "优";
  if (parsed <= 100) return "良";
  if (parsed <= 150) return "轻度污染";
  if (parsed <= 200) return "中度污染";
  if (parsed <= 300) return "重度污染";
  return "严重污染";
}

function normalizeDate(value: unknown, fallbackOffset?: number): string | undefined {
  if (typeof value === "string") {
    const match = /^(\d{4}-\d{2}-\d{2})/.exec(value);
    if (match) return match[1];
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return formatDateFromValue(new Date(value));
  }
  return fallbackOffset == null ? undefined : formatDateFromOffset(fallbackOffset);
}

function formatDateFromValue(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function normalizeCurrentDetail(
  current: XiaomiWeatherAllResponse["current"] | undefined
): WeatherCurrentDetail | undefined {
  if (!current) return undefined;
  const direction = normalizeUnitValue(current.wind?.direction, "°");
  return {
    feelsLike: normalizeUnitValue(current.feelsLike, "℃"),
    humidity: normalizeUnitValue(current.humidity, "%"),
    observationTime: normalizeTimestamp(current.pubTime),
    pressure: normalizeUnitValue(current.pressure, "hPa"),
    temperature: normalizeUnitValue(current.temperature, "℃"),
    uvIndex: valueToString(current.uvIndex),
    visibility: normalizeUnitValue(current.visibility, "km"),
    weatherCode: valueToString(current.weather),
    weatherText: weatherText(current.weather),
    windDirection: direction,
    windDirectionText: windDirectionText(direction),
    windSpeed: normalizeUnitValue(current.wind?.speed, "km/h"),
  };
}

function normalizeAlertImages(images: unknown): string[] {
  if (Array.isArray(images)) {
    return images.filter((image): image is string => typeof image === "string" && image.length > 0);
  }
  if (typeof images !== "object" || images == null) return [];
  return Object.values(images).filter(
    (image): image is string => typeof image === "string" && image.length > 0
  );
}

function uniqueBrands(data: XiaomiWeatherAllResponse) {
  const brands = [
    ...(data.brandInfo?.brands || []),
    ...(data.aqi?.brandInfo?.brands || []),
    ...(data.forecastDaily?.aqi?.brandInfo?.brands || []),
    ...(data.forecastHourly?.aqi?.brandInfo?.brands || []),
  ];
  const seen = new Set<string>();
  return brands.filter((brand) => {
    const key = brand.brandId || brand.names?.zh_CN || brand.url || JSON.stringify(brand);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function adaptWeatherDetails(data: XiaomiWeatherAllResponse): WeatherDetailsResponse {
  const daily = data.forecastDaily;
  const dailyCount = Math.max(
    daily?.temperature?.value?.length || 0,
    daily?.weather?.value?.length || 0,
    daily?.sunRiseSet?.value?.length || 0,
    daily?.precipitationProbability?.value?.length || 0,
    daily?.aqi?.value?.length || 0,
    daily?.wind?.direction?.value?.length || 0,
    daily?.wind?.speed?.value?.length || 0
  );
  const normalizedDaily = Array.from({ length: dailyCount }, (_, index) => {
    const temperature = daily?.temperature?.value?.[index];
    const weather = daily?.weather?.value?.[index];
    const sun = daily?.sunRiseSet?.value?.[index];
    const windDirection = daily?.wind?.direction?.value?.[index];
    const windSpeed = daily?.wind?.speed?.value?.[index];
    const directionDay = normalizeUnitValue(
      windDirection?.from,
      daily?.wind?.direction?.unit || "°"
    );
    const directionNight = normalizeUnitValue(
      windDirection?.to,
      daily?.wind?.direction?.unit || "°"
    );
    return {
      aqi: valueToString(daily?.aqi?.value?.[index]),
      date: normalizeDate(sun?.from, index),
      precipitationProbability: valueToString(daily?.precipitationProbability?.value?.[index]),
      sunrise: normalizeTimestamp(sun?.from),
      sunset: normalizeTimestamp(sun?.to),
      temperatureMax: normalizeUnitValue(temperature?.from, daily?.temperature?.unit || "℃"),
      temperatureMin: normalizeUnitValue(temperature?.to, daily?.temperature?.unit || "℃"),
      weatherCodeDay: valueToString(weather?.from),
      weatherCodeNight: valueToString(weather?.to),
      weatherTextDay: weatherText(weather?.from),
      weatherTextNight: weatherText(weather?.to),
      windDirectionDay: directionDay,
      windDirectionDayText: windDirectionText(directionDay),
      windDirectionNight: directionNight,
      windDirectionNightText: windDirectionText(directionNight),
      windSpeedDay: normalizeUnitValue(windSpeed?.from, daily?.wind?.speed?.unit || "km/h"),
      windSpeedNight: normalizeUnitValue(windSpeed?.to, daily?.wind?.speed?.unit || "km/h"),
    };
  });

  const hourly = data.forecastHourly;
  const hourlyCount = Math.max(
    hourly?.temperature?.value?.length || 0,
    hourly?.weather?.value?.length || 0,
    hourly?.aqi?.value?.length || 0,
    hourly?.wind?.value?.length || 0
  );
  const hourlyBaseTime = normalizeTimestamp(
    hourly?.temperature?.pubTime || hourly?.weather?.pubTime || data.updateTime
  );
  const hourlyBaseMs = hourlyBaseTime ? Date.parse(hourlyBaseTime) : NaN;
  const normalizedHourly = Array.from({ length: hourlyCount }, (_, index) => {
    const wind = hourly?.wind?.value?.[index];
    const direction = normalizeUnitValue(wind?.direction, "°");
    const explicitTime = normalizeTimestamp(wind?.datetime);
    const forecastTime =
      explicitTime ||
      (Number.isFinite(hourlyBaseMs)
        ? new Date(hourlyBaseMs + index * 60 * 60 * 1000).toISOString()
        : undefined);
    return {
      aqi: valueToString(hourly?.aqi?.value?.[index]),
      forecastTime,
      temperature: normalizeUnitValue(
        hourly?.temperature?.value?.[index],
        hourly?.temperature?.unit || "℃"
      ),
      weatherCode: valueToString(hourly?.weather?.value?.[index]),
      weatherText: weatherText(hourly?.weather?.value?.[index]),
      windDirection: direction,
      windDirectionText: windDirectionText(direction),
      windSpeed: normalizeUnitValue(wind?.speed, "km/h"),
    };
  });

  const airQuality = data.aqi
    ? {
        aqi: valueToString(data.aqi.aqi),
        category: aqiCategory(data.aqi.aqi),
        pollutants: [
          {
            code: "pm25" as const,
            description: data.aqi.pm25Desc,
            unit: "μg/m3",
            value: valueToString(data.aqi.pm25),
          },
          {
            code: "pm10" as const,
            description: data.aqi.pm10Desc,
            unit: "μg/m3",
            value: valueToString(data.aqi.pm10),
          },
          {
            code: "so2" as const,
            description: data.aqi.so2Desc,
            unit: "μg/m3",
            value: valueToString(data.aqi.so2),
          },
          {
            code: "no2" as const,
            description: data.aqi.no2Desc,
            unit: "μg/m3",
            value: valueToString(data.aqi.no2),
          },
          {
            code: "o3" as const,
            description: data.aqi.o3Desc,
            unit: "μg/m3",
            value: valueToString(data.aqi.o3),
          },
          {
            code: "co" as const,
            description: data.aqi.coDesc,
            unit: "mg/m3",
            value: valueToString(data.aqi.co),
          },
        ],
        primary: valueToString(data.aqi.primary),
        publishedAt: normalizeTimestamp(data.aqi.pubTime),
        source: data.aqi.src,
        suggestion: data.aqi.suggest,
      }
    : undefined;

  const yesterday = data.yesterday;
  const yesterdayDirectionStart = normalizeUnitValue(yesterday?.windDircStart, "°");
  const yesterdayDirectionEnd = normalizeUnitValue(yesterday?.windDircEnd, "°");
  const previousHours = (data.preHour || [])
    .map(normalizeCurrentDetail)
    .filter((item): item is WeatherCurrentDetail => item != null);

  return {
    airQuality,
    alerts: (data.alerts || []).map((alert) => ({
      defenses: (alert.defense || []).map((defense) => ({
        icon: defense.defenseIcon,
        text: defense.defenseText,
      })),
      detail: alert.detail,
      id: alert.alertId,
      images: normalizeAlertImages(alert.images),
      level: alert.level,
      locationKey: alert.locationKey,
      publishedAt: normalizeTimestamp(alert.pubTime),
      title: alert.title,
      type: alert.type,
    })),
    brands: uniqueBrands(data),
    code: data.status == null || data.status === 0 ? "200" : String(data.status),
    current: normalizeCurrentDetail(data.current),
    daily: normalizedDaily,
    embeddedMinutely: data.minutely,
    error: data.error,
    hourly: normalizedHourly,
    indices: (data.indices?.indices || []).map((index) => ({
      type: index.type,
      value: valueToString(index.value),
    })),
    previousHours,
    raw: data,
    technical: {
      channels: data.chs || [],
      sourceMaps: data.sourceMaps,
      statuses: {
        response: data.status,
        daily: daily?.status,
        dailyAqi: daily?.aqi?.status,
        dailyPrecipitation: daily?.precipitationProbability?.status,
        dailySun: daily?.sunRiseSet?.status,
        dailyTemperature: daily?.temperature?.status,
        dailyWeather: daily?.weather?.status,
        dailyWindDirection: daily?.wind?.direction?.status,
        dailyWindSpeed: daily?.wind?.speed?.status,
        hourly: hourly?.status,
        hourlyAqi: hourly?.aqi?.status,
        hourlyTemperature: hourly?.temperature?.status,
        hourlyWeather: hourly?.weather?.status,
        hourlyWind: hourly?.wind?.status,
        indices: data.indices?.status,
        minutely: data.minutely?.status,
        airQuality: data.aqi?.status,
        yesterday: data.yesterday?.status,
      },
      units: {
        currentFeelsLike: data.current?.feelsLike?.unit,
        currentHumidity: data.current?.humidity?.unit,
        currentPressure: data.current?.pressure?.unit,
        currentTemperature: data.current?.temperature?.unit,
        currentVisibility: data.current?.visibility?.unit,
        currentWindDirection: data.current?.wind?.direction?.unit,
        currentWindSpeed: data.current?.wind?.speed?.unit,
        dailyTemperature: daily?.temperature?.unit,
        dailyWindDirection: daily?.wind?.direction?.unit,
        dailyWindSpeed: daily?.wind?.speed?.unit,
        hourlyTemperature: hourly?.temperature?.unit,
      },
      urls: {
        caiyun: data.url?.caiyun,
        weathercn: data.url?.weathercn,
      },
    },
    typhoons: data.typhoon || [],
    updateTime: normalizeTimestamp(data.updateTime),
    yesterday: yesterday
      ? {
          aqi: valueToString(yesterday.aqi),
          date: normalizeDate(yesterday.date),
          sunrise: normalizeTimestamp(yesterday.sunRise),
          sunset: normalizeTimestamp(yesterday.sunSet),
          temperatureMax: normalizeUnitValue(yesterday.tempMax, "℃"),
          temperatureMin: normalizeUnitValue(yesterday.tempMin, "℃"),
          weatherCodeEnd: valueToString(yesterday.weatherEnd),
          weatherCodeStart: valueToString(yesterday.weatherStart),
          weatherTextEnd: weatherText(yesterday.weatherEnd),
          weatherTextStart: weatherText(yesterday.weatherStart),
          windDirectionEnd: yesterdayDirectionEnd,
          windDirectionEndText: windDirectionText(yesterdayDirectionEnd),
          windDirectionStart: yesterdayDirectionStart,
          windDirectionStartText: windDirectionText(yesterdayDirectionStart),
          windSpeedEnd: normalizeUnitValue(yesterday.windSpeedEnd, "km/h"),
          windSpeedStart: normalizeUnitValue(yesterday.windSpeedStart, "km/h"),
        }
      : undefined,
  };
}

async function fetchXiaomiWeatherAllByResolved(
  resolved: XiaomiResolvedLocation
): Promise<XiaomiWeatherAllResponse> {
  const query = withXiaomiWeatherParams({
    latitude: resolved.lat,
    longitude: resolved.lon,
    locationKey: resolved.locationKey,
    days: 15,
  });
  return (await xiaomiWeatherGetJson(`/weather/all?${query}`)) as XiaomiWeatherAllResponse;
}

function adaptWeatherNow(data: XiaomiWeatherAllResponse): WeatherNow {
  if (data.error) return { error: data.error };
  const current = data.current;
  const direction = valueToString(current?.wind?.direction?.value);
  return {
    code: data.status == null || data.status === 0 ? "200" : String(data.status),
    now: {
      obsTime: normalizeTimestamp(current?.pubTime || data.updateTime),
      text: weatherText(current?.weather),
      temp: valueToString(current?.temperature?.value),
      feelsLike: valueToString(current?.feelsLike?.value),
      wind360: direction,
      windDir: windDirectionText(direction),
      windSpeed: valueToString(current?.wind?.speed?.value),
      humidity: valueToString(current?.humidity?.value),
      pressure: valueToString(current?.pressure?.value),
      uvIndex: valueToString(current?.uvIndex),
      vis: valueToString(current?.visibility?.value),
      icon: weatherIcon(current?.weather),
    },
    refer: { sources: ["Xiaomi Weather"] },
  };
}

function adaptDaily3d(data: XiaomiWeatherAllResponse): WeatherDaily3dResponse {
  if (data.error) return { error: data.error };
  const details = adaptWeatherDetails(data);
  return {
    code: data.status == null || data.status === 0 ? "200" : String(data.status),
    updateTime: normalizeTimestamp(data.updateTime),
    daily: details.daily.slice(0, 3).map((day) => ({
      fxDate: day.date,
      sunrise: day.sunrise,
      sunset: day.sunset,
      tempMax: day.temperatureMax?.value,
      tempMin: day.temperatureMin?.value,
      iconDay: weatherIcon(day.weatherCodeDay),
      textDay: day.weatherTextDay,
      iconNight: weatherIcon(day.weatherCodeNight),
      textNight: day.weatherTextNight,
      precip: day.precipitationProbability,
    })),
    refer: { sources: ["Xiaomi Weather"] },
  };
}

function adaptAstronomySun(data: XiaomiWeatherAllResponse, date?: string): AstronomySunResponse {
  if (data.error) return { error: data.error };
  const sunRiseSet = data.forecastDaily?.sunRiseSet?.value || [];
  const targetDateKey = date ? normalizeDateKey(date) : dateKeyFromOffset(0);
  if (!targetDateKey) return { error: "Invalid date" };
  const index = sunRiseSet.findIndex((_, offset) => dateKeyFromOffset(offset) === targetDateKey);
  if (index < 0) return { error: "Astronomy sun data unavailable for date" };
  const target = sunRiseSet[index];
  return {
    code: data.status == null || data.status === 0 ? "200" : String(data.status),
    sunrise: valueToString(target?.from),
    sunset: valueToString(target?.to),
    refer: { sources: ["Xiaomi Weather"] },
  };
}

function adaptAirQuality(data: XiaomiWeatherAllResponse): AirQualityCurrentResponse {
  if (data.error) return { error: data.error };
  const aqi = data.aqi;
  const indexValue = Number(aqi?.aqi);
  const adaptedPollutants: NonNullable<AirQualityCurrentResponse["pollutants"]> = [];
  const pollutants = [
    ["pm25", aqi?.pm25],
    ["pm10", aqi?.pm10],
    ["so2", aqi?.so2],
    ["no2", aqi?.no2],
    ["o3", aqi?.o3],
    ["co", aqi?.co],
  ] as const;
  pollutants.forEach(([code, value]) => {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      adaptedPollutants.push({
        code,
        concentration: { value: parsed, unit: code === "co" ? "mg/m3" : "μg/m3" },
      });
    }
  });
  return {
    metadata: { tag: normalizeTimestamp(aqi?.pubTime), sources: [aqi?.src || "Xiaomi Weather"] },
    indexes: [
      {
        code: "cn-mee-1h-aqi",
        name: "AQI",
        aqi: Number.isFinite(indexValue) ? indexValue : undefined,
        category: aqiCategory(indexValue),
        primaryPollutant: aqi?.primary ? { code: aqi.primary } : undefined,
      },
    ],
    pollutants: adaptedPollutants,
  };
}

export function adaptWeatherAlerts(data: XiaomiWeatherAllResponse): WeatherAlertResponse {
  if (data.error) return { error: data.error };
  const alerts = data.alerts || [];
  return {
    metadata: { tag: normalizeTimestamp(data.updateTime), zeroResult: alerts.length === 0 },
    alerts: alerts.map((alert) => ({
      id: alert.alertId,
      issuedTime: normalizeTimestamp(alert.pubTime),
      eventType: { name: alert.type, code: alert.type },
      severity: alert.level,
      headline: alert.title,
      description: alert.detail,
      defenses: (alert.defense || []).map((defense) => ({
        icon: defense.defenseIcon,
        text: defense.defenseText,
      })),
      images: normalizeAlertImages(alert.images),
    })),
  };
}

function parseMinutelyTimestamp(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function inferMinutelyIntervalMs(times: Array<number | null>, fallbackMs = 60 * 1000): number {
  const samples: number[] = [];
  for (let i = 0; i < times.length; i += 1) {
    const current = times[i];
    if (current == null) continue;
    for (let j = i + 1; j < times.length; j += 1) {
      const next = times[j];
      if (next == null) continue;
      const delta = next - current;
      if (delta > 0) samples.push(delta / (j - i));
      break;
    }
  }
  if (samples.length === 0) return fallbackMs;
  samples.sort((a, b) => a - b);
  const middle = Math.floor(samples.length / 2);
  const median =
    samples.length % 2 === 0 ? (samples[middle - 1] + samples[middle]) / 2 : samples[middle];
  return Math.max(30 * 1000, Math.min(60 * 60 * 1000, Math.round(median)));
}

function normalizeMinutelyIntervalMs(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return 60 * 1000;
  // 供应商有时以毫秒、秒或分钟表达 interval；按数量级兼容三种形态。
  if (value >= 100_000) return Math.round(value);
  if (value >= 1_000) return Math.round(value * 1000);
  return Math.round(value * 60 * 1000);
}

/**
 * 将小米分钟降水响应转换为应用统一格式。若响应带有 fxTime，则完整保留真实
 * 时间轴；只有 pubTime 时才按服务端提供的 interval（默认 1 分钟）推导，绝不
 * 使用客户端当前时间伪造“刚刚更新”的时间戳。
 */
export function adaptMinutely(
  data: XiaomiMinutelyResponse | XiaomiWeatherAllResponse
): MinutelyPrecipResponse {
  if (data.error) return { error: data.error };
  let precipitation: XiaomiMinutelyPrecipitation | undefined;
  let raw: XiaomiMinutelyResponse;
  let embeddedProbability: XiaomiEmbeddedMinutely["probability"];
  if ("minutely" in data) {
    const weatherAll = data as XiaomiWeatherAllResponse;
    precipitation = weatherAll.minutely?.precipitation;
    embeddedProbability = weatherAll.minutely?.probability;
    raw = {
      new: weatherAll.minutely?.new,
      precipitation,
      status: weatherAll.minutely?.status,
    };
  } else {
    const standalone = data as XiaomiMinutelyResponse;
    precipitation = standalone.precipitation;
    raw = standalone;
  }
  const updateTime = normalizeTimestamp(precipitation?.pubTime);
  const rawValues = precipitation?.value || [];
  const explicitTimes = rawValues.map((value, index) => {
    const itemTime =
      typeof value === "object" && value != null
        ? parseMinutelyTimestamp((value as { fxTime?: unknown }).fxTime)
        : null;
    const arrayTime = Array.isArray(precipitation?.fxTime)
      ? parseMinutelyTimestamp(precipitation.fxTime[index])
      : null;
    return arrayTime ?? itemTime;
  });
  const baseMs = parseMinutelyTimestamp(updateTime);
  const intervalMs = inferMinutelyIntervalMs(
    explicitTimes,
    normalizeMinutelyIntervalMs(precipitation?.interval)
  );
  return {
    code: data.status == null || data.status === 0 ? "200" : String(data.status),
    updateTime,
    summary: precipitation?.description,
    minutely: rawValues.map((value, index) => {
      const primitive =
        typeof value === "object" && value != null
          ? ((value as { value?: string | number; precip?: string | number }).value ??
            (value as { precip?: string | number }).precip)
          : value;
      const explicit = explicitTimes[index];
      const inferred = explicit ?? (baseMs != null ? baseMs + index * intervalMs : null);
      return {
        ...(inferred != null ? { fxTime: new Date(inferred).toISOString() } : {}),
        precip: valueToString(primitive) || "0",
        type: "rain",
      };
    }),
    provider: {
      description: precipitation?.description,
      flags: {
        firstRainOrSnow: precipitation?.firstRainOrSnow,
        isFirstRainOrSnow: precipitation?.isFirstRainOrSnow,
        isModify: precipitation?.isModify,
        isModifyInHour: precipitation?.isModifyInHour,
        isRadarHideToast: precipitation?.isRadarHideToast,
        isRainOrSnow: precipitation?.isRainOrSnow,
        isShow: precipitation?.isShow,
        isSnowTemp: precipitation?.isSnowTemp,
        kmNum: precipitation?.kmNum,
        modifyInHour: precipitation?.modifyInHour,
        responseStatus: raw.status,
        precipitationStatus: precipitation?.status,
        version: raw.new,
      },
      headDescription: precipitation?.headDescription,
      headIconType: precipitation?.headIconType,
      interval: precipitation?.interval,
      maxProbability: embeddedProbability?.maxProbability,
      probability: precipitation?.probability,
      probabilityDescription: embeddedProbability?.probabilityDesc,
      probabilityDescriptionV2: embeddedProbability?.probabilityDescV2,
      rainRemainingMinutes: precipitation?.rainRemainingMinutes,
      raw,
      shortDescription: precipitation?.shortDescription,
      subtitle: precipitation?.subtitle,
      weatherCode: valueToString(precipitation?.weather),
    },
  };
}

/** @internal Network access is scheduled exclusively by WeatherRuntime. */
export async function fetchMinutelyPrecip(
  location: string,
  providerLocation: XiaomiResolvedLocation
): Promise<MinutelyPrecipResponse> {
  try {
    const coords = parseLocationParam(location);
    if (!coords) return { error: "Invalid location" };
    const query = withXiaomiWeatherParams({
      latitude: providerLocation.lat,
      longitude: providerLocation.lon,
      locationKey: providerLocation.locationKey,
    });
    const data = (await xiaomiWeatherGetJson(
      `/weather/xm/forecast/minutely?${query}`
    )) as XiaomiMinutelyResponse;
    return adaptMinutely(data);
  } catch (e: unknown) {
    if (isWeatherRequestDeferredError(e)) throw e;
    return { error: String(e) } as MinutelyPrecipResponse;
  }
}

export interface WeatherFlowResult {
  coords: Coords | null;
  coordsSource?: string | null;
  city?: string | null;
  location?: WeatherLocation | null;
  weather?: WeatherNow | null;
  alerts?: WeatherAlertResponse | null;
  details?: WeatherDetailsResponse | null;
  daily3d?: WeatherDaily3dResponse | null;
  airQuality?: AirQualityCurrentResponse | null;
  astronomySun?: AstronomySunResponse | null;
  embeddedMinutely?: MinutelyPrecipResponse | null;
  providerLocation?: XiaomiResolvedLocation | null;
}

/** @internal Network access is scheduled exclusively by WeatherRuntime. */
export async function buildWeatherFlow(options: WeatherFlowOptions): Promise<WeatherFlowResult> {
  const location = options.location;
  const resolved = {
    lat: location.coords.lat,
    locationKey: location.city.locationKey,
    lon: location.coords.lon,
    name: location.city.name,
  };
  const weatherAll = await fetchXiaomiWeatherAllByResolved(resolved);

  const weather = adaptWeatherNow(weatherAll);
  const alerts = adaptWeatherAlerts(weatherAll);
  const details = adaptWeatherDetails(weatherAll);
  const daily3d = options?.fetchDaily3d !== false ? adaptDaily3d(weatherAll) : null;
  const astronomySun = options?.fetchAstronomySun !== false ? adaptAstronomySun(weatherAll) : null;
  const airQuality = options?.fetchAirQuality !== false ? adaptAirQuality(weatherAll) : null;
  const embeddedMinutely = adaptMinutely(weatherAll);

  return {
    coords: location.coords,
    coordsSource: location.source,
    city: location.city.name,
    location,
    weather,
    alerts,
    details,
    daily3d,
    astronomySun,
    airQuality,
    embeddedMinutely,
    providerLocation: resolved,
  };
}
