import { describe, expect, it } from "vitest";

import {
  computeMinutelyRainStats,
  isUsableMinutelyResponse,
  resolveMinutelyRainPhase,
  shouldTriggerCriticalRefresh,
} from "../minutelyPrecipLogic";

/**
 * 构建分钟级测试缓存（函数级中文注释：基于基准时间和5分钟步长生成分钟级降水序列）
 */
function createMinutelyCache(baseMs: number, precipSeries: number[]) {
  return {
    updateTime: new Date(baseMs).toISOString(),
    fetchedAt: baseMs,
    minutely: precipSeries.map((precip, idx) => ({
      fxTime: new Date(baseMs + idx * 5 * 60 * 1000).toISOString(),
      precip: String(precip),
    })),
  };
}

describe("minutelyPrecipLogic", () => {
  it("仅接受状态正常且全部降水样本有效的分钟响应，零值仍有效", () => {
    expect(
      isUsableMinutelyResponse({
        code: "200",
        minutely: [{ precip: "0" }, { precip: "0.2" }],
        provider: {
          flags: { precipitationStatus: 0, responseStatus: 0 },
          raw: { status: 0 },
        },
      })
    ).toBe(true);
    expect(
      isUsableMinutelyResponse({
        code: "200",
        minutely: [{ precip: "" }],
      })
    ).toBe(false);
    expect(
      isUsableMinutelyResponse({
        code: "200",
        minutely: [{ precip: "0.2" }],
        provider: {
          flags: { precipitationStatus: 1, responseStatus: 0 },
          raw: { status: 0 },
        },
      })
    ).toBe(false);
  });

  it("按真实 1 分钟 fxTime 计算雨段时长，而不是固定按 5 分钟计算", () => {
    const base = Date.parse("2026-03-07T10:00:00+08:00");
    const cache = {
      updateTime: new Date(base).toISOString(),
      fetchedAt: base,
      minutely: [0, 0.2, 0.3, 0].map((precip, index) => ({
        fxTime: new Date(base + index * 60 * 1000).toISOString(),
        precip: String(precip),
      })),
    };

    const stats = computeMinutelyRainStats(cache, base + 30 * 1000);

    expect(stats.startInMinutes).toBe(1);
    expect(stats.durationMinutes).toBe(2);
    expect(stats.rainEndAt).toBe(base + 3 * 60 * 1000);
    expect(stats.hasReliableTimestamps).toBe(true);
  });

  it("使用相邻 fxTime 的真实边界计算非固定间隔雨段", () => {
    const base = Date.parse("2026-03-07T10:00:00+08:00");
    const cache = {
      updateTime: new Date(base).toISOString(),
      fetchedAt: base,
      minutely: [
        { fxTime: new Date(base).toISOString(), precip: "0" },
        { fxTime: new Date(base + 2 * 60 * 1000).toISOString(), precip: "0.2" },
        { fxTime: new Date(base + 4 * 60 * 1000).toISOString(), precip: "0.3" },
        { fxTime: new Date(base + 6 * 60 * 1000).toISOString(), precip: "0" },
      ],
    };

    const stats = computeMinutelyRainStats(cache, base + 30 * 1000);

    expect(stats.durationMinutes).toBe(4);
    expect(stats.rainEndAt).toBe(base + 6 * 60 * 1000);
  });

  it("预报窗口已结束时不会把过去的雨段当作未来降雨", () => {
    const base = Date.parse("2026-03-07T10:00:00+08:00");
    const cache = createMinutelyCache(base, [0.2, 0.3, 0]);

    const stats = computeMinutelyRainStats(cache, base + 20 * 60 * 1000);

    expect(stats.hasRain).toBe(false);
    expect(stats.isRainingNow).toBe(false);
  });

  it("正在下雨且雨段延伸到预报末尾时不伪造停雨时间", () => {
    const base = Date.parse("2026-03-07T10:00:00+08:00");
    const cache = createMinutelyCache(base, [0.2, 0.3, 0.4]);

    const stats = computeMinutelyRainStats(cache, base + 60 * 1000);

    expect(stats.isRainingNow).toBe(true);
    expect(stats.rainEndAt).toBeNull();
    expect(stats.remainingMinutes).toBeNull();
    expect(stats.durationMinutes).toBeNull();
    expect(stats.summary).toContain("未来两小时仍可能有雨");
  });

  it("未来雨段延伸到预报末尾时不伪造持续时长", () => {
    const base = Date.parse("2026-03-07T10:00:00+08:00");
    const cache = createMinutelyCache(base, [0, 0.2, 0.3]);

    const stats = computeMinutelyRainStats(cache, base + 60 * 1000);

    expect(stats.isRainingNow).toBe(false);
    expect(stats.hasRain).toBe(true);
    expect(stats.rainEndAt).toBeNull();
    expect(stats.durationMinutes).toBeNull();
    expect(stats.summary).toContain("未来两小时仍可能有雨");
  });

  it("多段降雨只使用最早未来雨段，并在首段结束后切换到下一段", () => {
    const base = Date.parse("2026-03-07T10:00:00+08:00");
    const cache = createMinutelyCache(base, [0, 0.2, 0.3, 0, 0.4, 0.5, 0]);

    const first = computeMinutelyRainStats(cache, base);
    expect(first.rainStartAt).toBe(base + 5 * 60 * 1000);
    expect(first.rainEndAt).toBe(base + 15 * 60 * 1000);
    expect(first.durationMinutes).toBe(10);

    const second = computeMinutelyRainStats(cache, base + 16 * 60 * 1000);
    expect(second.isRainingNow).toBe(false);
    expect(second.rainStartAt).toBe(base + 20 * 60 * 1000);
    expect(second.rainEndAt).toBe(base + 30 * 60 * 1000);
  });

  it("缺失 fxTime 时使用原始更新时间推导且标记时间轴不可靠", () => {
    const base = Date.parse("2026-03-07T10:00:00+08:00");
    const stats = computeMinutelyRainStats(
      {
        updateTime: new Date(base).toISOString(),
        fetchedAt: base + 60 * 60 * 1000,
        minutely: [{ precip: "0.2" }, { precip: "0" }],
      },
      base + 60 * 60 * 1000
    );

    expect(stats.hasRain).toBe(false);
    expect(stats.hasReliableTimestamps).toBe(false);
  });

  it("无雨场景应返回 DRY 且无开始结束时间", () => {
    const base = Date.parse("2026-03-07T10:00:00+08:00");
    const cache = createMinutelyCache(base, [0, 0, 0, 0, 0]);
    const stats = computeMinutelyRainStats(cache, base + 2 * 60 * 1000);
    const phase = resolveMinutelyRainPhase(stats, null);
    expect(stats.hasRain).toBe(false);
    expect(stats.isRainingNow).toBe(false);
    expect(stats.nextRainStartAt).toBeNull();
    expect(stats.rainEndAt).toBeNull();
    expect(phase).toBe("DRY");
  });

  it("将雨场景应返回 PRE_RAIN 且提供开始与结束时间", () => {
    const base = Date.parse("2026-03-07T10:00:00+08:00");
    const cache = createMinutelyCache(base, [0, 0.2, 0.3, 0, 0]);
    const stats = computeMinutelyRainStats(cache, base + 1 * 60 * 1000);
    const phase = resolveMinutelyRainPhase(stats, null);
    expect(stats.hasRain).toBe(true);
    expect(stats.isRainingNow).toBe(false);
    expect(stats.nextRainStartAt).toBe(base + 5 * 60 * 1000);
    expect(stats.rainEndAt).toBe(base + 15 * 60 * 1000);
    expect(stats.leadMinutes).toBeGreaterThan(0);
    expect(phase).toBe("PRE_RAIN");
  });

  it("开雨前不足 30 秒仍保持 PRE_RAIN，不会短暂退回 DRY", () => {
    const base = Date.parse("2026-03-07T10:00:00+08:00");
    const cache = createMinutelyCache(base, [0, 0.2, 0]);
    const stats = computeMinutelyRainStats(cache, base + 4 * 60 * 1000 + 31 * 1000);

    expect(stats.isRainingNow).toBe(false);
    expect(stats.hasRain).toBe(true);
    expect(stats.startInMinutes).toBe(1);
    expect(resolveMinutelyRainPhase(stats, "PRE_RAIN")).toBe("PRE_RAIN");
  });

  it("正在降雨场景应立即识别并给出剩余分钟", () => {
    const base = Date.parse("2026-03-07T10:00:00+08:00");
    const cache = createMinutelyCache(base, [0.2, 0.3, 0, 0, 0]);
    const now = base + 2 * 60 * 1000;
    const stats = computeMinutelyRainStats(cache, now);
    const phase = resolveMinutelyRainPhase(stats, "PRE_RAIN");
    expect(stats.isRainingNow).toBe(true);
    expect(stats.remainingMinutes).not.toBeNull();
    expect(stats.rainEndAt).toBe(base + 10 * 60 * 1000);
    expect(phase).toBe("RAINING");
  });

  it("由降雨转无雨应进入 POST_RAIN 过渡态", () => {
    const base = Date.parse("2026-03-07T10:00:00+08:00");
    const cache = createMinutelyCache(base, [0, 0, 0, 0]);
    const stats = computeMinutelyRainStats(cache, base + 30 * 60 * 1000);
    const phase = resolveMinutelyRainPhase(stats, "RAINING");
    expect(phase).toBe("POST_RAIN");
  });

  it("关键窗口条件满足时应允许加密刷新", () => {
    const shouldRefresh = shouldTriggerCriticalRefresh({
      phase: "PRE_RAIN",
      leadMinutes: 8,
      remainingMinutes: null,
      nowMs: 2000,
      lastApiFetchAt: 1000,
      lastCriticalFetchAt: 0,
      baseIntervalMs: 60 * 60 * 1000,
      criticalWindowMinutes: 10,
      minCriticalGapMs: 500,
    });
    expect(shouldRefresh).toBe(true);
  });

  it("关键窗口不满足时不应触发加密刷新", () => {
    const shouldRefresh = shouldTriggerCriticalRefresh({
      phase: "DRY",
      leadMinutes: null,
      remainingMinutes: null,
      nowMs: 2000,
      lastApiFetchAt: 1000,
      lastCriticalFetchAt: 1900,
      baseIntervalMs: 60 * 60 * 1000,
      criticalWindowMinutes: 10,
      minCriticalGapMs: 500,
    });
    expect(shouldRefresh).toBe(false);
  });
});
