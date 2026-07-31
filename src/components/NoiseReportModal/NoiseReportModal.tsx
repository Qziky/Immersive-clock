import React, { useEffect, useMemo, useState } from "react";

import type { NoiseSliceSummary } from "../../types/noise";
import {
  Button as FormButton,
  LineChart,
  MetricCard,
  Modal,
  Progress,
  RadioGroup,
  StatusPill,
  type ChartLineSeries,
  type ChartTick,
  type UiTone,
} from "../../ui";
import { getNoiseControlSettings } from "../../utils/noiseControlSettings";
import { aggregateNoiseSlicesForRange } from "../../utils/noiseReportAggregation";
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
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor(seconds / 60);
  const remainingMinutes = minutes % 60;
  const remainingSeconds = seconds % 60;
  return hours > 0
    ? `${hours}小时${remainingMinutes}分${remainingSeconds}秒`
    : `${minutes}分${remainingSeconds}秒`;
}

function formatPeriodRange(start: Date, end: Date): string {
  const dateFormatter = new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "numeric",
    day: "numeric",
  });
  const timeFormatter = new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const sameDay =
    start.getFullYear() === end.getFullYear() &&
    start.getMonth() === end.getMonth() &&
    start.getDate() === end.getDate();
  if (sameDay) {
    return `${dateFormatter.format(start)} ${timeFormatter.format(start)}–${timeFormatter.format(end)}`;
  }
  return `${dateFormatter.format(start)} ${timeFormatter.format(start)}–${dateFormatter.format(end)} ${timeFormatter.format(end)}`;
}

function getScoreLevel(score: number): { label: string; tone: UiTone } {
  if (score >= 90) return { label: "优秀", tone: "success" };
  if (score >= 75) return { label: "良好", tone: "accent" };
  if (score >= 60) return { label: "一般", tone: "warning" };
  return { label: "较差", tone: "danger" };
}

function clampCoverageRatio(value: number): number {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
}

function calculateQualifiedDurationMs(
  slices: readonly (NoiseSliceSummary & { score: number })[],
  startTs: number,
  endTs: number,
  minScore: number
): number {
  let coveredUntil = startTs;
  let qualifiedDurationMs = 0;

  for (const slice of slices) {
    const overlapStart = Math.max(startTs, slice.start);
    const overlapEnd = Math.min(endTs, slice.end);
    const contributionStart = Math.max(overlapStart, coveredUntil);
    const contributionDurationMs = Math.max(0, overlapEnd - contributionStart);
    coveredUntil = Math.max(coveredUntil, overlapEnd);
    if (contributionDurationMs <= 0) continue;

    const validContributionMs =
      contributionDurationMs * clampCoverageRatio(slice.detail.coverageRatio);
    if (validContributionMs <= 0 || slice.score < minScore) continue;
    qualifiedDurationMs += validContributionMs;
  }

  return qualifiedDurationMs;
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
    return {
      ...aggregateNoiseSlicesForRange(slices, startTs, endTs),
      scoreAlertThreshold: getNoiseControlSettings().scoreAlertThreshold,
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

  const modalTitle = "噪音统计报告";
  const modalFooter = (
    <div className={styles.footer}>
      <FormButton variant="primary" size="sm" onClick={onBack ?? onClose}>
        {onBack ? "返回" : "关闭"}
      </FormButton>
    </div>
  );

  if (!period || !report || report.validDurationMs <= 0 || report.averageScore === null) {
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
    report.periodDurationMs > 0
      ? Math.min(100, Math.max(0, (report.validDurationMs / report.periodDurationMs) * 100))
      : 0;
  const quietDurationMs = Math.min(
    report.validDurationMs,
    calculateQualifiedDurationMs(
      report.slices,
      period.start.getTime(),
      period.end.getTime(),
      report.scoreAlertThreshold
    )
  );
  const quietRatePercent =
    report.validDurationMs > 0
      ? Math.min(100, Math.max(0, (quietDurationMs / report.validDurationMs) * 100))
      : 0;
  const attentionDurationMs = Math.max(0, report.validDurationMs - quietDurationMs);
  const scoreLevel = getScoreLevel(score);
  const coverageSufficient = coveragePercent >= 80;
  const dataQualitySummary = `数据质量：覆盖 ${coveragePercent.toFixed(1)}% · 有效 ${formatDuration(report.validDurationMs)} · 排除 ${formatDuration(report.excludedDurationMs)}`;

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
        <section className={`${styles.section} ${styles.summarySection}`}>
          <div className={styles.reportIntro}>
            <div className={styles.reportIdentity}>
              <span className={styles.eyebrow}>报告时段</span>
              <h3 className={styles.reportName}>{period.name}</h3>
              <p className={styles.periodRange}>
                {formatPeriodRange(period.start, period.end)} · 共
                {formatDuration(report.periodDurationMs)}
              </p>
            </div>
            <StatusPill tone={coverageSufficient ? "success" : "warning"}>
              {coverageSufficient ? "覆盖充分" : "覆盖有限"}
            </StatusPill>
          </div>
          <div className={styles.summaryGrid}>
            <div className={styles.scoreSummary}>
              <span className={styles.summaryLabel}>环境安静评分</span>
              <div className={styles.scoreRow}>
                <strong className={styles.scoreValue}>{score}</strong>
                <span className={styles.scoreUnit}>分</span>
                <StatusPill tone={scoreLevel.tone}>{scoreLevel.label}</StatusPill>
              </div>
              <p className={styles.summaryDescription}>
                评分越高，环境越安静。仅统计达到单窗口覆盖要求的有效数据。
              </p>
            </div>
            <div className={styles.qualitySummary} role="group" aria-label="安静达标率摘要">
              <div className={styles.qualityHeading}>
                <span className={styles.summaryLabel}>安静达标率</span>
                <strong>{quietRatePercent.toFixed(1)}%</strong>
              </div>
              <p className={styles.summaryDescription}>
                达到提醒阈值的有效时段占比。越高表示越少需要留意。
              </p>
              <Progress value={quietRatePercent} label="安静达标率" />
              <div className={styles.qualityDetails}>
                <div>
                  <span>安静时段</span>
                  <strong>{formatDuration(quietDurationMs)}</strong>
                </div>
                <div>
                  <span>需留意时段</span>
                  <strong>{formatDuration(attentionDurationMs)}</strong>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <div>
              <h3 className={styles.sectionTitle}>环境趋势</h3>
              <p className={styles.sectionDescription}>
                查看安静评分随时间的变化，虚线表示低于提醒阈值的区间。
              </p>
            </div>
            {report.hasEstimated && (
              <RadioGroup
                className={styles.chartSwitch}
                ariaLabel="报告主指标"
                value={metric}
                options={[
                  { value: "quietness-score", label: "评分" },
                  { value: "estimated-dba", label: "估算 dB(A)" },
                ]}
                onChange={(value) => setMetric(value as ReportMetric)}
              />
            )}
          </div>
          {chart && chart.series[0].data.length >= 2 ? (
            <div className={styles.chartWrap}>
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
          <p className={styles.dataQualityNote}>{dataQualitySummary}</p>
          <div className={styles.chartNote}>
            <strong>阅读说明</strong>
            <span>
              {report.hasEstimated
                ? "可切换查看带校准快照的估算 dB(A)；校准不会改变安静评分。"
                : "当前报告没有校准读数；有效窗口仍会参与安静评分。"}
            </span>
          </div>
        </section>

        <section className={styles.section}>
          <h3 className={styles.sectionTitle}>评分依据</h3>
          <p className={styles.sectionDescription}>
            评分分布展示各等级所占时间，环境特征越低表示对安静评分的影响越小。
          </p>
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
                    ["excellent", "优秀", "90–100", COLORS.excellent],
                    ["good", "良好", "75–89", COLORS.good],
                    ["fair", "一般", "60–74", COLORS.fair],
                    ["poor", "较差", "低于 60", COLORS.poor],
                  ] as const
                ).map(([key, label, range, color]) => (
                  <div className={styles.legendItem} key={key}>
                    <span className={styles.legendColor} style={{ background: color }} />
                    <span>
                      {label} {range} · {(report.distribution[key] * 100).toFixed(0)}%
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className={styles.chartContainer}>
              <div className={styles.chartTitle}>影响评分的环境特征</div>
              <div className={styles.penaltyList}>
                {(
                  [
                    ["整体声活动", report.activityMean, COLORS.sustained],
                    ["持续背景声", report.activityFloor, COLORS.time],
                    ["突发声频度", report.eventFactor, COLORS.segment],
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
            <h3 className={styles.sectionTitle}>校准读数</h3>
            <p className={styles.sectionDescription}>
              仅作为经过外部参考校准后的估算值，不改变环境安静评分。
            </p>
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
