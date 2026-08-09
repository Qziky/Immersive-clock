import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { WeatherLocation } from "../../../../types/weather";
import WeatherSettingsPanel from "../WeatherSettingsPanel";

const mocks = vi.hoisted(() => ({
  acquireRuntime: vi.fn(() => () => undefined),
  broadcast: vi.fn(),
  dispatch: vi.fn(),
  refreshLocation: vi.fn(),
  refreshWeather: vi.fn(),
  searchCities: vi.fn(),
  settings: {
    locationMode: "auto" as "auto" | "manual",
    manualLocation: { query: "", selected: null },
  },
  updateGeneral: vi.fn(),
  runtime: {
    cache: {},
    error: null,
    lastSuccessAt: null,
    location: null as WeatherLocation | null,
    nextRefreshAt: null,
    requestsThisHour: 0,
    status: "ready",
    updatedAt: 1,
  },
}));

vi.mock("../../../../contexts/AppContext", () => ({
  useAppDispatch: () => mocks.dispatch,
  useAppState: () => ({
    study: {
      airQualityAlertEnabled: false,
      sunriseSunsetAlertEnabled: false,
      weatherAlertEnabled: false,
    },
  }),
}));

vi.mock("../../../../hooks/useMinutelyWeatherSnapshot", () => ({
  useMinutelyWeatherSnapshot: () => ({ status: "idle" }),
}));

vi.mock("../../../../hooks/useWeatherRuntimeSnapshot", () => ({
  useWeatherRuntimeSnapshot: () => mocks.runtime,
}));

vi.mock("../../../../services/weatherRuntime", () => ({
  acquireWeatherRuntime: mocks.acquireRuntime,
  refreshLocation: mocks.refreshLocation,
  refreshWeather: mocks.refreshWeather,
  searchWeatherCities: mocks.searchCities,
}));

vi.mock("../../../../utils/appSettings", () => ({
  getAppSettings: () => ({ general: { weather: mocks.settings } }),
  updateGeneralSettings: mocks.updateGeneral,
}));

vi.mock("../../../../utils/settingsEvents", () => ({
  SETTINGS_EVENTS: { WeatherSettingsUpdated: "weatherSettingsUpdated" },
  broadcastSettingsEvent: mocks.broadcast,
}));

vi.mock("../WeatherLivePanel", () => ({
  WeatherLivePanel: ({ hidden }: { hidden: boolean }) => (
    <div hidden={hidden} data-testid="weather-live-panel" />
  ),
}));

describe("WeatherSettingsPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.settings = { locationMode: "auto", manualLocation: { query: "", selected: null } };
    mocks.runtime = {
      cache: {},
      error: null,
      lastSuccessAt: null,
      location: null,
      nextRefreshAt: null,
      requestsThisHour: 0,
      status: "ready",
      updatedAt: 1,
    };
    mocks.searchCities.mockResolvedValue([
      {
        affiliation: "浙江省",
        lat: 30.2,
        locationKey: "weathercn:101210101",
        lon: 120.1,
        name: "杭州市",
      },
      {
        affiliation: "湖北省",
        lat: 30.3,
        locationKey: "weathercn:101200101",
        lon: 120.2,
        name: "杭州区",
      },
    ]);
  });

  it("天气更新页只展示系统自适应状态和手动刷新", async () => {
    const user = userEvent.setup();
    render(<WeatherSettingsPanel section="weather" />);
    await user.click(screen.getByRole("tab", { name: "更新" }));

    expect(screen.getByText(/前台全量天气每 10 分钟/)).toBeInTheDocument();
    expect(screen.queryByText("刷新档位")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "刷新天气" }));
    expect(mocks.refreshWeather).toHaveBeenCalledWith({ force: true, reason: "manual" });
  });

  it("仅在当前设置分区激活时持有天气运行时", () => {
    const { rerender } = render(<WeatherSettingsPanel isActive={false} section="weather" />);
    expect(mocks.acquireRuntime).not.toHaveBeenCalled();

    rerender(<WeatherSettingsPanel isActive section="weather" />);
    expect(mocks.acquireRuntime).toHaveBeenCalledTimes(1);
  });

  it("手动城市必须搜索、选择候选并保存完整 locationKey", async () => {
    const user = userEvent.setup();
    let save: (() => void) | undefined;
    render(
      <WeatherSettingsPanel
        section="location"
        onRegisterSave={(handler) => {
          save = handler;
        }}
      />
    );
    await user.click(screen.getByRole("radio", { name: "手动城市" }));
    fireEvent.change(screen.getByLabelText("城市名称"), { target: { value: "杭州" } });
    await user.click(screen.getByRole("button", { name: "搜索城市" }));
    await waitFor(() => expect(mocks.searchCities).toHaveBeenCalledWith("杭州"));

    await user.click(screen.getByRole("button", { name: "搜索结果" }));
    const listbox = screen.getByRole("listbox");
    await user.click(within(listbox).getByRole("option", { name: /杭州市/ }));
    save?.();

    expect(mocks.updateGeneral).toHaveBeenCalledWith({
      weather: {
        locationMode: "manual",
        manualLocation: {
          query: "杭州",
          selected: expect.objectContaining({
            locationKey: "weathercn:101210101",
            name: "杭州市",
          }),
        },
      },
    });
    expect(mocks.broadcast).toHaveBeenCalledWith(
      "weatherSettingsUpdated",
      expect.objectContaining({ locationMode: "manual" })
    );
  });

  it("手动模式没有选中候选时阻止保存", async () => {
    const user = userEvent.setup();
    let save: (() => void) | undefined;
    render(
      <WeatherSettingsPanel
        section="location"
        onRegisterSave={(handler) => {
          save = handler;
        }}
      />
    );
    await user.click(screen.getByRole("radio", { name: "手动城市" }));
    expect(() => save?.()).toThrow("手动定位必须搜索并选择一个城市");
    expect(mocks.updateGeneral).not.toHaveBeenCalled();
  });

  it("修改城市文本后立即使已选候选失效", async () => {
    const user = userEvent.setup();
    let save: (() => void) | undefined;
    render(
      <WeatherSettingsPanel
        section="location"
        onRegisterSave={(handler) => {
          save = handler;
        }}
      />
    );
    await user.click(screen.getByRole("radio", { name: "手动城市" }));
    await user.type(screen.getByLabelText("城市名称"), "杭州");
    await user.click(screen.getByRole("button", { name: "搜索城市" }));
    await user.click(screen.getByRole("button", { name: "搜索结果" }));
    await user.click(within(screen.getByRole("listbox")).getByRole("option", { name: /杭州市/ }));

    await user.type(screen.getByLabelText("城市名称"), "市");

    expect(() => save?.()).toThrow("手动定位必须搜索并选择一个城市");
    expect(mocks.updateGeneral).not.toHaveBeenCalled();
  });

  it("城市搜索无结果时显示字段错误", async () => {
    const user = userEvent.setup();
    mocks.searchCities.mockResolvedValue([]);
    render(<WeatherSettingsPanel section="location" />);
    await user.click(screen.getByRole("radio", { name: "手动城市" }));
    await user.type(screen.getByLabelText("城市名称"), "不存在的城市");

    await user.click(screen.getByRole("button", { name: "搜索城市" }));

    expect(await screen.findByText("未找到匹配城市，请补充省份或地区名称")).toBeVisible();
    expect(screen.queryByRole("button", { name: "搜索结果" })).not.toBeInTheDocument();
  });

  it("城市搜索请求失败时显示服务错误", async () => {
    const user = userEvent.setup();
    mocks.searchCities.mockRejectedValue(new Error("城市服务暂不可用"));
    render(<WeatherSettingsPanel section="location" />);
    await user.click(screen.getByRole("radio", { name: "手动城市" }));
    await user.type(screen.getByLabelText("城市名称"), "杭州");

    await user.click(screen.getByRole("button", { name: "搜索城市" }));

    expect(await screen.findByText("城市服务暂不可用")).toBeVisible();
    expect(screen.queryByRole("button", { name: "搜索结果" })).not.toBeInTheDocument();
  });

  it("定位设置和状态在同一页面展示，并明确显示公共 IP 降级", () => {
    mocks.runtime = {
      ...mocks.runtime,
      cache: { geolocation: { diagnostics: { permissionState: "granted" } } },
      location: {
        city: { lat: 30.2, locationKey: "weathercn:101210101", lon: 120.1, name: "杭州市" },
        coords: { lat: 30.2, lon: 120.1 },
        mode: "auto",
        resolvedAt: Date.now(),
        source: "public_ip",
      },
    };
    render(<WeatherSettingsPanel section="location" />);

    expect(screen.queryByRole("tablist", { name: "定位服务分类" })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "定位设置" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "定位状态" })).toBeVisible();
    expect(screen.getByRole("radiogroup", { name: "定位方式" })).toBeVisible();
    expect(screen.getByText("公共 IP 城市级位置。", { exact: false })).toBeInTheDocument();
    expect(screen.getByText("公共 IP 降级定位", { exact: false })).toBeInTheDocument();
  });
});
