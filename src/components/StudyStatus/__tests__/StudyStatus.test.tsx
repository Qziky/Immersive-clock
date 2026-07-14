import { act, cleanup, render, screen } from "@testing-library/react";
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { getDayGreeting } from "../dayGreeting";
import StudyStatus, {
  calculateDayProgress,
  calculateStudyStatus,
  formatRemainingTime,
  getProgressStage,
} from "../StudyStatus";

const mocks = vi.hoisted(() => ({
  getAdjustedDate: vi.fn(),
  readStudySchedule: vi.fn(),
}));

vi.mock("../../../contexts/AppearanceContext", () => ({
  useComponentAppearance: () => ({}),
}));

vi.mock("../../../utils/logger", () => ({
  logger: { error: vi.fn() },
}));

vi.mock("../../../utils/settingsEvents", () => ({
  SETTINGS_EVENTS: {
    SettingsSaved: "settings-saved",
    StudyScheduleUpdated: "study-schedule-updated",
  },
  subscribeSettingsEvent: () => () => undefined,
}));

vi.mock("../../../utils/studyScheduleStorage", () => ({
  readStudySchedule: mocks.readStudySchedule,
}));

vi.mock("../../../utils/timeSync", () => ({
  getAdjustedDate: mocks.getAdjustedDate,
}));

const schedule = [
  { id: "1", startTime: "19:10", endTime: "20:20", name: "第1节自习" },
  { id: "2", startTime: "20:30", endTime: "21:30", name: "第2节自习" },
];

function atTime(hours: number, minutes: number, seconds = 0): Date {
  return new Date(2026, 6, 13, hours, minutes, seconds);
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe("StudyStatus 进度模型", () => {
  it("按 24 小时计算今日进度并在午夜重置", () => {
    const midnight = calculateDayProgress(atTime(0, 0));
    const noon = calculateDayProgress(atTime(12, 0));
    const endOfDay = calculateDayProgress(atTime(23, 59, 59));
    const nextMidnight = calculateDayProgress(new Date(2026, 6, 14, 0, 0, 0));

    expect(midnight.progress).toBe(0);
    expect(midnight.remainingSeconds).toBe(24 * 60 * 60);
    expect(noon.progress).toBe(50);
    expect(noon.remainingSeconds).toBe(12 * 60 * 60);
    expect(Math.floor(endOfDay.progress)).toBe(99);
    expect(endOfDay.remainingSeconds).toBe(1);
    expect(nextMidnight.progress).toBe(0);
    expect(nextMidnight.remainingSeconds).toBe(24 * 60 * 60);
  });

  it.each([
    ["00:00", 0, 0, "凌晨啦 (－_－) zZ", "凌晨啦"],
    ["03:59", 3, 59, "凌晨啦 (－_－) zZ", "凌晨啦"],
    ["04:59", 4, 59, "凌晨啦 (－_－) zZ", "凌晨啦"],
    ["05:00", 5, 0, "早安呀 (｡･ω･｡)ﾉ", "早安呀"],
    ["08:00", 8, 0, "上午好 (•̀ᴗ•́)و", "上午好"],
    ["11:00", 11, 0, "中午好 (｡•ㅅ•｡)", "中午好"],
    ["14:00", 14, 0, "下午好 (ง •̀_•́)ง", "下午好"],
    ["18:00", 18, 0, "晚上好 (´▽｀)ノ♪", "晚上好"],
    ["22:00", 22, 0, "夜深啦 (。-ω-)zzz", "夜深啦"],
    ["23:59", 23, 59, "夜深啦 (。-ω-)zzz", "夜深啦"],
  ] as const)("%s 使用对应的今日问候", (_label, hours, minutes, text, ariaText) => {
    expect(getDayGreeting(atTime(hours, minutes))).toEqual({ ariaText, text });
  });

  it("按秒计算课程进度、剩余时间和阶段文案", () => {
    const status = calculateStudyStatus(schedule, atTime(19, 27, 30));

    expect(status.progress).toBe(25);
    expect(status.remainingSeconds).toBe(52 * 60 + 30);
    expect(status.stageText).toBe("渐入佳境");
    expect(status.statusText).toBe("第1节自习");
  });

  it("为课间提供独立节奏文案和下一节倒计时", () => {
    const status = calculateStudyStatus(schedule, atTime(20, 25));

    expect(status.isInClass).toBe(false);
    expect(status.progress).toBe(50);
    expect(status.remainingSeconds).toBe(5 * 60);
    expect(status.stageText).toBe("准备回来");
  });

  it("覆盖课程阶段与剩余时间格式", () => {
    expect(getProgressStage(10, true)).toBe("进入状态");
    expect(getProgressStage(55, true)).toBe("保持专注");
    expect(getProgressStage(91, true)).toBe("准备收尾");
    expect(formatRemainingTime(32)).toBe("还剩 32 秒");
    expect(formatRemainingTime(61)).toBe("还剩 2 分钟");
    expect(formatRemainingTime(60 * 60)).toBe("还剩 1 小时");
  });
});

describe("StudyStatus 界面", () => {
  it("默认显示今日进度、剩余时间和向下取整的百分比", () => {
    mocks.readStudySchedule.mockReturnValue(schedule);
    mocks.getAdjustedDate.mockImplementation(() => atTime(3, 59));

    render(<StudyStatus />);
    const progressbar = screen.getByRole("progressbar", { name: "今日进度" });

    expect(progressbar).toHaveAttribute("aria-valuenow", "16");
    expect(progressbar).toHaveAttribute("aria-valuetext", "凌晨啦，还剩 20 小时 1 分钟");
    expect(screen.getByText("今日进度")).toBeInTheDocument();
    expect(screen.getByText("凌晨啦 (－_－) zZ")).toBeInTheDocument();
    expect(screen.getByText("还剩 20 小时 1 分钟")).toBeInTheDocument();
    expect(screen.getByText("16%")).toBeInTheDocument();
  });

  it("跨过问候时段边界后自动更新可见文案和读屏文本", () => {
    vi.useFakeTimers();
    let now = atTime(4, 59, 59);
    mocks.readStudySchedule.mockReturnValue(schedule);
    mocks.getAdjustedDate.mockImplementation(() => now);

    render(<StudyStatus />);
    const progressbar = screen.getByRole("progressbar", { name: "今日进度" });
    expect(screen.getByText("凌晨啦 (－_－) zZ")).toBeInTheDocument();
    expect(progressbar).toHaveAttribute("aria-valuetext", "凌晨啦，还剩 19 小时 1 分钟");

    now = atTime(5, 0);
    act(() => vi.advanceTimersByTime(1000));

    expect(screen.queryByText("凌晨啦 (－_－) zZ")).not.toBeInTheDocument();
    expect(screen.getByText("早安呀 (｡･ω･｡)ﾉ")).toBeInTheDocument();
    expect(progressbar).toHaveAttribute("aria-valuetext", "早安呀，还剩 19 小时");
  });

  it("显示中央节奏信息，不渲染轨道圆点", () => {
    mocks.readStudySchedule.mockReturnValue(schedule);
    mocks.getAdjustedDate.mockImplementation(() => atTime(20, 13));

    const { container } = render(<StudyStatus mode="schedule" />);
    const progressbar = screen.getByRole("progressbar", { name: "第1节自习进度" });

    expect(progressbar).toHaveAttribute("aria-valuenow", "90");
    expect(progressbar).toHaveAttribute("aria-valuetext", "准备收尾，还剩 7 分钟");
    expect(screen.getByText("准备收尾")).toBeInTheDocument();
    expect(screen.getByText("还剩 7 分钟")).toBeInTheDocument();
    expect(container.querySelectorAll("[data-checkpoint]")).toHaveLength(0);
    expect(container.querySelector("[data-progress-cursor]")).not.toBeInTheDocument();
  });

  it("切换模式时立即渲染同一模式的文案、进度和无障碍属性", () => {
    mocks.readStudySchedule.mockReturnValue(schedule);
    mocks.getAdjustedDate.mockImplementation(() => atTime(20, 13));

    const { rerender } = render(<StudyStatus mode="day" />);
    expect(screen.getByRole("progressbar", { name: "今日进度" })).toHaveAttribute(
      "aria-valuenow",
      "84"
    );

    rerender(<StudyStatus mode="schedule" />);
    const progressbar = screen.getByRole("progressbar", { name: "第1节自习进度" });
    expect(progressbar).toHaveAttribute("aria-valuenow", "90");
    expect(progressbar).toHaveAttribute("aria-valuetext", "准备收尾，还剩 7 分钟");
    expect(screen.queryByText("今日进度")).not.toBeInTheDocument();
  });
});
