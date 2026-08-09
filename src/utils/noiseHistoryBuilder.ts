import { DEFAULT_NOISE_REPORT_RETENTION_DAYS } from "../constants/noiseReport";
import type { NoiseSliceSummary } from "../types/noise";
import type { StudyTimetableSettings } from "../types/studySchedule";

import { aggregateNoiseSlicesForRange } from "./noiseReportAggregation";
import { resolveStudyDaySchedule } from "./studyTimetable";

export interface NoiseHistoryPeriod {
  id: string;
  name: string;
  start: Date;
  end: Date;
}

export interface NoiseHistoryListItem {
  period: NoiseHistoryPeriod;
  avgScore: number | null;
  totalMs: number;
  periodMs: number;
  coverageRatio: number;
}

function getDateKey(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function parseDateKey(dateKey: string): { year: number; month: number; day: number } | null {
  const m = dateKey.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const year = parseInt(m[1], 10);
  const month = parseInt(m[2], 10);
  const day = parseInt(m[3], 10);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return null;
  return { year, month, day };
}

function buildDateTime(dateKey: string, timeStr: string): Date | null {
  const parsed = parseDateKey(dateKey);
  if (!parsed) return null;
  const [hours, minutes, seconds] = timeStr.split(":").map((part) => parseInt(part, 10));
  if (![hours, minutes, seconds].every(Number.isFinite)) return null;
  return new Date(parsed.year, parsed.month - 1, parsed.day, hours, minutes, seconds, 0);
}

/**
 * 构建噪音历史列表
 * 从最近窗口期内的噪音切片与课表生成“课时-评分-时间”列表
 */
export function buildNoiseHistoryListItems(params: {
  slices: NoiseSliceSummary[];
  timetable: StudyTimetableSettings;
  windowMs?: number;
}): NoiseHistoryListItem[] {
  const { slices, timetable } = params;
  const windowMs =
    typeof params.windowMs === "number" && params.windowMs > 0
      ? params.windowMs
      : DEFAULT_NOISE_REPORT_RETENTION_DAYS * 24 * 60 * 60 * 1000;

  if (slices.length === 0) return [];

  const sortedSlices = slices.slice().sort((a, b) => a.start - b.start);
  const maxEnd = sortedSlices.reduce((m, s) => Math.max(m, s.end), -Infinity);
  const cutoff = maxEnd - windowMs;

  const dateKeys = Array.from(new Set(sortedSlices.map((s) => getDateKey(s.end)))).sort((a, b) =>
    a === b ? 0 : a > b ? -1 : 1
  );

  const items: NoiseHistoryListItem[] = [];
  for (const dateKey of dateKeys) {
    const parsedDate = parseDateKey(dateKey);
    if (!parsedDate) continue;
    const schedule = resolveStudyDaySchedule(
      timetable,
      new Date(parsedDate.year, parsedDate.month - 1, parsedDate.day)
    ).periods;
    for (const p of schedule) {
      const start = buildDateTime(dateKey, p.startTime);
      const endRaw = buildDateTime(dateKey, p.endTime);
      if (!start || !endRaw) continue;

      const end =
        endRaw.getTime() <= start.getTime()
          ? new Date(endRaw.getTime() + 24 * 60 * 60 * 1000)
          : endRaw;

      const startTs = start.getTime();
      const endTs = end.getTime();
      const periodMs = Math.max(1, endTs - startTs);
      if (endTs < cutoff || startTs > maxEnd) continue;

      const aggregate = aggregateNoiseSlicesForRange(sortedSlices, startTs, endTs);
      const avgScore = aggregate.averageScore;
      const totalMs = aggregate.validDurationMs;
      if (totalMs <= 0) continue;

      items.push({
        period: {
          id: `${dateKey}-${p.id}`,
          name: p.name,
          start,
          end,
        },
        avgScore,
        totalMs,
        periodMs,
        coverageRatio: Math.max(0, Math.min(1, totalMs / periodMs)),
      });
    }
  }

  items.sort((a, b) => b.period.end.getTime() - a.period.end.getTime());
  return items;
}
