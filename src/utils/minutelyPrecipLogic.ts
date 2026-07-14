import type { MinutelyPrecipResponse } from "../types/weather";

import { getAdjustedNowMs } from "./timeSync";

export type MinutelyRainPhase = "DRY" | "PRE_RAIN" | "RAINING" | "POST_RAIN";

export interface MinutelyPrecipCacheLike extends Pick<
  MinutelyPrecipResponse,
  "updateTime" | "summary" | "minutely"
> {
  fetchedAt: number;
}

export interface MinutelyRainStats {
  hasRain: boolean;
  probability: number;
  intensityLabel: string;
  startInMinutes: number | null;
  durationMinutes: number | null;
  remainingMinutes: number | null;
  expectedAmountMm: number;
  summary: string;
  isRainingNow: boolean;
  nextRainStartAt: number | null;
  rainStartAt: number | null;
  rainEndAt: number | null;
  leadMinutes: number | null;
  /** 预报时间轴是否来自可解析的服务端时间（而不是本地推断） */
  hasReliableTimestamps?: boolean;
}

/**
 * 解析时间字符串为毫秒时间戳（函数级中文注释：解析失败时返回 null，避免 NaN 进入后续计算）
 */
function parseTimeMs(iso?: string | number): number | null {
  if (iso == null) return null;
  const ms = typeof iso === "number" ? iso : Date.parse(iso);
  return Number.isFinite(ms) ? ms : null;
}

interface RainPoint {
  t: number;
  precip: number;
  /** 该时间点是否由服务端明确给出 */
  reliable: boolean;
}

/**
 * 从服务端时间序列推导每个预报槽位的步长。不同供应商可能返回 1、5 或
 * 其它分钟粒度，因此不能把时间槽硬编码为 5 分钟。
 */
function inferIntervalMs(times: Array<number | null>, fallbackMs = 60 * 1000): number {
  const samples: number[] = [];
  for (let i = 0; i < times.length; i += 1) {
    const current = times[i];
    if (current == null) continue;
    for (let j = i + 1; j < times.length; j += 1) {
      const next = times[j];
      if (next == null) continue;
      const slots = j - i;
      const delta = next - current;
      if (delta > 0 && slots > 0) samples.push(delta / slots);
      break;
    }
  }
  if (samples.length === 0) return fallbackMs;
  samples.sort((a, b) => a - b);
  const middle = Math.floor(samples.length / 2);
  const median =
    samples.length % 2 === 0 ? (samples[middle - 1] + samples[middle]) / 2 : samples[middle];
  // 防止异常时间戳让本地计时器跳到极端值；常见分钟预报仍保持原始精度。
  return Math.max(30 * 1000, Math.min(60 * 60 * 1000, Math.round(median)));
}

function roundMinutes(ms: number): number {
  return Math.max(0, Math.round(ms / 60000));
}

/**
 * 根据降水强度计算雨量级别（函数级中文注释：统一返回展示文案“小雨/中雨/大雨/暴雨”）
 */
function resolveRainIntensityLabel(maxPrecip: number): string {
  if (maxPrecip < 0.1) return "小雨";
  if (maxPrecip < 0.5) return "中雨";
  if (maxPrecip < 1.5) return "大雨";
  return "暴雨";
}

/**
 * 计算分钟级降水统计信息（函数级中文注释：支持“当前是否在下雨”与“未来何时开始/结束”的统一推演）
 */
export function computeMinutelyRainStats(
  cache: MinutelyPrecipCacheLike,
  nowMs = getAdjustedNowMs()
): MinutelyRainStats {
  const list = cache.minutely || [];
  if (list.length === 0) {
    return {
      hasRain: false,
      probability: 0,
      intensityLabel: "降雨",
      startInMinutes: null,
      durationMinutes: null,
      remainingMinutes: null,
      expectedAmountMm: 0,
      summary: "未来两小时暂无降雨。",
      isRainingNow: false,
      nextRainStartAt: null,
      rainStartAt: null,
      rainEndAt: null,
      leadMinutes: null,
      hasReliableTimestamps: false,
    };
  }

  const rawTimes = list.map((m) => parseTimeMs(m.fxTime));
  const intervalMs = inferIntervalMs(rawTimes);
  // updateTime 是服务端发布时刻；仅在 fxTime 缺失时作为序列起点，不能直接
  // 使用当前时间，否则旧缓存会被误报为“现在正在下雨”。
  const baseMs =
    parseTimeMs(cache.updateTime) ?? (Number.isFinite(cache.fetchedAt) ? cache.fetchedAt : null);
  const inferredBase = baseMs ?? nowMs;
  const items: RainPoint[] = list
    .map((m, idx) => {
      const explicit = rawTimes[idx];
      const t = explicit ?? inferredBase + idx * intervalMs;
      const p = m.precip ? Number.parseFloat(m.precip) : 0;
      const precip = Number.isFinite(p) ? p : 0;
      return { t, precip, reliable: explicit != null };
    })
    .sort((a, b) => a.t - b.t)
    .filter((item, idx, sorted) => idx === 0 || item.t > sorted[idx - 1].t);

  if (items.length === 0) {
    return {
      hasRain: false,
      probability: 0,
      intensityLabel: "降雨",
      startInMinutes: null,
      durationMinutes: null,
      remainingMinutes: null,
      expectedAmountMm: 0,
      summary: "未来两小时暂无降雨。",
      isRainingNow: false,
      nextRainStartAt: null,
      rainStartAt: null,
      rainEndAt: null,
      leadMinutes: null,
      hasReliableTimestamps: false,
    };
  }

  const hasReliableTimestamps = items.some((item) => item.reliable);
  const boundaryAfter = (index: number): number => {
    const current = items[index];
    const next = items[index + 1];
    if (next && next.t > current.t) return next.t;
    return current.t + intervalMs;
  };

  const idxNow = (() => {
    for (let i = items.length - 1; i >= 0; i -= 1) {
      if (items[i].t <= nowMs && nowMs < boundaryAfter(i)) return i;
    }
    return -1;
  })();
  const currentItem = idxNow >= 0 ? items[idxNow] : null;
  const isRainingNow = !!currentItem && currentItem.precip > 0;

  const horizon = items.filter((x) => x.t >= nowMs);
  const horizonWithNow = isRainingNow && currentItem ? [currentItem, ...horizon] : horizon;
  // 当前时间已超过预报窗口时，不再回看过去的雨段，避免“雨已结束”仍被
  // 报告为未来降雨。
  const consideredSlots = horizonWithNow;
  const totalSlots = consideredSlots.length;
  const rainySlots = consideredSlots.filter((x) => x.precip > 0);
  const probability = totalSlots > 0 ? Math.round((rainySlots.length / totalSlots) * 100) : 0;

  if (rainySlots.length === 0) {
    return {
      hasRain: false,
      probability,
      intensityLabel: "降雨",
      startInMinutes: null,
      durationMinutes: null,
      remainingMinutes: null,
      expectedAmountMm: 0,
      summary: "未来两小时暂无降雨。",
      isRainingNow: false,
      nextRainStartAt: null,
      rainStartAt: null,
      rainEndAt: null,
      leadMinutes: null,
      hasReliableTimestamps,
    };
  }

  if (isRainingNow && currentItem && idxNow >= 0) {
    let segStart = idxNow;
    while (segStart - 1 >= 0 && items[segStart - 1].precip > 0) segStart -= 1;
    let segEnd = idxNow;
    while (segEnd + 1 < items.length && items[segEnd + 1].precip > 0) segEnd += 1;

    const segment = items.slice(segStart, segEnd + 1);
    const rainStartAt = items[segStart]?.t ?? currentItem.t;
    const nextPoint = items[segEnd + 1];
    // 只有后续明确出现无雨槽位时才能断言结束时间。雨段延伸到预报末尾时，
    // 不能用最后一个推导 interval 伪造停雨时刻。
    const rainEndAt = nextPoint && nextPoint.precip <= 0 ? nextPoint.t : null;
    const durationMinutes = rainEndAt == null ? null : roundMinutes(rainEndAt - rainStartAt);
    const maxPrecip = segment.reduce((mx, x) => Math.max(mx, x.precip), 0);
    const expectedAmountMm = items.slice(idxNow, segEnd + 1).reduce((sum, x) => sum + x.precip, 0);
    const intensityLabel = resolveRainIntensityLabel(maxPrecip);
    const remainingMinutes = rainEndAt == null ? null : roundMinutes(rainEndAt - nowMs);

    return {
      hasRain: true,
      probability,
      intensityLabel,
      startInMinutes: 0,
      durationMinutes,
      remainingMinutes,
      expectedAmountMm,
      summary:
        remainingMinutes == null
          ? `正在${intensityLabel}，未来两小时仍可能有雨。`
          : `正在${intensityLabel}，预计${remainingMinutes}分钟后结束。`,
      isRainingNow: true,
      nextRainStartAt: rainStartAt,
      rainStartAt,
      rainEndAt,
      leadMinutes: 0,
      hasReliableTimestamps,
    };
  }

  const firstRain = rainySlots[0];
  const startInMinutes = Math.max(0, Math.ceil((firstRain.t - nowMs) / 60000));
  const seqSource = horizon.length > 0 ? horizon : items;
  const firstIdx = seqSource.findIndex((x) => x.t === firstRain.t && x.precip > 0);
  const segment: Array<{ t: number; precip: number }> = [];
  for (let i = Math.max(0, firstIdx); i < seqSource.length; i += 1) {
    const x = seqSource[i];
    if (x.precip > 0) segment.push(x);
    else if (segment.length > 0) break;
  }

  const firstSegmentIndex = Math.max(0, firstIdx);
  const lastSegmentIndex = Math.max(firstSegmentIndex, firstSegmentIndex + segment.length - 1);
  const segmentStartAt = seqSource[firstSegmentIndex]?.t ?? firstRain.t;
  const lastSegmentPoint = seqSource[lastSegmentIndex];
  const nextSegmentPoint = seqSource[lastSegmentIndex + 1];
  const segmentEndAt =
    lastSegmentPoint &&
    nextSegmentPoint &&
    nextSegmentPoint.precip <= 0 &&
    nextSegmentPoint.t > lastSegmentPoint.t
      ? nextSegmentPoint.t
      : null;
  const durationMinutes = segmentEndAt == null ? null : roundMinutes(segmentEndAt - segmentStartAt);
  const maxPrecip = segment.reduce((mx, x) => Math.max(mx, x.precip), 0);
  const expectedAmountMm = segment.reduce((sum, x) => sum + x.precip, 0);
  const intensityLabel = resolveRainIntensityLabel(maxPrecip);
  const rainEndAt = segmentEndAt;

  return {
    hasRain: true,
    probability,
    intensityLabel,
    startInMinutes,
    durationMinutes,
    remainingMinutes: null,
    expectedAmountMm,
    summary:
      durationMinutes == null
        ? `预计${startInMinutes}分钟后开始${intensityLabel}，未来两小时仍可能有雨。`
        : `预计${startInMinutes}分钟后开始${intensityLabel}，持续约${durationMinutes}分钟。`,
    isRainingNow: false,
    nextRainStartAt: firstRain.t,
    rainStartAt: firstRain.t,
    rainEndAt,
    leadMinutes: startInMinutes,
    hasReliableTimestamps,
  };
}

/**
 * 根据统计结果推导降水阶段（函数级中文注释：用于驱动“提前提醒/正在降雨提醒/雨停收敛”状态流）
 */
export function resolveMinutelyRainPhase(
  stats: MinutelyRainStats,
  previousPhase: MinutelyRainPhase | null
): MinutelyRainPhase {
  if (stats.isRainingNow) return "RAINING";
  if (stats.hasRain) return "PRE_RAIN";
  if (previousPhase === "RAINING" && !stats.hasRain) return "POST_RAIN";
  return "DRY";
}

/**
 * 判断是否应触发关键时刻加密刷新（函数级中文注释：在“临近开雨/临近停雨”窗口内允许更高时效刷新）
 */
export function shouldTriggerCriticalRefresh(params: {
  phase: MinutelyRainPhase;
  leadMinutes: number | null;
  remainingMinutes: number | null;
  nowMs: number;
  lastApiFetchAt: number;
  lastCriticalFetchAt: number;
  baseIntervalMs: number;
  criticalWindowMinutes?: number;
  minCriticalGapMs?: number;
}): boolean {
  const {
    phase,
    leadMinutes,
    remainingMinutes,
    nowMs,
    lastApiFetchAt,
    lastCriticalFetchAt,
    baseIntervalMs,
    criticalWindowMinutes = 10,
    minCriticalGapMs = 5 * 60 * 1000,
  } = params;

  if (lastApiFetchAt <= 0) return false;
  const elapsed = nowMs - lastApiFetchAt;
  if (elapsed <= 0) return false;
  if (elapsed >= baseIntervalMs) return false;
  if (nowMs - lastCriticalFetchAt < minCriticalGapMs) return false;

  if (
    phase === "PRE_RAIN" &&
    leadMinutes != null &&
    leadMinutes > 0 &&
    leadMinutes <= criticalWindowMinutes
  ) {
    return true;
  }
  if (
    phase === "RAINING" &&
    remainingMinutes != null &&
    remainingMinutes > 0 &&
    remainingMinutes <= criticalWindowMinutes
  ) {
    return true;
  }
  return false;
}
