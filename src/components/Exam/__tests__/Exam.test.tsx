import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getAppSettings, updateAppSettings } from "../../../utils/appSettings";
import { DEFAULT_EXAM, localDateTime, startExam } from "../../../utils/exam";
import { Exam } from "../Exam";

const mocks = vi.hoisted(() => ({ play: vi.fn(), confirm: vi.fn(), speak: vi.fn() }));

class MockSpeechSynthesisUtterance {
  lang = "";

  constructor(readonly text: string) {}
}

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
    mocks.speak.mockClear();
    mocks.confirm.mockReset().mockResolvedValue(false);
    vi.stubGlobal("SpeechSynthesisUtterance", MockSpeechSynthesisUtterance);
    vi.stubGlobal("speechSynthesis", { speak: mocks.speak });
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
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
  it("开考只播放提示音，临近结束和结束先提示音再播报一次", () => {
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
    expect(mocks.play.mock.calls[0]?.[0]).toBeUndefined();
    expect(mocks.speak).not.toHaveBeenCalled();

    act(() => vi.advanceTimersByTime(60000));
    expect(mocks.play).toHaveBeenCalledTimes(2);
    expect(mocks.speak).not.toHaveBeenCalled();
    const warningCueEnded = mocks.play.mock.calls[1]?.[0] as (() => void) | undefined;
    expect(warningCueEnded).toEqual(expect.any(Function));
    act(() => warningCueEnded?.());
    expect(mocks.speak).toHaveBeenCalledTimes(1);
    const warningNotice = mocks.speak.mock.calls[0]?.[0] as MockSpeechSynthesisUtterance;
    expect(warningNotice.text).toBe("距离考试结束还有 1 分钟，请合理安排答题时间。");
    expect(warningNotice.lang).toBe("zh-CN");

    act(() => vi.advanceTimersByTime(60000));
    expect(mocks.play).toHaveBeenCalledTimes(3);
    expect(mocks.speak).toHaveBeenCalledTimes(1);
    const endCueEnded = mocks.play.mock.calls[2]?.[0] as (() => void) | undefined;
    expect(endCueEnded).toEqual(expect.any(Function));
    act(() => endCueEnded?.());
    expect(mocks.speak).toHaveBeenCalledTimes(2);
    const endNotice = mocks.speak.mock.calls[1]?.[0] as MockSpeechSynthesisUtterance;
    expect(endNotice.text).toBe("考试结束，请立即停止作答。");
    expect(endNotice.lang).toBe("zh-CN");

    act(() => vi.advanceTimersByTime(1000));
    expect(mocks.play).toHaveBeenCalledTimes(3);
    expect(mocks.speak).toHaveBeenCalledTimes(2);
  });
  it.each([
    { warningSound: false, warningMinutes: 1, label: "关闭提醒开关" },
    { warningSound: true, warningMinutes: 0, label: "提醒分钟数为零" },
  ])("$label 时不播放临近结束声音或语音", ({ warningSound, warningMinutes }) => {
    const config = {
      ...DEFAULT_EXAM.config,
      minutes: 2,
      warningMinutes,
      warningSound,
      endSound: false,
    };
    updateAppSettings({ exam: { config, session: startExam(config, Date.now()) } });
    mount();

    act(() => vi.advanceTimersByTime(60000));

    expect(mocks.play).not.toHaveBeenCalled();
    expect(mocks.speak).not.toHaveBeenCalled();
  });
  it("系统语音合成不可用时仍播放提示音", () => {
    vi.stubGlobal("SpeechSynthesisUtterance", undefined);
    const config = {
      ...DEFAULT_EXAM.config,
      minutes: 2,
      warningMinutes: 1,
      warningSound: true,
      endSound: false,
    };
    updateAppSettings({ exam: { config, session: startExam(config, Date.now()) } });
    mount();

    act(() => vi.advanceTimersByTime(60000));

    expect(mocks.play).toHaveBeenCalledTimes(1);
    const warningCueEnded = mocks.play.mock.calls[0]?.[0] as (() => void) | undefined;
    expect(warningCueEnded).toEqual(expect.any(Function));
    expect(() => act(() => warningCueEnded?.())).not.toThrow();
    expect(mocks.speak).not.toHaveBeenCalled();
  });
  it("结束声音关闭时不播报考试结束", () => {
    const config = {
      ...DEFAULT_EXAM.config,
      minutes: 1,
      warningMinutes: 0,
      warningSound: false,
      endSound: false,
    };
    updateAppSettings({ exam: { config, session: startExam(config, Date.now()) } });
    mount();

    act(() => vi.advanceTimersByTime(60000));

    expect(screen.getByText("考试已结束")).toBeVisible();
    expect(mocks.play).not.toHaveBeenCalled();
    expect(mocks.speak).not.toHaveBeenCalled();
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
    const config = { ...DEFAULT_EXAM.config, endSound: true };
    updateAppSettings({ exam: { config, session: startExam(config, Date.now()) } });
    mount();
    fireEvent.click(screen.getByRole("button", { name: "更多" }));
    await act(async () => fireEvent.click(screen.getByRole("option", { name: "提前结束" })));
    expect(screen.getByText("考试进行中")).toBeVisible();
    mocks.confirm.mockResolvedValue(true);
    fireEvent.click(screen.getByRole("button", { name: "更多" }));
    await act(async () => fireEvent.click(screen.getByRole("option", { name: "提前结束" })));
    expect(screen.getByText("已提前结束")).toBeVisible();
    expect(mocks.play).not.toHaveBeenCalled();
    expect(mocks.speak).not.toHaveBeenCalled();
    const frozen = screen.getByRole("timer").textContent;
    act(() => vi.advanceTimersByTime(60000));
    expect(screen.getByRole("timer")).toHaveTextContent(frozen!);
  });
});
