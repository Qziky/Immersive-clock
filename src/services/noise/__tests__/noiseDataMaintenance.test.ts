import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  recover: vi.fn().mockResolvedValue(0),
  rescore: vi.fn().mockResolvedValue(undefined),
  warn: vi.fn(),
}));

vi.mock("../noiseFeatureRepository", () => ({
  recoverAbandonedNoiseCaptureSessions: state.recover,
}));

vi.mock("../noiseRescoreService", () => ({
  scheduleNoiseRescore: state.rescore,
}));

vi.mock("../../../utils/logger", () => ({
  logger: { warn: state.warn },
}));

describe("noiseDataMaintenance", () => {
  beforeEach(() => {
    vi.resetModules();
    localStorage.clear();
    state.recover.mockClear();
    state.rescore.mockClear();
    state.warn.mockClear();
  });

  it("启动时幂等清理旧键并在恢复会话后触发重算", async () => {
    [
      "noise-slices",
      "noise-slices-v2",
      "noise-score-slices-v3",
      "immersive-clock:noise-history-message:v3",
    ].forEach((key) => localStorage.setItem(key, "legacy"));
    const { initializeNoiseDataMaintenance } = await import("../noiseDataMaintenance");

    initializeNoiseDataMaintenance();
    initializeNoiseDataMaintenance();

    expect(localStorage.length).toBe(0);
    await vi.waitFor(() => expect(state.rescore).toHaveBeenCalledTimes(1));
    expect(state.recover).toHaveBeenCalledTimes(1);
    expect(state.recover.mock.invocationCallOrder[0]).toBeLessThan(
      state.rescore.mock.invocationCallOrder[0]!
    );
    expect(state.warn).not.toHaveBeenCalled();
  });
});
