import React, { useEffect, useMemo, useRef, useState } from "react";

import type { NoiseSliceSummary } from "../../types/noise";
import {
  Button as FormButton,
  LineChart,
  MetricCard,
  Modal,
  RadioGroup,
  type ChartLineSeries,
  type ChartTick,
} from "../../ui";
import { getNoiseControlSettings } from "../../utils/noiseControlSettings";
import { readNoiseSlices, subscribeNoiseSlicesUpdated } from "../../utils/noiseSliceService";

import styles from "./NoiseReportModal.module.css";

export interface NoiseReportPeriod {
  id: string;
  name: string;
  start: Date;
  end: Date;
}

interface NoiseReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onBack?: () => void;
  period: NoiseReportPeriod | null;
}

type ReportMetric = "quietness-score" | "estimated-dba";

const COLORS = {
  excellent: "var(--ui-color-accent)",
  good: "var(--ui-color-info)",
  fair: "var(--ui-color-warning)",
  poor: "var(--ui-color-danger)",
  sustained: "var(--ui-color-warning)",
  time: "var(--ui-color-info)",
  segment: "var(--ui-color-danger)",
} as const;

function formatDuration(durationMs: number): string {
  const seconds = Math.round(durationMs / 1000);
  const minutes = Math.floor(seconds / 60);
  return `${minutes}分${seconds % 60}秒`;
}

function getScoreLevelText(score: number): string {
  if (score >= 90) return "优秀";
  if (score >= 75) return "良好";
  if (score >= 60) return "一般";
  return "较差";
}

function createSegmentedData(
  slices: NoiseSliceSummary[],
  valueOf: (slice: NoiseSliceSummary) => number | null
): Array<{ x: number; y: number } | null> {
  const data: Array<{ x: number; y: number } | null> = [];
  let previous: NoiseSliceSummary | null = null;
  for (const slice of slices) {
    const value = valueOf(slice);
    if (value === null || !Number.isFinite(value)) {
      previous = null;
      continue;
    }
    const typicalDurationMs = Math.max(1, slice.end - slice.start);
    if (previous && slice.start - previous.end > typicalDurationMs * 2) data.push(null);
    data.push({ x: slice.end, y: value });
    previous = slice;
  }
  return data;
}

export const NoiseReportModal: React.FC<NoiseReportModalProps> = ({
  isOpen,
  onClose,
  onBack,
  period,
}) => {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const [slices, setSlices] = useState<NoiseSliceSummary[]>([]);
  const [metric, setMetric] = useState<ReportMetric>("quietness-score");

  useEffect(() => {
    if (!isOpen || !period) {
      setSlices([]);
      return;
    }

    let active = true;
    const refresh = () => {
      void readNoiseSlices({ endFrom: period.start.getTime() })
        .then((nextSlices) => {
          if (active) setSlices(nextSlices);
        })
        .catch(() => {
          if (active) setSlices([]);
        });
    };
    const unsubscribe = subscribeNoiseSlicesUpdated(refresh);
    refresh();
    return () => {
      active = false;
      unsubscribe();
    };
  }, [isOpen, period]);

  const report = useMemo(() => {
    if (!period) return null;
    const startTs = period.start.getTime();
    const endTs = period.end.getTime();
    const periodDurationMs = Math.max(0, endTs - startTs);
    const periodSlices = slices
      .filter((slice) => slice.end >= startTs && slice.start <= endTs)
      .sort((left, right) => left.start - right.start);
    const validSlices = periodSlices.filter(
      (slice): slice is NoiseSliceSummary & { score: number } => slice.score !== null
    );

    let validDurationMs = 0;
    let weightedScore = 0;
    let weightedActivityMean = 0;
    let weightedActivityFloor = 0;
    let weightedEventFactor = 0;
    let estimatedDurationMs = 0;
    let weightedEstimatedDbA = 0;
    let maxEstimatedDbA = -Infinity;
    let segmentCount = 0;
    const distribution = { excellent: 0, good: 0, fair: 0, poor: 0 };

    for (const slice of validSlices) {
      const overlapStart = Math.max(startTs, slice.start);
      const overlapEnd = Math.min(endTs, slice.end);
      const overlapMs = Math.max(0, overlapEnd - overlapStart);
      const sliceDurationMs = Math.max(1, slice.end - slice.start);
      const overlapRatio = overlapMs / sliceDurationMs;
      const sampledDurationMs = Math.min(overlapMs, slice.detail.sampledDurationMs * overlapRatio);
      if (sampledDurationMs <= 0) continue;

      validDurationMs += sampledDurationMs;
      weightedScore += slice.score * sampledDurationMs;
      weightedActivityMean += slice.detail.activityMean * sampledDurationMs;
      weightedActivityFloor += slice.detail.activityFloor * sampledDurationMs;
      weightedEventFactor += slice.detail.eventFactor * sampledDurationMs;
      segmentCount += Math.round(slice.detail.eventCount * overlapRatio);

      if (slice.score >= 90) distribution.excellent += sampledDurationMs;
      else if (slice.score >= 75) distribution.good += sampledDurationMs;
      else if (slice.score >= 60) distribution.fair += sampledDurationMs;
      else distribution.poor += sampledDurationMs;

      if (slice.estimated) {
        estimatedDurationMs += sampledDurationMs;
        weightedEstimatedDbA += slice.estimated.avgDbA * sampledDurationMs;
        maxEstimatedDbA = Math.max(maxEstimatedDbA, slice.estimated.p95DbA);
      }
    }

    const averageScore = validDurationMs > 0 ? weightedScore / validDurationMs : null;
    const hasEstimated = estimatedDurationMs > 0;
    return {
      activityMean: validDurationMs > 0 ? weightedActivityMean / validDurationMs : 0,
      activityFloor: validDurationMs > 0 ? weightedActivityFloor / validDurationMs : 0,
      averageEstimatedDbA: hasEstimated ? weightedEstimatedDbA / estimatedDurationMs : null,
      averageScore,
      excludedDurationMs: Math.max(0, periodDurationMs - validDurationMs),
      hasEstimated,
      maxEstimatedDbA: hasEstimated ? maxEstimatedDbA : null,
      periodDurationMs,
      scoreAlertThreshold: getNoiseControlSettings().scoreAlertThreshold,
      segmentCount,
      slices: validSlices,
      eventFactor: validDurationMs > 0 ? weightedEventFactor / validDurationMs : 0,
      validDurationMs,
      distribution:
        validDurationMs > 0
          ? {
              excellent: distribution.excellent / validDurationMs,
              good: distribution.good / validDurationMs,
              fair: distribution.fair / validDurationMs,
              poor: distribution.poor / validDurationMs,
            }
          : { excellent: 0, good: 0, fair: 0, poor: 0 },
    };
  }, [period, slices]);

  useEffect(() => {
    if (!report?.hasEstimated && metric === "estimated-dba") setMetric("quietness-score");
  }, [metric, report?.hasEstimated]);

  const chart = useMemo(() => {
    if (!period || !report) return null;
    const scoreMode = metric === "quietness-score";
    const data = createSegmentedData(report.slices, (slice) =>
      scoreMode ? slice.score : (slice.estimated?.avgDbA ?? null)
    );
    const values = data.flatMap((point) => (point ? [point.y] : []));
    const yDomain: readonly [number, number] = scoreMode
      ? [0, 100]
      : values.length > 0
        ? [Math.floor(Math.min(...values) - 5), Math.ceil(Math.max(...values) + 5)]
        : [30, 80];
    const yTicks: ChartTick[] = scoreMode
      ? [0, 20, 40, 60, 80, 100].map((value) => ({ value, label: String(value) }))
      : Array.from({ length: 6 }, (_, index) => {
          const value = yDomain[0] + ((yDomain[1] - yDomain[0]) * index) / 5;
          return { value, label: value.toFixed(0) };
        });
    const series: ChartLineSeries[] = [
      {
        id: scoreMode ? "quietness-score" : "estimated-dba",
        label: scoreMode ? "环境安静评分" : "估算 dB(A)",
        data,
        tone: "accent",
        area: true,
        curve: "smooth",
      },
    ];
    return {
      scoreMode,
      series,
      xDomain: [period.start.getTime(), period.end.getTime()] as const,
      yDomain,
      yTicks,
    };
  }, [metric, period, report]);

  const modalTitle = period ? `${period.name} 统计报告` : "统计报告";
  const modalFooter = (
    <div className={styles.footer}>
      <FormButton variant="primary" size="sm" onClick={onBack ?? onClose}>
        {onBack ? "返回" : "关闭"}
      </FormButton>
    </div>
  );

  if (!report || report.validDurationMs <= 0 || report.averageScore === null) {
    return (
      <Modal
        isOpen={isOpen}
        onClose={onClose}
        title={modalTitle}
        maxWidth="xxl"
        className={styles.reportModal}
        bodyPadding="none"
        footer={modalFooter}
      >
        <div className={styles.empty} role="status">
          <strong>该时段暂无有效噪音评分</strong>
          <span>信号恢复且有效覆盖率达到 80% 后，报告才会纳入对应切片。</span>
        </div>
      </Modal>
    );
  }

  const score = Math.round(report.averageScore);
  const coveragePercent =
    report.periodDurationMs > 0 ? (report.validDurationMs / report.periodDurationMs) * 100 : 0;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={modalTitle}
      maxWidth="xxl"
      className={styles.reportModal}
      bodyPadding="none"
      footer={modalFooter}
    >
      <div className={`${styles.container} ${styles.reportContent}`}>
        <section className={styles.section}>
          <h4 className={styles.sectionTitle}>报告概览</h4>
          <div className={styles.overviewGrid}>
            <MetricCard
              className={styles.card}
              label="有效覆盖"
              value={formatDuration(report.validDurationMs)}
            />
            <MetricCard
              className={styles.card}
              label="表现"
              meta={`${getScoreLevelText(score)} · 仅统计有效切片`}
              tone="accent"
              value={`${score} 分`}
            />
            <MetricCard
              className={styles.card}
              label="排除时长"
              value={formatDuration(report.excludedDurationMs)}
            />
            <MetricCard
              className={styles.card}
              label="平均活动度"
              value={`${(report.activityMean * 100).toFixed(0)}%`}
            />
            <MetricCard
              className={styles.card}
              label="持续活动底"
              value={`${(report.activityFloor * 100).toFixed(0)}%`}
            />
            <MetricCard className={styles.card} label="噪音事件" value={report.segmentCount} />
          </div>
        </section>

        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <h4 className={styles.sectionTitle}>环境趋势</h4>
            <RadioGroup
              className={styles.chartSwitch}
              ariaLabel="报告主指标"
              value={metric}
              options={[
                { value: "quietness-score", label: "评分" },
                ...(report.hasEstimated ? [{ value: "estimated-dba", label: "估算 dB(A)" }] : []),
              ]}
              onChange={(value) => setMetric(value as ReportMetric)}
            />
          </div>
          {chart && chart.series[0].data.length >= 2 ? (
            <div ref={chartContainerRef} className={styles.chartWrap}>
              <LineChart
                ariaLabel={chart.scoreMode ? "环境安静评分走势" : "估算 dB(A) 走势"}
                description={
                  chart.scoreMode
                    ? "所选时段内有效窗口的环境安静评分。"
                    : "所选时段内带有效校准快照的估算 dB(A)。"
                }
                series={chart.series}
                xDomain={chart.xDomain}
                yDomain={chart.yDomain}
                yTicks={chart.yTicks}
                thresholds={
                  chart.scoreMode
                    ? [
                        {
                          value: report.scoreAlertThreshold,
                          label: `${report.scoreAlertThreshold.toFixed(0)} 分`,
                          tone: "danger",
                        },
                      ]
                    : []
                }
                showLegend
              />
            </div>
          ) : (
            <div className={`${styles.empty} ${styles.chartEmpty}`}>趋势样本不足</div>
          )}
          <div className={styles.rangeInfo}>
            有效覆盖率 {coveragePercent.toFixed(1)}%；未校准切片只参与评分，不生成估算 dB(A)。
          </div>
        </section>

        <section className={styles.section}>
          <h4 className={styles.sectionTitle}>评分构成</h4>
          <div className={styles.chartGrid}>
            <div className={styles.chartContainer}>
              <div className={styles.chartTitle}>评分分布</div>
              <div className={styles.distributionChart}>
                <div className={styles.distributionBar}>
                  {(
                    [
                      ["excellent", COLORS.excellent],
                      ["good", COLORS.good],
                      ["fair", COLORS.fair],
                      ["poor", COLORS.poor],
                    ] as const
                  ).map(([key, color]) => (
                    <div
                      key={key}
                      className={styles.distributionSegment}
                      style={{
                        width: `${report.distribution[key] * 100}%`,
                        backgroundColor: color,
                      }}
                    />
                  ))}
                </div>
              </div>
              <div className={styles.legend}>
                {(
                  [
                    ["excellent", "优秀", COLORS.excellent],
                    ["good", "良好", COLORS.good],
                    ["fair", "一般", COLORS.fair],
                    ["poor", "较差", COLORS.poor],
                  ] as const
                ).map(([key, label, color]) => (
                  <div className={styles.legendItem} key={key}>
                    <span className={styles.legendColor} style={{ background: color }} />
                    {label} ({(report.distribution[key] * 100).toFixed(0)}%)
                  </div>
                ))}
              </div>
            </div>

            <div className={styles.chartContainer}>
              <div className={styles.chartTitle}>平均评分构成</div>
              <div className={styles.penaltyList}>
                {(
                  [
                    ["平均活动度", report.activityMean, COLORS.sustained],
                    ["持续活动底", report.activityFloor, COLORS.time],
                    ["事件频度", report.eventFactor, COLORS.segment],
                  ] as const
                ).map(([label, value, color]) => (
                  <div className={styles.penaltyItem} key={label}>
                    <span className={styles.penaltyLabel}>{label}</span>
                    <span className={styles.penaltyBarTrack}>
                      <span
                        className={styles.penaltyBarFill}
                        style={{ width: `${value * 100}%`, backgroundColor: color }}
                      />
                    </span>
                    <span className={styles.penaltyValue}>{(value * 100).toFixed(0)}%</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {report.hasEstimated && (
          <section className={styles.section}>
            <h4 className={styles.sectionTitle}>校准读数</h4>
            <div className={styles.calibrationSummary}>
              <MetricCard
                className={styles.card}
                label="平均估算 dB(A)"
                value={`${report.averageEstimatedDbA?.toFixed(1) ?? "—"} dB(A)`}
              />
              <MetricCard
                className={styles.card}
                label="P95 估算 dB(A)"
                value={`${report.maxEstimatedDbA?.toFixed(1) ?? "—"} dB(A)`}
              />
            </div>
          </section>
        )}
      </div>
    </Modal>
  );
};

export default NoiseReportModal;
