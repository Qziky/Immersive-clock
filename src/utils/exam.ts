export const EXAM_PRESETS = [
  { subject: "语文", minutes: 150 },
  { subject: "数学", minutes: 120 },
  { subject: "英语", minutes: 120 },
  { subject: "物理", minutes: 75 },
  { subject: "化学", minutes: 75 },
  { subject: "生物", minutes: 75 },
  { subject: "地理", minutes: 75 },
  { subject: "政治", minutes: 75 },
  { subject: "历史", minutes: 75 },
];
export interface ExamConfig {
  subject: string;
  kind: "immediate" | "scheduled";
  minutes: number;
  start: string;
  end: string;
  progress: boolean;
  warningMinutes: number;
  startSound: boolean;
  warningSound: boolean;
  endSound: boolean;
}
export interface ExamSession {
  kind: ExamConfig["kind"];
  startAt: number;
  endAt: number;
  durationMs: number;
  pausedMs: number | null;
  endedMs: number | null;
}
export interface ExamSettings {
  config: ExamConfig;
  session: ExamSession | null;
}
export const DEFAULT_EXAM: ExamSettings = {
  config: {
    subject: "语文",
    kind: "immediate",
    minutes: 150,
    start: "",
    end: "",
    progress: true,
    warningMinutes: 15,
    startSound: false,
    warningSound: false,
    endSound: false,
  },
  session: null,
};
export function localDateTime(timestamp: number): string {
  const date = new Date(timestamp);
  return new Date(timestamp - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}
export function validateExam(config: ExamConfig, now: number): string | null {
  if (!config.subject.trim()) return "请输入考试科目";
  if (!Number.isInteger(config.minutes) || config.minutes < 1 || config.minutes > 5999)
    return "时长须为 1 至 5999 分钟";
  if (!Number.isFinite(config.warningMinutes) || config.warningMinutes < 0)
    return "提醒分钟数不能小于零";
  if (config.kind === "scheduled") {
    const start = Date.parse(config.start),
      end = Date.parse(config.end);
    if (!Number.isFinite(start) || !Number.isFinite(end)) return "请选择完整的开始和结束时间";
    if (end <= start) return "结束时间必须晚于开始时间";
    if (end <= now) return "该考试时间段已经结束";
    if (end - start > 5999 * 60000) return "考试时间段不能超过 5999 分钟";
  }
  return null;
}
export function startExam(config: ExamConfig, now: number): ExamSession {
  const error = validateExam(config, now);
  if (error) throw new Error(error);
  const startAt = config.kind === "scheduled" ? Date.parse(config.start) : now;
  const endAt = config.kind === "scheduled" ? Date.parse(config.end) : now + config.minutes * 60000;
  return {
    kind: config.kind,
    startAt,
    endAt,
    durationMs: endAt - startAt,
    pausedMs: null,
    endedMs: null,
  };
}
export function examSnapshot(session: ExamSession, now: number) {
  if (session.endedMs !== null) return { phase: "ended", remainingMs: session.endedMs } as const;
  if (session.pausedMs !== null) return { phase: "paused", remainingMs: session.pausedMs } as const;
  if (now < session.startAt)
    return { phase: "waiting", remainingMs: session.startAt - now } as const;
  const remainingMs = Math.max(0, session.endAt - now);
  return { phase: remainingMs > 0 ? "running" : "finished", remainingMs } as const;
}
export function toggleExamPause(session: ExamSession, now: number): ExamSession {
  const snapshot = examSnapshot(session, now);
  if (session.kind !== "immediate") return session;
  if (snapshot.phase === "paused")
    return { ...session, endAt: now + snapshot.remainingMs, pausedMs: null };
  if (snapshot.phase === "running") return { ...session, pausedMs: snapshot.remainingMs };
  return session;
}
export function formatExamTime(milliseconds: number): string {
  const seconds = Math.max(0, Math.ceil(milliseconds / 1000));
  return [Math.floor(seconds / 3600), Math.floor(seconds / 60) % 60, seconds % 60]
    .map((value) => String(value).padStart(2, "0"))
    .join(":");
}
export function normalizeExam(value: unknown): ExamSettings {
  if (!value || typeof value !== "object") return structuredClone(DEFAULT_EXAM);
  const input = value as Partial<ExamSettings>;
  const config = { ...DEFAULT_EXAM.config, ...input.config };
  if (
    typeof config.subject !== "string" ||
    !["immediate", "scheduled"].includes(config.kind) ||
    !Number.isFinite(config.minutes) ||
    config.minutes < 1 ||
    config.minutes > 5999
  )
    return structuredClone(DEFAULT_EXAM);
  for (const key of ["progress", "startSound", "warningSound", "endSound"] as const) {
    if (typeof config[key] !== "boolean") config[key] = DEFAULT_EXAM.config[key];
  }
  if (!Number.isFinite(config.warningMinutes) || config.warningMinutes < 0)
    config.warningMinutes = 15;
  if (typeof config.start !== "string") config.start = "";
  if (typeof config.end !== "string") config.end = "";
  const session = input.session;
  const valid =
    session &&
    [session.startAt, session.endAt, session.durationMs].every(Number.isFinite) &&
    session.durationMs > 0 &&
    session.durationMs <= 5999 * 60000 &&
    session.endAt > session.startAt &&
    session.kind === config.kind &&
    [session.pausedMs, session.endedMs].every(
      (value) =>
        value === null ||
        (typeof value === "number" &&
          Number.isFinite(value) &&
          value >= 0 &&
          value <= session.durationMs)
    ) &&
    (session.kind !== "scheduled" || session.pausedMs === null);
  return { config, session: valid ? session : null };
}
