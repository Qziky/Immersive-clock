import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { StudyTimePresentation } from "../StudyTimePresentation";

describe("StudyTimePresentation", () => {
  it("显示独立的秒钟节点", () => {
    render(<StudyTimePresentation primaryText="12:45" secondsText=":09" />);

    expect(screen.getByText("12:45")).toBeVisible();
    expect(screen.getByText(":09")).toBeVisible();
  });

  it("未提供秒数时不渲染秒钟节点", () => {
    render(
      <StudyTimePresentation
        currentTimeAttributes={{ "aria-label": "当前时间：12:45" }}
        primaryText="12:45"
      />
    );

    expect(screen.getByLabelText("当前时间：12:45")).toHaveTextContent("12:45");
    expect(screen.queryByText(":09")).toBeNull();
  });
});
