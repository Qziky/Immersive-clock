import { describe, expect, it } from "vitest";

import {
  COUNTDOWN_EVENT_PRESETS,
  getCountdownEventPreset,
  getCountdownEventTargetDate,
  isCountdownQuickEventKind,
} from "../countdownEvents";

describe("countdownEvents", () => {
  it("提供统一的考试快捷事件列表", () => {
    expect(COUNTDOWN_EVENT_PRESETS.map((preset) => preset.kind)).toEqual([
      "gaokao",
      "zhongkao",
      "kaoyan",
      "gongkao",
    ]);
    expect(getCountdownEventPreset("kaoyan").label).toBe("考研");
    expect(isCountdownQuickEventKind("gongkao")).toBe(true);
    expect(isCountdownQuickEventKind("custom")).toBe(false);
  });

  it.each([
    ["gaokao", 2027, 6, 7],
    ["zhongkao", 2027, 6, 20],
    ["kaoyan", 2027, 12, 20],
    ["gongkao", 2027, 11, 28],
  ] as const)("计算 %s 的 %s 年目标日期", (kind, year, month, day) => {
    const target = getCountdownEventTargetDate(kind, year);

    expect(target.getFullYear()).toBe(year);
    expect(target.getMonth() + 1).toBe(month);
    expect(target.getDate()).toBe(day);
  });
});
