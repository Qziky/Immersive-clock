import { act, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import Weather from "../Weather";

const mocks = vi.hoisted(() => ({
  buildLocationFlow: vi.fn(),
  buildWeatherFlow: vi.fn(),
  fetchWeatherAlertsByCoords: vi.fn(),
  getMinutelyWeatherSnapshot: vi.fn(),
  loggerError: vi.fn(),
  refreshMinutelyWeather: vi.fn(),
  snapshotRenderCount: 0,
}));

const firstMinutelyCache = {
  fetchedAt: 1,
  minutely: [],
  summary: "无降水",
  updateTime: "2026-07-16T12:00:00.000Z",
};

const nextMinutelyCache = {
  ...firstMinutelyCache,
  fetchedAt: 2,
};

vi.mock("../../../contexts/AppContext", () => ({
  useAppState: () => ({
    study: {
      airQualityAlertEnabled: false,
      errorPopupEnabled: false,
      minutelyPrecipEnabled: false,
      sunriseSunsetAlertEnabled: false,
      weatherAlertEnabled: false,
    },
  }),
}));

vi.mock("../../../contexts/AppearanceContext", () => ({
  useComponentAppearance: () => undefined,
}));

vi.mock("../../../hooks/useMinutelyWeatherSnapshot", () => ({
  useMinutelyWeatherSnapshot: () => {
    const cache = mocks.snapshotRenderCount === 0 ? firstMinutelyCache : nextMinutelyCache;
    mocks.snapshotRenderCount += 1;
    return {
      cache,
      error: null,
      fetchedAt: cache.fetchedAt,
      freshness: "fresh",
      location: "116.41,39.90",
      phase: null,
      sourceUpdatedAt: null,
      stale: false,
      stats: null,
      status: "ready",
      updatedAt: cache.fetchedAt,
    };
  },
}));

vi.mock("../../../services/locationService", () => ({
  buildLocationFlow: mocks.buildLocationFlow,
}));

vi.mock("../../../services/minutelyWeatherRuntime", () => ({
  getMinutelyWeatherSnapshot: mocks.getMinutelyWeatherSnapshot,
  refreshMinutelyWeather: mocks.refreshMinutelyWeather,
}));

vi.mock("../../../services/weatherService", () => ({
  buildWeatherFlow: mocks.buildWeatherFlow,
  fetchWeatherAlertsByCoords: mocks.fetchWeatherAlertsByCoords,
}));

vi.mock("../../../utils/appSettings", () => ({
  getAppSettings: () => ({ general: { weather: { autoRefreshIntervalMin: 30 } } }),
}));

vi.mock("../../../utils/logger", () => ({
  logger: {
    error: mocks.loggerError,
    warn: vi.fn(),
  },
}));

vi.mock("../../../utils/timeSync", () => ({
  getAdjustedDate: () => new Date("2026-07-16T12:00:00.000Z"),
  getAdjustedNowMs: () => Date.parse("2026-07-16T12:00:00.000Z"),
}));

vi.mock("../../../utils/weatherStorage", () => ({
  getValidCoords: vi.fn(() => null),
  getValidMinutely: vi.fn(() => null),
  getWeatherCache: vi.fn(() => ({})),
  updateAirQualityCache: vi.fn(),
  updateAlertTag: vi.fn(),
  updateAstronomySunCache: vi.fn(),
  updateDaily3dCache: vi.fn(),
  updateWeatherNowSnapshot: vi.fn(),
}));

vi.mock("../WeatherPresentation", () => ({
  WeatherPresentation: () => <div data-testid="weather-presentation" />,
}));

describe("Weather", () => {
  beforeEach(() => {
    mocks.buildLocationFlow.mockReset();
    mocks.buildWeatherFlow.mockReset();
    mocks.fetchWeatherAlertsByCoords.mockReset();
    mocks.getMinutelyWeatherSnapshot.mockReset();
    mocks.loggerError.mockReset();
    mocks.refreshMinutelyWeather.mockReset();
    mocks.snapshotRenderCount = 0;

    mocks.getMinutelyWeatherSnapshot.mockReturnValue({ cache: nextMinutelyCache });
    mocks.refreshMinutelyWeather.mockResolvedValue(undefined);
    mocks.buildWeatherFlow.mockResolvedValue({
      addressInfo: { address: "北京市", source: "Amap" },
      airQuality: null,
      astronomySun: null,
      city: "北京市",
      coords: { lat: 39.904, lon: 116.408 },
      coordsSource: "manual_city",
      daily3d: null,
      weather: {
        code: "200",
        now: { temp: "27", text: "阴" },
      },
    });
  });

  it("分钟缓存对象更新时不会重复初始化天气", async () => {
    render(<Weather />);

    await screen.findByTestId("weather-presentation");
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    await waitFor(() => expect(mocks.buildWeatherFlow).toHaveBeenCalledTimes(1));
    expect(mocks.loggerError).not.toHaveBeenCalled();
  });
});
