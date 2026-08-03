import { getRuntimePlatform } from "../utils/runtimePlatform";

import { capacitorHttpGetJson } from "./capacitorHttpClient";
import { httpGetJson } from "./httpClient";
import { executeWeatherRequest, type WeatherRequestKind } from "./weatherRequestGuard";

const XIAOMI_WEATHER_PROXY_PREFIX = "/api/xiaomi-weather";
const XIAOMI_WEATHER_UPSTREAM_ORIGIN = "https://weatherapi.market.xiaomi.com";
const XIAOMI_WEATHER_PATH_PREFIX = "/wtr-v3";
const XIAOMI_WEATHER_APP_KEY = "weather20151024";
const XIAOMI_WEATHER_SIGN = "zUFJoAR2ZVrDy1vF3D07";

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
  const requestPath = `${XIAOMI_WEATHER_PATH_PREFIX}${path}`;
  const isAndroid = getRuntimePlatform() === "android";
  const url = isAndroid
    ? `${XIAOMI_WEATHER_UPSTREAM_ORIGIN}${requestPath}`
    : `${XIAOMI_WEATHER_PROXY_PREFIX}${requestPath}`;
  let requestKind: WeatherRequestKind = "other";
  let requestKey = path;
  if (path.startsWith("/weather/all")) requestKind = "all";
  else if (path.startsWith("/weather/xm/forecast/minutely")) requestKind = "minutely";
  else if (path.startsWith("/location/city/search")) requestKind = "citySearch";
  else if (path.startsWith("/location/city/geo")) requestKind = "geoResolve";
  if (requestKind === "all" || requestKind === "minutely") requestKey = requestKind;
  return executeWeatherRequest(
    () =>
      isAndroid
        ? capacitorHttpGetJson(url, undefined, timeoutMs)
        : httpGetJson(url, undefined, timeoutMs),
    requestKind,
    requestKey
  );
}
