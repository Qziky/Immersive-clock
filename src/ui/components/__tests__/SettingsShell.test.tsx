import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import { SettingsShell, type SettingsNavGroup } from "../SettingsShell";

type ItemValue = "startup" | "display" | "theme" | "contrast";
type GroupValue = "workspace" | "appearance";

const groups: ReadonlyArray<SettingsNavGroup<ItemValue, GroupValue>> = [
  {
    value: "workspace",
    label: "常用工作台",
    description: "启动与显示",
    icon: "feature.workspace",
    items: [
      { value: "startup", label: "启动页面", icon: "mode.clock" },
      { value: "display", label: "自习显示", icon: "appearance.preview" },
    ],
  },
  {
    value: "appearance",
    label: "视觉外观",
    description: "主题与对比度",
    icon: "feature.appearance",
    items: [
      { value: "theme", label: "整体样式", icon: "appearance.color" },
      { value: "contrast", label: "高对比度", icon: "appearance.effects" },
    ],
  },
];

function ControlledShell({ onClose = vi.fn() }: { onClose?: () => void }) {
  const [activeItem, setActiveItem] = useState<ItemValue>("startup");
  return (
    <SettingsShell
      title="设置"
      icon="feature.settings"
      groups={groups}
      activeItem={activeItem}
      onItemChange={setActiveItem}
      onClose={onClose}
      footer={<button type="button">保存</button>}
    >
      <output>{activeItem}</output>
    </SettingsShell>
  );
}

describe("SettingsShell", () => {
  it("switches groups through their last enabled item and remembers later selections", async () => {
    const user = userEvent.setup();
    render(<ControlledShell />);

    const desktopNavigation = screen.getByRole("navigation", { name: "设置分组" });
    const appearanceGroup = within(desktopNavigation).getByRole("button", { name: /视觉外观/ });
    const workspaceGroup = within(desktopNavigation).getByRole("button", { name: /常用工作台/ });

    await user.click(appearanceGroup);
    expect(screen.getByText("theme", { selector: "output" })).toBeInTheDocument();
    await user.click(within(desktopNavigation).getByRole("button", { name: "高对比度" }));
    expect(screen.getByText("contrast", { selector: "output" })).toBeInTheDocument();

    await user.click(workspaceGroup);
    expect(screen.getByText("startup", { selector: "output" })).toBeInTheDocument();
    await user.click(within(desktopNavigation).getByRole("button", { name: "自习显示" }));
    await user.click(appearanceGroup);

    expect(screen.getByText("contrast", { selector: "output" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "高对比度" })).toBeInTheDocument();
  });

  it("closes the compact submenu with Escape and restores trigger focus", async () => {
    const user = userEvent.setup();
    render(<ControlledShell />);

    const compactNavigation = screen.getByRole("navigation", { name: "设置紧凑导航" });
    const appearanceTrigger = within(compactNavigation).getByRole("button", {
      name: "视觉外观",
    });
    await user.click(appearanceTrigger);

    expect(appearanceTrigger).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("navigation", { name: "视觉外观子分类" })).toBeInTheDocument();

    await user.keyboard("{Escape}");

    expect(appearanceTrigger).toHaveAttribute("aria-expanded", "false");
    expect(appearanceTrigger).toHaveFocus();
    expect(document.querySelector('button[aria-label="关闭设置子菜单"]')).toHaveAttribute(
      "aria-hidden",
      "true"
    );
  });

  it("restores compact trigger focus after selecting a submenu item", async () => {
    const user = userEvent.setup();
    render(<ControlledShell />);

    const compactNavigation = screen.getByRole("navigation", { name: "设置紧凑导航" });
    const appearanceTrigger = within(compactNavigation).getByRole("button", {
      name: "视觉外观",
    });
    await user.click(appearanceTrigger);
    const contrastItem = within(
      screen.getByRole("navigation", { name: "视觉外观子分类" })
    ).getByRole("button", { name: "高对比度" });
    contrastItem.focus();
    await user.keyboard("{Enter}");

    expect(screen.getByText("contrast", { selector: "output" })).toBeInTheDocument();
    expect(appearanceTrigger).toHaveAttribute("aria-expanded", "false");
    expect(appearanceTrigger).toHaveFocus();
  });

  it("disables navigation and close actions while busy", () => {
    render(
      <SettingsShell
        title="设置"
        groups={groups}
        activeItem="startup"
        disabled
        onClose={vi.fn()}
        onItemChange={vi.fn()}
      >
        内容
      </SettingsShell>
    );

    expect(screen.getByRole("region", { name: "设置" })).toHaveAttribute("aria-busy", "true");
    expect(screen.getByRole("button", { name: "关闭设置" })).toBeDisabled();
    expect(screen.getAllByRole("button", { name: /常用工作台/ })[0]).toBeDisabled();
  });

  it("supports the legacy flat items shape during migration", () => {
    render(
      <SettingsShell
        title="兼容设置"
        items={[{ value: "startup", label: "启动页面" }]}
        activeItem="startup"
        onItemChange={vi.fn()}
      >
        内容
      </SettingsShell>
    );

    expect(screen.getByRole("button", { name: "启动页面" })).toHaveAttribute(
      "aria-current",
      "page"
    );
  });
});
