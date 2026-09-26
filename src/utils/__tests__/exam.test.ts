import { beforeEach, describe, expect, it } from "vitest";

import { getAppSettings, normalizeAppSettings, updateAppSettings } from "../appSettings";
import {
  DEFAULT_EXAM,
  EXAM_PRESETS,
  examSnapshot,
  formatExamTime,
  localDateTime,
  normalizeExam,
  startExam,
  toggleExamPause,
  validateExam,
} from "../exam";

const now = new Date("2026-09-26T09:00:00").getTime();
describe("考试计时", () => {
  beforeEach(() => localStorage.clear());
  it("九科预设时长准确", () => {
    expect(EXAM_PRESETS.map((value) => [value.subject, value.minutes])).toEqual([
      ["语文", 150],
      ["数学", 120],
      ["英语", 120],
      ["物理", 75],
      ["化学", 75],
      ["生物", 75],
      ["地理", 75],
      ["政治", 75],
      ["历史", 75],
    ]);
  });
  it("暂停保存毫秒，刷新后继续并顺延结束时间", () => {
    const session = startExam(DEFAULT_EXAM.config, now);
    const paused = toggleExamPause(session, now + 1250);
    updateAppSettings({ exam: { config: DEFAULT_EXAM.config, session: paused } });
    const restored = getAppSettings().exam.session!;
    expect(examSnapshot(restored, now + 600000)).toEqual({
      phase: "paused",
      remainingMs: 9000000 - 1250,
    });
    const resumed = toggleExamPause(restored, now + 600000);
    expect(resumed.endAt).toBe(now + 600000 + 9000000 - 1250);
    expect(examSnapshot(resumed, resumed.endAt).phase).toBe("finished");
  });
  it("固定时间段自动等待、开考、结束且无法暂停", () => {
    const config = {
      ...DEFAULT_EXAM.config,
      kind: "scheduled" as const,
      start: localDateTime(now + 60000),
      end: localDateTime(now + 3600000),
    };
    const session = startExam(config, now);
    expect(examSnapshot(session, now).phase).toBe("waiting");
    expect(examSnapshot(session, now + 60000).phase).toBe("running");
    expect(toggleExamPause(session, now + 90000)).toBe(session);
    expect(examSnapshot(session, now + 7200000)).toEqual({ phase: "finished", remainingMs: 0 });
    expect(examSnapshot(startExam(config, now + 120000), now + 120000).remainingMs).toBe(3480000);
  });
  it("提前结束保留剩余时间，后台跳时以结束时间为准", () => {
    const session = startExam(DEFAULT_EXAM.config, now);
    expect(examSnapshot(session, now + 600000).remainingMs).toBe(8400000);
    const ended = { ...session, endedMs: 8400000 };
    expect(examSnapshot(ended, now + 99999999)).toEqual({ phase: "ended", remainingMs: 8400000 });
  });
  it("拒绝空科目、无效时长、倒置或已过期时间段", () => {
    expect(validateExam({ ...DEFAULT_EXAM.config, subject: " " }, now)).toBeTruthy();
    expect(validateExam({ ...DEFAULT_EXAM.config, minutes: 0 }, now)).toBeTruthy();
    expect(validateExam({ ...DEFAULT_EXAM.config, minutes: NaN }, now)).toBeTruthy();
    const config = {
      ...DEFAULT_EXAM.config,
      kind: "scheduled" as const,
      start: localDateTime(now),
      end: localDateTime(now - 60000),
    };
    expect(validateExam(config, now)).toBeTruthy();
    expect(validateExam({ ...config, start: localDateTime(now - 120000) }, now)).toBeTruthy();
  });
  it("旧配置补全考试和外观场景，损坏会话丢弃", () => {
    const normalized = normalizeAppSettings({ general: { keepAwakeEnabled: true } });
    expect(normalized.exam).toEqual(DEFAULT_EXAM);
    expect(normalized.general.keepAwakeEnabled).toBe(true);
    expect(normalized.appearance.scenes.exam.background.type).toBe("inherit");
    expect(normalizeExam({ session: { endAt: "broken" } }).session).toBeNull();
    expect(normalizeExam({ config: { minutes: -1 } })).toEqual(DEFAULT_EXAM);
  });
  it("固定八位格式且不显示负数", () => {
    expect(formatExamTime(9000000)).toBe("02:30:00");
    expect(formatExamTime(1)).toBe("00:00:01");
    expect(formatExamTime(-1)).toBe("00:00:00");
  });
});
