import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Portal } from "../Accessibility";
import { FormSection } from "../FormComponents";
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
});
