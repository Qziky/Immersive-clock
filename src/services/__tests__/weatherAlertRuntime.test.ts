import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  buildLocationFlow: vi.fn(),
  fetchWeatherAlertsByCoords: vi.fn(),
}));

vi.mock("../locationService", () => ({
  buildLocationFlow: mocks.buildLocationFlow,
}));

vi.mock("../weatherService", () => ({
  fetchWeatherAlertsByCoords: mocks.fetchWeatherAlertsByCoords,
}));

describe("weatherAlertRuntime", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.resetModules();
    mocks.buildLocationFlow.mockReset();
    mocks.fetchWeatherAlertsByCoords.mockReset();
  });

  afterEach(async () => {
    const runtime = await import("../weatherAlertRuntime");
    runtime.__resetWeatherAlertRuntimeForTests();
    vi.useRealTimers();
  });

  it("订阅和本地计时不会自行访问天气接口", async () => {
    const runtime = await import("../weatherAlertRuntime");
    const unsubscribe = runtime.subscribeWeatherAlerts(vi.fn());

    await vi.advanceTimersByTimeAsync(5 * 60 * 1000);

    expect(mocks.buildLocationFlow).not.toHaveBeenCalled();
    expect(mocks.fetchWeatherAlertsByCoords).not.toHaveBeenCalled();
    unsubscribe();
  });

  it("全量天气事件直接注入预警快照", async () => {
    const runtime = await import("../weatherAlertRuntime");
    const stop = runtime.startWeatherAlertRuntime();

    window.dispatchEvent(
      new CustomEvent("weatherRefreshDone", {
        detail: {
          alerts: {
            alerts: [
              {
                expireTime: "2026-07-18T12:00:00+08:00",
                headline: "暴雨蓝色预警",
                id: "alert-1",
                issuedTime: "2026-07-17T09:00:00+08:00",
              },
            ],
            metadata: { tag: "weather-tag" },
          },
          coords: { lat: 31.2, lon: 121.5 },
        },
      })
    );

    expect(runtime.getWeatherAlertSnapshot()).toMatchObject({
      alerts: [{ alert: { id: "alert-1" } }],
      coords: { lat: 31.2, lon: 121.5 },
      metadata: { tag: "weather-tag" },
      revision: 1,
      status: "ready",
    });
    expect(mocks.fetchWeatherAlertsByCoords).not.toHaveBeenCalled();
    stop();
  });

  it("预警按等级、发布时间排序并去重", async () => {
    const runtime = await import("../weatherAlertRuntime");
    const normalized = runtime.normalizeActiveWeatherAlerts(
      [
        {
          color: { code: "蓝色" },
          expireTime: "2026-07-18T12:00:00+08:00",
          headline: "蓝色预警",
          id: "blue",
          issuedTime: "2026-07-17T10:00:00+08:00",
        },
        {
          color: { code: "红色" },
          expireTime: "2026-07-18T12:00:00+08:00",
          headline: "红色预警",
          id: "red",
          issuedTime: "2026-07-17T09:00:00+08:00",
        },
        {
          color: { code: "红色" },
          expireTime: "2026-07-18T12:00:00+08:00",
          headline: "红色预警",
          id: "red",
          issuedTime: "2026-07-17T09:00:00+08:00",
        },
      ],
      Date.parse("2026-07-17T10:00:00+08:00")
    );

    expect(normalized.map((item) => item.alert.id)).toEqual(["red", "blue"]);
  });

  it("本地计时会清理已过期预警", async () => {
    const runtime = await import("../weatherAlertRuntime");
    runtime.ingestWeatherAlertResponse(
      {
        alerts: [
          {
            expireTime: new Date(Date.now() + 30_000).toISOString(),
            headline: "即将过期",
            id: "expiring",
          },
        ],
      },
      { lat: 31.2, lon: 121.5 }
    );
    const stop = runtime.startWeatherAlertRuntime({ localTickMs: 60_000 });

    await vi.advanceTimersByTimeAsync(60_000);

    expect(runtime.getWeatherAlertSnapshot().alerts).toEqual([]);
    stop();
  });
});
