import React, { useEffect, useMemo, useRef, useState } from "react";

import type { NoiseSliceSummary } from "../../types/noise";
import { Button as FormButton, MetricCard, Modal, RadioGroup } from "../../ui";
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

const CHART_HEIGHT = 140;
const SMALL_CHART_HEIGHT = 100;
const CHART_PADDING = 24;

/**
 * 格式化持续时间
 * @param ms 毫秒数
 */
function formatDuration(ms: number) {
  const sec = Math.round(ms / 1000);
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}分${s}秒`;
}

/**
 * 格式化分钟
 * @param ms 毫秒数
 */
function formatMinutes(ms: number) {
  const m = Math.round(ms / 60_000);
  return `${m} 分钟`;
}

/**
 * 格式化时间为 HH:MM
 * @param d 日期对象
 */
function formatTimeHHMM(d: Date) {
  return d.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
}

/**
 * 获取得分等级文本
 * @param score 分数
 */
function getScoreLevelText(score: number) {
  if (score >= 90) return "优秀";
  if (score >= 75) return "良好";
  if (score >= 60) return "一般";
  return "较差";
}

/**
 * 计算路径长度
 * @param segments 路径段数组
 */
function calculatePathLength(segments: { x: number; y: number }[][]) {
  let len = 0;
  for (const seg of segments) {
    for (let i = 1; i < seg.length; i++) {
      const dx = seg[i].x - seg[i - 1].x;
      const dy = seg[i].y - seg[i - 1].y;
      len += Math.sqrt(dx * dx + dy * dy);
    }
  }
  return len;
}

/**
 * 获取平滑路径
 * 使用 Catmull-Rom 转 贝塞尔曲线算法，提供更自然的平滑效果
 * @param pts 点数组
 * @param alpha 参数 (0.5 为向心，0.0 为均匀)
 */
function getSmoothPath(pts: { x: number; y: number }[], alpha: number = 0.5) {
  if (pts.length < 2) return "";
  if (pts.length === 2) return `M ${pts[0].x} ${pts[0].y} L ${pts[1].x} ${pts[1].y}`;

  let d = `M ${pts[0].x} ${pts[0].y}`;

  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = i > 0 ? pts[i - 1] : pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = i < pts.length - 2 ? pts[i + 2] : pts[i + 1];

    // 计算控制点
    const getCp = (
      pA: { x: number; y: number },
      pB: { x: number; y: number },
      pC: { x: number; y: number },
      pD: { x: number; y: number }
    ) => {
      const d1 = Math.pow(Math.pow(pB.x - pA.x, 2) + Math.pow(pB.y - pA.y, 2), alpha * 0.5);
      const d2 = Math.pow(Math.pow(pC.x - pB.x, 2) + Math.pow(pC.y - pB.y, 2), alpha * 0.5);
      const d3 = Math.pow(Math.pow(pD.x - pC.x, 2) + Math.pow(pD.y - pC.y, 2), alpha * 0.5);

      let cp1x = pB.x + ((d2 * (pB.x - pA.x)) / (d1 + d2) + (pC.x - pB.x) / 2) / 3;
      let cp1y = pB.y + ((d2 * (pB.y - pA.y)) / (d1 + d2) + (pC.y - pB.y) / 2) / 3;
      let cp2x = pC.x - ((d2 * (pD.x - pC.x)) / (d3 + d2) + (pC.x - pB.x) / 2) / 3;
      let cp2y = pC.y - ((d2 * (pD.y - pC.y)) / (d3 + d2) + (pC.y - pB.y) / 2) / 3;

      // 极端情况回退：如果距离为0
      if (isNaN(cp1x)) {
        cp1x = pB.x + (pC.x - pB.x) / 3;
        cp1y = pB.y + (pC.y - pB.y) / 3;
      }
      if (isNaN(cp2x)) {
        cp2x = pC.x - (pC.x - pB.x) / 3;
        cp2y = pC.y - (pC.y - pB.y) / 3;
      }

      return { cp1x, cp1y, cp2x, cp2y };
    };

    const { cp1x, cp1y, cp2x, cp2y } = getCp(p0, p1, p2, p3);
    d += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2.x} ${p2.y}`;
  }

  return d;
}

/**
 * 噪音统计报告弹窗组件
 */
export const NoiseReportModal: React.FC<NoiseReportModalProps> = ({
  isOpen,
  onClose,
  onBack,
  period,
}) => {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const [chartWidth, setChartWidth] = useState(860);
  const [isGridSingleColumn, setIsGridSingleColumn] = useState(false);
  const [slices, setSlices] = useState<NoiseSliceSummary[]>([]);
  const [isMainChartCombined, setIsMainChartCombined] = useState(() => {
    try {
      const saved = localStorage.getItem("noise-report.is-main-chart-combined");
      return saved === "true";
    } catch {
      return false;
    }
  });

  useEffect(() => {
    localStorage.setItem("noise-report.is-main-chart-combined", String(isMainChartCombined));
  }, [isMainChartCombined]);

  useEffect(() => {
    const measure = () => {
      const w = chartContainerRef.current?.clientWidth || 860;
      setChartWidth(w);
      setIsGridSingleColumn(window.innerWidth <= 768);
    };
    measure();
    window.addEventListener("resize", measure);
    return () => {
      window.removeEventListener("resize", measure);
    };
  }, [isOpen]);

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

  const periodDurationMs = useMemo(() => {
    if (!period) return 0;
    return Math.max(0, period.end.getTime() - period.start.getTime());
  }, [period]);

  const report = useMemo(() => {
    if (!period) return null;
    const startTs = period.start.getTime();
    const endTs = period.end.getTime();
    const thresholdDb = getNoiseControlSettings().maxLevelDb;

    const periodSlices = slices
      .filter((s) => s.end >= startTs && s.start <= endTs)
      .sort((a, b) => a.start - b.start);

    let totalMs = 0;
    let sumAvgDb = 0;
    let maxDb = -Infinity;
    let sumScore = 0;
    let overDurationMs = 0;
    let segmentCount = 0;
    let sumP50 = 0;
    let sumP95 = 0;
    let sumSustainedPenalty = 0;
    let sumTimePenalty = 0;
    let sumSegmentPenalty = 0;

    const distribution = {
      quiet: 0, // < 45
      normal: 0, // 45-60
      loud: 0, // 60-75
      severe: 0, // > 75
    };

    // 与 UI 语义色保持一致，避免报告形成独立配色体系。
    const COLORS = {
      quiet: "var(--ui-color-accent)",
      normal: "var(--ui-color-info)",
      loud: "var(--ui-color-warning)",
      severe: "var(--ui-color-danger)",
      sustained: "var(--ui-color-warning)",
      time: "var(--ui-color-info)",
      segment: "var(--ui-color-danger)",
      score: "var(--ui-color-info)",
      event: "var(--ui-color-danger)",
    };

    const series: { t: number; start: number; v: number; score: number; events: number }[] = [];

    for (const s of periodSlices) {
      const overlapStart = Math.max(startTs, s.start);
      const overlapEnd = Math.min(endTs, s.end);
      const overlapMs = overlapEnd - overlapStart;
      const sliceMs = Math.max(1, s.end - s.start);
      if (overlapMs <= 0) continue;

      const ratio = overlapMs / sliceMs;
      // 使用有效采样时长（sampledDurationMs）作为权重基准，排除采集间隙
      const effectiveOverlapMs = (s.raw.sampledDurationMs ?? sliceMs) * ratio;

      totalMs += effectiveOverlapMs;
      sumAvgDb += s.display.avgDb * effectiveOverlapMs;
      sumScore += s.score * effectiveOverlapMs;
      sumP50 += s.raw.p50Dbfs * effectiveOverlapMs;
      sumP95 += s.raw.p95Dbfs * effectiveOverlapMs;
      if (s.display.p95Db > maxDb) maxDb = s.display.p95Db;

      overDurationMs += s.raw.overRatioDbfs * effectiveOverlapMs;
      segmentCount += Math.round(s.raw.segmentCount * ratio);

      sumSustainedPenalty += s.scoreDetail.sustainedPenalty * effectiveOverlapMs;
      sumTimePenalty += s.scoreDetail.timePenalty * effectiveOverlapMs;
      sumSegmentPenalty += s.scoreDetail.segmentPenalty * effectiveOverlapMs;

      // 分布统计
      const db = s.display.avgDb;
      if (db < 45) distribution.quiet += effectiveOverlapMs;
      else if (db < 60) distribution.normal += effectiveOverlapMs;
      else if (db < 75) distribution.loud += effectiveOverlapMs;
      else distribution.severe += effectiveOverlapMs;

      series.push({
        t: Math.min(Math.max(s.end, startTs), endTs),
        start: Math.max(s.start, startTs),
        v: s.display.avgDb,
        score: s.score,
        events: s.raw.segmentCount,
      });
    }

    const avgDb = totalMs > 0 ? sumAvgDb / totalMs : 0;
    const avgScore = totalMs > 0 ? sumScore / totalMs : 0;
    const p50Dbfs = totalMs > 0 ? sumP50 / totalMs : 0;
    const p95Dbfs = totalMs > 0 ? sumP95 / totalMs : 0;
    const sustainedPenalty = totalMs > 0 ? sumSustainedPenalty / totalMs : 0;
    const timePenalty = totalMs > 0 ? sumTimePenalty / totalMs : 0;
    const segmentPenalty = totalMs > 0 ? sumSegmentPenalty / totalMs : 0;

    const scoreText =
      avgScore >= 90
        ? "整体纪律良好，环境稳定。"
        : avgScore >= 70
          ? "整体尚可，存在一定噪音干扰。"
          : "纪律偏弱，建议关注持续吵闹与频繁事件段。";

    return {
      thresholdDb,
      totalMs,
      avgDb,
      maxDb: maxDb === -Infinity ? 0 : maxDb,
      avgScore,
      overDurationMs,
      segmentCount,
      p50Dbfs,
      p95Dbfs,
      sustainedPenalty,
      timePenalty,
      segmentPenalty,
      distribution:
        totalMs > 0
          ? {
              quiet: distribution.quiet / totalMs,
              normal: distribution.normal / totalMs,
              loud: distribution.loud / totalMs,
              severe: distribution.severe / totalMs,
            }
          : { quiet: 0, normal: 0, loud: 0, severe: 0 },
      series,
      scoreText,
      COLORS,
    };
  }, [period, slices]);

  const chart = useMemo(() => {
    const width = chartWidth;
    const height = CHART_HEIGHT;
    const padding = CHART_PADDING;

    if (!period || !report || report.series.length < 2) {
      return {
        width,
        height,
        padding,
        path: "",
        pathLength: 0,
        areaPath: "",
        scorePath: "",
        scorePathLength: 0,
        maskRects: [] as { x: number; w: number }[],
        pts: [] as { x: number; y: number; scoreY: number; events: number }[],
        eventRateBuckets: [] as { x: number; rate: number; count: number }[],
        maxBucketEventRate: 1,
        xTicks: [] as { x: number; label: string }[],
        yTicks: [] as { y: number; label: string }[],
        scoreTicks: [] as { y: number; label: string }[],
        eventTicks: [] as { y: number; label: string }[],
        maxEvents: 1,
        thresholdY: 0,
        mapX: (_t: number) => 0,
        mapY: (_v: number) => 0,
      };
    }

    const minDb = 0;
    const maxDb = 80;
    const startTs = period.start.getTime();
    const endTs = period.end.getTime();
    const span = Math.max(1, endTs - startTs);
    const mapX = (t: number) => padding + ((t - startTs) / span) * (width - padding * 2);
    const mapY = (v: number) =>
      height - padding - ((v - minDb) / (maxDb - minDb)) * (height - padding * 2);
    const mapScoreY = (v: number) =>
      height - padding - (Math.max(0, Math.min(100, v)) / 100) * (height - padding * 2) * 0.5;
    const maxEvents = Math.max(1, ...report.series.map((s) => s.events));
    const mapEventY = (v: number) => height - padding - (v / maxEvents) * (height - padding * 2);

    const sortedSeries = report.series.slice().sort((a, b) => a.t - b.t);
    const pts = sortedSeries.map((p, i) => {
      // 增加滑动平均滤波 (Moving Average)，进一步平滑原始数据的剧烈抖动
      // 窗口大小为 7，可显著减少毛刺感
      const windowSize = 7;
      const startIdx = Math.max(0, i - Math.floor(windowSize / 2));
      const endIdx = Math.min(sortedSeries.length, i + Math.ceil(windowSize / 2));
      const window = sortedSeries.slice(startIdx, endIdx);

      const avgV = window.reduce((sum, n) => sum + n.v, 0) / window.length;
      const avgScore = window.reduce((sum, n) => sum + n.score, 0) / window.length;

      return {
        t: p.t,
        start: p.start,
        x: mapX(p.t),
        y: mapY(avgV),
        scoreY: mapScoreY(avgScore),
        events: p.events,
      };
    });

    // 将点分为连续的段
    const segments: (typeof pts)[] = [];
    if (pts.length > 0) {
      const sortedDurations = pts.map((p) => Math.max(1, p.t - p.start)).sort((a, b) => a - b);
      const typicalSliceMs =
        sortedDurations.length > 0 ? sortedDurations[Math.floor(sortedDurations.length / 2)] : 0;
      const breakToleranceMs = Math.max(2000, typicalSliceMs * 2);
      let currentSeg = [pts[0]];
      for (let i = 1; i < pts.length; i++) {
        const prev = pts[i - 1];
        const curr = pts[i];
        // 如果当前点开始时间 > 前一点结束时间 + 容差，则视为断开
        if (curr.start > prev.t + breakToleranceMs) {
          segments.push(currentSeg);
          currentSeg = [curr];
        } else {
          currentSeg.push(curr);
        }
      }
      segments.push(currentSeg);
    }

    const path = getSmoothPath(pts);

    const areaPath = segments
      .map((seg) => {
        if (seg.length < 1) return "";
        const line = getSmoothPath(seg);
        const last = seg[seg.length - 1];
        const first = seg[0];
        return `${line} L ${last.x} ${height - padding} L ${first.x} ${height - padding} Z`;
      })
      .join(" ");

    const scorePath = getSmoothPath(pts.map((p) => ({ x: p.x, y: p.scoreY })));
    const scorePathLength = calculatePathLength([pts.map((p) => ({ x: p.x, y: p.scoreY }))]) * 1.15;

    // 生成遮罩矩形，用于隐藏无数据区域
    // 为了防止线宽被裁剪，矩形宽度稍微向两端扩展
    const maskRects = segments
      .map((seg) => {
        if (seg.length === 0) return null;
        const first = seg[0];
        const last = seg[seg.length - 1];
        // 扩展 2px 以覆盖线帽
        const x = first.x - 2;
        const w = Math.max(0, last.x - first.x) + 4;
        return { x, w };
      })
      .filter(Boolean) as { x: number; w: number }[];

    const xTickTs = [startTs, startTs + span / 3, startTs + (span * 2) / 3, endTs].map((t) =>
      Math.round(t)
    );
    const xTicks = xTickTs.map((t) => ({
      x: mapX(t),
      label: formatTimeHHMM(new Date(t)),
    }));
    const yTickVals = [20, 40, 60, 80];
    const yTicks = yTickVals.map((v) => ({
      y: mapY(v),
      label: String(v),
    }));

    const scoreTickVals = [0, 50, 100];
    const scoreTicks = scoreTickVals.map((v) => ({
      y: mapScoreY(v),
      label: String(v),
    }));

    const eventTickVals = [0, maxEvents / 3, (maxEvents * 2) / 3, maxEvents];
    const eventTicks = eventTickVals.map((v) => ({
      y: mapEventY(v),
      label: Number(v.toFixed(1)).toString(),
    }));
    const thresholdY = mapY(report.thresholdDb);

    // 计算完整路径长度（包含跨越空隙的部分），以确保动画连续
    // 由于使用了贝塞尔平滑曲线，实际路径长度会比直线略长，因此增加 15% 的冗余量
    const pathLength = calculatePathLength([pts.map((p) => ({ x: p.x, y: p.y }))]) * 1.15;

    const bucketWidth = 4;
    const numBuckets = Math.max(1, Math.floor((width - padding * 2) / bucketWidth));
    const eventRateBuckets = Array.from({ length: numBuckets }, (_, i) => ({
      x: padding + i * bucketWidth + bucketWidth / 2,
      rate: 0,
      count: 0,
    }));

    pts.forEach((p) => {
      const durationMs = Math.max(1, p.t - p.start);
      const rate = p.events / Math.max(0.1, durationMs / 60_000);
      const bucketIdx = Math.min(
        numBuckets - 1,
        Math.floor(((p.x - padding) / (width - padding * 2)) * numBuckets)
      );
      if (bucketIdx >= 0) {
        eventRateBuckets[bucketIdx].rate += rate;
        eventRateBuckets[bucketIdx].count++;
      }
    });

    eventRateBuckets.forEach((b) => {
      if (b.count > 0) b.rate = b.rate / b.count;
    });

    const maxBucketEventRate = Math.max(1, ...eventRateBuckets.map((b) => b.rate));

    return {
      width,
      height,
      padding,
      path,
      pathLength,
      areaPath,
      scorePath,
      scorePathLength,
      maskRects,
      pts,
      eventRateBuckets,
      maxBucketEventRate,
      xTicks,
      yTicks,
      scoreTicks,
      eventTicks,
      maxEvents,
      thresholdY,
      mapX: (t: number) => mapX(t),
      mapY: (v: number) => mapY(v),
    };
  }, [period, report, chartWidth]);

  const smallChart = useMemo(() => {
    const containerPadding = 24;
    const gridGap = 12;

    const width = isGridSingleColumn
      ? chartWidth - containerPadding
      : (chartWidth - gridGap) / 2 - containerPadding;

    const height = SMALL_CHART_HEIGHT;
    const padding = CHART_PADDING;

    if (!period || !report || report.series.length < 2) {
      return {
        width,
        height,
        padding,
        scorePath: "",
        scorePathLength: 0,
        maskRects: [] as { x: number; w: number }[],
        pts: [] as { x: number; scoreY: number; events: number }[],
        eventBuckets: [] as { x: number; events: number; count: number }[],
        maxBucketEvents: 1,
        xTicks: [] as { x: number; label: string }[],
        yTicks: [] as { y: number; label: string }[],
        eventTicks: [] as { y: number; label: string }[],
      };
    }

    const startTs = period.start.getTime();
    const endTs = period.end.getTime();
    const span = Math.max(1, endTs - startTs);
    const mapX = (t: number) => padding + ((t - startTs) / span) * (width - padding * 2);
    const mapScoreY = (v: number) =>
      height - padding - (Math.max(0, Math.min(100, v)) / 100) * (height - padding * 2);

    const sortedSeries = report.series.slice().sort((a, b) => a.t - b.t);
    const pts = sortedSeries.map((p, i) => {
      const windowSize = 7;
      const startIdx = Math.max(0, i - Math.floor(windowSize / 2));
      const endIdx = Math.min(sortedSeries.length, i + Math.ceil(windowSize / 2));
      const window = sortedSeries.slice(startIdx, endIdx);
      const avgScore = window.reduce((sum, n) => sum + n.score, 0) / window.length;

      return {
        t: p.t,
        start: p.start,
        x: mapX(p.t),
        scoreY: mapScoreY(avgScore),
        events: p.events,
      };
    });

    const segments: (typeof pts)[] = [];
    if (pts.length > 0) {
      let currentSeg = [pts[0]];
      for (let i = 1; i < pts.length; i++) {
        const prev = pts[i - 1];
        const curr = pts[i];
        if (curr.start > prev.t + 2000) {
          segments.push(currentSeg);
          currentSeg = [curr];
        } else {
          currentSeg.push(curr);
        }
      }
      segments.push(currentSeg);
    }

    const maskRects = segments
      .map((seg) => {
        if (seg.length === 0) return null;
        const first = seg[0];
        const last = seg[seg.length - 1];
        const x = first.x - 2;
        const w = Math.max(0, last.x - first.x) + 4;
        return { x, w };
      })
      .filter(Boolean) as { x: number; w: number }[];

    const scorePath = getSmoothPath(pts.map((p) => ({ x: p.x, y: p.scoreY })));
    const scorePathLength = calculatePathLength([pts.map((p) => ({ x: p.x, y: p.scoreY }))]) * 1.15;

    const bucketWidth = 5;
    const numBuckets = Math.max(1, Math.floor((width - padding * 2) / bucketWidth));
    const eventBuckets = Array.from({ length: numBuckets }, (_, i) => ({
      x: padding + i * bucketWidth + bucketWidth / 2,
      events: 0,
      count: 0,
    }));

    pts.forEach((p) => {
      const bucketIdx = Math.min(
        numBuckets - 1,
        Math.floor(((p.x - padding) / (width - padding * 2)) * numBuckets)
      );
      if (bucketIdx >= 0) {
        eventBuckets[bucketIdx].events += p.events;
        eventBuckets[bucketIdx].count++;
      }
    });

    const maxBucketEvents = Math.max(1, ...eventBuckets.map((b) => b.events));

    const xTickTs = [startTs, endTs].map((t) => Math.round(t));
    const xTicks = xTickTs.map((t) => ({
      x: mapX(t),
      label: formatTimeHHMM(new Date(t)),
    }));

    const yTickVals = [0, 50, 100];
    const yTicks = yTickVals.map((v) => ({
      y: mapScoreY(v),
      label: String(v),
    }));

    const maxEvents = Math.max(1, ...report.series.map((s) => s.events));
    const eventTickVals = [0, maxEvents / 2, maxEvents];
    const eventTicks = eventTickVals.map((v) => ({
      y: height - padding - (v / maxEvents) * (height - padding * 2),
      label: Math.round(v).toString(),
    }));

    return {
      width,
      height,
      padding,
      scorePath,
      scorePathLength,
      maskRects,
      pts: pts.map((p) => ({ x: p.x, scoreY: p.scoreY, events: p.events })),
      eventBuckets,
      maxBucketEvents,
      xTicks,
      yTicks,
      eventTicks,
    };
  }, [period, report, chartWidth, isGridSingleColumn]);

  const scoreInfo = useMemo(() => {
    if (!report) return null;
    const s = Math.round(report.avgScore);
    return { score: s, level: getScoreLevelText(s) };
  }, [report]);

  const modalTitle = period ? `${period.name} 统计报告` : "统计报告";
  const modalFooter = (
    <div className={styles.footer}>
      {onBack ? (
        <FormButton variant="primary" size="sm" onClick={onBack}>
          返回
        </FormButton>
      ) : (
        <FormButton variant="primary" size="sm" onClick={onClose}>
          关闭
        </FormButton>
      )}
    </div>
  );

  if (!report || report.totalMs <= 0) {
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
          <strong>该时段暂无噪音数据</strong>
          <span>生成有效的噪音切片后，这里将显示评分与趋势。</span>
        </div>
      </Modal>
    );
  }

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
        <div className={styles.section}>
          <h4 className={styles.sectionTitle}>报告概览</h4>
          <div className={styles.overviewGrid}>
            <MetricCard
              className={styles.card}
              label="时长"
              value={report ? formatMinutes(report.totalMs) : "—"}
            />
            <MetricCard
              className={styles.card}
              label="表现"
              meta={scoreInfo ? `${scoreInfo.level} · ${report.scoreText}` : report.scoreText}
              tone="accent"
              value={scoreInfo ? `${scoreInfo.score} 分` : "—"}
            />
            <MetricCard
              className={styles.card}
              label="峰值"
              value={report ? `${report.maxDb.toFixed(1)} dB` : "—"}
            />
            <MetricCard
              className={styles.card}
              label="平均"
              value={report ? `${report.avgDb.toFixed(1)} dB` : "—"}
            />
            <MetricCard
              className={styles.card}
              label="超阈时长"
              value={report ? formatDuration(report.overDurationMs) : "—"}
            />
            <MetricCard className={styles.card} label="打断次数" value={report.segmentCount} />
          </div>
        </div>

        <div className={styles.section}>
          <h4 className={styles.sectionTitle}>噪音走势</h4>
          {report && report.series.length >= 2 ? (
            <div>
              <div ref={chartContainerRef} className={styles.chartWrap}>
                <svg
                  width={chart.width}
                  height={chart.height}
                  className={styles.chart}
                  viewBox={`0 0 ${chart.width} ${chart.height}`}
                  role="img"
                  aria-labelledby="noise-trend-title noise-trend-description"
                >
                  <title id="noise-trend-title">噪音走势</title>
                  <desc id="noise-trend-description">
                    展示所选时段内的平均噪音、报警阈值以及可选的评分和打断密度。
                  </desc>
                  <defs>
                    <linearGradient
                      id="noiseAreaGradient"
                      x1="0"
                      y1="0"
                      x2="0"
                      y2={chart.height}
                      gradientUnits="userSpaceOnUse"
                    >
                      <stop offset="0%" stopColor="var(--ui-color-accent)" stopOpacity={0.28} />
                      <stop offset="100%" stopColor="var(--ui-color-accent)" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient
                      id="noiseAreaGradientWarning"
                      x1="0"
                      y1="0"
                      x2="0"
                      y2={chart.height}
                      gradientUnits="userSpaceOnUse"
                    >
                      <stop offset="0%" stopColor={report.COLORS.severe} stopOpacity={0.4} />
                      <stop offset="100%" stopColor={report.COLORS.severe} stopOpacity={0} />
                    </linearGradient>
                    <mask id="lineNormalMask">
                      {chart.maskRects.map((r, i) => (
                        <rect
                          key={i}
                          x={r.x}
                          y={chart.thresholdY}
                          width={r.w}
                          height={Math.max(0, chart.height - chart.thresholdY)}
                          fill="white"
                        />
                      ))}
                    </mask>
                    <mask id="lineWarningMask">
                      {chart.maskRects.map((r, i) => (
                        <rect
                          key={i}
                          x={r.x}
                          y={0}
                          width={r.w}
                          height={Math.max(0, chart.thresholdY)}
                          fill="white"
                        />
                      ))}
                    </mask>
                    <mask id="scoreCoverageMaskMain">
                      {chart.maskRects.map((r, i) => (
                        <rect
                          key={i}
                          x={r.x}
                          y={0}
                          width={r.w}
                          height={chart.height}
                          fill="white"
                        />
                      ))}
                    </mask>
                  </defs>

                  {chart.yTicks.map((t) => (
                    <g key={`y-${t.label}`}>
                      <line
                        x1={chart.padding}
                        x2={chart.width - chart.padding}
                        y1={t.y}
                        y2={t.y}
                        className={styles.gridLine}
                      />
                      <text
                        x={chart.padding - 8}
                        y={t.y + 4}
                        textAnchor="end"
                        className={styles.axisLabel}
                      >
                        {t.label}
                      </text>
                    </g>
                  ))}

                  <line
                    x1={chart.padding}
                    y1={chart.thresholdY}
                    x2={chart.width - chart.padding}
                    y2={chart.thresholdY}
                    className={styles.threshold}
                  />

                  {isMainChartCombined && (
                    <path
                      d={chart.scorePath}
                      fill="none"
                      stroke={report.COLORS.score}
                      strokeWidth="1.5"
                      opacity={0.72}
                      mask="url(#scoreCoverageMaskMain)"
                    />
                  )}

                  <mask id="normalMask">
                    <rect
                      x="0"
                      y={chart.thresholdY}
                      width={chart.width}
                      height={chart.height}
                      fill="white"
                    />
                  </mask>
                  <mask id="warningMask">
                    <rect x="0" y="0" width={chart.width} height={chart.thresholdY} fill="white" />
                  </mask>

                  <g>
                    <path
                      d={chart.areaPath}
                      fill="url(#noiseAreaGradient)"
                      className={styles.area}
                      mask="url(#normalMask)"
                    />
                    <path
                      d={chart.areaPath}
                      fill="url(#noiseAreaGradientWarning)"
                      className={styles.area}
                      mask="url(#warningMask)"
                    />
                  </g>

                  {isMainChartCombined
                    ? chart.eventRateBuckets.map((bucket, index) => {
                        if (bucket.count === 0 || bucket.rate <= 0) return null;
                        const barHeight =
                          (bucket.rate / Math.max(1, chart.maxBucketEventRate)) *
                          (chart.height - chart.padding * 2) *
                          0.7;
                        const y = chart.height - chart.padding - barHeight;

                        return (
                          <rect
                            key={index}
                            x={bucket.x - 1.5}
                            y={y}
                            width={3}
                            height={barHeight}
                            fill={report.COLORS.event}
                            opacity={0.42}
                            shapeRendering="crispEdges"
                          />
                        );
                      })
                    : null}

                  <path
                    d={chart.path}
                    className={styles.line}
                    stroke="var(--ui-color-accent)"
                    mask="url(#lineNormalMask)"
                  />
                  <path
                    d={chart.path}
                    className={styles.line}
                    stroke={report.COLORS.severe}
                    mask="url(#lineWarningMask)"
                  />

                  {chart.xTicks.map((t, idx) => (
                    <text
                      key={`x-${idx}`}
                      x={t.x}
                      y={chart.height - 10}
                      textAnchor={
                        idx === 0 ? "start" : idx === chart.xTicks.length - 1 ? "end" : "middle"
                      }
                      className={styles.axisLabel}
                    >
                      {t.label}
                    </text>
                  ))}
                </svg>
              </div>

              <div className={styles.rangeText}>
                <div className={styles.rangeInfo}>
                  统计范围：
                  {period
                    ? `${period.start.toLocaleString()} - ${period.end.toLocaleString()}`
                    : "—"}
                  ； 噪音报警阈值：{report.thresholdDb.toFixed(1)} dB ； 覆盖率：
                  {periodDurationMs > 0
                    ? ((report.totalMs / periodDurationMs) * 100).toFixed(1)
                    : "0.0"}
                  %
                </div>

                <RadioGroup
                  className={styles.chartSwitch}
                  ariaLabel="主图绘制模式"
                  value={isMainChartCombined ? "combined" : "single"}
                  options={[
                    { value: "single", label: "单图" },
                    { value: "combined", label: "三图" },
                  ]}
                  onChange={(value) => setIsMainChartCombined(value === "combined")}
                />
              </div>
            </div>
          ) : (
            <div className={`${styles.empty} ${styles.chartEmpty}`}>趋势样本不足</div>
          )}
        </div>

        <div className={styles.section}>
          <h4 className={styles.sectionTitle}>更多统计</h4>
          {report ? (
            <div className={styles.chartGrid}>
              <div className={styles.chartContainer}>
                <div className={styles.chartTitle}>评分走势 (0-100)</div>
                <svg
                  width={smallChart.width}
                  height={smallChart.height}
                  viewBox={`0 0 ${smallChart.width} ${smallChart.height}`}
                  role="img"
                  aria-labelledby="score-trend-title score-trend-description"
                >
                  <title id="score-trend-title">评分走势</title>
                  <desc id="score-trend-description">展示所选时段内零到一百分的评分变化。</desc>
                  <defs>
                    <mask id="scoreCoverageMaskSmall">
                      {smallChart.maskRects.map((r, i) => (
                        <rect
                          key={i}
                          x={r.x}
                          y={0}
                          width={r.w}
                          height={smallChart.height}
                          fill="white"
                        />
                      ))}
                    </mask>
                  </defs>

                  {smallChart.yTicks.map((t) => (
                    <line
                      key={`sy-${t.label}`}
                      x1={smallChart.padding}
                      x2={smallChart.width - smallChart.padding}
                      y1={t.y}
                      y2={t.y}
                      className={styles.gridLine}
                    />
                  ))}

                  <path
                    d={smallChart.scorePath}
                    fill="none"
                    stroke={report.COLORS.score}
                    strokeWidth="2"
                    opacity={0.9}
                    mask="url(#scoreCoverageMaskSmall)"
                  />

                  {smallChart.xTicks.map((t, idx) => (
                    <text
                      key={`sx-${idx}`}
                      x={t.x}
                      y={smallChart.height - 10}
                      textAnchor={
                        idx === 0
                          ? "start"
                          : idx === smallChart.xTicks.length - 1
                            ? "end"
                            : "middle"
                      }
                      className={styles.axisLabel}
                    >
                      {t.label}
                    </text>
                  ))}
                </svg>
              </div>

              <div className={styles.chartContainer}>
                <div className={styles.chartTitle}>打断次数密度 (次/分)</div>
                <svg
                  width={smallChart.width}
                  height={smallChart.height}
                  viewBox={`0 0 ${smallChart.width} ${smallChart.height}`}
                  role="img"
                  aria-labelledby="event-density-title event-density-description"
                >
                  <title id="event-density-title">打断次数密度</title>
                  <desc id="event-density-description">展示所选时段内每分钟打断次数的分布。</desc>
                  {smallChart.eventTicks.map((t) => (
                    <line
                      key={`ey-${t.label}`}
                      x1={smallChart.padding}
                      x2={smallChart.width - smallChart.padding}
                      y1={t.y}
                      y2={t.y}
                      className={styles.gridLine}
                    />
                  ))}

                  {smallChart.eventBuckets.map((p, i) => {
                    if (p.events === 0) return null;

                    const barHeight =
                      (p.events / Math.max(1, smallChart.maxBucketEvents)) *
                      (smallChart.height - smallChart.padding * 2);
                    const y = smallChart.height - smallChart.padding - barHeight;
                    const barWidth = 3.5;

                    return (
                      <rect
                        key={i}
                        x={p.x - barWidth / 2}
                        y={y}
                        width={barWidth}
                        height={barHeight}
                        fill={report.COLORS.event}
                        opacity={0.8}
                        shapeRendering="crispEdges"
                      />
                    );
                  })}

                  {smallChart.xTicks.map((t, idx) => (
                    <text
                      key={`ex-${idx}`}
                      x={t.x}
                      y={smallChart.height - 10}
                      textAnchor={
                        idx === 0
                          ? "start"
                          : idx === smallChart.xTicks.length - 1
                            ? "end"
                            : "middle"
                      }
                      className={styles.axisLabel}
                    >
                      {t.label}
                    </text>
                  ))}
                </svg>
              </div>

              <div className={styles.chartContainer}>
                <div className={styles.chartTitle}>噪音等级分布</div>
                <div className={styles.distributionChart}>
                  <div className={styles.distributionBar}>
                    <div
                      className={styles.distributionSegment}
                      style={{
                        width: `${report.distribution.quiet * 100}%`,
                        backgroundColor: report.COLORS.quiet,
                      }}
                    />
                    <div
                      className={styles.distributionSegment}
                      style={{
                        width: `${report.distribution.normal * 100}%`,
                        backgroundColor: report.COLORS.normal,
                      }}
                    />
                    <div
                      className={styles.distributionSegment}
                      style={{
                        width: `${report.distribution.loud * 100}%`,
                        backgroundColor: report.COLORS.loud,
                      }}
                    />
                    <div
                      className={styles.distributionSegment}
                      style={{
                        width: `${report.distribution.severe * 100}%`,
                        backgroundColor: report.COLORS.severe,
                      }}
                    />
                  </div>
                </div>
                <div className={styles.legend}>
                  <div className={styles.legendItem}>
                    <div
                      className={styles.legendColor}
                      style={{ background: report.COLORS.quiet }}
                    />
                    安静 ({(report.distribution.quiet * 100).toFixed(0)}%)
                  </div>
                  <div className={styles.legendItem}>
                    <div
                      className={styles.legendColor}
                      style={{ background: report.COLORS.normal }}
                    />
                    正常 ({(report.distribution.normal * 100).toFixed(0)}%)
                  </div>
                  <div className={styles.legendItem}>
                    <div
                      className={styles.legendColor}
                      style={{ background: report.COLORS.loud }}
                    />
                    吵闹 ({(report.distribution.loud * 100).toFixed(0)}%)
                  </div>
                  <div className={styles.legendItem}>
                    <div
                      className={styles.legendColor}
                      style={{ background: report.COLORS.severe }}
                    />
                    极吵 ({(report.distribution.severe * 100).toFixed(0)}%)
                  </div>
                </div>
              </div>

              <div className={styles.chartContainer}>
                <div className={styles.chartTitle}>扣分归因 (越长扣分越多)</div>
                <div className={styles.penaltyList}>
                  <div className={styles.penaltyItem}>
                    <div className={styles.penaltyLabel}>持续</div>
                    <div className={styles.penaltyBarTrack}>
                      <div
                        className={styles.penaltyBarFill}
                        style={{
                          width: `${report.sustainedPenalty * 100}%`,
                          backgroundColor: report.COLORS.sustained,
                        }}
                      />
                    </div>
                    <div className={styles.penaltyValue}>
                      {(report.sustainedPenalty * 100).toFixed(0)}%
                    </div>
                  </div>

                  <div className={styles.penaltyItem}>
                    <div className={styles.penaltyLabel}>时长</div>
                    <div className={styles.penaltyBarTrack}>
                      <div
                        className={styles.penaltyBarFill}
                        style={{
                          width: `${report.timePenalty * 100}%`,
                          backgroundColor: report.COLORS.time,
                        }}
                      />
                    </div>
                    <div className={styles.penaltyValue}>
                      {(report.timePenalty * 100).toFixed(0)}%
                    </div>
                  </div>

                  <div className={styles.penaltyItem}>
                    <div className={styles.penaltyLabel}>打断</div>
                    <div className={styles.penaltyBarTrack}>
                      <div
                        className={styles.penaltyBarFill}
                        style={{
                          width: `${report.segmentPenalty * 100}%`,
                          backgroundColor: report.COLORS.segment,
                        }}
                      />
                    </div>
                    <div className={styles.penaltyValue}>
                      {(report.segmentPenalty * 100).toFixed(0)}%
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className={styles.empty}>暂无更多数据</div>
          )}
        </div>
      </div>
    </Modal>
  );
};

export default NoiseReportModal;
