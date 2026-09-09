import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { ControlBar } from "../ControlBar";

const dispatch = vi.fn();
let currentMode = "clock";
vi.mock("../../../contexts/AppContext", () => ({
  useAppState: () => ({ mode: currentMode, countdown: {}, stopwatch: {} }),
  useAppDispatch: () => dispatch,
}));
vi.mock("../../../hooks/useFullscreen", () => ({ useFullscreen: () => [false, vi.fn()] }));

describe("ControlBar 更多模式", () => {
  it("shows the more button only in clock mode", async () => {
    const { rerender } = render(<ControlBar />);
    expect(screen.getByRole("button", { name: "更多" })).toBeVisible();
    currentMode = "countdown";
    rerender(<ControlBar />);
    expect(screen.queryByRole("button", { name: "更多" })).toBeNull();
    currentMode = "clock";
  });

  it("uses the page navigation callback and closes after selecting a mode", async () => {
    const user = userEvent.setup();
    const onModeChange = vi.fn();
    render(<ControlBar onModeChange={onModeChange} />);
    const trigger = screen.getByRole("button", { name: "更多" });
    expect(trigger.className).toBe(screen.getByRole("button", { name: "进入全屏" }).className);
    await user.click(trigger);
    expect(screen.getByRole("option", { name: "时钟" })).toHaveAttribute("aria-selected", "true");
    await user.click(screen.getByRole("option", { name: "自习" }));
    expect(onModeChange).toHaveBeenCalledWith("study");
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(trigger).toHaveFocus();
  });
});
