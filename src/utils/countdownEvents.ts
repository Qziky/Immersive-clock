import type { CountdownQuickEventKind } from "../types";

export interface CountdownEventPreset {
  kind: CountdownQuickEventKind;
  label: string;
  name: string;
  description: string;
  targetDescription: string;
  getTargetDate: (year: number) => Date;
}

function createDate(year: number, month: number, day: number): Date {
  return new Date(year, month - 1, day, 0, 0, 0, 0);
}

function getLastSundayOfNovember(year: number): Date {
  const date = createDate(year, 11, 30);
  date.setDate(date.getDate() - date.getDay());
  return date;
}

export const COUNTDOWN_EVENT_PRESETS: readonly CountdownEventPreset[] = [
  {
    kind: "gaokao",
    label: "高考",
    name: "高考倒计时",
    description: "全国普通高等学校招生考试",
    targetDescription: "每年 6 月 7 日",
    getTargetDate: (year) => createDate(year, 6, 7),
  },
  {
    kind: "zhongkao",
    label: "中考",
    name: "中考倒计时",
    description: "初中学业水平考试",
    targetDescription: "常用日期：每年 6 月 20 日",
    getTargetDate: (year) => createDate(year, 6, 20),
  },
  {
    kind: "kaoyan",
    label: "考研",
    name: "考研倒计时",
    description: "全国硕士研究生招生考试",
    targetDescription: "常用日期：每年 12 月 20 日",
    getTargetDate: (year) => createDate(year, 12, 20),
  },
  {
    kind: "gongkao",
    label: "考公",
    name: "考公倒计时",
    description: "国家公务员考试",
    targetDescription: "常用日期：每年 11 月最后一个周日",
    getTargetDate: getLastSundayOfNovember,
  },
];

const PRESET_BY_KIND = new Map(
  COUNTDOWN_EVENT_PRESETS.map((preset) => [preset.kind, preset] as const)
);

export function isCountdownQuickEventKind(
  kind: string | undefined
): kind is CountdownQuickEventKind {
  return PRESET_BY_KIND.has(kind as CountdownQuickEventKind);
}

export function getCountdownEventPreset(kind: CountdownQuickEventKind): CountdownEventPreset {
  return PRESET_BY_KIND.get(kind) ?? COUNTDOWN_EVENT_PRESETS[0];
}

export function getCountdownEventTargetDate(kind: CountdownQuickEventKind, year: number): Date {
  return getCountdownEventPreset(kind).getTargetDate(year);
}

export function formatCountdownEventDate(date: Date): string {
  return date.toLocaleDateString("zh-CN", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}
