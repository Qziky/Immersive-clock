import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { IconButton } from "../IconButton";
import { Tooltip } from "../Tooltip";

function createRect({ left, width }: { left: number; width: number }): DOMRect {
  return {
    bottom: 40,
    height: 40,
    left,
    right: left + width,
    top: 0,
    width,
    x: left,
    y: 0,
    toJSON: () => ({}),
  };
}

describe("Tooltip", () => {
  it("shifts the bubble inside the viewport near the left edge", async () => {
    vi.spyOn(window, "innerWidth", "get").mockReturnValue(320);
    render(
      <Tooltip content="Tooltip 用于解释图标按钮">
        <IconButton icon="status.help" aria-label="查看提示" />
      </Tooltip>
    );

    const tooltip = screen.getByRole("tooltip");
    const wrapper = tooltip.parentElement as HTMLElement;
    vi.spyOn(wrapper, "getBoundingClientRect").mockReturnValue(createRect({ left: 12, width: 40 }));
    vi.spyOn(tooltip, "getBoundingClientRect").mockReturnValue(createRect({ left: 0, width: 148 }));

    fireEvent(window, new Event("resize"));

    await waitFor(() => {
      expect(tooltip.style.getPropertyValue("--ui-tooltip-shift-x")).toBe("50px");
    });
  });

  it("shifts the bubble inside the viewport near the right edge", async () => {
    vi.spyOn(window, "innerWidth", "get").mockReturnValue(320);
    render(
      <Tooltip content="右侧提示">
        <IconButton icon="status.help" aria-label="查看右侧提示" />
      </Tooltip>
    );

    const tooltip = screen.getByRole("tooltip");
    const wrapper = tooltip.parentElement as HTMLElement;
    vi.spyOn(wrapper, "getBoundingClientRect").mockReturnValue(
      createRect({ left: 292, width: 24 })
    );
    vi.spyOn(tooltip, "getBoundingClientRect").mockReturnValue(createRect({ left: 0, width: 120 }));

    fireEvent(window, new Event("resize"));

    await waitFor(() => {
      expect(tooltip.style.getPropertyValue("--ui-tooltip-shift-x")).toBe("-52px");
    });
  });
});
