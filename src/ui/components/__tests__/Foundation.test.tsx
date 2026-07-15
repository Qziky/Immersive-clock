import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { APP_ICON_NAMES, appIconRegistry } from "../../icons/appIconRegistry";
import { Portal } from "../Accessibility";
import { Card } from "../Card";
import { FormSection } from "../FormComponents";
import { Input } from "../Input";
import { Toast } from "../Toast";

describe("UI foundation", () => {
  it("renders a plain FormSection without changing the public structure", () => {
    const { container } = render(
      <FormSection title="基础设置" variant="plain">
        表单内容
      </FormSection>
    );

    const section = container.querySelector("section");
    expect(section?.className).toContain("formSectionPlain");
    expect(screen.getByRole("heading", { name: "基础设置" })).toBeInTheDocument();
  });

  it("uses assertive semantics for warning and danger toasts", () => {
    render(<Toast variant="danger" title="保存失败" />);
    expect(screen.getByRole("alert")).toHaveTextContent("保存失败");
  });

  it("applies the UI scope to generic portal content", () => {
    render(
      <Portal>
        <button type="button">Portal 操作</button>
      </Portal>
    );

    expect(screen.getByRole("button", { name: "Portal 操作" }).parentElement).toHaveAttribute(
      "data-ui-scope"
    );
  });

  it("文件选择器只暴露一个可访问按钮", () => {
    const { container } = render(
      <Input type="file" label="备份文件" buttonText="选择备份文件" onFileChange={() => {}} />
    );

    expect(screen.getAllByRole("button")).toHaveLength(1);
    expect(screen.getByRole("button", { name: "选择备份文件" })).toBeInTheDocument();
    expect(container.querySelector('input[type="file"]')).toHaveAttribute("aria-hidden", "true");
    expect(container.querySelector('input[type="file"]')).toHaveAttribute("tabindex", "-1");
  });

  it("使用字段标签区分多个文件选择按钮", () => {
    render(
      <>
        <Input type="file" label="选择图片" />
        <Input type="file" label="字体文件" />
      </>
    );

    expect(screen.getByRole("button", { name: "选择图片：选择文件" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "字体文件：选择文件" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "选择文件" })).toBeNull();
  });

  it.each(["div", "article", "section"] as const)("renders Card as a semantic %s", (as) => {
    const { container } = render(<Card as={as}>卡片内容</Card>);

    expect(container.querySelector(as)).toHaveTextContent("卡片内容");
  });

  it("exposes a frozen internal list of every semantic icon name", () => {
    expect(APP_ICON_NAMES).toEqual(Object.keys(appIconRegistry));
    expect(Object.isFrozen(APP_ICON_NAMES)).toBe(true);
  });
});
