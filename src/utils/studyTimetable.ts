import { parse, stringify } from "yaml";

import type {
  CsesClass,
  CsesCycle,
  CsesCycleSpan,
  CsesDocument,
  CsesSchedule,
  CsesSubject,
  LegacyStudyPeriod,
  StudyPeriod,
  StudyTimetableSettings,
} from "../types/studySchedule";

export const CSES_VERSION = 2 as const;
export const DEFAULT_CYCLE_ANCHOR_DATE = "2000-01-03";
export const MAX_CSES_YAML_BYTES = 1024 * 1024;

const SECONDS_PER_DAY = 24 * 60 * 60;
const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;
const CSES_TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d):([0-5]\d)$/;
const LEGACY_TIME_PATTERN = /^([01]?\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?$/;
const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

export interface CsesValidationIssue {
  path: string;
  message: string;
}

export interface CsesValidationResult {
  issues: CsesValidationIssue[];
  valid: boolean;
}

export interface ResolvedStudyDay {
  activity: "before-cycle" | "rest" | "work";
  cycleDay: number | null;
  cycleLength: number;
  periods: StudyPeriod[];
  scheduleNames: string[];
  workDay: number | null;
}

export class CsesValidationError extends Error {
  constructor(public readonly issues: CsesValidationIssue[]) {
    super(issues[0]?.message ?? "CSES 文件无效");
    this.name = "CsesValidationError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function pushIssue(issues: CsesValidationIssue[], path: string, message: string): void {
  issues.push({ path, message });
}

function isIntegerAtLeast(value: unknown, minimum: number): value is number {
  return Number.isInteger(value) && Number(value) >= minimum;
}

function readRequiredString(
  value: unknown,
  path: string,
  issues: CsesValidationIssue[],
  allowEmpty = false
): string | null {
  if (typeof value !== "string") {
    pushIssue(issues, path, "必须是字符串");
    return null;
  }
  if (!allowEmpty && value.trim().length === 0) {
    pushIssue(issues, path, "不能为空");
    return null;
  }
  return value;
}

export function parseCsesTime(value: string): number | null {
  const match = CSES_TIME_PATTERN.exec(value);
  if (!match) return null;
  return Number(match[1]) * 60 * 60 + Number(match[2]) * 60 + Number(match[3]);
}

export function normalizeLegacyTime(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const match = LEGACY_TIME_PATTERN.exec(value.trim());
  if (!match) return null;
  return `${String(Number(match[1])).padStart(2, "0")}:${match[2]}:${match[3] ?? "00"}`;
}

export function formatCsesTimeFromSeconds(totalSeconds: number): string {
  const safeSeconds = Math.max(0, Math.min(SECONDS_PER_DAY - 1, Math.round(totalSeconds)));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const seconds = safeSeconds % 60;
  return [hours, minutes, seconds].map((part) => String(part).padStart(2, "0")).join(":");
}

function dateToUtcDay(value: string): number | null {
  const match = DATE_PATTERN.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const timestamp = Date.UTC(year, month - 1, day);
  const parsed = new Date(timestamp);
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    return null;
  }
  return Math.floor(timestamp / MILLISECONDS_PER_DAY);
}

function localDateToUtcDay(value: Date): number {
  return Math.floor(
    Date.UTC(value.getFullYear(), value.getMonth(), value.getDate()) / MILLISECONDS_PER_DAY
  );
}

export function isValidCycleAnchorDate(value: unknown): value is string {
  return typeof value === "string" && dateToUtcDay(value) !== null;
}

function validateCycle(value: unknown, issues: CsesValidationIssue[]): CsesCycle | null {
  if (!isRecord(value)) {
    pushIssue(issues, "configuration.cycle", "必须是对象");
    return null;
  }

  const workCount = value.work_count;
  const restCount = value.rest_count;
  if (!isIntegerAtLeast(workCount, 2)) {
    pushIssue(issues, "configuration.cycle.work_count", "必须是大于等于 2 的整数");
  }
  if (!isIntegerAtLeast(restCount, 1)) {
    pushIssue(issues, "configuration.cycle.rest_count", "必须是大于等于 1 的整数");
  }
  if (!Array.isArray(value.spans)) {
    pushIssue(issues, "configuration.cycle.spans", "必须是数组");
    return null;
  }

  let workSpanCount = 0;
  let restSpanCount = 0;
  value.spans.forEach((spanValue, index) => {
    const path = `configuration.cycle.spans[${index}]`;
    if (!isRecord(spanValue)) {
      pushIssue(issues, path, "必须是对象");
      return;
    }
    if (spanValue.activity !== "work" && spanValue.activity !== "rest") {
      pushIssue(issues, `${path}.activity`, "必须是 work 或 rest");
    }
    if (!isIntegerAtLeast(spanValue.count, 1)) {
      pushIssue(issues, `${path}.count`, "必须是大于等于 1 的整数");
      return;
    }
    if (spanValue.activity === "work") workSpanCount += spanValue.count;
    if (spanValue.activity === "rest") restSpanCount += spanValue.count;
  });

  if (typeof workCount === "number" && workSpanCount !== workCount) {
    pushIssue(issues, "configuration.cycle.work_count", "必须等于 spans 中 work 的数量总和");
  }
  if (typeof restCount === "number" && restSpanCount !== restCount) {
    pushIssue(issues, "configuration.cycle.rest_count", "必须等于 spans 中 rest 的数量总和");
  }

  return value as CsesCycle;
}

function validateSubjects(value: unknown, issues: CsesValidationIssue[]): Set<string> {
  const names = new Set<string>();
  if (!Array.isArray(value)) {
    pushIssue(issues, "subjects", "必须是数组");
    return names;
  }

  value.forEach((subjectValue, index) => {
    const path = `subjects[${index}]`;
    if (!isRecord(subjectValue)) {
      pushIssue(issues, path, "必须是对象");
      return;
    }
    const name = readRequiredString(subjectValue.name, `${path}.name`, issues);
    for (const field of ["simplified_name", "location", "teacher"] as const) {
      if (subjectValue[field] !== undefined && typeof subjectValue[field] !== "string") {
        pushIssue(issues, `${path}.${field}`, "必须是字符串");
      }
    }
    if (!name) return;
    if (names.has(name)) {
      pushIssue(issues, `${path}.name`, "课程名称必须唯一");
      return;
    }
    names.add(name);
  });

  return names;
}

interface ValidatedClassLocation {
  classValue: CsesClass;
  classIndex: number;
  scheduleIndex: number;
  start: number;
  end: number;
}

function validateSchedules(
  value: unknown,
  workCount: number | null,
  subjectNames: Set<string>,
  issues: CsesValidationIssue[]
): void {
  if (!Array.isArray(value)) {
    pushIssue(issues, "schedules", "必须是数组");
    return;
  }

  const classesByWorkDay = new Map<number, ValidatedClassLocation[]>();

  value.forEach((scheduleValue, scheduleIndex) => {
    const path = `schedules[${scheduleIndex}]`;
    if (!isRecord(scheduleValue)) {
      pushIssue(issues, path, "必须是对象");
      return;
    }
    readRequiredString(scheduleValue.name, `${path}.name`, issues);

    const enabledDays: number[] = [];
    if (!Array.isArray(scheduleValue.enable_day)) {
      pushIssue(issues, `${path}.enable_day`, "必须是数组");
    } else {
      const seenDays = new Set<number>();
      scheduleValue.enable_day.forEach((dayValue, dayIndex) => {
        const dayPath = `${path}.enable_day[${dayIndex}]`;
        if (!isIntegerAtLeast(dayValue, 1)) {
          pushIssue(issues, dayPath, "必须是大于等于 1 的整数");
          return;
        }
        if (workCount !== null && dayValue > workCount) {
          pushIssue(issues, dayPath, `不能超过 work_count（${workCount}）`);
        }
        if (seenDays.has(dayValue)) {
          pushIssue(issues, dayPath, "同一日课程表不能重复启用同一个上课日");
          return;
        }
        seenDays.add(dayValue);
        enabledDays.push(dayValue);
      });
    }

    if (!Array.isArray(scheduleValue.classes)) {
      pushIssue(issues, `${path}.classes`, "必须是数组");
      return;
    }

    scheduleValue.classes.forEach((classValue, classIndex) => {
      const classPath = `${path}.classes[${classIndex}]`;
      if (!isRecord(classValue)) {
        pushIssue(issues, classPath, "必须是对象");
        return;
      }
      const subject = readRequiredString(classValue.subject, `${classPath}.subject`, issues);
      if (subject && !subjectNames.has(subject)) {
        pushIssue(issues, `${classPath}.subject`, "必须引用 subjects 中已存在的课程");
      }
      const startText = readRequiredString(
        classValue.start_time,
        `${classPath}.start_time`,
        issues
      );
      const endText = readRequiredString(classValue.end_time, `${classPath}.end_time`, issues);
      const start = startText ? parseCsesTime(startText) : null;
      const end = endText ? parseCsesTime(endText) : null;
      if (startText && start === null) {
        pushIssue(issues, `${classPath}.start_time`, "必须使用 HH:mm:ss 格式");
      }
      if (endText && end === null) {
        pushIssue(issues, `${classPath}.end_time`, "必须使用 HH:mm:ss 格式");
      }
      if (start !== null && end !== null && start >= end) {
        pushIssue(issues, `${classPath}.end_time`, "必须晚于开始时间");
      }
      if (start === null || end === null || start >= end) return;
      enabledDays.forEach((day) => {
        const entries = classesByWorkDay.get(day) ?? [];
        entries.push({
          classValue: classValue as CsesClass,
          classIndex,
          scheduleIndex,
          start,
          end,
        });
        classesByWorkDay.set(day, entries);
      });
    });
  });

  classesByWorkDay.forEach((classes, workDay) => {
    classes.sort((first, second) => first.start - second.start || first.end - second.end);
    for (let index = 0; index < classes.length - 1; index += 1) {
      const current = classes[index];
      const next = classes[index + 1];
      if (current.end <= next.start) continue;
      pushIssue(
        issues,
        `schedules[${next.scheduleIndex}].classes[${next.classIndex}]`,
        `与第 ${workDay} 个上课日的其他课时重叠`
      );
    }
  });
}

export function validateCsesDocument(value: unknown): CsesValidationResult {
  const issues: CsesValidationIssue[] = [];
  if (!isRecord(value)) {
    return { valid: false, issues: [{ path: "$", message: "根节点必须是对象" }] };
  }

  if (value.version !== CSES_VERSION) {
    pushIssue(issues, "version", "仅支持 CSES v2");
  }

  let cycle: CsesCycle | null = null;
  if (!isRecord(value.configuration)) {
    pushIssue(issues, "configuration", "必须是对象");
  } else {
    readRequiredString(value.configuration.name, "configuration.name", issues);
    readRequiredString(value.configuration.description, "configuration.description", issues, true);
    cycle = validateCycle(value.configuration.cycle, issues);
  }

  const subjectNames = validateSubjects(value.subjects, issues);
  validateSchedules(
    value.schedules,
    cycle && isIntegerAtLeast(cycle.work_count, 2) ? cycle.work_count : null,
    subjectNames,
    issues
  );

  return { valid: issues.length === 0, issues };
}

export function validateStudyTimetable(value: unknown): CsesValidationResult {
  if (!isRecord(value)) {
    return { valid: false, issues: [{ path: "$", message: "课程表设置必须是对象" }] };
  }
  const result = validateCsesDocument(value.document);
  const issues = [...result.issues];
  if (!isValidCycleAnchorDate(value.cycleAnchorDate)) {
    pushIssue(issues, "cycleAnchorDate", "必须是有效的 YYYY-MM-DD 日期");
  }
  return { valid: issues.length === 0, issues };
}

export function parseCsesYaml(source: string): CsesDocument {
  let parsed: unknown;
  try {
    parsed = parse(source, { maxAliasCount: 100, prettyErrors: true, strict: true });
  } catch (error) {
    throw new CsesValidationError([
      { path: "$", message: error instanceof Error ? error.message : "YAML 解析失败" },
    ]);
  }
  const validation = validateCsesDocument(parsed);
  if (!validation.valid) throw new CsesValidationError(validation.issues);
  return parsed as CsesDocument;
}

export function serializeCsesYaml(document: CsesDocument): string {
  const validation = validateCsesDocument(document);
  if (!validation.valid) throw new CsesValidationError(validation.issues);
  return stringify(document, { indent: 2, lineWidth: 0, sortMapEntries: false });
}

function createDefaultDocument(): CsesDocument {
  return {
    version: CSES_VERSION,
    configuration: {
      name: "工作日晚自习",
      description: "默认上 5 休 2 的晚自习模板，可按实际作息修改",
      cycle: {
        work_count: 5,
        rest_count: 2,
        spans: [
          { activity: "work", count: 5 },
          { activity: "rest", count: 2 },
        ],
      },
    },
    subjects: [
      { name: "自习", simplified_name: "自习" },
      { name: "语文", simplified_name: "语" },
      { name: "数学", simplified_name: "数" },
      { name: "英语", simplified_name: "英" },
    ],
    schedules: [
      {
        name: "工作日",
        enable_day: [1, 2, 3, 4, 5],
        classes: [
          { subject: "自习", start_time: "19:10:00", end_time: "20:20:00" },
          { subject: "自习", start_time: "20:30:00", end_time: "22:20:00" },
        ],
      },
    ],
  };
}

export function createDefaultStudyTimetable(): StudyTimetableSettings {
  return {
    document: createDefaultDocument(),
    cycleAnchorDate: DEFAULT_CYCLE_ANCHOR_DATE,
  };
}

export const DEFAULT_TIMETABLE = createDefaultStudyTimetable();

function canonicalizeStructure(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalizeStructure);
  if (!isRecord(value)) return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, canonicalizeStructure(value[key])])
  );
}

function createLegacyDefaultTimetable(name: string, description: string): StudyTimetableSettings {
  return {
    cycleAnchorDate: DEFAULT_CYCLE_ANCHOR_DATE,
    document: {
      version: CSES_VERSION,
      configuration: {
        name,
        description,
        cycle: {
          work_count: 5,
          rest_count: 2,
          spans: [
            { activity: "work", count: 5 },
            { activity: "rest", count: 2 },
          ],
        },
      },
      subjects: [{ name: "第1节自习" }, { name: "第2节自习" }],
      schedules: [
        {
          name: "周一至周五",
          enable_day: [1, 2, 3, 4, 5],
          classes: [
            { subject: "第1节自习", start_time: "19:10:00", end_time: "20:20:00" },
            { subject: "第2节自习", start_time: "20:30:00", end_time: "22:20:00" },
          ],
        },
      ],
    },
  };
}

function createV17DefaultTimetable(): StudyTimetableSettings {
  return {
    cycleAnchorDate: DEFAULT_CYCLE_ANCHOR_DATE,
    document: {
      version: CSES_VERSION,
      configuration: {
        name: "工作日晚自习",
        description: "默认上 5 休 2 的晚自习模板，可按实际作息修改",
        cycle: {
          work_count: 5,
          rest_count: 2,
          spans: [
            { activity: "work", count: 5 },
            { activity: "rest", count: 2 },
          ],
        },
      },
      subjects: [{ name: "自习", simplified_name: "自习" }],
      schedules: [
        {
          name: "工作日",
          enable_day: [1, 2, 3, 4, 5],
          classes: [
            { subject: "自习", start_time: "19:10:00", end_time: "20:20:00" },
            { subject: "自习", start_time: "20:30:00", end_time: "22:20:00" },
          ],
        },
      ],
    },
  };
}

export function isSupersededDefaultStudyTimetable(value: unknown): boolean {
  const canonicalValue = JSON.stringify(canonicalizeStructure(value));
  const supersededCandidates = [
    createLegacyDefaultTimetable("工作日自习课表", "Immersive Clock 默认课程表"),
    createLegacyDefaultTimetable("迁移的工作日课表", "由旧版每日课表迁移，仅在周一至周五生效"),
    createV17DefaultTimetable(),
  ];
  return supersededCandidates.some(
    (candidate) => JSON.stringify(canonicalizeStructure(candidate)) === canonicalValue
  );
}

export function migrateLegacyStudySchedule(value: unknown): StudyTimetableSettings {
  const rows = Array.isArray(value) ? value : [];
  const classes: CsesClass[] = [];
  const subjects: CsesSubject[] = [];
  const subjectNames = new Set<string>();

  rows.forEach((rowValue, index) => {
    if (!isRecord(rowValue)) return;
    const row = rowValue as unknown as LegacyStudyPeriod;
    const start = normalizeLegacyTime(row.startTime);
    const end = normalizeLegacyTime(row.endTime);
    if (!start || !end) return;
    const subjectName =
      typeof row.name === "string" && row.name.trim() ? row.name.trim() : `自定义时段${index + 1}`;
    if (!subjectNames.has(subjectName)) {
      subjectNames.add(subjectName);
      subjects.push({ name: subjectName });
    }
    classes.push({ subject: subjectName, start_time: start, end_time: end });
  });

  if (classes.length === 0) return createDefaultStudyTimetable();

  const migrated: StudyTimetableSettings = {
    cycleAnchorDate: DEFAULT_CYCLE_ANCHOR_DATE,
    document: {
      version: CSES_VERSION,
      configuration: {
        name: "迁移的工作日课表",
        description: "由旧版每日课表迁移，仅在周一至周五生效",
        cycle: {
          work_count: 5,
          rest_count: 2,
          spans: [
            { activity: "work", count: 5 },
            { activity: "rest", count: 2 },
          ],
        },
      },
      subjects,
      schedules: [
        {
          name: "周一至周五",
          enable_day: [1, 2, 3, 4, 5],
          classes,
        },
      ],
    },
  };
  return isSupersededDefaultStudyTimetable(migrated) ? createDefaultStudyTimetable() : migrated;
}

export function normalizeStudyTimetable(value: unknown): StudyTimetableSettings {
  const validation = validateStudyTimetable(value);
  if (validation.valid) return structuredClone(value as StudyTimetableSettings);
  return createDefaultStudyTimetable();
}

export function deriveCycleCounts(
  spans: CsesCycleSpan[]
): Pick<CsesCycle, "work_count" | "rest_count"> {
  return spans.reduce(
    (counts, span) => {
      if (span.activity === "work") counts.work_count += span.count;
      if (span.activity === "rest") counts.rest_count += span.count;
      return counts;
    },
    { work_count: 0, rest_count: 0 }
  );
}

function stablePeriodId(
  workDay: number,
  scheduleIndex: number,
  classIndex: number,
  classValue: CsesClass
): string {
  return [
    "cses",
    workDay,
    scheduleIndex,
    classIndex,
    classValue.subject,
    classValue.start_time,
    classValue.end_time,
  ]
    .join(":")
    .replace(/\s+/g, "-");
}

export function resolveStudyDaySchedule(
  timetable: StudyTimetableSettings,
  date: Date
): ResolvedStudyDay {
  const anchorDay = dateToUtcDay(timetable.cycleAnchorDate);
  const cycle = timetable.document.configuration.cycle;
  const cycleLength = cycle.spans.reduce((total, span) => total + span.count, 0);
  if (anchorDay === null || cycleLength <= 0) {
    return {
      activity: "before-cycle",
      cycleDay: null,
      cycleLength,
      periods: [],
      scheduleNames: [],
      workDay: null,
    };
  }

  const elapsedDays = localDateToUtcDay(date) - anchorDay;
  if (elapsedDays < 0) {
    return {
      activity: "before-cycle",
      cycleDay: null,
      cycleLength,
      periods: [],
      scheduleNames: [],
      workDay: null,
    };
  }

  const zeroBasedCycleDay = elapsedDays % cycleLength;
  let calendarOffset = 0;
  let precedingWorkDays = 0;
  let resolvedActivity: "rest" | "work" = "rest";
  let workDay: number | null = null;

  for (const span of cycle.spans) {
    if (zeroBasedCycleDay < calendarOffset + span.count) {
      resolvedActivity = span.activity;
      if (span.activity === "work") {
        workDay = precedingWorkDays + (zeroBasedCycleDay - calendarOffset) + 1;
      }
      break;
    }
    calendarOffset += span.count;
    if (span.activity === "work") precedingWorkDays += span.count;
  }

  if (resolvedActivity === "rest" || workDay === null) {
    return {
      activity: "rest",
      cycleDay: zeroBasedCycleDay + 1,
      cycleLength,
      periods: [],
      scheduleNames: [],
      workDay: null,
    };
  }

  const subjectMap = new Map(timetable.document.subjects.map((subject) => [subject.name, subject]));
  const scheduleNames: string[] = [];
  const periods: StudyPeriod[] = [];

  timetable.document.schedules.forEach((schedule: CsesSchedule, scheduleIndex) => {
    if (!schedule.enable_day.includes(workDay)) return;
    scheduleNames.push(schedule.name);
    schedule.classes.forEach((classValue, classIndex) => {
      const subject = subjectMap.get(classValue.subject);
      periods.push({
        id: stablePeriodId(workDay, scheduleIndex, classIndex, classValue),
        startTime: classValue.start_time,
        endTime: classValue.end_time,
        name: classValue.subject,
        ...(subject?.simplified_name ? { simplifiedName: subject.simplified_name } : {}),
        ...(subject?.location ? { location: subject.location } : {}),
        ...(subject?.teacher ? { teacher: subject.teacher } : {}),
        scheduleNames: [schedule.name],
      });
    });
  });

  periods.sort((first, second) => {
    return (parseCsesTime(first.startTime) ?? 0) - (parseCsesTime(second.startTime) ?? 0);
  });

  return {
    activity: "work",
    cycleDay: zeroBasedCycleDay + 1,
    cycleLength,
    periods,
    scheduleNames,
    workDay,
  };
}

export function createNewCsesClass(existing: CsesClass[], subject: string): CsesClass {
  const last = [...existing].sort(
    (first, second) =>
      (parseCsesTime(first.start_time) ?? 0) - (parseCsesTime(second.start_time) ?? 0)
  )[existing.length - 1];
  const lastEnd = last ? parseCsesTime(last.end_time) : null;
  const start = lastEnd === null ? 19 * 3600 : Math.min(SECONDS_PER_DAY - 61, lastEnd + 10 * 60);
  const end = Math.min(SECONDS_PER_DAY - 1, start + 60 * 60);
  return {
    subject,
    start_time: formatCsesTimeFromSeconds(start),
    end_time: formatCsesTimeFromSeconds(end),
  };
}

export function cloneCsesDocument(document: CsesDocument): CsesDocument {
  return structuredClone(document);
}
