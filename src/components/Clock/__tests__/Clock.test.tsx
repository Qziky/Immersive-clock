import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { Clock } from "../Clock";

const componentMocks = vi.hoisted(() => ({
  getAdjustedDate: vi.fn(),
  useAppState: vi.fn(),
  useComponentAppearance: vi.fn(),
  useTimer: vi.fn(),
}));

vi.mock("../../../contexts/AppContext", () => ({
  useAppState: componentMocks.useAppState,
}));

vi.mock("../../../contexts/AppearanceContext", () => ({
  useComponentAppearance: componentMocks.useComponentAppearance,
}));

vi.mock("../../../hooks/useTimer", () => ({
  useTimer: componentMocks.useTimer,
}));

vi.mock("../../../utils/timeSync", () => ({
  getAdjustedDate: componentMocks.getAdjustedDate,
}));

describe("Clock", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    componentMocks.getAdjustedDate.mockReturnValue(new Date(2026, 6, 13, 12, 45, 9));
    componentMocks.useComponentAppearance.mockReturnValue({});
  });

  it("默认显示秒数并同步无障碍标签", () => {
    componentMocks.useAppState.mockReturnValue({
      timeDisplay: { showClockSeconds: true, showStudySeconds: true },
    });

    render(<Clock />);

    expect(screen.getByText("12:45:09")).toHaveAttribute("aria-label", "当前时间：12:45:09");
  });

  it("关闭秒数后只显示小时和分钟", () => {
    componentMocks.useAppState.mockReturnValue({
      timeDisplay: { showClockSeconds: false, showStudySeconds: true },
    });

    render(<Clock />);

    expect(screen.getByText("12:45")).toHaveAttribute("aria-label", "当前时间：12:45");
    expect(screen.queryByText("12:45:09")).toBeNull();
  });
});
