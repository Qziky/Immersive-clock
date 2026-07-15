import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { Menu, Popover } from "../Popover";

function createRect({
  bottom,
  left = 40,
  top,
  width = 120,
}: {
  bottom: number;
  left?: number;
  top: number;
  width?: number;
}): DOMRect {
  return {
    bottom,
    height: bottom - top,
    left,
    right: left + width,
    top,
    width,
    x: left,
    y: top,
    toJSON: () => ({}),
  };
}

describe("Popover", () => {
  it("restores trigger focus when Escape closes from inside the panel", async () => {
    const user = userEvent.setup();
    render(
      <Popover ariaLabel="焦点浮层" trigger={<span>打开焦点浮层</span>}>
        <button type="button">浮层操作</button>
      </Popover>
    );

    const trigger = screen.getByRole("button", { name: "打开焦点浮层" });
    await user.click(trigger);
    await user.click(screen.getByRole("button", { name: "浮层操作" }));
    expect(screen.getByRole("button", { name: "浮层操作" })).toHaveFocus();

    await user.keyboard("{Escape}");

    await waitFor(() => expect(trigger).toHaveFocus());
    expect(trigger).toHaveAttribute("aria-expanded", "false");
  });

  it("flips above the trigger when the lower viewport has insufficient space", async () => {
    vi.spyOn(window, "innerWidth", "get").mockReturnValue(390);
    vi.spyOn(window, "innerHeight", "get").mockReturnValue(844);
    render(
      <Popover ariaLabel="边界浮层" width={280} trigger={<span>打开浮层</span>}>
        浮层内容
      </Popover>
    );

    const trigger = screen.getByRole("button", { name: "打开浮层" });
    vi.spyOn(trigger, "getBoundingClientRect").mockReturnValue(
      createRect({ bottom: 818, left: 340, top: 780, width: 40 })
    );
    fireEvent.click(trigger);

    const panel = screen.getByRole("dialog", { name: "边界浮层" });
    Object.defineProperty(panel, "offsetHeight", { configurable: true, value: 120 });
    fireEvent(window, new Event("resize"));

    await waitFor(() => {
      expect(panel.style.left).toBe("102px");
      expect(panel.style.top).toBe("652px");
      expect(panel.style.maxHeight).toBe("calc(100vh - 16px)");
      expect(panel.style.maxWidth).toBe("calc(100vw - 16px)");
    });
  });

  it("lets Menu inherit vertical flipping and top-edge clamping", async () => {
    vi.spyOn(window, "innerWidth", "get").mockReturnValue(320);
    vi.spyOn(window, "innerHeight", "get").mockReturnValue(140);
    render(
      <Menu
        triggerLabel="操作菜单"
        items={[
          { value: "edit", label: "编辑" },
          { value: "sync", label: "同步" },
        ]}
      />
    );

    const trigger = screen.getByRole("button", { name: "操作菜单" });
    vi.spyOn(trigger, "getBoundingClientRect").mockReturnValue(
      createRect({ bottom: 118, top: 80 })
    );
    fireEvent.click(trigger);

    const panel = screen.getByRole("dialog", { name: "操作菜单" });
    Object.defineProperty(panel, "offsetHeight", { configurable: true, value: 100 });
    fireEvent(window, new Event("resize"));

    await waitFor(() => {
      expect(panel.style.top).toBe("8px");
    });
  });
});
