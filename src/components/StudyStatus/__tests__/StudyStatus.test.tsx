import { cleanup, render, screen } from "@testing-library/react";
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import StudyStatus, {
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
  vi.clearAllMocks();
});

describe("StudyStatus 进度模型", () => {
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
  it("显示中央节奏信息，不渲染轨道圆点", () => {
    mocks.readStudySchedule.mockReturnValue(schedule);
    mocks.getAdjustedDate.mockImplementation(() => atTime(20, 13));

    const { container } = render(<StudyStatus />);
    const progressbar = screen.getByRole("progressbar", { name: "第1节自习进度" });

    expect(progressbar).toHaveAttribute("aria-valuenow", "90");
    expect(progressbar).toHaveAttribute("aria-valuetext", "准备收尾，还剩 7 分钟");
    expect(screen.getByText("准备收尾")).toBeInTheDocument();
    expect(screen.getByText("还剩 7 分钟")).toBeInTheDocument();
    expect(container.querySelectorAll("[data-checkpoint]")).toHaveLength(0);
    expect(container.querySelector("[data-progress-cursor]")).not.toBeInTheDocument();
  });
});
