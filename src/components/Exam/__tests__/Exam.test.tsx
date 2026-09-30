import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getAppSettings, updateAppSettings } from "../../../utils/appSettings";
import { DEFAULT_EXAM, localDateTime, startExam } from "../../../utils/exam";
import { Exam } from "../Exam";

const mocks = vi.hoisted(() => ({ play: vi.fn(), confirm: vi.fn() }));
vi.mock("../../../contexts/AppearanceContext", () => ({ useComponentAppearance: () => ({}) }));
vi.mock("../../../hooks/useFullscreen", () => ({ useFullscreen: () => [false, () => {}] }));
vi.mock("../../../hooks/useAudio", () => ({ useAudio: () => [mocks.play, true] }));
vi.mock("../../../utils/timeSync", () => ({ getAdjustedNowMs: () => Date.now() }));
vi.mock("../../../ui/components/Feedback", () => ({
  useFeedback: () => ({ confirm: mocks.confirm }),
}));

describe("考试画面与提醒", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-26T09:00:00"));
    mocks.play.mockClear();
    mocks.confirm.mockReset().mockResolvedValue(false);
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });
  const mount = () =>
    render(
      <MemoryRouter>
        <Exam />
      </MemoryRouter>
    );
  it("在其他路由预览考试外观时不自动打开考试设置", () => {
    mount();
    expect(screen.queryByRole("dialog", { name: "考试设置" })).toBeNull();
    expect(screen.getByRole("timer")).toHaveTextContent("02:30:00");
  });
  it("暂停时剩余时间冻结，当前时钟继续走且不逐秒写存储", () => {
    const config = DEFAULT_EXAM.config;
    updateAppSettings({ exam: { config, session: startExam(config, Date.now()) } });
    mount();
    fireEvent.click(screen.getByRole("button", { name: "暂停" }));
    const frozen = screen.getByRole("timer").textContent;
    const storage = JSON.stringify(getAppSettings().exam);
    const clockBefore = document.querySelector("time")!.textContent;
    act(() => vi.advanceTimersByTime(5000));
    expect(screen.getByRole("timer")).toHaveTextContent(frozen!);
    expect(document.querySelector("time")!.textContent).not.toBe(clockBefore);
    expect(JSON.stringify(getAppSettings().exam)).toBe(storage);
    expect(screen.getByText(/恢复后顺延/)).toBeVisible();
  });
  it("开考、临近结束和结束提示各触发一次", () => {
    const config = {
      ...DEFAULT_EXAM.config,
      kind: "scheduled" as const,
      start: localDateTime(Date.now() + 60000),
      end: localDateTime(Date.now() + 180000),
      warningMinutes: 1,
      startSound: true,
      warningSound: true,
      endSound: true,
    };
    updateAppSettings({ exam: { config, session: startExam(config, Date.now()) } });
    mount();
    expect(screen.queryByRole("button", { name: "暂停" })).toBeNull();
    act(() => vi.advanceTimersByTime(60000));
    expect(mocks.play).toHaveBeenCalledTimes(1);
    act(() => vi.advanceTimersByTime(60000));
    expect(mocks.play).toHaveBeenCalledTimes(2);
    act(() => vi.advanceTimersByTime(60000));
    expect(mocks.play).toHaveBeenCalledTimes(3);
    act(() => vi.advanceTimersByTime(1000));
    expect(mocks.play).toHaveBeenCalledTimes(3);
  });
  it("刷新过期会话不补播历史提示", () => {
    const config = { ...DEFAULT_EXAM.config, startSound: true, warningSound: true, endSound: true };
    updateAppSettings({ exam: { config, session: startExam(config, Date.now() - 10000000) } });
    mount();
    act(() => vi.advanceTimersByTime(5000));
    expect(screen.getByRole("timer")).toHaveTextContent("00:00:00");
    expect(mocks.play).not.toHaveBeenCalled();
  });
  it("提前结束取消保持计时，确认后保留剩余时间", async () => {
    const config = DEFAULT_EXAM.config;
    updateAppSettings({ exam: { config, session: startExam(config, Date.now()) } });
    mount();
    fireEvent.click(screen.getByRole("button", { name: "更多" }));
    await act(async () => fireEvent.click(screen.getByRole("option", { name: "提前结束" })));
    expect(screen.getByText("考试进行中")).toBeVisible();
    mocks.confirm.mockResolvedValue(true);
    fireEvent.click(screen.getByRole("button", { name: "更多" }));
    await act(async () => fireEvent.click(screen.getByRole("option", { name: "提前结束" })));
    expect(screen.getByText("已提前结束")).toBeVisible();
    const frozen = screen.getByRole("timer").textContent;
    act(() => vi.advanceTimersByTime(60000));
    expect(screen.getByRole("timer")).toHaveTextContent(frozen!);
  });
});
