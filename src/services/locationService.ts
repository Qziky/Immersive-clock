import type {
  Coords,
  GeolocationDiagnostics,
  GeolocationPermissionState,
  GeolocationResult,
  WeatherCitySelection,
  WeatherLocation,
  XiaomiCityLocation,
} from "../types/weather";
import { getAppSettings, updateGeneralSettings } from "../utils/appSettings";
import { getValidXiaomiLocation, updateXiaomiLocationCache } from "../utils/weatherStorage";

import { httpGetJson } from "./httpClient";
import { xiaomiWeatherGetJson } from "./xiaomiWeatherClient";

export type {
  Coords,
  GeolocationDiagnostics,
  GeolocationPermissionState,
  GeolocationResult,
  WeatherCitySelection,
  WeatherLocation,
};

export type LocationFlowOptions = {
  cachedLocation?: WeatherLocation | null;
  forceGeolocation?: boolean;
  preferredLocationMode?: "auto" | "manual";
};

const BROWSER_LOCATION_TTL_MS = 30 * 60 * 1000;
const PUBLIC_IP_LOCATION_TTL_MS = 6 * 60 * 60 * 1000;
const CITY_SEARCH_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const CITY_SEARCH_CACHE_KEY = "immersive-clock:xiaomi-city-search:v1";

interface IpInfoResponse {
  loc?: string;
}

interface CachedCitySearch {
  candidates: WeatherCitySelection[];
  updatedAt: number;
}

function validateCoords(lat: number, lon: number): boolean {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lon) &&
    lat >= -90 &&
    lat <= 90 &&
    lon >= -180 &&
    lon <= 180
  );
}

function normalizeQuery(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase("zh-CN");
}

function readCitySearchCache(): Record<string, CachedCitySearch> {
  if (typeof localStorage === "undefined") return {};
  try {
    const parsed = JSON.parse(localStorage.getItem(CITY_SEARCH_CACHE_KEY) || "{}") as Record<
      string,
      CachedCitySearch
    >;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeCitySearchCache(query: string, candidates: WeatherCitySelection[]): void {
  if (typeof localStorage === "undefined") return;
  try {
    const now = Date.now();
    const current = readCitySearchCache();
    const next = Object.fromEntries(
      Object.entries(current).filter(
        ([, entry]) => now - entry.updatedAt < CITY_SEARCH_CACHE_TTL_MS
      )
    );
    next[query] = { candidates, updatedAt: now };
    localStorage.setItem(CITY_SEARCH_CACHE_KEY, JSON.stringify(next));
  } catch {
    // 城市搜索缓存失败不应阻断定位。
  }
}

async function getGeolocationPermissionState(): Promise<GeolocationPermissionState> {
  try {
    if (typeof navigator === "undefined" || !("permissions" in navigator)) return "unsupported";
    const permissions = navigator.permissions as unknown as {
      query: (descriptor: { name: string }) => Promise<{ state?: string }>;
    };
    const state = String(
      (await permissions.query({ name: "geolocation" })).state || ""
    ).toLowerCase();
    return state === "granted" || state === "denied" || state === "prompt" ? state : "unknown";
  } catch {
    return "unknown";
  }
}

/** 浏览器定位固定请求全新高精度坐标，不执行低精度重试。 */
export async function getGeolocationResult(options?: {
  timeoutMs?: number;
}): Promise<GeolocationResult> {
  const attemptedAt = Date.now();
  const isSupported = typeof navigator !== "undefined" && "geolocation" in navigator;
  const isSecureContext = typeof window !== "undefined" ? Boolean(window.isSecureContext) : false;
  const permissionState = await getGeolocationPermissionState();
  const timeoutMs = options?.timeoutMs ?? 20_000;
  const diagnostics: GeolocationDiagnostics = {
    attemptedAt,
    isSecureContext,
    isSupported,
    maximumAgeMs: 0,
    permissionState,
    timeoutMs,
    usedHighAccuracy: true,
  };

  if (!isSupported || !isSecureContext) return { coords: null, diagnostics };

  return new Promise((resolve) => {
    try {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const lat = position.coords.latitude;
          const lon = position.coords.longitude;
          if (!validateCoords(lat, lon)) {
            resolve({ coords: null, diagnostics });
            return;
          }
          const accuracy = Number(position.coords.accuracy);
          resolve({
            coords: {
              lat,
              lon,
              ...(Number.isFinite(accuracy) && accuracy >= 0 ? { accuracy } : {}),
            },
            diagnostics,
          });
        },
        (error) => {
          resolve({
            coords: null,
            diagnostics: {
              ...diagnostics,
              errorCode: error.code,
              errorMessage: error.message,
            },
          });
        },
        { enableHighAccuracy: true, maximumAge: 0, timeout: timeoutMs }
      );
    } catch (error: unknown) {
      resolve({
        coords: null,
        diagnostics: {
          ...diagnostics,
          errorMessage: error instanceof Error ? error.message : String(error),
        },
      });
    }
  });
}

export async function getCoordsViaGeolocation(): Promise<Coords | null> {
  return (await getGeolocationResult()).coords;
}

/** 公共 IP 定位只在浏览器高精度定位失败后使用。 */
export async function getCoordsViaIP(): Promise<Coords | null> {
  const sources: Array<[string, "pair" | "loc"]> = [
    ["https://ipapi.co/json/", "pair"],
    ["https://ipinfo.io/json", "loc"],
  ];
  for (const [url, format] of sources) {
    try {
      const data = (await httpGetJson(url, undefined, 8000, {
        apiClass: "free",
        requestKey: `ip:${url}`,
        softTtlMs: PUBLIC_IP_LOCATION_TTL_MS,
        minIntervalMs: 60 * 1000,
      })) as Record<string, unknown>;
      const values =
        format === "loc"
          ? String((data as IpInfoResponse).loc || "").split(",", 2)
          : [data.latitude, data.longitude];
      const lat = Number.parseFloat(String(values[0] ?? ""));
      const lon = Number.parseFloat(String(values[1] ?? ""));
      if (validateCoords(lat, lon)) return { lat, lon };
    } catch {
      // 继续尝试下一个公共 IP 数据源。
    }
  }
  return null;
}

function toCitySelection(item: XiaomiCityLocation | null | undefined): WeatherCitySelection | null {
  const lat = Number.parseFloat(String(item?.latitude ?? ""));
  const lon = Number.parseFloat(String(item?.longitude ?? ""));
  const name = String(item?.name || "").trim();
  const locationKey = String(item?.locationKey || item?.key || "").trim();
  if (!name || !locationKey || !validateCoords(lat, lon)) return null;
  const affiliation = String(item?.affiliation || "").trim() || undefined;
  return { affiliation, lat, locationKey, lon, name };
}

export async function searchWeatherCities(query: string): Promise<WeatherCitySelection[]> {
  const normalized = normalizeQuery(query);
  if (!normalized) return [];
  const cached = readCitySearchCache()[normalized];
  if (cached && Date.now() - cached.updatedAt < CITY_SEARCH_CACHE_TTL_MS) {
    return cached.candidates;
  }
  const data = await xiaomiWeatherGetJson(
    `/location/city/search?name=${encodeURIComponent(query.trim())}&locale=zh_cn`
  );
  const candidates = (Array.isArray(data) ? data : [])
    .map((item) => toCitySelection(item as XiaomiCityLocation))
    .filter((item): item is WeatherCitySelection => item != null);
  writeCitySearchCache(normalized, candidates);
  return candidates;
}

export async function fetchXiaomiCityByCoords(
  lat: number,
  lon: number
): Promise<XiaomiCityLocation | null> {
  try {
    const data = await xiaomiWeatherGetJson(
      `/location/city/geo?longitude=${encodeURIComponent(String(lon))}&latitude=${encodeURIComponent(
        String(lat)
      )}&locale=zh_cn`
    );
    if (Array.isArray(data)) return (data[0] as XiaomiCityLocation | undefined) || null;
    return (data as XiaomiCityLocation | null) || null;
  } catch {
    return null;
  }
}

export async function resolveCityByCoords(
  lat: number,
  lon: number
): Promise<WeatherCitySelection | null> {
  const cached = getValidXiaomiLocation(lat, lon);
  if (cached?.locationKey && cached.name) {
    return {
      affiliation: cached.affiliation,
      lat,
      locationKey: cached.locationKey,
      lon,
      name: cached.name,
    };
  }
  const city = toCitySelection(await fetchXiaomiCityByCoords(lat, lon));
  if (!city) return null;
  const selection = { ...city, lat, lon };
  updateXiaomiLocationCache(selection);
  return selection;
}

function locationFromSelection(
  selection: WeatherCitySelection,
  source: WeatherLocation["source"],
  mode: WeatherLocation["mode"],
  coords: Coords = { lat: selection.lat, lon: selection.lon }
): WeatherLocation {
  return { city: selection, coords, mode, resolvedAt: Date.now(), source };
}

export async function resolveWeatherLocation(
  options: LocationFlowOptions = {}
): Promise<{ diagnostics: GeolocationDiagnostics | null; location: WeatherLocation }> {
  const settings = getAppSettings().general.weather;
  const mode = options.preferredLocationMode ?? settings.locationMode;
  if (mode === "manual") {
    if (settings.manualLocation.selected) {
      return {
        diagnostics: null,
        location: locationFromSelection(settings.manualLocation.selected, "manual_city", "manual"),
      };
    }
    if (settings.manualLocation.legacyCoords) {
      const { lat, lon } = settings.manualLocation.legacyCoords;
      const city = await resolveCityByCoords(lat, lon);
      if (city) {
        updateGeneralSettings({
          weather: {
            manualLocation: { query: city.name, selected: city, legacyCoords: undefined },
          },
        });
        return {
          diagnostics: null,
          location: locationFromSelection(city, "manual_city", "manual", { lat, lon }),
        };
      }
    }
    throw new Error("手动城市尚未确认，请在定位设置中搜索并选择城市");
  }

  const now = Date.now();
  const cached = options.cachedLocation?.mode === "auto" ? options.cachedLocation : null;
  if (
    !options.forceGeolocation &&
    cached?.source === "browser" &&
    now - cached.resolvedAt < BROWSER_LOCATION_TTL_MS
  ) {
    return { diagnostics: null, location: cached };
  }

  const geolocation = await getGeolocationResult();
  if (geolocation.coords) {
    const city = await resolveCityByCoords(geolocation.coords.lat, geolocation.coords.lon);
    if (city) {
      return {
        diagnostics: geolocation.diagnostics,
        location: locationFromSelection(city, "browser", "auto", geolocation.coords),
      };
    }
  }

  if (cached?.source === "public_ip" && now - cached.resolvedAt < PUBLIC_IP_LOCATION_TTL_MS) {
    return { diagnostics: geolocation.diagnostics, location: cached };
  }

  const ipCoords = await getCoordsViaIP();
  if (ipCoords) {
    const city = await resolveCityByCoords(ipCoords.lat, ipCoords.lon);
    if (city) {
      return {
        diagnostics: geolocation.diagnostics,
        location: locationFromSelection(city, "public_ip", "auto", ipCoords),
      };
    }
  }

  const detail = geolocation.diagnostics.errorMessage
    ? `：${geolocation.diagnostics.errorMessage}`
    : "";
  throw new Error(`高精度浏览器定位和公共 IP 定位均失败${detail}`);
}
