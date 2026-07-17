import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("weatherCrossTabLock", () => {
  const originalLocksDescriptor = Object.getOwnPropertyDescriptor(navigator, "locks");

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime("2026-07-17T10:00:00+08:00");
    vi.resetModules();
    localStorage.clear();
    Reflect.deleteProperty(navigator, "locks");
  });

  afterEach(async () => {
    const lock = await import("../weatherCrossTabLock");
    lock.__resetWeatherCrossTabLockForTests();
    if (originalLocksDescriptor) {
      Object.defineProperty(navigator, "locks", originalLocksDescriptor);
    }
    vi.useRealTimers();
  });

  it("Web Locks 不可用时使用带所有者校验的本地租约串行执行", async () => {
    const lock = await import("../weatherCrossTabLock");
    const started: number[] = [];
    const releases: Array<() => void> = [];
    const createTask = (id: number) =>
      lock.withWeatherCrossTabLock(
        () =>
          new Promise<number>((resolve) => {
            started.push(id);
            releases.push(() => resolve(id));
          })
      );

    const first = createTask(1);
    const second = createTask(2);
    await vi.advanceTimersByTimeAsync(500);

    expect(started).toHaveLength(1);
    releases.shift()?.();
    await vi.advanceTimersByTimeAsync(500);
    expect(started).toHaveLength(2);
    releases.shift()?.();

    await expect(Promise.all([first, second])).resolves.toEqual(expect.arrayContaining([1, 2]));
    expect(localStorage.getItem("immersive-clock:xiaomi-weather-lease:v1")).toBeNull();
  });
});
