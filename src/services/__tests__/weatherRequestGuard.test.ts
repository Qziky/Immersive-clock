import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { HttpRequestError } from "../httpClient";

const mocks = vi.hoisted(() => ({
  lockTail: Promise.resolve() as Promise<void>,
  locksRequest: vi.fn(),
  maxRequestsPerHour: 60,
  minRequestGapSec: 2,
}));

vi.mock("../../utils/appSettings", () => ({
  getAppSettings: () => ({
    general: {
      weather: {
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
            maxRequestsPerHour: mocks.maxRequestsPerHour,
            minRequestGapSec: mocks.minRequestGapSec,
          },
        },
      },
    },
  }),
}));

describe("weatherRequestGuard", () => {
  const originalLocksDescriptor = Object.getOwnPropertyDescriptor(navigator, "locks");

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.setSystemTime("2026-07-17T10:00:00+08:00");
    localStorage.clear();
    mocks.maxRequestsPerHour = 60;
    mocks.minRequestGapSec = 2;
    mocks.lockTail = Promise.resolve();
    mocks.locksRequest.mockReset();
    mocks.locksRequest.mockImplementation(
      (_name: string, _options: { mode: "exclusive" }, callback: () => Promise<unknown>) => {
        const task = mocks.lockTail.then(callback, callback);
        mocks.lockTail = task.then(
          () => undefined,
          () => undefined
        );
        return task;
      }
    );
    Object.defineProperty(navigator, "locks", {
      configurable: true,
      value: { request: mocks.locksRequest },
    });
    const guard = await import("../weatherRequestGuard");
    guard.__resetWeatherRequestGuardForTests();
  });

  afterEach(() => {
    if (originalLocksDescriptor) {
      Object.defineProperty(navigator, "locks", originalLocksDescriptor);
    } else {
      Reflect.deleteProperty(navigator, "locks");
    }
    vi.useRealTimers();
  });

  it("串行执行请求并遵守最小请求间隔", async () => {
    const guard = await import("../weatherRequestGuard");
    const runner = vi.fn(async () => "ok");

    await expect(guard.executeWeatherRequest(runner)).resolves.toBe("ok");
    const second = guard.executeWeatherRequest(runner);
    await vi.advanceTimersByTimeAsync(1_999);
    expect(runner).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    await expect(second).resolves.toBe("ok");
    expect(runner).toHaveBeenCalledTimes(2);
  });

  it("达到滚动小时上限后返回可排队时间", async () => {
    mocks.maxRequestsPerHour = 10;
    mocks.minRequestGapSec = 1;
    const guard = await import("../weatherRequestGuard");

    for (let index = 0; index < 10; index += 1) {
      const task = guard.executeWeatherRequest(async () => index);
      await vi.advanceTimersByTimeAsync(index === 0 ? 0 : 1_000);
      await task;
    }

    const blocked = guard.executeWeatherRequest(async () => 11);
    await expect(blocked).rejects.toMatchObject({
      name: "WeatherRequestDeferredError",
      retryAt: Date.parse("2026-07-17T11:00:00+08:00"),
    });
    expect(guard.getWeatherRequestGuardSnapshot().requestsThisHour).toBe(10);
  });

  it("429 会持久化 Retry-After 冷却", async () => {
    const guard = await import("../weatherRequestGuard");
    await expect(
      guard.executeWeatherRequest(async () => {
        throw new HttpRequestError("rate limited", "http", "/weather/all", {
          retryAfterMs: 90_000,
          status: 429,
        });
      })
    ).rejects.toThrow("rate limited");

    expect(guard.getWeatherRequestGuardSnapshot().cooldownUntil).toBe(
      Date.parse("2026-07-17T10:01:30+08:00")
    );
    expect(localStorage.getItem("immersive-clock:weather-request-guard:v1")).toContain(
      "cooldownUntil"
    );
  });

  it("403 使用两小时本机冷却", async () => {
    const guard = await import("../weatherRequestGuard");
    await expect(
      guard.executeWeatherRequest(async () => {
        throw new HttpRequestError("forbidden", "http", "/weather/all", {
          status: 403,
        });
      })
    ).rejects.toThrow("forbidden");

    expect(guard.getWeatherRequestGuardSnapshot().cooldownUntil).toBe(
      Date.parse("2026-07-17T12:00:00+08:00")
    );
  });

  it("分钟接口在同设备标签页之间共享 60 秒硬间隔", async () => {
    const firstGuard = await import("../weatherRequestGuard");
    const firstRunner = vi.fn(async () => "first");
    await expect(firstGuard.executeWeatherRequest(firstRunner, "minutely")).resolves.toBe("first");

    vi.resetModules();
    const secondGuard = await import("../weatherRequestGuard");
    const secondRunner = vi.fn(async () => "second");
    await expect(secondGuard.executeWeatherRequest(secondRunner, "minutely")).rejects.toMatchObject(
      {
        name: "WeatherRequestDeferredError",
        retryAt: Date.parse("2026-07-17T10:01:00+08:00"),
      }
    );

    expect(firstRunner).toHaveBeenCalledTimes(1);
    expect(secondRunner).not.toHaveBeenCalled();
    expect(mocks.locksRequest).toHaveBeenCalledTimes(2);
  });

  it("持久化最近尝试、成功、下次允许时间和端点时间", async () => {
    const guard = await import("../weatherRequestGuard");
    await guard.executeWeatherRequest(async () => "ok", "all");

    const raw = JSON.parse(
      localStorage.getItem("immersive-clock:weather-request-guard:v1") || "{}"
    );
    expect(raw).toMatchObject({
      endpointLastAttemptAt: {
        all: Date.parse("2026-07-17T10:00:00+08:00"),
      },
      endpointLastSuccessAt: {
        all: Date.parse("2026-07-17T10:00:00+08:00"),
      },
      lastAttemptAt: Date.parse("2026-07-17T10:00:00+08:00"),
      lastSuccessAt: Date.parse("2026-07-17T10:00:00+08:00"),
      nextAllowedAt: Date.parse("2026-07-17T10:01:00+08:00"),
      version: 2,
    });
  });
});
