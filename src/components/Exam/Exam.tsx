import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import { useComponentAppearance } from "../../contexts/AppearanceContext";
import { useAudio } from "../../hooks/useAudio";
import { useFullscreen } from "../../hooks/useFullscreen";
import { Button, Dropdown, Progress, TimeStage, TimeStageValue, useFeedback } from "../../ui";
import { getAppSettings, updateAppSettings } from "../../utils/appSettings";
import {
  DEFAULT_EXAM,
  examSnapshot,
  formatExamTime,
  startExam,
  toggleExamPause,
  type ExamConfig,
  type ExamSettings as ExamData,
} from "../../utils/exam";
import { getAdjustedNowMs } from "../../utils/timeSync";

import styles from "./Exam.module.css";
import { ExamSettings } from "./ExamSettings";

const PHASE_LABELS = {
  waiting: "距开考",
  running: "考试进行中",
  paused: "已暂停",
  finished: "考试已结束",
  ended: "已提前结束",
};
const clock = (value: number) => new Date(value).toLocaleTimeString("zh-CN", { hour12: false });
const timestamp = (value: number) =>
  new Date(value).toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

export function Exam() {
  const [data, setData] = useState<ExamData>(() => getAppSettings().exam);
  const [now, setNow] = useState(getAdjustedNowMs);
  const [editing, setEditing] = useState<ExamConfig | null>(() =>
    data.session ? null : data.config
  );
  const [visible, setVisible] = useState(true);
  const lastActivity = useRef(Date.now());
  const toolbar = useRef<HTMLDivElement>(null);
  const [fullscreen, toggleFullscreen] = useFullscreen();
  const [play] = useAudio("/ding.mp3");
  const { confirm } = useFeedback();
  const navigate = useNavigate();
  const timeStyle = useComponentAppearance("exam", "time");
  const { config, session } = data;
  const snapshot = session ? examSnapshot(session, now) : null;
  const previous = useRef(snapshot);
  const warning =
    snapshot?.phase === "running" &&
    config.warningMinutes > 0 &&
    snapshot.remainingMs <= config.warningMinutes * 60000;
  const ended = snapshot?.phase === "ended" || snapshot?.phase === "finished";
  const save = (next: ExamData) => {
    updateAppSettings({ exam: next });
    setData(next);
    setNow(getAdjustedNowMs());
  };
  const reveal = () => {
    lastActivity.current = Date.now();
    setVisible(true);
  };

  useEffect(() => {
    const refresh = () => {
      setNow(getAdjustedNowMs());
      if (
        Date.now() - lastActivity.current > 3000 &&
        !toolbar.current?.contains(document.activeElement)
      )
        setVisible(false);
    };
    const interval = window.setInterval(refresh, 250);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      clearInterval(interval);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, []);

  useEffect(() => {
    const before = previous.current;
    if (snapshot && before) {
      const opening =
        before.phase === "waiting" && snapshot.phase === "running" && config.startSound;
      const closing =
        before.phase === "running" && snapshot.phase === "finished" && config.endSound;
      const nearing =
        before.phase === "running" &&
        snapshot.phase === "running" &&
        config.warningSound &&
        config.warningMinutes > 0 &&
        before.remainingMs > config.warningMinutes * 60000 &&
        snapshot.remainingMs <= config.warningMinutes * 60000;
      if (opening || closing || nearing) play();
    }
    previous.current = snapshot;
  }, [snapshot, config, play]);

  const openSettings = (reset = false) => {
    const next = reset ? { ...DEFAULT_EXAM.config } : { ...config };
    if (!session || ended) {
      next.start = "";
      next.end = "";
    }
    setEditing(next);
    reveal();
  };
  const submit = async (next: ExamConfig) => {
    if (
      session &&
      !ended &&
      !(await confirm({
        title: "修改当前考试？",
        description: "将按新设置重新计算考试时间。",
        confirmLabel: "应用设置",
      }))
    )
      return;
    const current = getAdjustedNowMs();
    const nextSession = startExam(next, current);
    previous.current = examSnapshot(nextSession, current);
    save({ config: next, session: nextSession });
    setEditing(null);
    if (next.startSound && current >= nextSession.startAt) play();
  };
  const finish = async () => {
    if (
      !session ||
      !(await confirm({
        title: "提前结束考试？",
        description: "结束后将保留当前剩余时间。",
        confirmLabel: "结束考试",
        variant: "danger",
      }))
    )
      return;
    const current = examSnapshot(session, getAdjustedNowMs());
    save({
      config,
      session: {
        ...session,
        endedMs: current.phase === "waiting" ? session.durationMs : current.remainingMs,
        pausedMs: null,
      },
    });
  };
  return (
    <section
      className={styles.screen}
      aria-label="考试计时屏"
      onPointerMove={reveal}
      onPointerDown={reveal}
      onFocusCapture={reveal}
      onKeyDown={reveal}
    >
      <header className={styles.header}>
        <div className={styles.subject}>
          <span title={config.subject} tabIndex={0}>
            {config.subject}
          </span>
          <small aria-live="polite">{snapshot ? PHASE_LABELS[snapshot.phase] : "准备考试"}</small>
        </div>
        <div className={styles.clock}>
          <small>当前时间</small>
          <time>{clock(now)}</time>
        </div>
      </header>
      <TimeStage layout="viewport" placement="overlay">
        <TimeStageValue
          style={{ ...timeStyle, ...(warning ? { color: "var(--ui-color-warning)" } : {}) }}
          role="timer"
          aria-label={snapshot?.phase === "waiting" ? "距开考" : "剩余时间"}
        >
          {formatExamTime(snapshot?.remainingMs ?? config.minutes * 60000)}
        </TimeStageValue>
      </TimeStage>
      <footer className={styles.footer}>
        <span>
          {session ? (
            <>
              {timestamp(session.startAt)} —{" "}
              {snapshot?.phase === "paused"
                ? "恢复后顺延"
                : `${session.kind === "immediate" ? "预计 " : ""}${timestamp(session.endAt)}`}
            </>
          ) : (
            "设置科目和时间后开始"
          )}
        </span>
        <span>共 {session ? Math.round(session.durationMs / 60000) : config.minutes} 分钟</span>
      </footer>
      {config.progress && session && (
        <div className={styles.progress}>
          <Progress
            label="考试进度"
            value={
              snapshot?.phase === "waiting"
                ? 0
                : Math.max(0, session.durationMs - (snapshot?.remainingMs ?? 0))
            }
            max={session.durationMs}
          />
        </div>
      )}
      <div
        ref={toolbar}
        className={styles.toolbar}
        data-visible={visible || Boolean(editing)}
        inert={!visible && !editing}
        role="toolbar"
        aria-label="考试操作"
      >
        {session?.kind === "immediate" &&
          (snapshot?.phase === "running" || snapshot?.phase === "paused") && (
            <Button
              size="sm"
              onClick={() =>
                save({ config, session: toggleExamPause(session, getAdjustedNowMs()) })
              }
            >
              {snapshot.phase === "paused" ? "继续" : "暂停"}
            </Button>
          )}
        {(!session || ended) && (
          <Button size="sm" onClick={() => openSettings()}>
            {ended ? "再考一次" : "考试设置"}
          </Button>
        )}
        <Button size="sm" variant="ghost" onClick={toggleFullscreen}>
          {fullscreen ? "退出全屏" : "全屏"}
        </Button>
        <Dropdown
          placeholder="更多"
          placement="above"
          menuWidth={180}
          options={[
            { value: "settings", label: ended ? "重新设置" : "考试设置" },
            ...(session && !ended ? [{ value: "finish", label: "提前结束" }] : []),
            { value: "clock", label: "返回时钟" },
          ]}
          onChange={(value) => {
            if (value === "settings") openSettings(Boolean(ended));
            if (value === "finish") void finish();
            if (value === "clock") navigate("/clock");
          }}
        />
      </div>
      {editing && (
        <ExamSettings
          initial={editing}
          onSave={submit}
          onClose={() => {
            setEditing(null);
            reveal();
          }}
        />
      )}
    </section>
  );
}
