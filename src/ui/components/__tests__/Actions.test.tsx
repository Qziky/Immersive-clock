import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Button } from "../Button";
import { IconButton } from "../IconButton";

const primitiveStyles = readFileSync(
  resolve("src/ui/components/primitives.module.css"),
  "utf8"
).replace(/\r\n/g, "\n");

describe("action controls", () => {
  it("labels icon buttons and uses the label as the default title", () => {
    render(<IconButton aria-label="搜索" icon="action.search" size="sm" />);

    const button = screen.getByRole("button", { name: "搜索" });
    expect(button).toHaveAttribute("title", "搜索");
    expect(button).not.toHaveAttribute("aria-pressed");
    expect(button.className).toContain("iconButtonSm");
    expect(button.querySelector('[data-app-icon="action.search"]')).toBeInTheDocument();
  });

  it("preserves an explicit icon button title", () => {
    render(<IconButton aria-label="搜索" icon="action.search" title="打开搜索" />);

    expect(screen.getByRole("button", { name: "搜索" })).toHaveAttribute("title", "打开搜索");
  });

  it.each([
    ["sm", "iconButtonSm", "14"],
    ["md", "iconButtonMd", "16"],
    ["lg", "iconButtonLg", "18"],
  ] as const)("maps the %s icon button size", (size, expectedClass, expectedIconSize) => {
    render(<IconButton aria-label={`${size} 按钮`} icon="action.search" size={size} />);

    const button = screen.getByRole("button", { name: `${size} 按钮` });
    expect(button.className).toContain(expectedClass);
    expect(button.querySelector("svg")).toHaveAttribute("width", expectedIconSize);
    expect(button.querySelector("svg")).toHaveAttribute("height", expectedIconSize);
  });

  it("locks icon button hit targets and semantic danger color", () => {
    expect(primitiveStyles).toContain(`.iconButtonSm {
  height: 32px;
  width: 32px;
}`);
    expect(primitiveStyles).toContain(`.iconButtonMd {
  height: 40px;
  width: 40px;
}`);
    expect(primitiveStyles).toContain(`.iconButtonLg {
  height: 44px;
  width: 44px;
}`);
    expect(primitiveStyles).toContain(`.iconButtonDanger {
  background: transparent;
  border-color: var(--ui-color-danger-border);
  color: var(--ui-color-danger);
}`);
    expect(primitiveStyles).toContain(`@media (pointer: coarse), (any-pointer: coarse) {
  .iconButton {
    min-height: 44px;
    min-width: 44px;
  }
}`);
  });

  it.each([
    ["default", "iconButtonDefault"],
    ["ghost", "iconButtonGhost"],
    ["danger", "iconButtonDanger"],
  ] as const)("applies the %s icon button variant", (variant, expectedClass) => {
    render(<IconButton aria-label={`${variant} 按钮`} icon="action.search" variant={variant} />);

    expect(screen.getByRole("button", { name: `${variant} 按钮` }).className).toContain(
      expectedClass
    );
  });

  it("exposes pressed state when provided", () => {
    render(<IconButton aria-label="固定搜索" icon="action.search" pressed />);

    const button = screen.getByRole("button", { name: "固定搜索" });
    expect(button).toHaveAttribute("aria-pressed", "true");
    expect(button.className).toContain("iconButtonPressed");
  });

  it("exposes an explicit unpressed state without selected styling", () => {
    render(<IconButton aria-label="固定搜索" icon="action.search" pressed={false} />);

    const button = screen.getByRole("button", { name: "固定搜索" });
    expect(button).toHaveAttribute("aria-pressed", "false");
    expect(button.className).not.toContain("iconButtonPressed");
  });

  it("uses danger styling only for a destructive action", () => {
    render(<IconButton aria-label="删除" icon="action.delete" variant="danger" />);

    expect(screen.getByRole("button", { name: "删除" }).className).toContain("iconButtonDanger");
  });

  it("keeps a text button accessible while loading", () => {
    render(
      <Button icon="action.apply" loading>
        保存设置
      </Button>
    );

    const button = screen.getByRole("button", { name: "保存设置" });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("aria-busy", "true");
  });

  it("renders button icons through the semantic slot", () => {
    render(<Button icon="action.apply">应用</Button>);

    const button = screen.getByRole("button", { name: "应用" });
    expect(button.querySelector('[data-app-icon="action.apply"]')).toBeInTheDocument();
  });

  it.each([
    ["sm", "14"],
    ["md", "16"],
    ["lg", "18"],
  ] as const)("maps the %s text button icon size", (size, expectedIconSize) => {
    render(
      <Button icon="action.apply" size={size}>
        {size} 应用
      </Button>
    );

    const icon = screen.getByRole("button", { name: `${size} 应用` }).querySelector("svg");
    expect(icon).toHaveAttribute("width", expectedIconSize);
    expect(icon).toHaveAttribute("height", expectedIconSize);
  });

  it("keeps a loading icon button labelled and disabled", () => {
    render(<IconButton aria-label="删除资源" icon="action.delete" loading />);

    const button = screen.getByRole("button", { name: "删除资源" });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("aria-busy", "true");
  });

  it("honors explicit disabled state for both action controls", () => {
    render(
      <>
        <Button disabled>保存</Button>
        <IconButton aria-label="关闭" disabled icon="action.close" />
      </>
    );

    expect(screen.getByRole("button", { name: "保存" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "关闭" })).toBeDisabled();
  });
});
