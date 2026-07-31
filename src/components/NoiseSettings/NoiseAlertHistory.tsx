import React, { useEffect, useMemo, useState } from "react";

import { DEFAULT_NOISE_REPORT_RETENTION_DAYS } from "../../constants/noiseReport";
import type { NoiseSliceSummary } from "../../types/noise";
import { FormSection } from "../../ui";
import { readNoiseSlices, subscribeNoiseSlicesUpdated } from "../../utils/noiseSliceService";

import styles from "./NoiseSettings.module.css";

export const NoiseAlertHistory: React.FC = () => {
  const [slices, setSlices] = useState<NoiseSliceSummary[]>([]);
  const retentionDays = DEFAULT_NOISE_REPORT_RETENTION_DAYS;

  useEffect(() => {
    let active = true;
    const refresh = () => {
      const cutoff = Date.now() - Math.max(1, Math.round(retentionDays)) * 24 * 60 * 60 * 1000;
      void readNoiseSlices({ endFrom: cutoff, direction: "desc" })
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
  }, [retentionDays]);

  const { items, totalSegments } = useMemo(() => {
    try {
      const rows = slices
        .filter((s) => s.detail.eventCount > 0 || s.detail.eventFactor > 0)
        .slice(0, 60)
        .map((s) => ({
          time: new Date(s.end).toLocaleString(),
          segments: s.detail.eventCount,
          eventFactor: s.detail.eventFactor,
          score: s.score,
        }));

      const totalSegments = slices.reduce((acc, s) => acc + s.detail.eventCount, 0);
      return { items: rows, totalSegments };
    } catch {
      return { items: [], totalSegments: 0 };
    }
  }, [slices]);

  return (
    <FormSection title="提醒记录">
      <div className={styles.alertHeader}>
        <div>
          最近{retentionDays}天事件段数：{totalSegments}
        </div>
      </div>
      <div className={styles.alertList}>
        {items.length === 0 ? (
          <div className={styles.empty}>暂无记录</div>
        ) : (
          items.map((it, idx) => (
            <div key={idx} className={styles.alertItem}>
              <span className={styles.alertTime}>{it.time}</span>
              <span className={styles.alertValue}>
                事件 {it.segments} / 频度 {(it.eventFactor * 100).toFixed(0)}% /{" "}
                {it.score?.toFixed(1) ?? "—"}分
              </span>
            </div>
          ))
        )}
      </div>
    </FormSection>
  );
};

export default NoiseAlertHistory;
