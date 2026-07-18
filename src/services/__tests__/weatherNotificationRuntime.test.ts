import { beforeEach, describe, expect, it, vi } from "vitest";

import type { WeatherAlertResponse } from "../../types/weather";
import type { WeatherCache } from "../../utils/weatherStorage";
import { processWeatherNotifications } from "../weatherNotificationRuntime";

const mocks = vi.hoisted(() => ({
  now: new Date("2026-07-18T06:05:00+08:00"),
}));

vi.mock("../../utils/appSettings", () => ({
  getAppSettings: () => ({
    study: {
      alerts: { airQuality: true, sunriseSunset: true, weatherAlert: true },
      display: { showWeather: false },
    },
  }),
}));

vi.mock("../../utils/timeSync", () => ({
  getAdjustedDate: () => new Date(mocks.now),
}));

describe("weatherNotificationRuntime", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    mocks.now = new Date("2026-07-18T06:05:00+08:00");
  });

  it("隐藏顶部天气后仍触发并去重预警、AQI 与日出日落提醒", () => {
    const messages: Array<Record<string, unknown>> = [];
    const listener = (event: Event) => {
      messages.push((event as CustomEvent<Record<string, unknown>>).detail);
    };
    window.addEventListener("messagePopup:open", listener);
    const cache = {
      activeLocation: {
        city: {
          lat: 31.2,
          locationKey: "weathercn:101020100",
          lon: 121.5,
          name: "上海市",
        },
        coords: { lat: 31.2, lon: 121.5 },
        mode: "auto",
        resolvedAt: Date.now(),
        source: "browser",
      },
      airQuality: {
        data: { indexes: [{ aqi: 150, category: "中度污染" }] },
        signature: "31.2000,121.5000",
        updatedAt: Date.now(),
      },
      astronomySun: {
        data: { code: "200", sunrise: "06:00", sunset: "18:00" },
        date: "20260718",
        location: "121.5000,31.2000",
        updatedAt: Date.now(),
      },
      version: 2,
    } as WeatherCache;
    const alerts = {
      alerts: [
        {
          description: "注意防范强降雨。",
          headline: "暴雨蓝色预警",
          id: "alert-hidden-weather",
          senderName: "上海中心气象台",
        },
      ],
    } as WeatherAlertResponse;

    processWeatherNotifications(cache, alerts);
    processWeatherNotifications(cache, alerts);
    mocks.now = new Date("2026-07-18T17:35:00+08:00");
    processWeatherNotifications(cache, alerts);
    processWeatherNotifications(cache, alerts);

    expect(messages.map((message) => message.title)).toEqual([
      "暴雨蓝色预警",
      "空气污染提醒",
      "日出提醒",
      "日落提醒",
    ]);
    window.removeEventListener("messagePopup:open", listener);
  });
});
