import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { Dropdown } from "../Dropdown";

const options = [
  { value: "clock", label: "时钟" },
  { value: "study", label: "自习" },
];

describe("Dropdown", () => {
  it("applies default and ghost trigger variants", () => {
    render(
      <>
        <Dropdown label="默认模式" options={options} />
        <Dropdown label="幽灵模式" options={options} variant="ghost" />
      </>
    );

    expect(screen.getByRole("button", { name: "默认模式" }).className).toContain(
      "dropdownTriggerDefault"
    );
    expect(screen.getByRole("button", { name: "幽灵模式" }).className).toContain(
      "dropdownTriggerGhost"
    );
  });

  it("keeps an explicit menu width while flipping and clamping it to the viewport", async () => {
    vi.spyOn(window, "innerWidth", "get").mockReturnValue(320);
    vi.spyOn(window, "innerHeight", "get").mockReturnValue(400);
    render(<Dropdown label="位置测试" menuWidth={400} options={options} />);

    const trigger = screen.getByRole("button", { name: "位置测试" });
    vi.spyOn(trigger, "getBoundingClientRect").mockReturnValue({
      bottom: 338,
      height: 38,
      left: 280,
      right: 320,
      top: 300,
      width: 40,
      x: 280,
      y: 300,
      toJSON: () => ({}),
    });

    fireEvent.click(trigger);
    const menu = screen.getByRole("listbox").parentElement as HTMLElement;
    Object.defineProperty(menu, "offsetHeight", { configurable: true, value: 180 });
    fireEvent(window, new Event("resize"));

    await waitFor(() => {
      expect(menu.style.width).toBe("400px");
      expect(menu.style.maxWidth).toBe("calc(100vw - 16px)");
      expect(menu.style.left).toBe("8px");
      expect(menu.style.top).toBe("112px");
    });
  });

  it("shows a deterministic empty state for an unmatched search", async () => {
    const user = userEvent.setup();
    render(<Dropdown label="搜索模式" options={options} searchable />);

    await user.click(screen.getByRole("button", { name: "搜索模式" }));
    await user.type(screen.getByPlaceholderText("搜索选项"), "不存在");

    expect(screen.getByText("没有匹配的选项")).toBeInTheDocument();
  });

  it("restores trigger focus when Escape closes a searchable menu", async () => {
    const user = userEvent.setup();
    render(<Dropdown label="键盘模式" options={options} searchable />);

    const trigger = screen.getByRole("button", { name: "键盘模式" });
    await user.click(trigger);
    expect(screen.getByPlaceholderText("搜索选项")).toHaveFocus();

    await user.keyboard("{Escape}");

    await waitFor(() => expect(trigger).toHaveFocus());
    expect(trigger).toHaveAttribute("aria-expanded", "false");
  });

  it("keeps focus on an outside target when pointerdown closes the menu", async () => {
    const user = userEvent.setup();
    render(
      <>
        <Dropdown label="外部点击模式" options={options} searchable />
        <button type="button">外部操作</button>
      </>
    );

    const trigger = screen.getByRole("button", { name: "外部点击模式" });
    const outside = screen.getByRole("button", { name: "外部操作" });
    await user.click(trigger);
    await user.click(outside);

    expect(outside).toHaveFocus();
    expect(trigger).toHaveAttribute("aria-expanded", "false");
  });
});
