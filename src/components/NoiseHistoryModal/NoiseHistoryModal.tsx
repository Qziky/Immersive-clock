import React, { useEffect, useId, useMemo, useState } from "react";

import { DEFAULT_NOISE_REPORT_RETENTION_DAYS } from "../../constants/noiseReport";
import type { NoiseSliceSummary } from "../../types/noise";
import {
  AppIcon,
  Button as FormButton,
  FormSection,
  Inline as FormButtonGroup,
  Inline as FormRow,
  Input as FormInput,
  Modal,
} from "../../ui";
import { formatDateTimeLocal, parseDateTimeLocal } from "../../utils/dateTimeLocal";
import { buildNoiseHistoryListItems } from "../../utils/noiseHistoryBuilder";
import { readNoiseSlices, subscribeNoiseSlicesUpdated } from "../../utils/noiseSliceService";
import { createDefaultStudyTimetable } from "../../utils/studyTimetable";
import { readStudyTimetable } from "../../utils/studyTimetableStorage";
import type { NoiseReportPeriod } from "../NoiseReportModal/NoiseReportModal";

import styles from "./NoiseHistoryModal.module.css";

export interface NoiseHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onViewDetail: (period: NoiseReportPeriod) => void;
}

function formatRange(start: Date, end: Date): string {
  return `${start.toLocaleString()} - ${end.toLocaleString()}`;
}

const DAY_MS = 24 * 60 * 60 * 1000;

const NoiseHistoryModal: React.FC<NoiseHistoryModalProps> = ({ isOpen, onClose, onViewDetail }) => {
  const [slices, setSlices] = useState<NoiseSliceSummary[]>([]);
  const [customName, setCustomName] = useState("自定义报告");
  const [customStartValue, setCustomStartValue] = useState("");
  const [customEndValue, setCustomEndValue] = useState("");
  const [customError, setCustomError] = useState<string | null>(null);
  const [customOpen, setCustomOpen] = useState(false);
  const customErrorId = useId();

  useEffect(() => {
    if (!isOpen) {
      setSlices([]);
      return;
    }

    let active = true;
    const refresh = () => {
      void readNoiseSlices()
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
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const end = new Date();
    end.setSeconds(0, 0);
    const start = new Date(end.getTime() - 60 * 60 * 1000);
    setCustomName("自定义报告");
    setCustomStartValue(formatDateTimeLocal(start));
    setCustomEndValue(formatDateTimeLocal(end));
    setCustomError(null);
    setCustomOpen(false);
  }, [isOpen]);

  const retentionDays = DEFAULT_NOISE_REPORT_RETENTION_DAYS;

  const maxCustomRangeMs = Math.max(1, Math.round(retentionDays)) * DAY_MS;

  const availableRange = useMemo(() => {
    if (!isOpen) return null;
    if (slices.length === 0) return null;
    let minStart = Infinity;
    let maxEnd = -Infinity;
    for (const s of slices) {
      if (s.start < minStart) minStart = s.start;
      if (s.end > maxEnd) maxEnd = s.end;
    }
    if (!Number.isFinite(minStart) || !Number.isFinite(maxEnd) || maxEnd <= minStart) return null;
    return { min: new Date(minStart), max: new Date(maxEnd) };
  }, [isOpen, slices]);

  const items = useMemo(() => {
    if (!isOpen) return [];
    let timetable = createDefaultStudyTimetable();
    try {
      timetable = readStudyTimetable();
    } catch {}
    return buildNoiseHistoryListItems({ slices, timetable, windowMs: maxCustomRangeMs });
  }, [isOpen, slices, maxCustomRangeMs]);

  /** 查看自定义报告（函数级注释：校验起止时间并回传 NoiseReportPeriod，让上层复用统一报告弹窗展示） */
  const handleViewCustomReport = () => {
    setCustomError(null);
    const start = parseDateTimeLocal(customStartValue);
    const end = parseDateTimeLocal(customEndValue);
    if (!start || !end) {
      setCustomError("请输入有效的开始/结束时间。");
      setCustomOpen(true);
      return;
    }
    const startTs = start.getTime();
    const endTs = end.getTime();
    if (endTs <= startTs) {
      setCustomError("结束时间必须晚于开始时间。");
      setCustomOpen(true);
      return;
    }
    if (endTs - startTs > maxCustomRangeMs) {
      setCustomError(`当前仅支持查看最近 ${retentionDays} 天内的时间段报告。`);
      setCustomOpen(true);
      return;
    }
    const name = customName.trim().length > 0 ? customName.trim() : "自定义报告";
    onViewDetail({
      id: `custom-${startTs}-${endTs}`,
      name,
      start,
      end,
    });
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="历史记录管理"
      maxWidth="xxl"
      closeButtonDataTour="noise-history-close"
    >
      <div data-tour="noise-history-modal">
        <FormSection title={`历史记录（最近${retentionDays}天）`} variant="plain">
          <div className={styles.note}>
            数据来源：噪音切片摘要（按“历史保存天数”保存，且会受本地容量限制自动裁剪）。
          </div>

          <div className={styles.list} role="table" aria-label="噪音历史记录" aria-live="polite">
            <div className={styles.headerRow} role="row">
              <div className={styles.colName} role="columnheader">
                名称
              </div>
              <div className={styles.colScore} role="columnheader">
                评分
              </div>
              <div className={styles.colTime} role="columnheader">
                时间
              </div>
              <div className={styles.colAction} role="columnheader">
                操作
              </div>
            </div>

            {items.length === 0 ? (
              <div className={styles.empty} role="row">
                <span role="cell">暂无历史记录</span>
              </div>
            ) : (
              items.map((item) => (
                <div key={item.period.id} className={styles.dataRow} role="row">
                  <div className={styles.colName} role="cell">
                    {item.period.name}
                  </div>
                  <div className={styles.colScore} role="cell">
                    <span className={styles.mobileLabel}>评分</span>
                    {item.avgScore === null ? "—" : item.avgScore.toFixed(1)}
                  </div>
                  <div className={styles.colTime} role="cell">
                    {formatRange(item.period.start, item.period.end)}
                  </div>
                  <div className={styles.colAction} role="cell">
                    <FormButton
                      variant="secondary"
                      size="sm"
                      onClick={() =>
                        onViewDetail({
                          id: item.period.id,
                          name: item.period.name,
                          start: item.period.start,
                          end: item.period.end,
                        })
                      }
                    >
                      查看详情
                    </FormButton>
                  </div>
                </div>
              ))
            )}
          </div>

          <details
            className={styles.customDetails}
            open={customOpen}
            onToggle={(e) => setCustomOpen((e.currentTarget as HTMLDetailsElement).open)}
          >
            <summary className={styles.customSummary}>
              <AppIcon name="action.expand" size="lg" />
              <span>自定义时间段报告</span>
            </summary>
            <div className={styles.customBody}>
              <div className={styles.note}>
                {availableRange
                  ? `可用数据范围：${formatRange(availableRange.min, availableRange.max)}`
                  : "当前暂无切片数据（生成报告后将显示统计）。"}
              </div>

              <div className={styles.customForm}>
                <FormInput
                  label="报告名称"
                  value={customName}
                  onChange={(e) => setCustomName(e.target.value)}
                  placeholder="例如：午间自习"
                />

                <FormRow gap="sm" align="end" className={styles.customRow}>
                  <FormInput
                    label="开始时间"
                    type="datetime-local"
                    value={customStartValue}
                    onChange={(e) => setCustomStartValue(e.target.value)}
                    aria-invalid={customError ? true : undefined}
                    aria-describedby={customError ? customErrorId : undefined}
                  />
                  <FormInput
                    label="结束时间"
                    type="datetime-local"
                    value={customEndValue}
                    onChange={(e) => setCustomEndValue(e.target.value)}
                    aria-invalid={customError ? true : undefined}
                    aria-describedby={customError ? customErrorId : undefined}
                  />
                </FormRow>

                <FormButtonGroup align="right">
                  <FormButton variant="primary" size="sm" onClick={handleViewCustomReport}>
                    查看报告
                  </FormButton>
                </FormButtonGroup>

                {customError ? (
                  <div id={customErrorId} className={styles.customError} role="alert">
                    {customError}
                  </div>
                ) : null}
              </div>
            </div>
          </details>
        </FormSection>
      </div>
    </Modal>
  );
};

export default NoiseHistoryModal;
