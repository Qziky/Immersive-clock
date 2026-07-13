const WEATHER_ICON_BASE_PATH = "/weather-icons/fill";

const SIMPLIFIED_WEATHER_TEXT: ReadonlyArray<readonly [string, string]> = [
  ["晴", "晴"],
  ["多云", "云"],
  ["阴", "阴"],
  ["小雨", "雨"],
  ["中雨", "雨"],
  ["大雨", "雨"],
  ["暴雨", "雨"],
  ["雷阵雨", "雷"],
  ["小雪", "雪"],
  ["中雪", "雪"],
  ["大雪", "雪"],
  ["雾", "雾"],
  ["霾", "霾"],
  ["沙尘暴", "沙"],
  ["浮尘", "尘"],
  ["扬沙", "沙"],
];

export function resolveWeatherIconCode(weatherText: string, hour = new Date().getHours()): string {
  const suffix = hour >= 18 || hour < 6 ? "n" : "d";
  if (!weatherText || typeof weatherText !== "string") return `01${suffix}`;
  if (weatherText.includes("晴")) return `01${suffix}`;
  if (weatherText.includes("阴")) return `04${suffix}`;
  if (weatherText.includes("多云")) return `03${suffix}`;
  if (weatherText.includes("云")) return `02${suffix}`;
  if (weatherText.includes("雨")) return `09${suffix}`;
  if (weatherText.includes("雪")) return `13${suffix}`;
  if (weatherText.includes("雾") || weatherText.includes("霾")) return `50${suffix}`;
  if (weatherText.includes("雷")) return `11${suffix}`;
  return `01${suffix}`;
}

export function simplifyWeatherText(text: string): string {
  const match = SIMPLIFIED_WEATHER_TEXT.find(([keyword]) => text.includes(keyword));
  return match?.[1] ?? (text.charAt(0) || "晴");
}

export function getWeatherIconUrl(iconCode: string): string {
  return `${WEATHER_ICON_BASE_PATH}/${iconCode}.svg`;
}
