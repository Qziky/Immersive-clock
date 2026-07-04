import { httpGetJson } from "./httpClient";

const DEFAULT_XIAOMI_WEATHER_HOST = "weatherapi.market.xiaomi.com";
const DEFAULT_XIAOMI_WEATHER_PROXY_PREFIX = "/api/xiaomi-weather";
const XIAOMI_WEATHER_PATH_PREFIX = "/wtr-v3";
const XIAOMI_WEATHER_APP_KEY = "weather20151024";
const XIAOMI_WEATHER_SIGN = "zUFJoAR2ZVrDy1vF3D07";

export function getXiaomiWeatherHost(): string {
  return (import.meta.env.VITE_XIAOMI_WEATHER_API_HOST || DEFAULT_XIAOMI_WEATHER_HOST).trim();
}

function getXiaomiWeatherProxyPrefix(): string {
  return (
    import.meta.env.VITE_XIAOMI_WEATHER_PROXY_PREFIX || DEFAULT_XIAOMI_WEATHER_PROXY_PREFIX
  ).trim();
}

export function withXiaomiWeatherParams(params: Record<string, string | number | boolean>) {
  const searchParams = new URLSearchParams();
  Object.entries({
    ...params,
    appKey: XIAOMI_WEATHER_APP_KEY,
    sign: XIAOMI_WEATHER_SIGN,
    isGlobal: params.isGlobal ?? false,
    locale: params.locale ?? "zh_cn",
  }).forEach(([key, value]) => {
    searchParams.set(key, String(value));
  });
  return searchParams.toString();
}

export async function xiaomiWeatherGetJson(
  pathWithQuery: string,
  timeoutMs = 10000
): Promise<unknown> {
  const path = pathWithQuery.startsWith("/") ? pathWithQuery : `/${pathWithQuery}`;
  const proxyPrefix = getXiaomiWeatherProxyPrefix();
  const url = proxyPrefix
    ? `${proxyPrefix}${XIAOMI_WEATHER_PATH_PREFIX}${path}`
    : `https://${getXiaomiWeatherHost()}${XIAOMI_WEATHER_PATH_PREFIX}${path}`;
  return httpGetJson(url, undefined, timeoutMs, {
    apiClass: "xiaomiWeather",
    requestKey: `xiaomiWeather:${path}`,
  });
}
