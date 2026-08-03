import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { Dropdown } from "../Dropdown";
import { Modal } from "../Modal";
import { Popover } from "../Popover";

describe("UI motion presence", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("keeps Modal mounted during exit and unmounts after the exit duration", () => {
    vi.useFakeTimers();
    const onClose = vi.fn();

    const { rerender } = render(
      <Modal isOpen title="动效弹窗" onClose={onClose} closeOnBackdrop>
        <p>弹窗内容</p>
      </Modal>
    );

    const dialog = screen.getByRole("dialog", { name: "动效弹窗" });
    expect(dialog).toHaveAttribute("data-ui-presence", "entering");

    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);

    fireEvent.mouseDown(dialog.parentElement as HTMLElement);
    expect(onClose).toHaveBeenCalledTimes(2);

    rerender(
      <Modal isOpen={false} title="动效弹窗" onClose={onClose} closeOnBackdrop>
        <p>弹窗内容</p>
      </Modal>
    );

    const exitingDialog = screen.getByRole("dialog", { hidden: true });
    expect(exitingDialog).toHaveAttribute("data-ui-presence", "exiting");
    expect(exitingDialog).toHaveAttribute("aria-hidden", "true");
    expect(exitingDialog).toHaveAttribute("inert");

    act(() => {
      vi.advanceTimersByTime(179);
    });

    expect(exitingDialog).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(1);
    });

    expect(screen.queryByRole("dialog", { hidden: true })).not.toBeInTheDocument();
  });

  it("closes Dropdown with exit presence while keeping aria-expanded accurate", () => {
    vi.useFakeTimers();
    const onChange = vi.fn();

    render(
      <Dropdown
        label="页面"
        value="clock"
        options={[
          { value: "clock", label: "时钟" },
          { value: "study", label: "自习" },
        ]}
        onChange={onChange}
      />
    );

    const trigger = screen.getByRole("button", { name: "页面" });

    fireEvent.click(trigger);

    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("listbox")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("option", { name: "自习" }));

    expect(onChange).toHaveBeenCalledWith("study");
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();

    const exitingListbox = screen.getByRole("listbox", { hidden: true });
    const exitingMenu = exitingListbox.closest("[data-dropdown-menu]");
    expect(exitingMenu).toHaveAttribute("data-ui-presence", "exiting");
    expect(exitingMenu).toHaveAttribute("aria-hidden", "true");
    expect(exitingMenu).toHaveAttribute("inert");

    act(() => {
      vi.advanceTimersByTime(180);
    });

    expect(screen.queryByRole("listbox", { hidden: true })).not.toBeInTheDocument();
  });

  it("keeps Popover mounted during exit and removes it after the exit duration", () => {
    vi.useFakeTimers();

    render(
      <Popover ariaLabel="测试浮层" trigger={<span>打开浮层</span>}>
        <p>浮层内容</p>
      </Popover>
    );

    const trigger = screen.getByRole("button", { name: "打开浮层" });

    fireEvent.click(trigger);

    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("dialog", { name: "测试浮层" })).toHaveAttribute(
      "data-ui-presence",
      "entering"
    );

    fireEvent.pointerDown(document.body);

    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByRole("dialog", { name: "测试浮层" })).toHaveAttribute(
      "data-ui-presence",
      "exiting"
    );

    act(() => {
      vi.advanceTimersByTime(180);
    });

    expect(screen.queryByRole("dialog", { name: "测试浮层" })).not.toBeInTheDocument();
  });
});
