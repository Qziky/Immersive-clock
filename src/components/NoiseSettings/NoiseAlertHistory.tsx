import React, { useEffect, useMemo, useState } from "react";

import { DEFAULT_NOISE_REPORT_RETENTION_DAYS } from "../../constants/noiseReport";
import type { NoiseSliceSummary } from "../../types/noise";
import { FormSection } from "../../ui";
import { getNoiseReportSettings } from "../../utils/noiseReportSettings";
import { readNoiseSlices, subscribeNoiseSlicesUpdated } from "../../utils/noiseSliceService";
import { SETTINGS_EVENTS, subscribeSettingsEvent } from "../../utils/settingsEvents";

import styles from "./NoiseSettings.module.css";

export const NoiseAlertHistory: React.FC = () => {
  const [slices, setSlices] = useState<NoiseSliceSummary[]>([]);
  const [settingsTick, setSettingsTick] = useState(0);

  const retentionDays = useMemo(() => {
    void settingsTick;
    try {
      return getNoiseReportSettings().retentionDays;
    } catch {
      return DEFAULT_NOISE_REPORT_RETENTION_DAYS;
    }
  }, [settingsTick]);

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

  useEffect(() => {
    const off = subscribeSettingsEvent(SETTINGS_EVENTS.NoiseReportSettingsUpdated, () => {
      setSettingsTick((t) => t + 1);
    });
    return off;
  }, []);

  const { items, totalSegments } = useMemo(() => {
    try {
      const rows = slices
        .filter((s) => s.raw.segmentCount > 0 || s.raw.overRatioDbfs > 0)
        .slice(0, 60)
        .map((s) => ({
          time: new Date(s.end).toLocaleString(),
          segments: s.raw.segmentCount,
          overRatio: s.raw.overRatioDbfs,
          score: s.score,
        }));

      const totalSegments = slices.reduce((acc, s) => acc + (s.raw.segmentCount || 0), 0);
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
                段{it.segments} / {(it.overRatio * 100).toFixed(0)}% / {it.score.toFixed(1)}分
              </span>
            </div>
          ))
        )}
      </div>
    </FormSection>
  );
};

export default NoiseAlertHistory;
