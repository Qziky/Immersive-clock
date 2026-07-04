import type {
  AddressInfo,
  AirQualityCurrentResponse,
  AstronomySunResponse,
  CityLookupResponse,
  Coords,
  GeolocationDiagnostics,
  GeolocationPermissionState,
  GeolocationResult,
  MinutelyPrecipResponse,
  WeatherHourly72hResponse,
  WeatherAlertResponse,
  WeatherDaily3dResponse,
  WeatherNow,
  XiaomiMinutelyResponse,
  XiaomiWeatherAllResponse,
} from "../types/weather";

import {
  buildLocationFlow,
  fetchCityLookup,
  fetchXiaomiCityByCoords,
  type LocationFlowOptions,
} from "./locationService";
import { withXiaomiWeatherParams, xiaomiWeatherGetJson } from "./xiaomiWeatherClient";

export type {
  AddressInfo,
  AirQualityCurrentResponse,
  AstronomySunResponse,
  CityLookupResponse,
  Coords,
  GeolocationDiagnostics,
  GeolocationPermissionState,
  GeolocationResult,
  MinutelyPrecipResponse,
  LocationFlowOptions,
  WeatherHourly72hResponse,
  WeatherAlertResponse,
  WeatherDaily3dResponse,
  WeatherNow,
};

export {
  buildLocationFlow,
  fetchCityLookup,
  getCoordsViaAmapIP,
  getCoordsViaGeolocation,
  getCoordsViaIP,
  getGeolocationResult,
  reverseGeocodeAmap,
  reverseGeocodeOSM,
} from "./locationService";

export interface WeatherFlowOptions extends LocationFlowOptions {
  fetchDaily3d?: boolean;
  fetchAstronomySun?: boolean;
  fetchAirQuality?: boolean;
}

interface XiaomiResolvedLocation {
  lat: number;
  lon: number;
  locationKey: string;
  name?: string;
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

async function resolveXiaomiLocation(coords: Coords, city?: string | null): Promise<XiaomiResolvedLocation | null> {
  const byCoords = await fetchXiaomiCityByCoords(coords.lat, coords.lon);
  const key = byCoords?.locationKey || byCoords?.key;
  if (key) {
    return { lat: coords.lat, lon: coords.lon, locationKey: key, name: byCoords?.name };
  }

  if (city) {
    const lookup = await fetchCityLookup(city);
    const first = lookup.location?.[0];
    const fallbackKey = first?.locationKey || first?.id;
    if (fallbackKey) {
      return { lat: coords.lat, lon: coords.lon, locationKey: fallbackKey, name: first?.name };
    }
  }

  return null;
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

async function fetchXiaomiWeatherAll(location: string): Promise<XiaomiWeatherAllResponse> {
  const coords = parseLocationParam(location);
  if (!coords) return { error: "Invalid location" };
  const resolved = await resolveXiaomiLocation(coords);
  if (!resolved) return { error: "Missing Xiaomi locationKey" };
  return fetchXiaomiWeatherAllByResolved(resolved);
}

function adaptWeatherNow(data: XiaomiWeatherAllResponse): WeatherNow {
  if (data.error) return { error: data.error };
  const current = data.current;
  return {
    code: data.status == null || data.status === 0 ? "200" : String(data.status),
    now: {
      obsTime: normalizeTimestamp(current?.pubTime || data.updateTime),
      text: weatherText(current?.weather),
      temp: valueToString(current?.temperature?.value),
      feelsLike: valueToString(current?.feelsLike?.value),
      windDir: valueToString(current?.wind?.direction?.value),
      windSpeed: valueToString(current?.wind?.speed?.value),
      humidity: valueToString(current?.humidity?.value),
      pressure: valueToString(current?.pressure?.value),
      vis: valueToString(current?.visibility?.value),
      icon: weatherIcon(current?.weather),
    },
    refer: { sources: ["Xiaomi Weather"] },
  };
}

function adaptDaily3d(data: XiaomiWeatherAllResponse): WeatherDaily3dResponse {
  if (data.error) return { error: data.error };
  const forecast = data.forecastDaily;
  return {
    code: data.status == null || data.status === 0 ? "200" : String(data.status),
    updateTime: normalizeTimestamp(data.updateTime),
    daily: (forecast?.temperature?.value || []).slice(0, 3).map((temperature, index) => {
      const weather = forecast?.weather?.value?.[index];
      const sun = forecast?.sunRiseSet?.value?.[index];
      return {
        fxDate: formatDateFromOffset(index),
        sunrise: valueToString(sun?.from),
        sunset: valueToString(sun?.to),
        tempMax: valueToString(temperature.from),
        tempMin: valueToString(temperature.to),
        iconDay: weatherIcon(weather?.from),
        textDay: weatherText(weather?.from),
        iconNight: weatherIcon(weather?.to),
        textNight: weatherText(weather?.to),
      };
    }),
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
        primaryPollutant: aqi?.primary ? { code: aqi.primary } : undefined,
      },
    ],
    pollutants: adaptedPollutants,
  };
}

function adaptWeatherAlerts(data: XiaomiWeatherAllResponse): WeatherAlertResponse {
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
    })),
  };
}

function adaptMinutely(data: XiaomiMinutelyResponse | XiaomiWeatherAllResponse): MinutelyPrecipResponse {
  if (data.error) return { error: data.error };
  const precipitation = data.precipitation ?? ("minutely" in data ? data.minutely : undefined);
  const updateTime = normalizeTimestamp(precipitation?.pubTime) || new Date().toISOString();
  const baseMs = Date.parse(updateTime);
  return {
    code: data.status == null || data.status === 0 ? "200" : String(data.status),
    updateTime,
    summary: precipitation?.description,
    minutely: (precipitation?.value || []).map((value: string | number, index: number) => ({
      fxTime: new Date((Number.isFinite(baseMs) ? baseMs : Date.now()) + index * 60 * 1000).toISOString(),
      precip: valueToString(value) || "0",
      type: "rain",
    })),
  };
}

function adaptHourly72h(data: XiaomiWeatherAllResponse): WeatherHourly72hResponse {
  if (data.error) return { error: data.error };
  const temperatures = data.forecastHourly?.temperature?.value || [];
  const weather = data.forecastHourly?.weather?.value || [];
  const pubTime = normalizeTimestamp(data.forecastHourly?.temperature?.pubTime || data.updateTime);
  const baseMs = pubTime ? Date.parse(pubTime) : Date.now();
  return {
    code: data.status == null || data.status === 0 ? "200" : String(data.status),
    updateTime: pubTime,
    hourly: temperatures.slice(0, 72).map((temperature, index) => ({
      fxTime: new Date((Number.isFinite(baseMs) ? baseMs : Date.now()) + index * 60 * 60 * 1000).toISOString(),
      temp: valueToString(temperature.value),
      icon: weatherIcon(weather[index]),
      text: weatherText(weather[index]),
    })),
    refer: { sources: ["Xiaomi Weather"] },
  };
}

export async function fetchWeatherNow(location: string): Promise<WeatherNow> {
  try {
    return adaptWeatherNow(await fetchXiaomiWeatherAll(location));
  } catch (e: unknown) {
    return { error: String(e) } as WeatherNow;
  }
}

export async function fetchWeatherDaily3d(location: string): Promise<WeatherDaily3dResponse> {
  try {
    return adaptDaily3d(await fetchXiaomiWeatherAll(location));
  } catch (e: unknown) {
    return { error: String(e) } as WeatherDaily3dResponse;
  }
}

export async function fetchAstronomySun(
  location: string,
  date: string
): Promise<AstronomySunResponse> {
  try {
    return adaptAstronomySun(await fetchXiaomiWeatherAll(location), date);
  } catch (e: unknown) {
    return { error: String(e) } as AstronomySunResponse;
  }
}

export async function fetchAirQualityCurrent(
  lat: number,
  lon: number
): Promise<AirQualityCurrentResponse> {
  try {
    return adaptAirQuality(await fetchXiaomiWeatherAll(`${lon},${lat}`));
  } catch (e: unknown) {
    return { error: String(e) } as AirQualityCurrentResponse;
  }
}

export async function fetchWeatherAlertsByCoords(
  lat: number,
  lon: number
): Promise<WeatherAlertResponse> {
  try {
    return adaptWeatherAlerts(await fetchXiaomiWeatherAll(`${lon},${lat}`));
  } catch (e: unknown) {
    return { error: String(e) } as WeatherAlertResponse;
  }
}

export async function fetchMinutelyPrecip(location: string): Promise<MinutelyPrecipResponse> {
  try {
    const coords = parseLocationParam(location);
    if (!coords) return { error: "Invalid location" };
    const resolved = await resolveXiaomiLocation(coords);
    if (!resolved) return { error: "Missing Xiaomi locationKey" };
    const query = withXiaomiWeatherParams({
      latitude: resolved.lat,
      longitude: resolved.lon,
      locationKey: resolved.locationKey,
    });
    const data = (await xiaomiWeatherGetJson(
      `/weather/xm/forecast/minutely?${query}`
    )) as XiaomiMinutelyResponse;
    return adaptMinutely(data);
  } catch (e: unknown) {
    return { error: String(e) } as MinutelyPrecipResponse;
  }
}

export async function fetchWeatherHourly72h(location: string): Promise<WeatherHourly72hResponse> {
  try {
    return adaptHourly72h(await fetchXiaomiWeatherAll(location));
  } catch (e: unknown) {
    return { error: String(e) } as WeatherHourly72hResponse;
  }
}

export async function buildWeatherFlow(options?: WeatherFlowOptions): Promise<{
  coords: Coords | null;
  coordsSource?: string | null;
  city?: string | null;
  addressInfo?: AddressInfo | null;
  weather?: WeatherNow | null;
  daily3d?: WeatherDaily3dResponse | null;
  airQuality?: AirQualityCurrentResponse | null;
  astronomySun?: AstronomySunResponse | null;
}> {
  const loc = await buildLocationFlow(options);
  if (!loc.coords) {
    return { coords: null, coordsSource: null };
  }

  const resolved = await resolveXiaomiLocation(loc.coords, loc.city);
  const weatherAll = resolved
    ? await fetchXiaomiWeatherAllByResolved(resolved)
    : ({ error: "Missing Xiaomi locationKey" } as XiaomiWeatherAllResponse);

  const weather = adaptWeatherNow(weatherAll);
  const daily3d = options?.fetchDaily3d !== false ? adaptDaily3d(weatherAll) : null;
  const astronomySun = options?.fetchAstronomySun !== false ? adaptAstronomySun(weatherAll) : null;
  const airQuality = options?.fetchAirQuality !== false ? adaptAirQuality(weatherAll) : null;

  return {
    coords: loc.coords,
    coordsSource: loc.coordsSource,
    city: loc.city,
    addressInfo: loc.addressInfo,
    weather,
    daily3d,
    astronomySun,
    airQuality,
  };
}
