import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { MinutelyWeatherSnapshot } from "../../../../services/minutelyWeatherRuntime";
import type { WeatherDetailsResponse } from "../../../../types/weather";
import type { WeatherCache } from "../../../../utils/weatherStorage";
import WeatherSettingsPanel from "../WeatherSettingsPanel";

const mocks = vi.hoisted(() => ({
  dispatch: vi.fn(),
  minutelySnapshot: {} as MinutelyWeatherSnapshot,
  requestWeatherRefresh: vi.fn(),
  updateGeneralSettings: vi.fn(),
  useMinutelyWeatherSnapshot: vi.fn(),
  weatherCache: {} as WeatherCache,
  weatherCoordinatorSnapshot: {
    activeTarget: null,
    cooldownUntil: null,
    error: null,
    lastSuccessAt: Date.parse("2026-07-17T10:00:00+08:00"),
    nextRefreshAt: Date.parse("2026-07-17T10:05:00+08:00"),
    reason: null,
    requestsThisHour: 3,
    status: "ready",
    updatedAt: 1,
  },
}));

vi.mock("../../../../contexts/AppContext", () => ({
  useAppDispatch: () => mocks.dispatch,
  useAppState: () => ({
    study: {
      weatherAlertEnabled: true,
      airQualityAlertEnabled: false,
      sunriseSunsetAlertEnabled: true,
    },
  }),
}));

vi.mock("../../../../hooks/useMinutelyWeatherSnapshot", () => ({
  useMinutelyWeatherSnapshot: mocks.useMinutelyWeatherSnapshot,
}));

vi.mock("../../../../hooks/useWeatherCoordinatorSnapshot", () => ({
  useWeatherCoordinatorSnapshot: () => mocks.weatherCoordinatorSnapshot,
}));

vi.mock("../../../../services/weatherCoordinator", () => ({
  requestWeatherRefresh: mocks.requestWeatherRefresh,
}));

vi.mock("../../../../utils/appSettings", () => ({
  getAppSettings: () => ({
    general: {
      weather: {
        locationMode: "auto",
        manualLocation: { type: "city", cityName: "" },
        schedule: {
          profile: "balanced",
          custom: {
            allForegroundMin: 5,
            allBackgroundMin: 15,
            minutelyDryMin: 5,
            minutelyRainMin: 2,
            minutelyBackgroundMin: 15,
          },
          safety: {
            maxRequestsPerHour: 120,
            minRequestGapSec: 2,
          },
        },
      },
    },
  }),
  updateGeneralSettings: mocks.updateGeneralSettings,
}));

vi.mock("../../../../utils/weatherStorage", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../../utils/weatherStorage")>();
  return {
    ...actual,
    getWeatherCache: () => mocks.weatherCache,
  };
});

function createDetails(): WeatherDetailsResponse {
  const embeddedMinutely = {
    new: "embedded-v2",
    status: 0,
    probability: {
      maxProbability: "70",
      probabilityDesc: "稍后有雨",
      probabilityDescV2: "预计半小时后有雨",
    },
    precipitation: {
      description: "全量接口分钟回退",
      firstRainOrSnow: false,
      fxTime: ["2026-07-17T10:01:00+08:00", "2026-07-17T10:02:00+08:00"],
      headDescription: "全量接口摘要",
      interval: 1,
      isShow: true,
      probability: [30, 70],
      pubTime: "2026-07-17T10:00:00+08:00",
      rainRemainingMinutes: 12,
      status: 0,
      value: [0, 0.3],
      weather: "7",
    },
  };
  const raw = {
    status: 0,
    updateTime: "2026-07-17T10:00:00+08:00",
    minutely: embeddedMinutely,
    sourceMaps: {
      current: { temperature: "weathercn" },
      rawSentinel: "weather-all-raw",
    },
  };

  return {
    airQuality: {
      aqi: "50",
      category: "优",
      pollutants: [
        { code: "pm25", description: "细颗粒物", unit: "μg/m3", value: "0" },
        { code: "pm10", description: "可吸入颗粒物", unit: "μg/m3", value: "40" },
        { code: "so2", description: "二氧化硫", unit: "μg/m3", value: "6" },
        { code: "no2", description: "二氧化氮", unit: "μg/m3", value: "19" },
        { code: "o3", description: "臭氧", unit: "μg/m3", value: "140" },
        { code: "co", description: "一氧化碳", unit: "mg/m3", value: "0.5" },
      ],
      primary: "pm25",
      publishedAt: "2026-07-17T09:00:00+08:00",
      source: "测试监测站",
      suggestion: "适宜户外活动",
    },
    alerts: [
      {
        defenses: [{ icon: "shield", text: "减少外出" }],
        detail: "注意防范短时强降水",
        id: "alert-1",
        images: ["alert-icon.png", "alert-notice.png"],
        level: "蓝色",
        locationKey: "weathercn:101020100",
        publishedAt: "2026-07-17T09:30:00+08:00",
        title: "暴雨蓝色预警",
        type: "暴雨",
      },
    ],
    brands: [
      {
        brandId: "weathercn",
        logo: "weathercn.png",
        names: { zh_CN: "中国天气" },
        url: "https://example.com/weathercn",
      },
    ],
    code: "200",
    current: {
      feelsLike: { unit: "℃", value: "30" },
      humidity: { unit: "%", value: "0" },
      observationTime: "2026-07-17T10:00:00+08:00",
      pressure: { unit: "hPa", value: "1008" },
      temperature: { unit: "℃", value: "28" },
      uvIndex: "0",
      visibility: { unit: "km", value: "" },
      weatherCode: "1",
      weatherText: "多云",
      windDirection: { unit: "°", value: "188" },
      windDirectionText: "南风",
      windSpeed: { unit: "km/h", value: "2" },
    },
    daily: [
      {
        aqi: "45",
        date: "2026-07-17",
        precipitationProbability: "0",
        sunrise: "2026-07-17T05:01:00+08:00",
        sunset: "2026-07-17T18:59:00+08:00",
        temperatureMax: { unit: "℃", value: "35" },
        temperatureMin: { unit: "℃", value: "27" },
        weatherCodeDay: "1",
        weatherCodeNight: "2",
        weatherTextDay: "多云",
        weatherTextNight: "阴",
        windDirectionDay: { unit: "°", value: "90" },
        windDirectionDayText: "东风",
        windDirectionNight: { unit: "°", value: "180" },
        windDirectionNightText: "南风",
        windSpeedDay: { unit: "km/h", value: "5" },
        windSpeedNight: { unit: "km/h", value: "8" },
      },
      {
        date: "2026-07-18",
        precipitationProbability: "80",
        temperatureMax: { unit: "℃", value: "34" },
        temperatureMin: { unit: "℃", value: "26" },
        weatherTextDay: "小雨",
        weatherTextNight: "中雨",
      },
    ],
    embeddedMinutely,
    hourly: [
      {
        aqi: "40",
        forecastTime: "2026-07-17T10:00:00+08:00",
        temperature: { unit: "℃", value: "28" },
        weatherCode: "1",
        weatherText: "多云",
        windDirection: { unit: "°", value: "188" },
        windDirectionText: "南风",
        windSpeed: { unit: "km/h", value: "2" },
      },
      {
        aqi: "41",
        forecastTime: "2026-07-17T11:00:00+08:00",
        temperature: { unit: "℃", value: "29" },
        weatherCode: "2",
        weatherText: "阴",
      },
      {
        aqi: "42",
        forecastTime: "2026-07-17T12:00:00+08:00",
        weatherCode: "7",
        weatherText: "小雨",
      },
    ],
    indices: [
      { type: "uvIndex", value: "0" },
      { type: "carWash", value: "" },
      { type: "customIndex", value: "自定义指数值" },
    ],
    previousHours: [
      {
        humidity: { unit: "%", value: "67" },
        observationTime: "2026-07-17T09:00:00+08:00",
        temperature: { unit: "℃", value: "27" },
        weatherText: "晴",
      },
    ],
    raw,
    technical: {
      channels: [{ type: "CWA6" }],
      sourceMaps: raw.sourceMaps,
      statuses: { response: 0, airQuality: 0, daily: 0, hourly: 0 },
      units: { currentTemperature: "℃", dailyWindSpeed: "km/h" },
      urls: {
        caiyun: "https://example.com/caiyun",
        weathercn: "https://example.com/weathercn",
      },
    },
    typhoons: [{ name: "测试台风", status: "active" }],
    updateTime: "2026-07-17T10:00:00+08:00",
    yesterday: {
      aqi: "46",
      date: "2026-07-16",
      sunrise: "2026-07-16T05:00:00+08:00",
      sunset: "2026-07-16T19:00:00+08:00",
      temperatureMax: { unit: "℃", value: "36" },
      temperatureMin: { unit: "℃", value: "28" },
      weatherTextEnd: "阴",
      weatherTextStart: "晴",
    },
  };
}

function freshSnapshot(overrides: Partial<MinutelyWeatherSnapshot> = {}): MinutelyWeatherSnapshot {
  const now = new Date(2026, 6, 17, 10, 0).getTime();
  return {
    cache: {
      fetchedAt: now,
      minutely: [
        { fxTime: "2026-07-17T10:01:00+08:00", precip: "0", type: "rain" },
        { fxTime: "2026-07-17T10:02:00+08:00", precip: "0.2", type: "rain" },
        { fxTime: "2026-07-17T10:03:00+08:00", precip: "0.2", type: "rain" },
      ],
      provider: {
        description: "分钟接口完整描述",
        flags: {
          isModify: false,
          isShow: true,
          precipitationStatus: 0,
          responseStatus: 0,
          version: "minute-raw-v1",
        },
        headDescription: "十五分钟后有小雨",
        headIconType: "rain",
        interval: 1,
        probability: [20, 80],
        rainRemainingMinutes: 8,
        raw: {
          new: "minute-raw-sentinel",
          status: 0,
          precipitation: {
            description: "分钟接口完整描述",
            status: 0,
            value: [0, 0.2, 0.2],
          },
        },
        shortDescription: "即将有雨",
        subtitle: "出门请带伞",
        weatherCode: "7",
      },
      summary: "分钟接口完整描述",
      updateTime: "2026-07-17T10:00:00+08:00",
    },
    error: null,
    fetchedAt: now,
    freshness: "fresh",
    location: "121.50,31.20",
    phase: "PRE_RAIN",
    sourceUpdatedAt: now - 60 * 1000,
    stale: false,
    stats: {
      durationMinutes: 20,
      expectedAmountMm: 0.4,
      hasRain: true,
      hasReliableTimestamps: true,
      intensityLabel: "小雨",
      isRainingNow: false,
      leadMinutes: 15,
      nextRainStartAt: now + 15 * 60 * 1000,
      probability: 80,
      rainEndAt: now + 35 * 60 * 1000,
      rainStartAt: now + 15 * 60 * 1000,
      remainingMinutes: null,
      startInMinutes: 15,
      summary: "",
    },
    status: "ready",
    updatedAt: now,
    ...overrides,
  };
}

function createWeatherCache(): WeatherCache {
  const now = new Date(2026, 6, 17, 10, 0).getTime();
  return {
    coords: { lat: 31.2, lon: 121.5, source: "test", updatedAt: now },
    details: {
      data: createDetails(),
      location: "121.5000,31.2000",
      updatedAt: now,
    },
    location: {
      address: "上海市测试路 1 号",
      city: "上海市",
      signature: "31.2000,121.5000",
      updatedAt: now,
    },
  };
}

async function openTab(name: string) {
  const user = userEvent.setup();
  const tab = screen.getByRole("tab", { name });
  await user.click(tab);
  const panel = screen.getByRole("tabpanel");
  expect(tab).toHaveAttribute("aria-controls", panel.id);
  expect(panel).toHaveAttribute("aria-labelledby", tab.id);
  return panel;
}

describe("WeatherSettingsPanel", () => {
  beforeEach(() => {
    mocks.dispatch.mockReset();
    mocks.requestWeatherRefresh.mockReset();
    mocks.requestWeatherRefresh.mockResolvedValue(mocks.weatherCoordinatorSnapshot);
    mocks.updateGeneralSettings.mockReset();
    mocks.useMinutelyWeatherSnapshot.mockReset();
    mocks.minutelySnapshot = freshSnapshot();
    mocks.useMinutelyWeatherSnapshot.mockImplementation(() => mocks.minutelySnapshot);
    mocks.weatherCache = createWeatherCache();
    Object.assign(mocks.weatherCoordinatorSnapshot, {
      activeTarget: null,
      cooldownUntil: null,
      error: null,
      lastSuccessAt: Date.parse("2026-07-17T10:00:00+08:00"),
      nextRefreshAt: Date.parse("2026-07-17T10:05:00+08:00"),
      reason: null,
      requestsThisHour: 3,
      status: "ready",
      updatedAt: 1,
    });
  });

  it("天气提醒中不再显示分钟级降水弹窗开关", () => {
    render(<WeatherSettingsPanel section="alerts" />);

    expect(screen.getByRole("switch", { name: "天气预警弹窗" })).toBeInTheDocument();
    expect(screen.queryByRole("switch", { name: "分钟级降水提醒" })).not.toBeInTheDocument();
    expect(mocks.useMinutelyWeatherSnapshot).toHaveBeenCalledWith(false);
  });

  it("天气刷新与定位设置互不显示对方控件", () => {
    const { rerender } = render(<WeatherSettingsPanel section="refresh" />);

    expect(screen.getByRole("radiogroup", { name: "刷新档位" })).toBeInTheDocument();
    expect(screen.queryByRole("radiogroup", { name: "定位方式" })).not.toBeInTheDocument();

    rerender(<WeatherSettingsPanel section="location" />);

    expect(screen.getByRole("radiogroup", { name: "定位方式" })).toBeInTheDocument();
    expect(screen.queryByRole("radiogroup", { name: "刷新档位" })).not.toBeInTheDocument();
  });

  it("天气调度展示四档、运行状态和可展开请求保护", async () => {
    const user = userEvent.setup();
    render(<WeatherSettingsPanel section="refresh" />);

    const profileGroup = screen.getByRole("radiogroup", { name: "刷新档位" });
    for (const profile of ["保守", "均衡", "高频", "自定义"]) {
      expect(within(profileGroup).getByRole("radio", { name: profile })).toBeInTheDocument();
    }
    expect(screen.getByText("3 / 120")).toBeInTheDocument();
    const requestSafetyButton = screen.getByRole("button", { name: "请求保护" });
    expect(requestSafetyButton).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByLabelText("最小请求间隔")).not.toBeVisible();

    await user.click(requestSafetyButton);

    expect(requestSafetyButton).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByLabelText("最小请求间隔")).toBeVisible();
    expect(screen.getByLabelText("每小时请求上限")).toBeVisible();

    await user.clear(screen.getByLabelText("每小时请求上限"));
    await user.type(screen.getByLabelText("每小时请求上限"), "80");
    await user.click(screen.getByRole("button", { name: "恢复默认值" }));

    expect(screen.getByLabelText("最小请求间隔")).toHaveValue(2);
    expect(screen.getByLabelText("每小时请求上限")).toHaveValue(120);
  });

  it("天气调度区分请求保护、冷却和失败后使用缓存", () => {
    const { rerender } = render(<WeatherSettingsPanel section="refresh" />);

    mocks.weatherCoordinatorSnapshot.status = "rate-limited";
    rerender(<WeatherSettingsPanel section="refresh" />);
    expect(screen.getAllByText("等待请求保护")).not.toHaveLength(0);

    mocks.weatherCoordinatorSnapshot.status = "cooldown";
    rerender(<WeatherSettingsPanel section="refresh" />);
    expect(screen.getAllByText("冷却中")).not.toHaveLength(0);

    mocks.weatherCoordinatorSnapshot.status = "error-with-cache";
    rerender(<WeatherSettingsPanel section="refresh" />);
    expect(screen.getAllByText("失败，使用缓存")).not.toHaveLength(0);
  });

  it("自定义调度与请求保护按 v6 嵌套结构保存", async () => {
    const user = userEvent.setup();
    let save: (() => void) | undefined;
    render(
      <WeatherSettingsPanel
        section="refresh"
        onRegisterSave={(registeredSave) => {
          save = registeredSave;
        }}
      />
    );

    await user.click(screen.getByRole("radio", { name: "自定义" }));
    const values = [
      ["前台全量", "7"],
      ["后台全量", "20"],
      ["分钟无雨", "6"],
      ["分钟临雨/降雨", "3"],
      ["分钟后台", "18"],
    ] as const;
    for (const [label, value] of values) {
      const input = screen.getByLabelText(label);
      await user.clear(input);
      await user.type(input, value);
    }

    await user.click(screen.getByRole("button", { name: "请求保护" }));
    const requestGap = screen.getByLabelText("最小请求间隔");
    await user.clear(requestGap);
    await user.type(requestGap, "4");
    const hourlyLimit = screen.getByLabelText("每小时请求上限");
    await user.clear(hourlyLimit);
    await user.type(hourlyLimit, "120");

    expect(save).toBeTypeOf("function");
    act(() => save?.());

    expect(mocks.updateGeneralSettings).toHaveBeenCalledWith({
      weather: expect.objectContaining({
        schedule: {
          profile: "custom",
          custom: {
            allBackgroundMin: 20,
            allForegroundMin: 7,
            minutelyBackgroundMin: 18,
            minutelyDryMin: 6,
            minutelyRainMin: 3,
          },
          safety: {
            maxRequestsPerHour: 120,
            minRequestGapSec: 4,
          },
        },
      }),
    });
  });

  it("天气数据刷新直接调用协调器，不依赖顶部天气组件", async () => {
    const user = userEvent.setup();
    render(<WeatherSettingsPanel section="live" />);

    await user.click(screen.getByRole("button", { name: "刷新数据" }));

    await waitFor(() =>
      expect(mocks.requestWeatherRefresh).toHaveBeenCalledWith({
        force: true,
        reason: "manual",
        target: "all",
      })
    );
  });

  it("天气数据提供七个关联正确的专题标签并固定展示空值和零值", () => {
    render(<WeatherSettingsPanel section="live" />);

    const tablist = screen.getByRole("tablist", { name: "天气数据分类" });
    const tabs = within(tablist).getAllByRole("tab");
    expect(tabs.map((tab) => tab.textContent)).toEqual([
      "概览",
      "分钟",
      "逐时",
      "逐日",
      "空气",
      "预警",
      "接口",
    ]);

    const panel = screen.getByRole("tabpanel");
    expect(tabs[0]).toHaveAttribute("aria-controls", panel.id);
    expect(panel).toHaveAttribute("aria-labelledby", tabs[0].id);
    expect(screen.getByText("相对湿度").parentElement).toHaveTextContent("0%");
    expect(screen.getAllByText("紫外线指数")[0].parentElement).toHaveTextContent("0");
    expect(screen.getAllByText("能见度")[0].parentElement).toHaveTextContent("暂无");
    expect(screen.getByText("洗车指数").parentElement).toHaveTextContent("暂无");
    expect(screen.getByText("自定义指数值")).toBeInTheDocument();
  });

  it("分钟标签展示供应商字段、运行时统计、完整样本和所有状态字段", async () => {
    render(<WeatherSettingsPanel section="live" />);

    const panel = await openTab("分钟");
    expect(within(panel).getByText("分钟接口")).toBeInTheDocument();
    expect(within(panel).getByText("十五分钟后有小雨")).toBeInTheDocument();
    expect(within(panel).getByText("20 / 80")).toBeInTheDocument();
    expect(within(panel).getByText("0.4 mm")).toBeInTheDocument();
    expect(within(panel).getByText("否")).toBeInTheDocument();
    expect(within(panel).getByText("minute-raw-v1")).toBeInTheDocument();
    const samples = within(panel).getByRole("region", { name: "全部分钟降水样本" });
    expect(samples).toHaveTextContent("0.2 mm");
    expect(samples.querySelectorAll("tbody tr")).toHaveLength(3);
    expect(within(panel).getByLabelText("未来两小时分钟降水强度")).toBeInTheDocument();
  });

  it("分钟新鲜数据失效时回退全量接口内嵌分钟数据", async () => {
    mocks.minutelySnapshot = freshSnapshot({
      freshness: "stale",
      stale: true,
      status: "stale",
    });
    render(<WeatherSettingsPanel section="live" />);

    const panel = await openTab("分钟");
    expect(within(panel).getByText("全量接口回退")).toBeInTheDocument();
    expect(within(panel).getByText("全量接口摘要")).toBeInTheDocument();
    expect(within(panel).getByText("30 / 70")).toBeInTheDocument();
    expect(within(panel).getByText("embedded-v2")).toBeInTheDocument();
  });

  it("逐时和逐日标签展示接口返回的全部记录及昨日对照", async () => {
    render(<WeatherSettingsPanel section="live" />);

    let panel = await openTab("逐时");
    expect(within(panel).getByText("逐时预报 · 3 条")).toBeInTheDocument();
    expect(within(panel).getByText("小雨")).toBeInTheDocument();
    expect(
      within(panel).getByRole("region", { name: "全部逐时天气预报" }).querySelectorAll("tbody tr")
    ).toHaveLength(3);

    panel = await openTab("逐日");
    expect(within(panel).getByText("逐日预报 · 2 天")).toBeInTheDocument();
    expect(within(panel).getByText("2026-07-16")).toBeInTheDocument();
    expect(
      within(panel).getByRole("region", { name: "全部逐日天气预报" }).querySelectorAll("tbody tr")
    ).toHaveLength(2);
  });

  it("空气、预警和接口标签展示污染物、防御信息及两份原始响应", async () => {
    render(<WeatherSettingsPanel section="live" />);

    let panel = await openTab("空气");
    expect(within(panel).getByText("测试监测站")).toBeInTheDocument();
    expect(within(panel).getByText("细颗粒物")).toBeInTheDocument();
    expect(within(panel).getByText("0 μg/m3")).toBeInTheDocument();
    const pollutants = within(panel).getByRole("region", { name: "全部空气污染物" });
    for (const label of ["PM2.5", "PM10", "SO₂", "NO₂", "O₃", "CO"]) {
      expect(within(pollutants).getByText(label)).toBeInTheDocument();
    }

    panel = await openTab("预警");
    expect(within(panel).getByText("暴雨蓝色预警")).toBeInTheDocument();
    expect(within(panel).getByText("减少外出 (shield)")).toBeInTheDocument();
    expect(within(panel).getByText("alert-icon.png / alert-notice.png")).toBeInTheDocument();
    expect(within(panel).getByText(/测试台风/)).toBeInTheDocument();

    panel = await openTab("接口");
    expect(within(panel).getByText("weather-all-raw")).toBeInTheDocument();
    expect(within(panel).getByText(/minute-raw-sentinel/)).toBeInTheDocument();
    expect(within(panel).getByText("CWA6")).toBeInTheDocument();
    expect(within(panel).getByText("rawSentinel")).toBeInTheDocument();
  });

  it("刷新失败时保留原缓存详情并显示失败状态", async () => {
    const user = userEvent.setup();
    mocks.requestWeatherRefresh.mockRejectedValueOnce(new Error("测试刷新失败"));
    render(<WeatherSettingsPanel section="live" />);

    await user.click(screen.getByRole("button", { name: "刷新数据" }));

    await waitFor(() => expect(screen.getByText("失败")).toBeInTheDocument());
    expect(screen.getAllByText("多云")).not.toHaveLength(0);
    expect(screen.getAllByText("气温")[0].parentElement).toHaveTextContent("28℃");
  });

  it("详情缓存坐标不匹配时不展示旧地点详情或旧版当前快照", async () => {
    mocks.weatherCache = {
      ...createWeatherCache(),
      details: {
        ...createWeatherCache().details!,
        location: "116.4080,39.9040",
      },
      now: {
        data: {
          code: "200",
          now: { temp: "99", text: "旧地点天气" },
        },
        updatedAt: Date.now(),
      },
    };

    render(<WeatherSettingsPanel section="live" />);

    expect(screen.queryByText("旧地点天气")).not.toBeInTheDocument();
    expect(screen.queryByText("多云")).not.toBeInTheDocument();
    expect(screen.getByText("暂无天气")).toBeInTheDocument();
    const panel = await openTab("接口");
    expect(within(panel).queryByText(/weather-all-raw/)).not.toBeInTheDocument();
    await waitFor(() => expect(mocks.requestWeatherRefresh).toHaveBeenCalledTimes(1));
  });
});
