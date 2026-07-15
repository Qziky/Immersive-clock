import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Checkbox } from "../Checkbox";
import { RadioGroup } from "../RadioGroup";

const primitiveStyles = readFileSync(
  resolve("src/ui/components/primitives.module.css"),
  "utf8"
).replace(/\r\n/g, "\n");

describe("RadioGroup", () => {
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
