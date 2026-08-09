import React, { useEffect, useMemo, useState } from "react";

import { useNoiseStream } from "../../hooks/useNoiseStream";
import type { NoiseSignalHealth, NoiseSliceSummary } from "../../types/noise";
import { Card, MetricCard, SettingGrid } from "../../ui";
import { readNoiseSlices, subscribeNoiseSlicesUpdated } from "../../utils/noiseSliceService";

import styles from "./NoiseSettings.module.css";

function formatDuration(ms: number) {
  const seconds = Math.round(ms / 1000);
  return `${Math.floor(seconds / 60)}分${seconds % 60}秒`;
}

function formatTimeRange(start: number, end: number) {
  const options: Intl.DateTimeFormatOptions = {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  };
  return `${new Date(start).toLocaleTimeString(undefined, options)} - ${new Date(end).toLocaleTimeString(undefined, options)}`;
}

function formatSignalHealth(health: NoiseSignalHealth): string {
  return health === "signal-anomaly" ? "信号异常" : health;
}

interface NoiseStatsSummaryProps {
  enabled?: boolean;
}

export const NoiseStatsSummary: React.FC<NoiseStatsSummaryProps> = ({ enabled = true }) => {
  const { latestSlice } = useNoiseStream(enabled);
  const [storedLatestSlice, setStoredLatestSlice] = useState<NoiseSliceSummary | null>(null);

  useEffect(() => {
    let active = true;
    const refresh = () => {
      void readNoiseSlices({ direction: "desc", limit: 1 }).then((slices) => {
        if (active) setStoredLatestSlice(slices[0] ?? null);
      });
    };
    const unsubscribe = subscribeNoiseSlicesUpdated(refresh);
    refresh();
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  const slice = useMemo(() => latestSlice ?? storedLatestSlice, [latestSlice, storedLatestSlice]);

  return (
    <>
      <div className={styles.sourceNote} aria-live="polite">
        数据来源时间：{slice ? formatTimeRange(slice.start, slice.end) : "暂无有效切片数据"}
        {slice ? `（模型 ${slice.modelVersion}）` : ""}
      </div>
      {slice ? (
        <Card className={styles.sliceItem} data-slice="latest">
          <div className={styles.sliceHeaderRow}>
            <div className={styles.sliceTitle}>
              最近切片 · {formatDuration(slice.end - slice.start)} ·{" "}
              {slice.score?.toFixed(1) ?? "—"}分
            </div>
            <div className={styles.sliceTime}>{formatTimeRange(slice.start, slice.end)}</div>
          </div>
          <SettingGrid columns="auto">
            <MetricCard
              label="活动度"
              value={`平均 ${Math.round(slice.detail.activityMean * 100)}% / 持续底 ${Math.round(slice.detail.activityFloor * 100)}%`}
            />
            <MetricCard
              label="估算声级"
              value={
                slice.estimated
                  ? `平均 ${slice.estimated.avgDbA.toFixed(1)} / P95 ${slice.estimated.p95DbA.toFixed(1)} dB(A)`
                  : "未进行外部参考校准"
              }
            />
            <MetricCard
              label="有效覆盖"
              tone={slice.coverageRatio >= 0.8 ? "success" : "warning"}
              value={`${Math.round(slice.coverageRatio * 100)}% · ${slice.confidence}`}
            />
            <MetricCard
              label="事件频度"
              tone="warning"
              value={`${Math.round(slice.detail.eventFactor * 100)}% · ${slice.detail.eventCount} 次`}
            />
          </SettingGrid>
          <div className={styles.sliceFootnote}>
            有效秒 {slice.detail.validSecondCount}/{slice.detail.totalSecondCount}；质量{" "}
            {slice.detail.quality}；信号状态 {formatSignalHealth(slice.signalHealth)}
          </div>
        </Card>
      ) : (
        <div className={styles.empty}>暂无有效切片数据</div>
      )}
    </>
  );
};

export default NoiseStatsSummary;
