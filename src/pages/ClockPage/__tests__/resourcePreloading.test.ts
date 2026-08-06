import { describe, expect, it, vi } from "vitest";

import type { AppMode } from "../../../types";
import { preloadClockPageResources } from "../resourcePreloading";

function createModeLoader(calls: AppMode[], clockGate?: Promise<void>) {
  return async (mode: AppMode) => {
    calls.push(mode);
    if (mode === "clock") await clockGate;
  };
}

describe("后续页面资源预加载", () => {
  it("当前模式完成前不启动任何后续资源", async () => {
    let releaseClock: (() => void) | undefined;
    const clockGate = new Promise<void>((resolve) => {
      releaseClock = resolve;
    });
    const modeCalls: AppMode[] = [];
    const waitForBackgroundOpportunity = vi.fn(async () => true);
    const secondaryLoader = vi.fn(async () => undefined);

    const preloadPromise = preloadClockPageResources({
      currentMode: "clock",
      loadModeComponent: createModeLoader(modeCalls, clockGate),
      secondaryLoaders: [secondaryLoader],
      waitForBackgroundOpportunity,
    });

    expect(modeCalls).toEqual(["clock"]);
    expect(waitForBackgroundOpportunity).not.toHaveBeenCalled();
    expect(secondaryLoader).not.toHaveBeenCalled();

    releaseClock?.();
    await preloadPromise;

    expect(modeCalls).toEqual(["clock", "countdown", "stopwatch", "study"]);
    expect(secondaryLoader).toHaveBeenCalledOnce();
  });

  it("每项后续资源都经过空闲调度并最终全部加载", async () => {
    const modeCalls: AppMode[] = [];
    const waitForBackgroundOpportunity = vi.fn(async () => true);
    const secondaryLoaders = [vi.fn(async () => undefined), vi.fn(async () => undefined)];

    await preloadClockPageResources({
      currentMode: "stopwatch",
      loadModeComponent: createModeLoader(modeCalls),
      secondaryLoaders,
      waitForBackgroundOpportunity,
    });

    expect(modeCalls).toEqual(["stopwatch", "clock", "countdown", "study"]);
    expect(waitForBackgroundOpportunity).toHaveBeenCalledTimes(5);
    secondaryLoaders.forEach((loader) => expect(loader).toHaveBeenCalledOnce());
  });

  it("页面切换后停止尚未开始的后台队列", async () => {
    const modeCalls: AppMode[] = [];
    const waitForBackgroundOpportunity = vi.fn(async () => false);
    const secondaryLoader = vi.fn(async () => undefined);

    await preloadClockPageResources({
      currentMode: "countdown",
      loadModeComponent: createModeLoader(modeCalls),
      secondaryLoaders: [secondaryLoader],
      waitForBackgroundOpportunity,
    });

    expect(modeCalls).toEqual(["countdown"]);
    expect(waitForBackgroundOpportunity).toHaveBeenCalledOnce();
    expect(secondaryLoader).not.toHaveBeenCalled();
  });
});
