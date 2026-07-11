import { beforeEach, describe, expect, it, vi } from "vitest";

import { __resetApiGovernanceForTests, executeGovernedRequest } from "../apiGovernance";

describe("apiGovernance", () => {
  beforeEach(() => {
    __resetApiGovernanceForTests();
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it("同一请求键在软缓存窗口内复用结果", async () => {
    const runner = vi.fn(async () => ({ ok: true, ts: Date.now() }));

    const first = await executeGovernedRequest(
      { apiClass: "xiaomiWeather", requestKey: "xiaomiWeather:/weather/all?locationKey=1" },
      runner
    );
    const second = await executeGovernedRequest(
      { apiClass: "xiaomiWeather", requestKey: "xiaomiWeather:/weather/all?locationKey=1" },
      runner
    );

    expect(first).toEqual(second);
    expect(runner).toHaveBeenCalledTimes(1);
  });

  it("同一请求键并发时复用 in-flight Promise", async () => {
    let resolveTask: (v: number) => void = () => {};
    const runner = vi.fn(
      () =>
        new Promise<number>((resolve) => {
          resolveTask = resolve;
        })
    );

    const p1 = executeGovernedRequest(
      { apiClass: "free", requestKey: "ip:https://ipapi.co/json/" },
      runner
    );
    const p2 = executeGovernedRequest(
      { apiClass: "free", requestKey: "ip:https://ipapi.co/json/" },
      runner
    );

    expect(runner).toHaveBeenCalledTimes(1);
    resolveTask(7);
    await expect(p1).resolves.toBe(7);
    await expect(p2).resolves.toBe(7);
  });

  it("时间同步请求绕过软缓存时仍遵守最小间隔", async () => {
    const runner = vi.fn(async () => ({ timestamp: Date.now() }));
    const options = {
      apiClass: "timesync" as const,
      requestKey: "timesync:https://worldtimeapi.org/api/timezone/Etc/UTC",
      bypassSoftCache: true,
    };

    const first = await executeGovernedRequest(options, runner);
    const second = await executeGovernedRequest(options, runner);

    expect(second).toEqual(first);
    expect(runner).toHaveBeenCalledTimes(1);
  });
});
