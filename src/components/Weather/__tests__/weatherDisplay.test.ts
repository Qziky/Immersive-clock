import { describe, expect, it } from "vitest";

import { getWeatherIconUrl, resolveWeatherIconCode, simplifyWeatherText } from "../weatherDisplay";

describe("weatherDisplay", () => {
  it("按真实天气规则映射昼夜图标", () => {
    expect(resolveWeatherIconCode("晴朗", 12)).toBe("01d");
    expect(resolveWeatherIconCode("晴朗", 20)).toBe("01n");
    expect(resolveWeatherIconCode("多云", 12)).toBe("03d");
    expect(resolveWeatherIconCode("雷阵雨", 12)).toBe("09d");
  });

  it("生成正式图标地址并简化天气描述", () => {
    expect(getWeatherIconUrl("01d")).toBe("/weather-icons/fill/01d.svg");
    expect(simplifyWeatherText("晴朗")).toBe("晴");
    expect(simplifyWeatherText("中雨转小雨")).toBe("雨");
    expect(simplifyWeatherText("")).toBe("晴");
  });
});
