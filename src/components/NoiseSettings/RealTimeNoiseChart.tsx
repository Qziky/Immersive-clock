import React, { useMemo } from "react";

import {
  NOISE_ANALYSIS_FRAME_MS,
  NOISE_ANALYSIS_SLICE_SEC,
  NOISE_REALTIME_CHART_SLICE_COUNT,
} from "../../constants/noise";
import { useNoiseStream } from "../../hooks/useNoiseStream";
import { LineChart, type ChartLineSeries, type ChartTick } from "../../ui";

import styles from "./NoiseSettings.module.css";

export const RealTimeNoiseChart: React.FC = () => {
  const { ringBuffer, maxLevelDb, status } = useNoiseStream();

  const { points, threshold, latest, xDomain, yDomain, yTicks, series } = useMemo(() => {
    const points = ringBuffer.filter(
      (p) => Number.isFinite(p.t) && Number.isFinite(p.displayDb) && Number.isFinite(p.dbfs)
    );
    const threshold = maxLevelDb;
    const latest = points.length ? points[points.length - 1] : null;

    const values = points.map((p) => p.displayDb);
    const minV = values.length ? Math.min(...values, threshold) : threshold - 10;
    const maxV = values.length ? Math.max(...values, threshold) : threshold + 10;
    const pad = Math.max(2, (maxV - minV) * 0.1);
    const yMin = Math.max(20, Math.floor(minV - pad));
    const yMax = Math.min(100, Math.ceil(maxV + pad));

    const fallbackSpanMs = Math.max(
      1,
      NOISE_ANALYSIS_SLICE_SEC * NOISE_REALTIME_CHART_SLICE_COUNT * 1000
    );
    const endTs = points.length ? points[points.length - 1].t : Date.now();
    const startTs = endTs - fallbackSpanMs;
    const span = fallbackSpanMs;

    const niceTicks = (min: number, max: number, count: number) => {
      const step = (max - min) / count;
      const pow10 = Math.pow(10, Math.floor(Math.log10(step)));
      const niceStep = Math.max(1, Math.round(step / pow10) * pow10);
      const start = Math.ceil(min / niceStep) * niceStep;
      const ticks: number[] = [];
      for (let v = start; v <= max; v += niceStep) ticks.push(v);
      return ticks;
    };
    const yTicks: ChartTick[] = niceTicks(yMin, yMax, 5).map((value) => ({
      value,
      label: value.toFixed(0),
    }));

    const gapThresholdMs = Math.max(500, NOISE_ANALYSIS_FRAME_MS * 8);
    const data: ChartLineSeries["data"][number][] = [];
    for (let i = 0; i < points.length; i++) {
      const prev = i > 0 ? points[i - 1] : null;
      const point = points[i];
      if (prev && point.t - prev.t > gapThresholdMs) {
        data.push(null);
      }
      data.push({ x: point.t, y: point.displayDb });
    }
    const series: ChartLineSeries[] =
      data.length > 0
        ? [
            {
              id: "realtime-noise",
              label: "实时噪音",
              data,
              tone: "accent",
              curve: "smooth",
              area: true,
              colorAbove: { value: threshold, tone: "danger" },
            },
          ]
        : [];

    return {
      points,
      threshold,
      latest,
      xDomain: [startTs, startTs + span] as const,
      yDomain: [yMin, yMax] as const,
      yTicks,
      series,
    };
  }, [ringBuffer, maxLevelDb]);

  return (
    <>
      <div className={styles.chartHeader}>
        <div className={styles.chartMetric}>
          <span>警戒线</span>
          <strong>{threshold.toFixed(0)} dB</strong>
        </div>
        <div className={styles.chartMetric}>
          <span>当前环境</span>
          <strong>
            {latest && (status === "quiet" || status === "noisy")
              ? `${latest.displayDb.toFixed(1)} dB`
              : "—"}
          </strong>
        </div>
      </div>
      <LineChart
        ariaLabel="实时噪音折线图"
        description={`最近 ${NOISE_ANALYSIS_SLICE_SEC} 秒的实时环境噪音，警戒线为 ${threshold.toFixed(
          0
        )} 分贝。`}
        series={points.length > 0 ? series : []}
        xDomain={xDomain}
        yDomain={yDomain}
        yTicks={yTicks}
        thresholds={[{ value: threshold, label: `${threshold.toFixed(0)} dB`, tone: "danger" }]}
        emptyMessage="等待噪音样本"
      />
    </>
  );
};

export default RealTimeNoiseChart;
