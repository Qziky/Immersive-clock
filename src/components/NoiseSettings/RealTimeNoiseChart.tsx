import React, { useMemo } from "react";

import { NOISE_REALTIME_WINDOW_SEC } from "../../constants/noise";
import { useNoiseStream } from "../../hooks/useNoiseStream";
import { LineChart, type ChartLineSeries, type ChartTick } from "../../ui";

import styles from "./NoiseSettings.module.css";

interface RealTimeNoiseChartProps {
  enabled?: boolean;
}

export const RealTimeNoiseChart: React.FC<RealTimeNoiseChartProps> = ({ enabled = true }) => {
  const { ringBuffer, primaryMetric, scoreAlertThreshold, status } = useNoiseStream(enabled);

  const chart = useMemo(() => {
    const scoreMode = primaryMetric === "quietness-score";
    const points = ringBuffer
      .map((point) => ({
        t: point.t,
        value: scoreMode ? point.quietnessScore : point.estimatedDbA,
      }))
      .filter((point): point is { t: number; value: number } => Number.isFinite(point.value));
    const latest = points.length > 0 ? points[points.length - 1] : null;
    const values = points.map((point) => point.value);
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
    const data: Array<{ x: number; y: number } | null> = [];
    points.forEach((point, index) => {
      if (index > 0 && point.t - points[index - 1].t > 800) data.push(null);
      data.push({ x: point.t, y: point.value });
    });
    const end = latest?.t ?? Date.now();
    return {
      scoreMode,
      latest,
      yDomain,
      yTicks,
      xDomain: [end - NOISE_REALTIME_WINDOW_SEC * 1000, end] as const,
      series:
        data.length > 0
          ? ([
              {
                id: "realtime-noise",
                label: scoreMode ? "环境安静评分" : "估算 dB(A)",
                data,
                tone: "accent",
                curve: "smooth",
                area: true,
                ...(scoreMode
                  ? { colorAbove: { value: scoreAlertThreshold, tone: "danger" as const } }
                  : {}),
              },
            ] satisfies ChartLineSeries[])
          : [],
    };
  }, [primaryMetric, ringBuffer, scoreAlertThreshold]);

  const latestText =
    chart.latest && (status === "quiet" || status === "noisy")
      ? chart.scoreMode
        ? `${chart.latest.value.toFixed(1)} 分`
        : `${chart.latest.value.toFixed(1)} dB(A) 估算`
      : "—";

  return (
    <>
      <div className={styles.chartHeader}>
        <div className={styles.chartMetric}>
          <span>{chart.scoreMode ? "提醒分数" : "显示口径"}</span>
          <strong>{chart.scoreMode ? `${scoreAlertThreshold.toFixed(0)} 分` : "估算 dB(A)"}</strong>
        </div>
        <div className={styles.chartMetric}>
          <span>当前环境</span>
          <strong>{latestText}</strong>
        </div>
      </div>
      <LineChart
        ariaLabel={chart.scoreMode ? "实时环境评分折线图" : "实时估算 dB(A) 折线图"}
        description={`最近 ${NOISE_REALTIME_WINDOW_SEC} 秒的${chart.scoreMode ? "环境安静评分" : "校准后估算 dB(A)"}。`}
        series={chart.series}
        xDomain={chart.xDomain}
        yDomain={chart.yDomain}
        yTicks={chart.yTicks}
        thresholds={
          chart.scoreMode
            ? [
                {
                  value: scoreAlertThreshold,
                  label: `${scoreAlertThreshold.toFixed(0)} 分`,
                  tone: "danger",
                },
              ]
            : []
        }
        emptyMessage={primaryMetric === "estimated-dba" ? "等待校准后的有效样本" : "等待有效评分"}
      />
    </>
  );
};

export default RealTimeNoiseChart;
