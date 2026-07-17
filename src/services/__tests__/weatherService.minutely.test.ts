import { describe, expect, it, vi } from "vitest";

import { WeatherRequestDeferredError } from "../weatherRequestGuard";
import { adaptMinutely, fetchMinutelyPrecip } from "../weatherService";

const mocks = vi.hoisted(() => ({
  xiaomiWeatherGetJson: vi.fn(),
}));

vi.mock("../xiaomiWeatherClient", () => ({
  withXiaomiWeatherParams: (params: Record<string, string | number | boolean>) =>
    new URLSearchParams(
      Object.entries(params).map(([key, value]) => [key, String(value)])
    ).toString(),
  xiaomiWeatherGetJson: mocks.xiaomiWeatherGetJson,
}));

describe("weatherService adaptMinutely", () => {
  it("保留响应中的真实 fxTime 序列", () => {
    const times = [
      "2026-03-07T10:00:00+08:00",
      "2026-03-07T10:02:00+08:00",
      "2026-03-07T10:04:00+08:00",
    ];

    const result = adaptMinutely({
      status: 0,
      precipitation: {
        pubTime: "2026-03-07T10:00:00+08:00",
        value: [0, 0.2, 0.3],
        fxTime: times,
      },
    });

    expect(result.minutely?.map((item) => item.fxTime)).toEqual(
      times.map((time) => new Date(time).toISOString())
    );
  });

  it("只有 pubTime 时按供应商 interval 推导时间轴", () => {
    const base = Date.parse("2026-03-07T10:00:00+08:00");
    const result = adaptMinutely({
      status: 0,
      precipitation: {
        pubTime: base,
        interval: 2,
        value: [0, 0.2, 0],
      },
    });

    expect(result.minutely?.[1].fxTime).toBe(new Date(base + 2 * 60 * 1000).toISOString());
  });

  it("缺失服务端发布时间时不使用客户端当前时间伪造 fxTime", () => {
    const result = adaptMinutely({
      status: 0,
      precipitation: {
        value: [0, 0.2],
      },
    });

    expect(result.updateTime).toBeUndefined();
    expect(result.minutely?.every((item) => item.fxTime == null)).toBe(true);
  });

  it("保留全量天气内嵌分钟概率、供应商状态和原始响应", () => {
    const raw = {
      minutely: {
        new: "embedded-v2",
        probability: {
          maxProbability: "80",
          probabilityDesc: "稍后有雨",
          probabilityDescV2: "预计十五分钟后有雨",
        },
        precipitation: {
          interval: 1,
          isModify: false,
          probability: [20, 80],
          rainRemainingMinutes: 8,
          status: 0,
          value: [0, 0.2],
        },
        status: 0,
      },
      status: 0,
    };

    const result = adaptMinutely(raw);

    expect(result.provider).toMatchObject({
      flags: {
        isModify: false,
        precipitationStatus: 0,
        responseStatus: 0,
        version: "embedded-v2",
      },
      interval: 1,
      maxProbability: "80",
      probability: [20, 80],
      probabilityDescription: "稍后有雨",
      probabilityDescriptionV2: "预计十五分钟后有雨",
      rainRemainingMinutes: 8,
    });
    expect(result.provider?.raw).toEqual({
      new: "embedded-v2",
      precipitation: raw.minutely.precipitation,
      status: 0,
    });
  });

  it("独立分钟接口保留请求保护的延后执行语义", async () => {
    const deferred = new WeatherRequestDeferredError(Date.now() + 60_000);
    mocks.xiaomiWeatherGetJson.mockRejectedValueOnce(deferred);

    await expect(
      fetchMinutelyPrecip("121.5000,31.2000", {
        lat: 31.2,
        locationKey: "weathercn:101020100",
        lon: 121.5,
      })
    ).rejects.toBe(deferred);
  });
});
