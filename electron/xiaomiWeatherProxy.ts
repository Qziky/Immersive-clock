const XIAOMI_WEATHER_PROXY_PATH_PREFIX = "/api/xiaomi-weather/wtr-v3/";
const XIAOMI_WEATHER_UPSTREAM_ORIGIN = "https://weatherapi.market.xiaomi.com";

export function resolveXiaomiWeatherUpstreamUrl(requestUrl: string): string | null {
  const url = new URL(requestUrl);
  if (!url.pathname.startsWith(XIAOMI_WEATHER_PROXY_PATH_PREFIX)) return null;

  const upstreamPath = url.pathname.slice("/api/xiaomi-weather".length);
  return `${XIAOMI_WEATHER_UPSTREAM_ORIGIN}${upstreamPath}${url.search}`;
}
