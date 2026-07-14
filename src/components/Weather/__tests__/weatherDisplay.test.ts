import { describe, expect, it } from "vitest";

import { getWeatherIconUrl, resolveWeatherIconCode, simplifyWeatherText } from "../weatherDisplay";

describe("weatherDisplay", () => {
  it.each([
    ["晴朗", 12, "01d"],
    ["晴朗", 20, "01n"],
    ["多云", 12, "03d"],
    ["阴", 12, "04d"],
    ["小雨", 12, "09d"],
    ["雷阵雨", 12, "11d"],
    ["小雪", 12, "13d"],
    ["雾", 12, "50d"],
    ["霾", 12, "50d"],
    ["未知天气", 12, "01d"],
    ["", 20, "01n"],
  ] as const)("将 %s 在 %i 时映射为 %s", (weatherText, hour, expectedCode) => {
    expect(resolveWeatherIconCode(weatherText, hour)).toBe(expectedCode);
  });

  it.each([
    ["01d", "/weather-icons/fill/01d.svg"],
    ["01n", "/weather-icons/fill/01n.svg"],
    ["03d", "/weather-icons/fill/03d.svg"],
    ["11n", "/weather-icons/fill/11n.svg"],
  ] as const)("将天气代码 %s 映射为原天气图标 %s", (iconCode, expectedUrl) => {
    expect(getWeatherIconUrl(iconCode)).toBe(expectedUrl);
  });

  it("简化天气描述", () => {
    expect(simplifyWeatherText("晴朗")).toBe("晴");
    expect(simplifyWeatherText("中雨转小雨")).toBe("雨");
    expect(simplifyWeatherText("")).toBe("晴");
  });
});
