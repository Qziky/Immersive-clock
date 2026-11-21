import { useId, useState } from "react";

import { useAppDispatch, useAppState } from "../../contexts/AppContext";
import {
  Button,
  ConfirmDialog,
  FormSection,
  IconButton,
  Inline,
  Input,
  Modal,
  RadioGroup,
} from "../../ui";
import { getAppSettings, updateAppSettings } from "../../utils/appSettings";
import { secondsToTime, timeToSeconds } from "../../utils/formatTime";

import styles from "./CountdownModal.module.css";

const COUNTDOWN_PRESETS = [
  { label: "10分钟", seconds: 600 },
  { label: "30分钟", seconds: 1800 },
  { label: "1小时", seconds: 3600 },
] as const;

const TIME_UNITS = [
  { key: "hours", label: "小时", unit: "时", max: 23 },
  { key: "minutes", label: "分钟", unit: "分", max: 59 },
  { key: "seconds", label: "秒", unit: "秒", max: 59 },
] as const;
type TimeUnit = (typeof TIME_UNITS)[number]["key"];
type TimeDraft = Record<TimeUnit, string>;

function toDraft(total: number): TimeDraft {
  const { hours, minutes, seconds } = secondsToTime(total);
  return {
    hours: String(hours).padStart(2, "0"),
    minutes: String(minutes).padStart(2, "0"),
    seconds: String(seconds).padStart(2, "0"),
  };
}

function parseUnit(text: string, max: number): number | null {
  const value = Number(text);
  return /^\d{1,2}$/.test(text) && value <= max ? value : null;
}

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

export function CountdownModal() {
  const { isModalOpen } = useAppState();
  // Each opening is a new transaction. Dismissing discards all unsaved edits.
  return isModalOpen ? <CountdownEditor /> : null;
}

function CountdownEditor() {
  const { countdown } = useAppState();
  const dispatch = useAppDispatch();
  const [saved] = useState(() => getAppSettings().countdown);
  const [favorites, setFavorites] = useState(saved.favoritePresetSeconds);
  const initialSeconds = countdown.initialTime || COUNTDOWN_PRESETS[0].seconds;
  const [draft, setDraft] = useState(() => toDraft(initialSeconds));
  const [source, setSource] = useState(() => {
    if (COUNTDOWN_PRESETS.some((preset) => preset.seconds === initialSeconds)) {
      return String(initialSeconds);
    }
    return saved.favoritePresetSeconds.includes(initialSeconds) ? "favorite" : "custom";
  });
  const [confirmReplacement, setConfirmReplacement] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);
  const errorId = useId();

  const invalidUnits = TIME_UNITS.some(({ key, max }) => parseUnit(draft[key], max) === null);
  const totalSeconds = invalidUnits
    ? 0
    : timeToSeconds(Number(draft.hours), Number(draft.minutes), Number(draft.seconds));
  const durationError = invalidUnits
    ? "请输入整数：小时为 0–23，分钟和秒为 0–59。"
    : totalSeconds === 0
      ? "倒计时时长至少为 1 秒。"
      : undefined;
  const favoritesChanged =
    favorites.length !== saved.favoritePresetSeconds.length ||
    favorites.some((value, index) => value !== saved.favoritePresetSeconds[index]);
  const hasProgress =
    countdown.isActive ||
    (countdown.currentTime > 0 && countdown.currentTime < countdown.initialTime);
  const alreadyFavorite = favorites.includes(totalSeconds);
  const close = () => dispatch({ type: "CLOSE_MODAL" });

  function editTime(key: TimeUnit, value: string) {
    setDraft((previous) => ({ ...previous, [key]: value }));
    setSource("custom");
  }

  function setPreset(preset: string) {
    setSource(preset);
    const seconds = preset === "custom" ? saved.customQuickPresetSeconds : Number(preset);
    if (seconds !== null) setDraft(toDraft(seconds));
  }

  function applyDuration(seconds: number) {
    // SET_COUNTDOWN leaves the timer stopped; starting it is always a separate action.
    dispatch({ type: "SET_COUNTDOWN", payload: seconds });
    close();
  }

  function selectFavorite(seconds: number) {
    if (!hasProgress && !favoritesChanged) {
      applyDuration(seconds);
      return;
    }
    // Do not discard live progress or implicitly commit a pending add/remove.
    setSource("favorite");
    setDraft(toDraft(seconds));
  }

  function commit() {
    if (durationError) return;
    const customChanged = source === "custom" && totalSeconds !== saved.customQuickPresetSeconds;
    if (customChanged || favoritesChanged) {
      try {
        updateAppSettings({
          countdown: {
            ...(customChanged && { customQuickPresetSeconds: totalSeconds }),
            ...(favoritesChanged && { favoritePresetSeconds: favorites }),
          },
        });
      } catch {
        setSaveFailed(true);
        setConfirmReplacement(false);
        return;
      }
    }
    applyDuration(totalSeconds);
  }

  return (
    <>
      <Modal
        isOpen
        onClose={close}
        title="设置倒计时"
        maxWidth="md"
        className={styles.countdownModal}
        bodyClassName={styles.modalBody}
        bodyPadding="none"
        footer={
          <Inline align="right" className={styles.footerActions}>
            <Button onClick={close}>取消</Button>
            <Button
              variant="primary"
              disabled={Boolean(durationError)}
              onClick={() => (hasProgress ? setConfirmReplacement(true) : commit())}
            >
              {hasProgress ? "替换当前倒计时" : "确认"}
            </Button>
          </Inline>
        }
      >
        <div className={styles.content}>
          <FormSection title="时间设置" variant="plain" className={styles.section}>
            <div className={styles.timeInputs}>
              {TIME_UNITS.map(({ key, label, unit, max }) => {
                const value = parseUnit(draft[key], max);
                return (
                  <div
                    key={key}
                    className={styles.inputGroup}
                    role="group"
                    aria-label={`${label}设置`}
                  >
                    <IconButton
                      size="lg"
                      onClick={() => editTime(key, String((value ?? 0) + 1).padStart(2, "0"))}
                      disabled={value === max}
                      icon="action.increment"
                      aria-label={`增加${label}`}
                    />
                    <div className={styles.valueWrapper}>
                      <Input
                        type="text"
                        variant="number"
                        inputMode="numeric"
                        autoComplete="off"
                        aria-label={label}
                        aria-invalid={value === null || undefined}
                        aria-describedby={durationError ? errorId : undefined}
                        className={styles.timeValue}
                        value={draft[key]}
                        onFocus={(event) => event.currentTarget.select()}
                        onChange={(event) => editTime(key, event.target.value)}
                        onBlur={() => {
                          if (value !== null) {
                            setDraft((previous) => ({
                              ...previous,
                              [key]: String(value).padStart(2, "0"),
                            }));
                          }
                        }}
                      />
                      <span className={styles.unit} aria-hidden="true">
                        {unit}
                      </span>
                    </div>
                    <IconButton
                      size="lg"
                      onClick={() =>
                        editTime(key, String(Math.max(0, (value ?? 1) - 1)).padStart(2, "0"))
                      }
                      disabled={value === 0}
                      icon="action.decrement"
                      aria-label={`减少${label}`}
                    />
                  </div>
                );
              })}
            </div>
            {durationError && (
              <p id={errorId} className={styles.message} role="status">
                {durationError}
              </p>
            )}
          </FormSection>

          <FormSection title="快速设置" variant="plain" className={styles.section}>
            <RadioGroup
              ariaLabel="快速设置倒计时时长"
              value={source}
              options={[
                ...COUNTDOWN_PRESETS.map(({ label, seconds }) => ({
                  value: String(seconds),
                  label,
                })),
                {
                  value: "custom",
                  label: (
                    <span
                      className={styles.customPresetLabel}
                      aria-label={
                        saved.customQuickPresetSeconds === null
                          ? "自定义"
                          : `自定义（${formatQuickPresetLabel(saved.customQuickPresetSeconds)}）`
                      }
                    >
                      自定义
                    </span>
                  ),
                },
              ]}
              onChange={setPreset}
            />
          </FormSection>

          <FormSection
            title="常用时长"
            variant="plain"
            className={styles.section}
            action={
              <Button
                size="sm"
                icon={alreadyFavorite ? "status.selected" : "action.add"}
                disabled={Boolean(durationError) || alreadyFavorite}
                onClick={() => setFavorites((previous) => [...previous, totalSeconds])}
              >
                {alreadyFavorite ? "已加入常用" : "加入常用"}
              </Button>
            }
            description={
              favoritesChanged
                ? "常用列表已修改，确认后保存。"
                : !favorites.length
                  ? "把重复使用的时长留在这里，下次直接点选。"
                  : hasProgress
                    ? "点选只会填入时长，确认替换后才会更改当前倒计时。"
                    : "点选即可设置，不会自动开始。"
            }
          >
            {favorites.length > 0 && (
              <ul className={styles.favorites} aria-label="常用时长列表">
                {favorites.map((seconds) => {
                  const label = formatQuickPresetLabel(seconds);
                  return (
                    <li key={seconds} className={styles.favorite}>
                      <Button size="sm" onClick={() => selectFavorite(seconds)}>
                        {label}
                      </Button>
                      <IconButton
                        size="lg"
                        variant="ghost"
                        icon="action.delete"
                        aria-label={`移除常用时长：${label}`}
                        onClick={() =>
                          setFavorites((previous) => previous.filter((item) => item !== seconds))
                        }
                      />
                    </li>
                  );
                })}
              </ul>
            )}
          </FormSection>
          {saveFailed && (
            <p role="alert" className={styles.message}>
              未能保存常用设置，请检查浏览器存储空间后重试。当前倒计时未更改。
            </p>
          )}
        </div>
      </Modal>
      <ConfirmDialog
        isOpen={confirmReplacement}
        title="替换当前倒计时？"
        description={`当前进度将被清除，改为 ${formatQuickPresetLabel(totalSeconds)}，不会自动开始。`}
        confirmLabel="确认替换"
        cancelLabel="保留当前倒计时"
        onConfirm={commit}
        onCancel={() => setConfirmReplacement(false)}
      />
    </>
  );
}
