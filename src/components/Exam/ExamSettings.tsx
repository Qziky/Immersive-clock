import { useState } from "react";

import { Button, Input, Modal, Select, Switch } from "../../ui";
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
  const [draft, setDraft] = useState(initial);
  const [manualEnd, setManualEnd] = useState(Boolean(initial.end));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const update = (changes: Partial<ExamConfig>) =>
    setDraft((current) => ({ ...current, ...changes }));
  const submit = async () => {
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
          <Button onClick={() => void submit()} disabled={saving}>
            {draft.kind === "immediate" ? "开始考试" : "启用考试安排"}
          </Button>
        </>
      }
    >
      <div className={styles.settingsGrid}>
        <div className={styles.form}>
          <Input
            label="考试科目"
            value={draft.subject}
            maxLength={80}
            onChange={(event) => update({ subject: event.target.value })}
          />
          <div className={styles.presets} aria-label="科目预设">
            {EXAM_PRESETS.map((preset) => (
              <Button
                key={preset.subject}
                size="sm"
                variant="ghost"
                onClick={() => {
                  const start = draft.start || localDateTime(getAdjustedNowMs());
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
              const start = draft.start || localDateTime(getAdjustedNowMs());
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
                value={Math.floor(draft.minutes / 60)}
                onChange={(event) =>
                  update({ minutes: Number(event.target.value) * 60 + (draft.minutes % 60) })
                }
              />
              <Input
                label="分钟"
                type="number"
                min={0}
                max={59}
                value={draft.minutes % 60}
                onChange={(event) =>
                  update({
                    minutes: Math.floor(draft.minutes / 60) * 60 + Number(event.target.value),
                  })
                }
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
          {error && <p role="alert">{error}</p>}
        </div>
        <aside className={styles.preview} aria-label="考试预览">
          <div className={styles.previewTop}>
            <span>{draft.subject || "考试科目"}</span>
            <span>
              当前时间
              <br />
              09:42:18
            </span>
          </div>
          <strong>{formatExamTime(Number.isFinite(duration) ? Math.max(0, duration) : 0)}</strong>
          <span>剩余时间 · 预览</span>
        </aside>
      </div>
    </Modal>
  );
}
