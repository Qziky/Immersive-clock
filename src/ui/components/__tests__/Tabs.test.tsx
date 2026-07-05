import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { Tabs } from "../Tabs";

describe("Tabs", () => {
  it("renders active state and forwards tab accessibility attributes", () => {
    render(
      <Tabs
        label="设置分区"
        value="display"
        items={[
          {
            value: "startup",
            label: "启动",
          },
          {
            value: "display",
            id: "tab-display",
            label: "显示",
            ariaControls: "panel-display",
            ariaLabel: "显示设置",
            title: "切换到显示设置",
            className: "custom-tab",
          },
        ]}
        onChange={vi.fn()}
      />
    );

    const tablist = screen.getByRole("tablist", { name: "设置分区" });
    const activeTab = screen.getByRole("tab", { name: "显示设置" });

    expect(tablist).toBeInTheDocument();
    expect(activeTab).toHaveAttribute("id", "tab-display");
    expect(activeTab).toHaveAttribute("aria-controls", "panel-display");
    expect(activeTab).toHaveAttribute("aria-selected", "true");
    expect(activeTab).toHaveAttribute("title", "切换到显示设置");
    expect(activeTab).toHaveClass("custom-tab");
  });

  it("supports activeKey and ignores disabled tab clicks", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    render(
      <Tabs
        activeKey="clock"
        items={[
          { key: "clock", label: "时钟" },
          { key: "study", label: "自习" },
          { key: "disabled", label: "禁用", disabled: true },
        ]}
        onChange={onChange}
      />
    );

    expect(screen.getByRole("tab", { name: "时钟" })).toHaveAttribute("aria-selected", "true");

    await user.click(screen.getByRole("tab", { name: "禁用" }));
    expect(onChange).not.toHaveBeenCalled();

    await user.click(screen.getByRole("tab", { name: "自习" }));
    expect(onChange).toHaveBeenCalledWith("study");
  });
});
