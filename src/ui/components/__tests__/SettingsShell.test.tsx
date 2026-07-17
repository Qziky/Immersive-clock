import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

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

const originalMatchMedia = window.matchMedia;

function mockReducedMotion() {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    writable: true,
    value: vi.fn().mockImplementation(
      (query: string): MediaQueryList => ({
        matches: query === "(prefers-reduced-motion: reduce)",
        media: query,
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
      })
    ),
  });
}

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
  afterEach(() => {
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      writable: true,
      value: originalMatchMedia,
    });
  });

  it("applies the drawer shell variant", () => {
    render(
      <SettingsShell
        title="抽屉设置"
        variant="drawer"
        groups={groups}
        activeItem="startup"
        onItemChange={vi.fn()}
      >
        内容
      </SettingsShell>
    );

    expect(screen.getByRole("region", { name: "抽屉设置" }).className).toContain(
      "settingsShellDrawer"
    );
  });

  it("supports a content body and footer without rendering the optional page header", () => {
    const { container } = render(
      <SettingsShell
        title="无页头设置"
        groups={groups}
        activeItem="startup"
        contentTitle={false}
        contentDescription={false}
        footer={<button type="button">保存</button>}
        onItemChange={vi.fn()}
      >
        短内容
      </SettingsShell>
    );

    const main = container.querySelector('[class*="settingsMain"]');
    expect(main?.children).toHaveLength(2);
    expect(main?.children[0]).toHaveTextContent("短内容");
    expect(main?.children[1]?.tagName).toBe("FOOTER");
    expect(screen.queryByRole("heading", { name: "启动页面", level: 2 })).toBeNull();
  });

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
    const onItemChange = vi.fn();
    render(
      <SettingsShell
        title="设置"
        groups={groups}
        activeItem="startup"
        disabled
        onClose={vi.fn()}
        onItemChange={onItemChange}
      >
        内容
      </SettingsShell>
    );

    const shell = screen.getByRole("region", { name: "设置" });
    expect(shell).toHaveAttribute("aria-busy", "true");
    for (const button of within(shell).getAllByRole("button")) {
      expect(button).toBeDisabled();
    }
    expect(onItemChange).not.toHaveBeenCalled();
  });

  it("honors disabled groups and individual disabled items", async () => {
    const user = userEvent.setup();
    const onItemChange = vi.fn();
    const restrictedGroups: ReadonlyArray<SettingsNavGroup<ItemValue, GroupValue>> = [
      {
        ...groups[0],
        items: [groups[0].items[0], { ...groups[0].items[1], disabled: true }],
      },
      { ...groups[1], disabled: true },
    ];
    render(
      <SettingsShell
        title="受限设置"
        groups={restrictedGroups}
        activeItem="startup"
        onItemChange={onItemChange}
      >
        内容
      </SettingsShell>
    );

    const desktopNavigation = screen.getByRole("navigation", { name: "设置分组" });
    const disabledItem = within(desktopNavigation).getByRole("button", { name: "自习显示" });
    const disabledGroup = within(desktopNavigation).getByRole("button", { name: /视觉外观/ });
    const compactNavigation = screen.getByRole("navigation", { name: "设置紧凑导航" });

    expect(disabledItem).toBeDisabled();
    expect(disabledGroup).toBeDisabled();
    expect(within(compactNavigation).getByRole("button", { name: "视觉外观" })).toBeDisabled();

    await user.click(disabledItem);
    await user.click(disabledGroup);
    expect(onItemChange).not.toHaveBeenCalled();
  });

  it("uses reduced-motion presence for the compact menu and closes it through the scrim", async () => {
    mockReducedMotion();
    const user = userEvent.setup();
    render(<ControlledShell />);

    const compactNavigation = screen.getByRole("navigation", { name: "设置紧凑导航" });
    await user.click(within(compactNavigation).getByRole("button", { name: "视觉外观" }));

    const compactMenu = screen.getByRole("navigation", { name: "视觉外观子分类" }).parentElement;
    const scrim = screen.getByRole("button", { name: "关闭设置子菜单" });
    expect(compactMenu).toHaveAttribute("data-ui-motion", "none");
    expect(scrim).toHaveAttribute("data-ui-motion", "none");
    expect(scrim).not.toHaveAttribute("aria-hidden");

    await user.click(scrim);

    expect(screen.queryByRole("navigation", { name: "视觉外观子分类" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "关闭设置子菜单" })).not.toBeInTheDocument();
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
