import React, { useEffect, useMemo, useState } from "react";

import type { NoiseSliceSummary } from "../../types/noise";
import {
  Button as FormButton,
  InfoPanel,
  LineChart,
  MetricCard,
  Modal,
  Progress,
  RadioGroup,
  StatusPill,
  type ChartLineSeries,
  type ChartTick,
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
  score: "var(--ui-color-accent)",
  activityMean: "var(--ui-color-warning)",
  activityFloor: "var(--ui-color-info)",
  eventFactor: "var(--ui-color-danger)",
} as const;

const MIN_DISPLAYED_DEDUCTION = 0.05;
const reportTimeFormatter = new Intl.DateTimeFormat("zh-CN", {
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

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

function formatReportTime(timestamp: number): string {
  return reportTimeFormatter.format(new Date(timestamp));
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
          <span>采集恢复并积累足够有效数据后，将自动生成报告。</span>
        </div>
      </Modal>
    );
  }

  const score = report.averageScore;
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
  const scoreMeetsThreshold = score >= report.scoreAlertThreshold;
  const coverageSufficient = coveragePercent >= 80;
  const dataQualitySummary = `数据质量：覆盖 ${coveragePercent.toFixed(1)}% · 有效 ${formatDuration(report.validDurationMs)} · 排除 ${formatDuration(report.excludedDurationMs)}`;
  const totalDeduction = report.scoreDeductions.total;
  const hasMeaningfulDeduction = totalDeduction >= MIN_DISPLAYED_DEDUCTION;
  const deductionItems = [
    {
      key: "activityMean",
      label: "整体声活动",
      description: "有效时段内声学活动的平均水平。",
      insight: "说明有效时段内总体声音活动相对更明显。",
      value: report.scoreDeductions.activityMean,
      color: COLORS.activityMean,
    },
    {
      key: "activityFloor",
      label: "持续声活动",
      description: "较安静片段中仍持续存在的声学活动。",
      insight: "说明较安静片段中仍存在较多持续声音。",
      value: report.scoreDeductions.activityFloor,
      color: COLORS.activityFloor,
    },
    {
      key: "eventFactor",
      label: "声音事件频度",
      description: "高活动声音事件在有效时段内的出现频度。",
      insight: "说明高活动声音事件出现得更频繁。",
      value: report.scoreDeductions.eventFactor,
      color: COLORS.eventFactor,
    },
  ].map((item) => ({
    ...item,
    share: hasMeaningfulDeduction ? (item.value / totalDeduction) * 100 : 0,
  }));
  const dominantDeduction = deductionItems.reduce((dominant, item) =>
    item.value > dominant.value ? item : dominant
  );
  const lowestScoreSlice = report.slices.reduce<(typeof report.slices)[number] | null>(
    (lowest, slice) => {
      if (!lowest || slice.score < lowest.score) return slice;
      if (slice.score > lowest.score) return lowest;
      if (slice.end < lowest.end) return slice;
      if (slice.end > lowest.end) return lowest;
      return slice.start < lowest.start ? slice : lowest;
    },
    null
  );
  const scoreDifference = score - report.scoreAlertThreshold;
  const scoreComparison =
    Math.abs(scoreDifference) < MIN_DISPLAYED_DEDUCTION
      ? `平均 ${score.toFixed(1)} 分，与提醒线持平`
      : scoreDifference > 0
        ? `平均 ${score.toFixed(1)} 分，高于提醒线 ${scoreDifference.toFixed(1)} 分`
        : `平均 ${score.toFixed(1)} 分，低于提醒线 ${Math.abs(scoreDifference).toFixed(1)} 分`;
  const overallInsight = `${scoreComparison}；有效时段达标率 ${quietRatePercent.toFixed(1)}%，需留意 ${formatDuration(attentionDurationMs)}。`;
  const dominantInsight = hasMeaningfulDeduction
    ? `主要扣分来自${dominantDeduction.label}，约扣 ${dominantDeduction.value.toFixed(1)} 分；${dominantDeduction.insight}`
    : "三项声音活动均未形成明显扣分。";
  const lowestScoreInsight = lowestScoreSlice
    ? `最低 ${lowestScoreSlice.score.toFixed(1)} 分，出现在 ${formatReportTime(lowestScoreSlice.end)} 左右。`
    : "当前有效数据不足以定位最低记录。";
  const dataRangeInsight = coverageSufficient
    ? `报告覆盖 ${coveragePercent.toFixed(1)}%，有效 ${formatDuration(report.validDurationMs)}，结果可代表本时段的大部分情况。`
    : `报告仅覆盖 ${coveragePercent.toFixed(1)}%，结论只代表 ${formatDuration(report.validDurationMs)}有效数据，不代表完整时段。`;
  const compositionSegments = [
    { key: "score", label: "保留得分", value: score, color: COLORS.score },
    ...deductionItems,
  ].filter((segment) => segment.value > 0);
  const compositionDescription = [
    `环境安静评分 ${score.toFixed(1)} 分`,
    ...deductionItems.map((item) => `${item.label}约扣 ${item.value.toFixed(1)} 分`),
  ].join("；");

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
                <strong className={styles.scoreValue}>{score.toFixed(1)}</strong>
                <span className={styles.scoreUnit}>分</span>
                <StatusPill tone={scoreMeetsThreshold ? "success" : "warning"}>
                  {scoreMeetsThreshold ? "平均分达标" : "平均分需留意"}
                </StatusPill>
              </div>
              <p className={styles.summaryDescription}>
                当前提醒线 {report.scoreAlertThreshold.toFixed(0)} 分。评分越高，环境越安静；
                仅基于当前报告中的有效数据。
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
                  { value: "estimated-dba", label: "分贝" },
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
                : "当前报告没有校准读数；安静评分仍可正常查看。"}
            </span>
          </div>
        </section>

        <section className={styles.section}>
          <h3 className={styles.sectionTitle}>评分构成与解读</h3>
          <p className={styles.sectionDescription}>
            展示本时段的实际扣分构成，并总结最需要留意的表现。
          </p>
          <div className={styles.scoringBasisGrid}>
            <InfoPanel className={styles.compositionPanel} title="本次评分构成">
              <div
                className={styles.scoreComposition}
                role="img"
                aria-label={compositionDescription}
              >
                {compositionSegments.map((segment) => (
                  <span
                    aria-hidden="true"
                    className={styles.compositionSegment}
                    key={segment.key}
                    style={{ backgroundColor: segment.color, flexGrow: segment.value }}
                  />
                ))}
              </div>
              <div className={styles.compositionSummary}>
                <span>保留得分 {score.toFixed(1)}</span>
                <span>
                  {hasMeaningfulDeduction
                    ? `共约扣 ${totalDeduction.toFixed(1)} 分`
                    : "本次未产生明显扣分"}
                </span>
              </div>
              <ul className={styles.deductionList} aria-label="评分扣分构成">
                {deductionItems.map((item) => (
                  <li className={styles.deductionItem} key={item.key}>
                    <span
                      aria-hidden="true"
                      className={styles.deductionColor}
                      style={{ backgroundColor: item.color }}
                    />
                    <span className={styles.deductionContent}>
                      <strong>{item.label}</strong>
                      <span>{item.description}</span>
                      <small>占本次扣分 {item.share.toFixed(1)}%</small>
                    </span>
                    <strong className={styles.deductionValue}>
                      约扣 {item.value.toFixed(1)} 分
                    </strong>
                  </li>
                ))}
              </ul>
            </InfoPanel>

            <InfoPanel className={styles.interpretationPanel} title="本时段解读">
              <ul className={styles.interpretationList} aria-label="本时段解读">
                <li>
                  <strong>总体表现</strong>
                  <span>{overallInsight}</span>
                </li>
                <li>
                  <strong>主要影响</strong>
                  <span>{dominantInsight}</span>
                </li>
                <li>
                  <strong>最低记录</strong>
                  <span>{lowestScoreInsight}</span>
                </li>
                <li>
                  <strong>数据范围</strong>
                  <span>{dataRangeInsight}</span>
                </li>
              </ul>
            </InfoPanel>
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
