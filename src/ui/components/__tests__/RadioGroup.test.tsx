import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { Checkbox } from "../Checkbox";
import { RadioGroup } from "../RadioGroup";

const primitiveStyles = readFileSync(
  resolve("src/ui/components/primitives.module.css"),
  "utf8"
).replace(/\r\n/g, "\n");

describe("RadioGroup", () => {
  it("reports changes while keeping selection controlled by the value prop", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const options = [
      { value: "normal", label: "标准" },
      { value: "fast", label: "快速" },
    ] as const;
    const { rerender } = render(
      <RadioGroup ariaLabel="显示速度" value="normal" options={options} onChange={onChange} />
    );

    await user.click(screen.getByRole("radio", { name: "快速" }));

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith("fast");
    expect(screen.getByRole("radio", { name: "标准" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "快速" })).not.toBeChecked();

    rerender(
      <RadioGroup ariaLabel="显示速度" value="fast" options={options} onChange={onChange} />
    );
    expect(screen.getByRole("radio", { name: "快速" })).toBeChecked();
  });

  it("prevents selecting a disabled option", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <RadioGroup
        ariaLabel="显示速度"
        value="normal"
        options={[
          { value: "normal", label: "标准" },
          { value: "fast", label: "快速", disabled: true },
        ]}
        onChange={onChange}
      />
    );

    const disabledOption = screen.getByRole("radio", { name: "快速" });
    expect(disabledOption).toBeDisabled();
    await user.click(disabledOption);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("renders its error content next to the group", () => {
    render(
      <RadioGroup
        label="显示速度"
        value="normal"
        options={[{ value: "normal", label: "标准" }]}
        error="请选择显示速度"
        onChange={() => {}}
      />
    );

    expect(screen.getByRole("radiogroup", { name: "显示速度" })).toBeInTheDocument();
    expect(screen.getByText("请选择显示速度")).toBeInTheDocument();
  });

  it("anchors each hidden radio input to its visible row", () => {
    render(
      <RadioGroup
        ariaLabel="显示速度"
        value="normal"
        options={[
          { value: "normal", label: "标准" },
          { value: "fast", label: "快速" },
        ]}
        onChange={() => {}}
      />
    );

    for (const radio of screen.getAllByRole("radio")) {
      expect(radio.parentElement?.tagName).toBe("LABEL");
      expect(radio.parentElement?.className).toContain("radioRow");
    }
  });

  it("anchors checkbox inputs to the same scrolling label context", () => {
    render(<Checkbox label="启用提醒" />);

    const checkbox = screen.getByRole("checkbox", { name: "启用提醒" });
    expect(checkbox.parentElement?.tagName).toBe("LABEL");
    expect(checkbox.parentElement?.className).toContain("checkRow");
  });

  it("keeps both hidden selection inputs inside positioned label rows", () => {
    expect(primitiveStyles).toContain(`.checkRow,
.radioRow {
  align-items: center;
  color: var(--ui-color-text-muted);
  display: inline-flex;
  gap: var(--ui-space-2);
  min-height: 26px;
  position: relative;
}`);
  });
});
