import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { WeatherAlertSnapshot } from "../../../services/weatherAlertRuntime";
import type { StudyState } from "../../../types";
import Weather from "../Weather";

const mocks = vi.hoisted(() => ({
  loggerError: vi.fn(),
  loggerWarn: vi.fn(),
  readStationAlertRecord: vi.fn(),
  study: {
    targetYear: 2027,
    airQualityAlertEnabled: false,
    errorPopupEnabled: false,
    sunriseSunsetAlertEnabled: false,
    weatherAlertEnabled: false,
  } as StudyState,
  useWeatherAlertSnapshot: vi.fn(),
  weatherCache: {} as Record<string, unknown>,
  weatherCoordinatorSnapshot: {
    activeTarget: null,
    cooldownUntil: null,
    error: null,
    lastSuccessAt: null,
    nextRefreshAt: null,
    reason: null,
    requestsThisHour: 0,
    status: "idle",
    updatedAt: 0,
  },
  weatherAlertSnapshot: {
    alerts: [],
    coords: null,
    error: null,
    fetchedAt: null,
    metadata: null,
    revision: 0,
    status: "idle",
  } as WeatherAlertSnapshot,
  writeStationAlertRecord: vi.fn(),
}));

vi.mock("../../../contexts/AppContext", () => ({
  useAppState: () => ({ study: mocks.study }),
}));

vi.mock("../../../contexts/AppearanceContext", () => ({
  useComponentAppearance: () => undefined,
}));

vi.mock("../../../hooks/useWeatherAlertSnapshot", () => ({
  useWeatherAlertSnapshot: (enabled: boolean) => {
    mocks.useWeatherAlertSnapshot(enabled);
    return mocks.weatherAlertSnapshot;
  },
}));

vi.mock("../../../hooks/useWeatherCoordinatorSnapshot", () => ({
  useWeatherCoordinatorSnapshot: () => mocks.weatherCoordinatorSnapshot,
}));

vi.mock("../../../utils/logger", () => ({
  logger: {
    error: mocks.loggerError,
    warn: mocks.loggerWarn,
  },
}));

vi.mock("../../../utils/timeSync", () => ({
  getAdjustedDate: () => new Date("2026-07-16T12:00:00.000Z"),
  getAdjustedNowMs: () => Date.parse("2026-07-16T12:00:00.000Z"),
}));

vi.mock("../../../utils/weatherStorage", () => ({
  createWeatherLocationKey: (lat: number, lon: number) => `${lon.toFixed(4)},${lat.toFixed(4)}`,
  getValidCoords: vi.fn(() => null),
  getValidMinutely: vi.fn(() => null),
  getWeatherCache: vi.fn(() => mocks.weatherCache),
  readStationAlertRecord: mocks.readStationAlertRecord,
  updateAirQualityCache: vi.fn(),
  updateAlertTag: vi.fn(),
  updateAstronomySunCache: vi.fn(),
  updateDaily3dCache: vi.fn(),
  updateWeatherNowSnapshot: vi.fn(),
  writeStationAlertRecord: mocks.writeStationAlertRecord,
}));

vi.mock("../WeatherPresentation", () => ({
  WeatherPresentation: ({
    temperatureText,
    weatherText,
  }: {
    temperatureText: string;
    weatherText: string;
  }) => (
    <div data-testid="weather-presentation">
      {temperatureText} {weatherText}
    </div>
  ),
}));

describe("Weather", () => {
  beforeEach(() => {
    mocks.loggerError.mockReset();
    mocks.loggerWarn.mockReset();
    mocks.readStationAlertRecord.mockReset();
    mocks.useWeatherAlertSnapshot.mockReset();
    mocks.writeStationAlertRecord.mockReset();
    mocks.study = {
      targetYear: 2027,
      airQualityAlertEnabled: false,
      errorPopupEnabled: false,
      sunriseSunsetAlertEnabled: false,
      weatherAlertEnabled: false,
    };
    mocks.weatherAlertSnapshot = {
      alerts: [],
      coords: null,
      error: null,
      fetchedAt: null,
      metadata: null,
      revision: 0,
      status: "idle",
    };
    mocks.weatherCache = {
      coords: { lat: 39.904, lon: 116.408, source: "manual_city", updatedAt: Date.now() },
      details: {
        data: {},
        location: "116.4080,39.9040",
        updatedAt: Date.now(),
      },
      location: {
        city: "北京市",
        signature: "39.9040,116.4080",
        updatedAt: Date.now(),
      },
      now: {
        data: {
          code: "200",
          now: { temp: "27", text: "阴" },
        },
        updatedAt: Date.now(),
      },
    };
  });

  it("从匹配当前坐标的缓存渲染天气且不自行请求", async () => {
    render(<Weather />);

    expect(await screen.findByTestId("weather-presentation")).toHaveTextContent("27° 阴");
    expect(mocks.loggerError).not.toHaveBeenCalled();
  });

  it("继续使用原有站点去重记录投递天气预警弹窗", async () => {
    mocks.study = { ...mocks.study, weatherAlertEnabled: true };
    const onOpen = vi.fn();
    window.addEventListener("messagePopup:open", onOpen);
    const { rerender } = render(<Weather />);
    await screen.findByTestId("weather-presentation");

    mocks.weatherAlertSnapshot = {
      alerts: [
        {
          alert: {
            id: "alert-1",
            senderName: "青羊气象台",
            issuedTime: "2026-07-17T00:32:00+08:00",
            headline: "青羊区暴雨橙色预警",
            description: "请注意防范。",
            color: { code: "橙色" },
          },
          expiresAt: Date.parse("2026-07-17T12:32:00+08:00"),
          publishedAt: Date.parse("2026-07-17T00:32:00+08:00"),
          severityRank: 4,
          signature: "id:alert-1",
        },
      ],
      coords: { lat: 30.67, lon: 104.06 },
      error: null,
      fetchedAt: Date.parse("2026-07-17T00:40:00+08:00"),
      metadata: { tag: "alert-tag" },
      revision: 1,
      status: "ready",
    };
    rerender(<Weather />);

    await waitFor(() => expect(onOpen).toHaveBeenCalledOnce());
    expect(mocks.writeStationAlertRecord).toHaveBeenCalledWith("青羊气象台", "id:alert-1");
    expect(onOpen.mock.calls[0][0]).toMatchObject({
      detail: {
        type: "weatherAlert",
        title: "青羊区暴雨橙色预警",
        message: "请注意防范。",
        themeColor: "#f97316",
      },
    });
    window.removeEventListener("messagePopup:open", onOpen);
  });

  it("仅启用顶部预警不会让 Weather 消费弹窗去重记录", async () => {
    render(<Weather />);
    await screen.findByTestId("weather-presentation");

    expect(mocks.useWeatherAlertSnapshot).toHaveBeenCalledWith(false);
    expect(mocks.readStationAlertRecord).not.toHaveBeenCalled();
    expect(mocks.writeStationAlertRecord).not.toHaveBeenCalled();
  });
});
