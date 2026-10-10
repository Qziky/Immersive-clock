import { act, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useOledScreenProtectionController } from "../useOledScreenProtectionController";

function ControllerHarness({ mode = "clock" }: { mode?: string }) {
  const [blocked, setBlocked] = useState(true);
  const controller = useOledScreenProtectionController({
    blocked,
    enabled: true,
    idleMinutes: 1,
    mode,
  });

  return (
    <>
      <button type="button" onClick={() => setBlocked(false)}>
        close blocker
      </button>
      <button type="button" onClick={() => setBlocked(true)}>
        open blocker
      </button>
      <button type="button" onClick={() => {}}>
        underlying action
      </button>
      <output>{controller.active ? "active" : "idle"}</output>
    </>
  );
}

describe("useOledScreenProtectionController", () => {
  let visibilityDescriptor: PropertyDescriptor | undefined;

  beforeEach(() => {
    vi.useFakeTimers();
    visibilityDescriptor = Object.getOwnPropertyDescriptor(document, "visibilityState");
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "visible",
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    if (visibilityDescriptor) {
      Object.defineProperty(document, "visibilityState", visibilityDescriptor);
    } else {
      Reflect.deleteProperty(document, "visibilityState");
    }
  });

  it("闲置达到设定时长后显示屏保，打开覆盖层时暂停计时", () => {
    render(<ControllerHarness />);
    fireEvent.click(screen.getByRole("button", { name: "close blocker" }));

    act(() => vi.advanceTimersByTime(59_999));
    expect(screen.getByText("idle")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "open blocker" }));
    act(() => vi.advanceTimersByTime(60_000));
    expect(screen.getByText("idle")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "close blocker" }));
    act(() => vi.advanceTimersByTime(60_000));
    expect(screen.getByText("active")).toBeInTheDocument();
  });

  it("屏保唤醒点击只负责恢复界面，不触发底层按钮", () => {
    const onClick = vi.fn();
    function Harness() {
      const controller = useOledScreenProtectionController({
        blocked: false,
        enabled: true,
        idleMinutes: 1,
        mode: "clock",
      });
      return (
        <>
          <output>{controller.active ? "active" : "idle"}</output>
          <button type="button" onClick={onClick}>
            underlying action
          </button>
        </>
      );
    }

    render(<Harness />);
    act(() => vi.advanceTimersByTime(60_000));
    const action = screen.getByRole("button", { name: "underlying action" });

    fireEvent.pointerDown(action);
    fireEvent.click(action);

    expect(screen.getByText("idle")).toBeInTheDocument();
    expect(onClick).not.toHaveBeenCalled();
  });

  it("考试模式不进入屏保", () => {
    render(<ControllerHarness mode="exam" />);
    fireEvent.click(screen.getByRole("button", { name: "close blocker" }));

    act(() => vi.advanceTimersByTime(60_000));

    expect(screen.getByText("idle")).toBeInTheDocument();
  });
});
