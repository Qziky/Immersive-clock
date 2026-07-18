import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { setDontShowForWeek } from "../../../utils/announcementStorage";
import AnnouncementModal from "../AnnouncementModal";

vi.mock("../../../utils/announcementStorage", () => ({
  setDontShowForWeek: vi.fn(),
}));

const setDontShowForWeekMock = vi.mocked(setDontShowForWeek);
const originalScrollTo = HTMLElement.prototype.scrollTo;

function renderAnnouncementModal(onClose = vi.fn()) {
  return {
    onClose,
    ...render(<AnnouncementModal isOpen onClose={onClose} initialTab="announcement" />),
  };
}

describe("AnnouncementModal", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-18T00:00:00.000Z"));
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise<Response>(() => {}))
    );
    HTMLElement.prototype.scrollTo = vi.fn();
    setDontShowForWeekMock.mockClear();
  });

  afterEach(() => {
    HTMLElement.prototype.scrollTo = originalScrollTo;
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("在最后 60 秒显示逐秒倒计时，并在 120 秒时自动关闭", () => {
    const { onClose } = renderAnnouncementModal();

    act(() => vi.advanceTimersByTime(59_000));
    expect(screen.queryByRole("timer")).not.toBeInTheDocument();

    act(() => vi.advanceTimersByTime(1_000));
    expect(screen.getByRole("timer")).toHaveTextContent("60s 后自动关闭");

    act(() => vi.advanceTimersByTime(1_000));
    expect(screen.getByRole("timer")).toHaveTextContent("59s 后自动关闭");

    act(() => vi.advanceTimersByTime(59_000));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("timer")).not.toBeInTheDocument();
  });

  it.each([
    ["指针按下", () => fireEvent.pointerDown(document)],
    ["触控", () => fireEvent.touchStart(document)],
    ["键盘", () => fireEvent.keyDown(document, { key: "ArrowDown" })],
    ["滚轮", () => fireEvent.wheel(document)],
    ["滚动", () => fireEvent.scroll(document)],
  ])("%s 会隐藏倒计时并重新计满 120 秒", (_label, triggerActivity) => {
    const { onClose } = renderAnnouncementModal();

    act(() => vi.advanceTimersByTime(61_000));
    expect(screen.getByRole("timer")).toHaveTextContent("59s 后自动关闭");

    act(() => triggerActivity());
    expect(screen.queryByRole("timer")).not.toBeInTheDocument();

    act(() => vi.advanceTimersByTime(59_000));
    expect(screen.queryByRole("timer")).not.toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();

    act(() => vi.advanceTimersByTime(1_000));
    expect(screen.getByRole("timer")).toHaveTextContent("60s 后自动关闭");

    act(() => vi.advanceTimersByTime(60_000));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("指针移动不会重置空闲计时", () => {
    const { onClose } = renderAnnouncementModal();

    act(() => {
      vi.advanceTimersByTime(30_000);
      fireEvent.pointerMove(document);
      vi.advanceTimersByTime(30_000);
      fireEvent.pointerMove(document);
    });
    expect(screen.getByRole("timer")).toHaveTextContent("60s 后自动关闭");

    act(() => {
      vi.advanceTimersByTime(30_000);
      fireEvent.pointerMove(document);
    });
    expect(screen.getByRole("timer")).toHaveTextContent("30s 后自动关闭");

    act(() => vi.advanceTimersByTime(30_000));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("反馈标签暂停自动关闭，切回公告后重新计时", () => {
    const { onClose } = renderAnnouncementModal();

    act(() => vi.advanceTimersByTime(60_000));
    expect(screen.getByRole("timer")).toHaveTextContent("60s 后自动关闭");

    fireEvent.click(screen.getByRole("tab", { name: "意见反馈" }));
    expect(screen.queryByRole("timer")).not.toBeInTheDocument();

    act(() => vi.advanceTimersByTime(180_000));
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("tab", { name: "公告" }));
    act(() => vi.advanceTimersByTime(119_000));
    expect(onClose).not.toHaveBeenCalled();

    act(() => vi.advanceTimersByTime(1_000));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("关闭和重新打开时清理旧计时并从 120 秒重新开始", () => {
    const onClose = vi.fn();
    const { rerender } = render(
      <AnnouncementModal isOpen onClose={onClose} initialTab="announcement" />
    );

    act(() => vi.advanceTimersByTime(90_000));
    fireEvent.click(screen.getByRole("button", { name: "确定" }));
    expect(onClose).toHaveBeenCalledTimes(1);

    rerender(<AnnouncementModal isOpen={false} onClose={onClose} initialTab="announcement" />);
    act(() => vi.advanceTimersByTime(180_000));
    expect(onClose).toHaveBeenCalledTimes(1);

    rerender(<AnnouncementModal isOpen onClose={onClose} initialTab="announcement" />);
    act(() => vi.advanceTimersByTime(119_000));
    expect(onClose).toHaveBeenCalledTimes(1);

    act(() => vi.advanceTimersByTime(1_000));
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("父组件重渲染不会重置计时，并在截止时调用最新关闭回调", () => {
    const firstOnClose = vi.fn();
    const latestOnClose = vi.fn();
    const { rerender } = render(
      <AnnouncementModal isOpen onClose={firstOnClose} initialTab="announcement" />
    );

    act(() => vi.advanceTimersByTime(90_000));
    rerender(<AnnouncementModal isOpen onClose={latestOnClose} initialTab="announcement" />);

    act(() => vi.advanceTimersByTime(30_000));
    expect(firstOnClose).not.toHaveBeenCalled();
    expect(latestOnClose).toHaveBeenCalledTimes(1);
  });

  it("组件卸载后不会遗留自动关闭计时器", () => {
    const onClose = vi.fn();
    const { unmount } = render(
      <AnnouncementModal isOpen onClose={onClose} initialTab="announcement" />
    );

    act(() => vi.advanceTimersByTime(90_000));
    unmount();
    act(() => vi.advanceTimersByTime(120_000));

    expect(onClose).not.toHaveBeenCalled();
  });

  it("自动关闭时沿用一周内不再显示的持久化语义", () => {
    const { onClose } = renderAnnouncementModal();

    fireEvent.click(screen.getByRole("checkbox", { name: "一周内不再显示" }));
    act(() => vi.advanceTimersByTime(120_000));

    expect(setDontShowForWeekMock).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
