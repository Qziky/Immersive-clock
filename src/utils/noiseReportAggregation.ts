import type { NoiseScoreQuality, NoiseSliceSummary } from "../types/noise";

export interface NoiseScoreDistribution {
  excellent: number;
  good: number;
  fair: number;
  poor: number;
}

export interface NoiseRangeAggregate {
  activityFloor: number;
  activityMean: number;
  averageEstimatedDbA: number | null;
  averageScore: number | null;
  distribution: NoiseScoreDistribution;
  eventFactor: number;
  excludedDurationMs: number;
  hasEstimated: boolean;
  maxEstimatedDbA: number | null;
  periodDurationMs: number;
  slices: Array<NoiseSliceSummary & { score: number }>;
  validDurationMs: number;
}

const QUALITY_RANK: Record<NoiseScoreQuality, number> = {
  high: 3,
  medium: 2,
  low: 1,
  insufficient: 0,
};

function clampRatio(value: number): number {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
}

function compareSlices(
  left: NoiseSliceSummary & { score: number },
  right: NoiseSliceSummary & { score: number }
): number {
  if (left.end !== right.end) return left.end - right.end;
  if (left.detail.coverageRatio !== right.detail.coverageRatio) {
    return right.detail.coverageRatio - left.detail.coverageRatio;
  }
  const qualityDifference = QUALITY_RANK[right.detail.quality] - QUALITY_RANK[left.detail.quality];
  if (qualityDifference !== 0) return qualityDifference;
  if (left.start !== right.start) return left.start - right.start;
  return left.id.localeCompare(right.id);
}

/**
 * 聚合滚动噪音评分窗口（函数级注释：每个后续窗口仅贡献超出已覆盖终点的新增时间，
 * 避免 60 秒窗口按 5 秒频率生成时重复累计覆盖、评分权重和环境特征）
 */
export function aggregateNoiseSlicesForRange(
  slices: readonly NoiseSliceSummary[],
  startTs: number,
  endTs: number
): NoiseRangeAggregate {
  const periodDurationMs = Math.max(0, endTs - startTs);
  const candidates = slices
    .filter(
      (slice): slice is NoiseSliceSummary & { score: number } =>
        slice.score !== null && slice.end > startTs && slice.start < endTs
    )
    .slice()
    .sort(compareSlices);

  let coveredUntil = startTs;
  let weightedDurationMs = 0;
  let weightedScore = 0;
  let weightedActivityMean = 0;
  let weightedActivityFloor = 0;
  let weightedEventFactor = 0;
  let estimatedDurationMs = 0;
  let weightedEstimatedDbA = 0;
  let maxEstimatedDbA = -Infinity;
  const contributingSlices: Array<NoiseSliceSummary & { score: number }> = [];
  const distributionDuration = { excellent: 0, good: 0, fair: 0, poor: 0 };

  for (const slice of candidates) {
    const overlapStart = Math.max(startTs, slice.start);
    const overlapEnd = Math.min(endTs, slice.end);
    const contributionStart = Math.max(overlapStart, coveredUntil);
    const contributionDurationMs = Math.max(0, overlapEnd - contributionStart);
    coveredUntil = Math.max(coveredUntil, overlapEnd);
    if (contributionDurationMs <= 0) continue;

    const validContributionMs = contributionDurationMs * clampRatio(slice.detail.coverageRatio);
    if (validContributionMs <= 0) continue;

    contributingSlices.push(slice);
    weightedDurationMs += validContributionMs;
    weightedScore += slice.score * validContributionMs;
    weightedActivityMean += slice.detail.activityMean * validContributionMs;
    weightedActivityFloor += slice.detail.activityFloor * validContributionMs;
    weightedEventFactor += slice.detail.eventFactor * validContributionMs;

    if (slice.score >= 90) distributionDuration.excellent += validContributionMs;
    else if (slice.score >= 75) distributionDuration.good += validContributionMs;
    else if (slice.score >= 60) distributionDuration.fair += validContributionMs;
    else distributionDuration.poor += validContributionMs;

    if (slice.estimated) {
      estimatedDurationMs += validContributionMs;
      weightedEstimatedDbA += slice.estimated.avgDbA * validContributionMs;
      maxEstimatedDbA = Math.max(maxEstimatedDbA, slice.estimated.p95DbA);
    }
  }

  const validDurationMs = Math.min(periodDurationMs, weightedDurationMs);
  const hasValidDuration = validDurationMs > 0;
  const hasEstimated = estimatedDurationMs > 0;

  return {
    activityFloor: hasValidDuration ? weightedActivityFloor / weightedDurationMs : 0,
    activityMean: hasValidDuration ? weightedActivityMean / weightedDurationMs : 0,
    averageEstimatedDbA: hasEstimated ? weightedEstimatedDbA / estimatedDurationMs : null,
    averageScore: hasValidDuration ? weightedScore / weightedDurationMs : null,
    distribution: hasValidDuration
      ? {
          excellent: distributionDuration.excellent / weightedDurationMs,
          good: distributionDuration.good / weightedDurationMs,
          fair: distributionDuration.fair / weightedDurationMs,
          poor: distributionDuration.poor / weightedDurationMs,
        }
      : { excellent: 0, good: 0, fair: 0, poor: 0 },
    eventFactor: hasValidDuration ? weightedEventFactor / weightedDurationMs : 0,
    excludedDurationMs: Math.max(0, periodDurationMs - validDurationMs),
    hasEstimated,
    maxEstimatedDbA: hasEstimated ? maxEstimatedDbA : null,
    periodDurationMs,
    slices: contributingSlices,
    validDurationMs,
  };
}
