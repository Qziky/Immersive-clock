import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { NoiseCoordinator } from "../noiseCoordinator";

describe("NoiseCoordinator localStorage lease", () => {
  const originalLocks = navigator.locks;

  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
    Object.defineProperty(navigator, "locks", {
      configurable: true,
      value: undefined,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    localStorage.clear();
    Object.defineProperty(navigator, "locks", {
      configurable: true,
      value: originalLocks,
    });
  });

  it("两个标签竞争时任意时刻只有一个 Leader", async () => {
    const rolesA: string[] = [];
    const rolesB: string[] = [];
    const coordinatorA = new NoiseCoordinator({
      onRoleChange: (role) => rolesA.push(role),
      runAsLeader: vi.fn().mockResolvedValue(undefined),
    });
    const coordinatorB = new NoiseCoordinator({
      onRoleChange: (role) => rolesB.push(role),
      runAsLeader: vi.fn().mockResolvedValue(undefined),
    });

    coordinatorA.start();
    coordinatorB.start();
    await vi.advanceTimersByTimeAsync(100);

    expect(Number(rolesA.includes("leader")) + Number(rolesB.includes("leader"))).toBe(1);
    await vi.advanceTimersByTimeAsync(5_000);
    expect(Number(rolesA.includes("leader")) + Number(rolesB.includes("leader"))).toBe(1);

    await coordinatorA.stop();
    await coordinatorB.stop();
  });

  it("Leader 释放后 Follower 在 5 秒内接管", async () => {
    const leaders: string[] = [];
    const coordinatorA = new NoiseCoordinator({
      onRoleChange: (role) => {
        if (role === "leader") leaders.push("a");
      },
      runAsLeader: vi.fn().mockResolvedValue(undefined),
    });
    const coordinatorB = new NoiseCoordinator({
      onRoleChange: (role) => {
        if (role === "leader") leaders.push("b");
      },
      runAsLeader: vi.fn().mockResolvedValue(undefined),
    });
    coordinatorA.start();
    coordinatorB.start();
    await vi.advanceTimersByTimeAsync(100);
    const firstLeader = leaders[0];

    if (firstLeader === "a") await coordinatorA.stop();
    else await coordinatorB.stop();
    await vi.advanceTimersByTimeAsync(1_000);

    expect(new Set(leaders)).toEqual(new Set(["a", "b"]));
    await coordinatorA.stop();
    await coordinatorB.stop();
  });

  it("页面隐藏会主动释放领导权", async () => {
    const coordinator = new NoiseCoordinator({
      onRoleChange: vi.fn(),
      runAsLeader: vi.fn().mockResolvedValue(undefined),
    });
    coordinator.start();
    await vi.advanceTimersByTimeAsync(100);
    expect(coordinator.ownsLeadership()).toBe(true);

    window.dispatchEvent(new Event("pagehide"));
    await Promise.resolve();

    expect(coordinator.ownsLeadership()).toBe(false);
    await coordinator.stop();
  });
});
