import React, { useCallback, useEffect, useRef, useState } from "react";

import { useAppDispatch, useAppState } from "../../contexts/AppContext";
import {
  Button as FormButton,
  FormSection,
  IconButton,
  Inline as FormButtonGroup,
  Modal,
  RadioGroup,
} from "../../ui";
import { getAppSettings, updateAppSettings } from "../../utils/appSettings";
import { secondsToTime, timeToSeconds } from "../../utils/formatTime";

import styles from "./CountdownModal.module.css";

const COUNTDOWN_PRESETS = [
  { label: "10分钟", minutes: 10 },
  { label: "30分钟", minutes: 30 },
  { label: "1小时", minutes: 60 },
] as const;

const CUSTOM_PRESET_VALUE = "custom";

type CountdownDraft = {
  hours: number;
  minutes: number;
  seconds: number;
  selectedPreset: string;
  customQuickPresetSeconds: number | null;
};

function formatQuickPresetLabel(totalSeconds: number): string {
  const { hours, minutes, seconds } = secondsToTime(totalSeconds);
  if (hours > 0) {
    return `${hours}小时${minutes > 0 ? `${minutes}分` : ""}${seconds > 0 ? `${seconds}秒` : ""}`;
  }
  if (minutes > 0) {
    return `${minutes}分钟${seconds > 0 ? `${seconds}秒` : ""}`;
  }
  return `${seconds}秒`;
}

function getTimeDraft(totalSeconds: number): Pick<CountdownDraft, "hours" | "minutes" | "seconds"> {
  return secondsToTime(totalSeconds);
}

/**
 * 倒计时设置模态框组件
 * 允许用户设置倒计时的小时、分钟和秒数
 */
export function CountdownModal() {
  const { isModalOpen } = useAppState();
  const dispatch = useAppDispatch();

  const [hours, setHours] = useState(0);
  const [minutes, setMinutes] = useState(10);
  const [seconds, setSeconds] = useState(0);
  const [selectedPreset, setSelectedPreset] = useState(String(COUNTDOWN_PRESETS[0].minutes));
  const [customQuickPresetSeconds, setCustomQuickPresetSeconds] = useState<number | null>(
    () => getAppSettings().countdown.customQuickPresetSeconds
  );
  const wasModalOpenRef = useRef(false);
  const draftSnapshotRef = useRef<CountdownDraft | null>(null);

  useEffect(() => {
    const isOpening = isModalOpen && !wasModalOpenRef.current;
    wasModalOpenRef.current = isModalOpen;
    if (!isOpening) return;

    const latestCustomQuickPresetSeconds = getAppSettings().countdown.customQuickPresetSeconds;
    setCustomQuickPresetSeconds(latestCustomQuickPresetSeconds);
    draftSnapshotRef.current = {
      hours,
      minutes,
      seconds,
      selectedPreset,
      customQuickPresetSeconds: latestCustomQuickPresetSeconds,
    };
  }, [hours, isModalOpen, minutes, seconds, selectedPreset]);

  /**
   * 关闭模态框
   */
  const handleClose = useCallback(() => {
    const snapshot = draftSnapshotRef.current;
    if (snapshot) {
      setHours(snapshot.hours);
      setMinutes(snapshot.minutes);
      setSeconds(snapshot.seconds);
      setSelectedPreset(snapshot.selectedPreset);
      setCustomQuickPresetSeconds(snapshot.customQuickPresetSeconds);
    }
    dispatch({ type: "CLOSE_MODAL" });
  }, [dispatch]);

  /**
   * 确认设置倒计时
   */
  const handleConfirm = useCallback(() => {
    const totalSeconds = timeToSeconds(hours, minutes, seconds);
    if (totalSeconds > 0) {
      if (selectedPreset === CUSTOM_PRESET_VALUE) {
        updateAppSettings({
          countdown: {
            customQuickPresetSeconds: totalSeconds,
          },
        });
        setCustomQuickPresetSeconds(totalSeconds);
      }
      dispatch({ type: "SET_COUNTDOWN", payload: totalSeconds });
      dispatch({ type: "CLOSE_MODAL" });
    }
  }, [hours, minutes, seconds, selectedPreset, dispatch]);

  /**
   * 设置预设时间
   */
  const handlePreset = useCallback(
    (presetValue: string) => {
      if (presetValue === CUSTOM_PRESET_VALUE) {
        setSelectedPreset(CUSTOM_PRESET_VALUE);
        if (customQuickPresetSeconds !== null) {
          const draft = getTimeDraft(customQuickPresetSeconds);
          setHours(draft.hours);
          setMinutes(draft.minutes);
          setSeconds(draft.seconds);
        }
        return;
      }

      const presetMinutes = Number(presetValue);
      const presetHours = Math.floor(presetMinutes / 60);
      const remainingMinutes = presetMinutes % 60;
      setSelectedPreset(presetValue);
      setHours(presetHours);
      setMinutes(remainingMinutes);
      setSeconds(0);
    },
    [customQuickPresetSeconds]
  );

  /**
   * 调整时间值
   */
  const adjustTime = useCallback((type: "hours" | "minutes" | "seconds", delta: number) => {
    setSelectedPreset(CUSTOM_PRESET_VALUE);
    switch (type) {
      case "hours":
        setHours((prev) => Math.max(0, Math.min(23, prev + delta)));
        break;
      case "minutes":
        setMinutes((prev) => Math.max(0, Math.min(59, prev + delta)));
        break;
      case "seconds":
        setSeconds((prev) => Math.max(0, Math.min(59, prev + delta)));
        break;
    }
  }, []);

  if (!isModalOpen) {
    return null;
  }

  const totalSeconds = timeToSeconds(hours, minutes, seconds);
  const isValid = totalSeconds > 0;
  const customPresetLabel =
    customQuickPresetSeconds === null
      ? "自定义"
      : `自定义（${formatQuickPresetLabel(customQuickPresetSeconds)}）`;
  const customPresetVisualLabel = "自定义";

  return (
    <Modal
      isOpen={isModalOpen}
      onClose={handleClose}
      title="设置倒计时"
      maxWidth="md"
      className={styles.countdownModal}
      bodyClassName={styles.modalBody}
      bodyPadding="none"
      footer={
        <FormButtonGroup align="right" className={styles.footerActions}>
          <FormButton variant="secondary" onClick={handleClose}>
            取消
          </FormButton>
          <FormButton variant="primary" onClick={handleConfirm} disabled={!isValid}>
            确认
          </FormButton>
        </FormButtonGroup>
      }
    >
      <div className={styles.content}>
        <FormSection title="时间设置" variant="plain" className={styles.section}>
          <div className={styles.timeInputs}>
            {/* 小时 */}
            <div className={styles.timeInput}>
              <div className={styles.inputGroup} role="group" aria-label="小时设置">
                <IconButton
                  variant="default"
                  size="lg"
                  onClick={() => adjustTime("hours", 1)}
                  disabled={hours === 23}
                  icon="action.increment"
                  aria-label="增加小时"
                />
                <div className={styles.valueWrapper}>
                  <output className={styles.timeValue} aria-live="polite">
                    {hours.toString().padStart(2, "0")}
                  </output>
                  <span className={styles.unit}>时</span>
                </div>
                <IconButton
                  variant="default"
                  size="lg"
                  onClick={() => adjustTime("hours", -1)}
                  disabled={hours === 0}
                  icon="action.decrement"
                  aria-label="减少小时"
                />
              </div>
            </div>

            {/* 分钟 */}
            <div className={styles.timeInput}>
              <div className={styles.inputGroup} role="group" aria-label="分钟设置">
                <IconButton
                  variant="default"
                  size="lg"
                  onClick={() => adjustTime("minutes", 1)}
                  disabled={minutes === 59}
                  icon="action.increment"
                  aria-label="增加分钟"
                />
                <div className={styles.valueWrapper}>
                  <output className={styles.timeValue} aria-live="polite">
                    {minutes.toString().padStart(2, "0")}
                  </output>
                  <span className={styles.unit}>分</span>
                </div>
                <IconButton
                  variant="default"
                  size="lg"
                  onClick={() => adjustTime("minutes", -1)}
                  disabled={minutes === 0}
                  icon="action.decrement"
                  aria-label="减少分钟"
                />
              </div>
            </div>

            {/* 秒 */}
            <div className={styles.timeInput}>
              <div className={styles.inputGroup} role="group" aria-label="秒设置">
                <IconButton
                  variant="default"
                  size="lg"
                  onClick={() => adjustTime("seconds", 1)}
                  disabled={seconds === 59}
                  icon="action.increment"
                  aria-label="增加秒"
                />
                <div className={styles.valueWrapper}>
                  <output className={styles.timeValue} aria-live="polite">
                    {seconds.toString().padStart(2, "0")}
                  </output>
                  <span className={styles.unit}>秒</span>
                </div>
                <IconButton
                  variant="default"
                  size="lg"
                  onClick={() => adjustTime("seconds", -1)}
                  disabled={seconds === 0}
                  icon="action.decrement"
                  aria-label="减少秒"
                />
              </div>
            </div>
          </div>
        </FormSection>

        <FormSection title="快速设置" variant="plain" className={styles.section}>
          <RadioGroup
            ariaLabel="快速设置倒计时时长"
            value={selectedPreset}
            options={[
              ...COUNTDOWN_PRESETS.map(({ label, minutes: presetMinutes }) => ({
                value: String(presetMinutes),
                label,
              })),
              {
                value: CUSTOM_PRESET_VALUE,
                label: (
                  <span className={styles.customPresetLabel} aria-label={customPresetLabel}>
                    {customPresetVisualLabel}
                  </span>
                ),
              },
            ]}
            onChange={handlePreset}
          />
        </FormSection>
      </div>
    </Modal>
  );
}
