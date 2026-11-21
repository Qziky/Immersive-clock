import { render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AppState } from "../../../types";
import { WebUpdateReloadGuard } from "../WebUpdateReloadGuard";

type RelevantState = Pick<AppState, "countdown" | "stopwatch" | "mode" | "isModalOpen">;

const context = vi.hoisted(() => ({
  state: {} as RelevantState,
  setBlocked: vi.fn(),
}));

vi.mock("../../../contexts/AppContext", () => ({
  useAppState: () => context.state,
}));

vi.mock("../../../services/update/updateRuntime", () => ({
  setWebUpdateReloadBlocked: context.setBlocked,
}));

describe("WebUpdateReloadGuard", () => {
  beforeEach(() => {
    context.setBlocked.mockClear();
    context.state = {
      countdown: { initialTime: 0, currentTime: 0, isActive: false },
      stopwatch: { elapsedTime: 0, isActive: false },
      mode: "clock",
      isModalOpen: false,
    };
  });

  it.each([
    [
      "另一个模式的运行中倒计时",
      { countdown: { initialTime: 600, currentTime: 600, isActive: true } },
    ],
    [
      "另一个模式的暂停倒计时",
      { countdown: { initialTime: 600, currentTime: 427, isActive: false } },
    ],
    ["后台运行的秒表", { stopwatch: { elapsedTime: 0, isActive: true } }],
    ["保留已暂停的秒表", { stopwatch: { elapsedTime: 2000, isActive: false } }],
    ["考试页和考试设置", { mode: "exam" }],
    ["未确认的倒计时编辑", { isModalOpen: true }],
  ] satisfies Array<[string, Partial<RelevantState>]>)("%s：阻止应用内刷新", (_, state) => {
    context.state = { ...context.state, ...state };
    render(<WebUpdateReloadGuard />);
    expect(context.setBlocked).toHaveBeenLastCalledWith(true);
  });

  it.each([
    ["已重置", 600],
    ["已结束", 0],
  ] as const)("倒计时%s后可手动刷新", (_, currentTime) => {
    context.state.countdown = { initialTime: 600, currentTime: 424, isActive: false };
    const view = render(<WebUpdateReloadGuard />);
    expect(context.setBlocked).toHaveBeenLastCalledWith(true);
    context.state.countdown.currentTime = currentTime;
    view.rerender(<WebUpdateReloadGuard />);
    expect(context.setBlocked).toHaveBeenLastCalledWith(false);
  });
});
