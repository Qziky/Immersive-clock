import { fireEvent, render, screen } from "@testing-library/react";
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

  it("uses roving tabindex and supports arrow, Home and End navigation", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    render(
      <Tabs
        id="settings"
        value="startup"
        items={[
          { value: "startup", label: "启动", ariaControls: "panel-startup" },
          { value: "disabled", label: "禁用", disabled: true },
          { value: "display", label: "显示", ariaControls: "panel-display" },
          { value: "about", label: "关于", ariaControls: "panel-about" },
        ]}
        onChange={onChange}
      />
    );

    const startupTab = screen.getByRole("tab", { name: "启动" });
    const displayTab = screen.getByRole("tab", { name: "显示" });
    const aboutTab = screen.getByRole("tab", { name: "关于" });

    expect(startupTab).toHaveAttribute("tabindex", "0");
    expect(displayTab).toHaveAttribute("tabindex", "-1");
    expect(startupTab).toHaveAttribute("id", "settings-tab-startup");
    expect(startupTab).toHaveAttribute("aria-controls", "panel-startup");

    startupTab.focus();
    await user.keyboard("{ArrowRight}");
    expect(onChange).toHaveBeenLastCalledWith("display");
    expect(displayTab).toHaveFocus();

    await user.keyboard("{End}");
    expect(onChange).toHaveBeenLastCalledWith("about");
    expect(aboutTab).toHaveFocus();

    await user.keyboard("{Home}");
    expect(onChange).toHaveBeenLastCalledWith("startup");
    expect(startupTab).toHaveFocus();
  });

  it("keeps one enabled tab in the tab order when the selected value is disabled", () => {
    render(
      <Tabs
        value="disabled"
        items={[
          { value: "clock", label: "时钟" },
          { value: "disabled", label: "禁用", disabled: true },
        ]}
        onChange={vi.fn()}
      />
    );

    expect(screen.getByRole("tab", { name: "时钟" })).toHaveAttribute("tabindex", "0");
    expect(screen.getByRole("tab", { name: "禁用" })).toHaveAttribute("tabindex", "-1");
  });

  it("reports pointer and keyboard preview targets", () => {
    const onPreviewChange = vi.fn();

    render(
      <Tabs
        value="clock"
        items={[
          { value: "clock", label: "时钟" },
          { value: "study", label: "自习" },
        ]}
        onChange={vi.fn()}
        onPreviewChange={onPreviewChange}
      />
    );

    const studyTab = screen.getByRole("tab", { name: "自习" });
    fireEvent.pointerEnter(studyTab);
    expect(onPreviewChange).toHaveBeenLastCalledWith("study");
    fireEvent.pointerLeave(studyTab);
    expect(onPreviewChange).toHaveBeenLastCalledWith(null);

    fireEvent.focus(studyTab);
    expect(onPreviewChange).toHaveBeenLastCalledWith("study");
    fireEvent.blur(studyTab);
    expect(onPreviewChange).toHaveBeenLastCalledWith(null);
  });
});
