import { describe, expect, it } from "vitest";

import {
  createDefaultWeatherScheduleSettings,
  normalizeWeatherScheduleSettings,
  resolveEffectiveWeatherSchedule,
  WEATHER_SCHEDULE_PRESETS,
} from "../weatherSchedule";

describe("weatherSchedule", () => {
  it("新安装默认使用均衡 5 分钟档位", () => {
    const settings = createDefaultWeatherScheduleSettings({});

    expect(settings.profile).toBe("balanced");
    expect(resolveEffectiveWeatherSchedule(settings)).toMatchObject({
      allForegroundMin: 5,
      allBackgroundMin: 15,
      minutelyDryMin: 5,
      minutelyRainMin: 2,
      minutelyBackgroundMin: 15,
      safety: {
        maxRequestsPerHour: 120,
        minRequestGapSec: 2,
      },
    });
  });

  it("三个预设解析为固定频率", () => {
    for (const profile of ["conservative", "balanced", "frequent"] as const) {
      const effective = resolveEffectiveWeatherSchedule({
        ...createDefaultWeatherScheduleSettings({}),
        profile,
      });
      expect(effective).toMatchObject(WEATHER_SCHEDULE_PRESETS[profile]);
    }
  });

  it("环境变量只提供部署默认值并经过合法范围钳制", () => {
    const settings = createDefaultWeatherScheduleSettings({
      VITE_WEATHER_DEFAULT_PROFILE: "frequent",
      VITE_WEATHER_MAX_REQUESTS_PER_HOUR: "9999",
      VITE_WEATHER_MIN_REQUEST_GAP_SEC: "0",
    });

    expect(settings).toMatchObject({
      profile: "frequent",
      safety: {
        maxRequestsPerHour: 600,
        minRequestGapSec: 1,
      },
    });
  });

  it("自定义值保证后台不短于前台且降雨不慢于无雨", () => {
    const settings = normalizeWeatherScheduleSettings(
      {
        profile: "custom",
        custom: {
          allForegroundMin: 20,
          allBackgroundMin: 2,
          minutelyDryMin: 10,
          minutelyRainMin: 30,
          minutelyBackgroundMin: 1,
        },
        safety: {
          maxRequestsPerHour: 0,
          minRequestGapSec: 90,
        },
      },
      { env: {} }
    );

    expect(settings).toMatchObject({
      custom: {
        allForegroundMin: 20,
        allBackgroundMin: 20,
        minutelyDryMin: 10,
        minutelyRainMin: 10,
        minutelyBackgroundMin: 10,
      },
      safety: {
        maxRequestsPerHour: 10,
        minRequestGapSec: 60,
      },
    });
  });

  it("旧刷新间隔迁移为自定义档并保留原频率", () => {
    const settings = normalizeWeatherScheduleSettings(undefined, {
      env: {},
      legacyIntervalMin: 30,
    });

    expect(settings).toMatchObject({
      profile: "custom",
      custom: {
        allForegroundMin: 30,
        allBackgroundMin: 30,
        minutelyDryMin: 30,
        minutelyRainMin: 5,
        minutelyBackgroundMin: 30,
      },
    });
  });
});
