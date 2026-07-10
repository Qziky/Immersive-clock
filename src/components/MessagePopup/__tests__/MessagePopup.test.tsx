import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import MessagePopup from "../MessagePopup";

describe("MessagePopup compatibility adapter", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("resumes auto-close from the remaining duration after hover", () => {
    vi.useFakeTimers();
    const onClose = vi.fn();
    render(<MessagePopup isOpen title="兼容通知" onClose={onClose} />);

    const container = screen.getByRole("status").parentElement as HTMLElement;
    act(() => vi.advanceTimersByTime(2000));
    fireEvent.mouseEnter(container);
    act(() => vi.advanceTimersByTime(6000));
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.mouseLeave(container);
    act(() => vi.advanceTimersByTime(2179));
    expect(onClose).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("keeps actionable notifications open until explicitly closed", () => {
    vi.useFakeTimers();
    const onClose = vi.fn();
    render(
      <MessagePopup
        isOpen
        title="需要处理"
        onClose={onClose}
        actions={[{ label: "查看", onClick: vi.fn() }]}
      />
    );

    act(() => vi.advanceTimersByTime(10000));
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "关闭通知" }));
    act(() => vi.advanceTimersByTime(180));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("renders the legacy custom icon through Toast", () => {
    render(
      <MessagePopup
        isOpen
        title="带图标通知"
        icon={<span data-testid="legacy-icon">旧图标</span>}
      />
    );

    expect(screen.getByTestId("legacy-icon")).toBeInTheDocument();
  });
});
