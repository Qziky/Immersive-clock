import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import Weather from "../Weather";

const mocks = vi.hoisted(() => ({
  runtime: {
    cache: {},
    error: null,
    lastSuccessAt: null,
    location: null,
    nextRefreshAt: null,
    requestsThisHour: 0,
    status: "idle",
    updatedAt: 0,
  } as Record<string, unknown>,
}));

vi.mock("../../../contexts/AppearanceContext", () => ({
  useComponentAppearance: () => undefined,
}));

vi.mock("../../../hooks/useWeatherRuntimeSnapshot", () => ({
  useWeatherRuntimeSnapshot: () => mocks.runtime,
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
    const now = Date.now();
    mocks.runtime = {
      cache: {
        version: 2,
        details: { data: {}, location: "116.4080,39.9040", updatedAt: now },
        now: { data: { code: "200", now: { temp: "27", text: "阴" } }, updatedAt: now },
      },
      error: null,
      lastSuccessAt: now,
      location: {
        city: { lat: 39.904, locationKey: "weathercn:101010100", lon: 116.408, name: "北京市" },
        coords: { lat: 39.904, lon: 116.408 },
        mode: "manual",
        resolvedAt: now,
        source: "manual_city",
      },
      nextRefreshAt: null,
      requestsThisHour: 0,
      status: "ready",
      updatedAt: now,
    };
  });

  it("只从统一运行时快照渲染匹配位置的天气", () => {
    render(<Weather />);
    expect(screen.getByTestId("weather-presentation")).toHaveTextContent("27° 阴");
  });

  it("定位加载阶段显示稳定加载状态", () => {
    mocks.runtime = { ...mocks.runtime, cache: {}, location: null, status: "locating" };
    render(<Weather />);
    expect(screen.getByLabelText("天气")).toBeInTheDocument();
    expect(screen.queryByTestId("weather-presentation")).not.toBeInTheDocument();
  });

  it("首次迁移失败时继续显示旧缓存的过期占位", () => {
    mocks.runtime = {
      ...mocks.runtime,
      cache: {
        now: { data: { code: "200", now: { temp: "25", text: "旧天气" } }, updatedAt: 1 },
      },
      error: "手动城市迁移失败",
      location: null,
      status: "error",
    };

    render(<Weather />);

    expect(screen.getByTestId("weather-presentation")).toHaveTextContent("25° 旧天气");
  });
});
