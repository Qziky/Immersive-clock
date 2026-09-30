import { useId, useState } from "react";

import { Button, Input, Modal, Select, Switch, TimeStage, TimeStageValue } from "../../ui";
import {
  EXAM_PRESETS,
  formatExamTime,
  localDateTime,
  validateExam,
  type ExamConfig,
} from "../../utils/exam";
import { getAdjustedNowMs } from "../../utils/timeSync";

import styles from "./Exam.module.css";

export function ExamSettings({
  initial,
  onClose,
  onSave,
}: {
  initial: ExamConfig;
  onClose: () => void;
  onSave: (config: ExamConfig) => Promise<void>;
}) {
  const [draft, setDraft] = useState(() => {
    const start = Number.isFinite(Date.parse(initial.start))
      ? initial.start
      : localDateTime(getAdjustedNowMs());
    return {
      ...initial,
      start,
      end: Number.isFinite(Date.parse(initial.end))
        ? initial.end
        : localDateTime(Date.parse(start) + initial.minutes * 60000),
    };
  });
  const [hours, setHours] = useState(String(Math.floor(initial.minutes / 60)));
  const [minutes, setMinutes] = useState(String(initial.minutes % 60));
  const formId = useId();
  const subjectId = useId();
  const [manualEnd, setManualEnd] = useState(Boolean(initial.end));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const update = (changes: Partial<ExamConfig>) =>
    setDraft((current) => {
      const next = { ...current, ...changes };
      if (
        !manualEnd &&
        ("minutes" in changes || "start" in changes || "kind" in changes) &&
        Number.isFinite(Date.parse(next.start)) &&
        next.minutes >= 1 &&
        next.minutes <= 5999
      ) {
        next.end = localDateTime(Date.parse(next.start) + next.minutes * 60000);
      }
      return next;
    });
  const submit = async () => {
    if (
      draft.kind === "immediate" &&
      (!hours.trim() ||
        !minutes.trim() ||
        !Number.isInteger(Number(hours)) ||
        !Number.isInteger(Number(minutes)) ||
        Number(hours) < 0 ||
        Number(hours) > 99 ||
        Number(minutes) < 0 ||
        Number(minutes) > 59)
    ) {
      setError("小时须为 0 至 99，分钟须为 0 至 59");
      return;
    }
    const invalid = validateExam(draft, getAdjustedNowMs());
    setError(invalid);
    if (invalid) return;
    setSaving(true);
    try {
      await onSave({ ...draft, subject: draft.subject.trim() });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "无法保存考试设置，请重试");
    } finally {
      setSaving(false);
    }
  };
  const duration =
    draft.kind === "scheduled"
      ? Date.parse(draft.end) - Date.parse(draft.start)
      : draft.minutes * 60000;
  const selectedPreset = EXAM_PRESETS.find(
    (preset) => preset.subject === draft.subject && preset.minutes === draft.minutes
  );
  return (
    <Modal
      isOpen
      title="考试设置"
      width="xl"
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            取消
          </Button>
          <Button type="submit" form={formId} disabled={saving}>
            {draft.kind === "immediate" ? "开始考试" : "启用考试安排"}
          </Button>
        </>
      }
    >
      <div className={styles.settingsGrid}>
        <form
          id={formId}
          className={styles.form}
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <Input
            id={subjectId}
            label="考试科目"
            placeholder="例如：综合能力测试"
            value={draft.subject}
            maxLength={80}
            onChange={(event) => update({ subject: event.target.value })}
          />
          <div className={styles.presets} role="group" aria-label="科目预设">
            {EXAM_PRESETS.map((preset) => (
              <Button
                key={preset.subject}
                size="sm"
                variant={selectedPreset === preset ? "secondary" : "ghost"}
                aria-pressed={selectedPreset === preset}
                onClick={() => {
                  const start = Number.isFinite(Date.parse(draft.start))
                    ? draft.start
                    : localDateTime(getAdjustedNowMs());
                  setHours(String(Math.floor(preset.minutes / 60)));
                  setMinutes(String(preset.minutes % 60));
                  update({
                    subject: preset.subject,
                    minutes: preset.minutes,
                    start,
                    ...(!manualEnd
                      ? { end: localDateTime(Date.parse(start) + preset.minutes * 60000) }
                      : {}),
                  });
                }}
              >
                {preset.subject} · {preset.minutes}分
              </Button>
            ))}
            <Button
              size="sm"
              variant={selectedPreset ? "ghost" : "secondary"}
              icon="action.configure"
              aria-pressed={!selectedPreset}
              onClick={() => {
                if (selectedPreset) update({ subject: "" });
                document.getElementById(subjectId)?.focus();
              }}
            >
              自定义
            </Button>
          </div>
          <Select
            label="开始方式"
            value={draft.kind}
            options={[
              { value: "immediate", label: "立刻开始" },
              { value: "scheduled", label: "固定时间段" },
            ]}
            onChange={(event) => {
              const kind = event.target.value as ExamConfig["kind"];
              const start = Number.isFinite(Date.parse(draft.start))
                ? draft.start
                : localDateTime(getAdjustedNowMs());
              update({
                kind,
                start,
                end: draft.end || localDateTime(Date.parse(start) + draft.minutes * 60000),
              });
            }}
          />
          {draft.kind === "immediate" ? (
            <div className={styles.duration}>
              <Input
                label="小时"
                type="number"
                min={0}
                max={99}
                value={hours}
                onChange={(event) => {
                  setHours(event.target.value);
                  update({ minutes: Number(event.target.value) * 60 + Number(minutes) });
                }}
              />
              <Input
                label="分钟"
                type="number"
                min={0}
                max={59}
                value={minutes}
                onChange={(event) => {
                  setMinutes(event.target.value);
                  update({ minutes: Number(hours) * 60 + Number(event.target.value) });
                }}
              />
            </div>
          ) : (
            <>
              <Input
                label="开始时间"
                type="datetime-local"
                value={draft.start}
                onChange={(event) => {
                  const start = event.target.value;
                  update({
                    start,
                    ...(!manualEnd && Number.isFinite(Date.parse(start))
                      ? { end: localDateTime(Date.parse(start) + draft.minutes * 60000) }
                      : {}),
                  });
                }}
              />
              <Input
                label="结束时间"
                type="datetime-local"
                value={draft.end}
                onChange={(event) => {
                  setManualEnd(true);
                  update({ end: event.target.value });
                }}
              />
              <p>到点自动开考和结束，固定时间段不支持暂停。</p>
            </>
          )}
          <details>
            <summary>显示与提醒</summary>
            <div className={styles.form}>
              <Switch
                label="显示进度条"
                checked={draft.progress}
                onCheckedChange={(progress) => update({ progress })}
              />
              <Input
                label="临近结束提醒（分钟，0 为关闭）"
                type="number"
                min={0}
                max={5999}
                value={draft.warningMinutes}
                onChange={(event) => update({ warningMinutes: Number(event.target.value) })}
              />
              <Switch
                label="开考声音"
                checked={draft.startSound}
                onCheckedChange={(startSound) => update({ startSound })}
              />
              <Switch
                label="临近结束声音"
                checked={draft.warningSound}
                onCheckedChange={(warningSound) => update({ warningSound })}
              />
              <Switch
                label="结束声音"
                checked={draft.endSound}
                onCheckedChange={(endSound) => update({ endSound })}
              />
            </div>
          </details>
          {error && (
            <p className={styles.error} role="alert">
              {error}
            </p>
          )}
        </form>
        <aside className={styles.preview} aria-label="考试预览">
          <div className={styles.previewTop}>
            <span>{draft.subject || "考试科目"}</span>
            <span>
              当前时间
              <br />
              09:42:18
            </span>
          </div>
          <TimeStage layout="viewport" placement="overlay">
            <TimeStageValue>
              {formatExamTime(Number.isFinite(duration) ? Math.max(0, duration) : 0)}
            </TimeStageValue>
          </TimeStage>
          <span>剩余时间 · 预览</span>
        </aside>
      </div>
    </Modal>
  );
}
