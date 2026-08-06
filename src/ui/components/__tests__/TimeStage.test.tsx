import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { TimeStage, TimeStageValue } from "../TimeStage";

describe("TimeStage", () => {
  it("默认渲染流式舞台并保留根节点与内容属性", () => {
    render(
      <TimeStage
        contentAttributes={{ "data-testid": "stage-content" }}
        rootAttributes={{ "aria-label": "时钟舞台", className: "custom-stage" }}
      >
        <TimeStageValue data-testid="stage-value">12:45:09</TimeStageValue>
      </TimeStage>
    );

    const stage = screen.getByLabelText("时钟舞台");
    expect(stage.className).toContain("stageFlow");
    expect(stage).toHaveClass("custom-stage");
    expect(screen.getByTestId("stage-content")).toContainElement(screen.getByTestId("stage-value"));
  });

  it("覆盖式舞台与主数字复用公共视觉类", () => {
    render(
      <TimeStage placement="overlay" rootAttributes={{ "data-testid": "overlay-stage" }}>
        <TimeStageValue className="custom-value">00:25:00</TimeStageValue>
      </TimeStage>
    );

    expect(screen.getByTestId("overlay-stage").className).toContain("stageOverlay");
    expect(screen.getByText("00:25:00").className).toContain("value");
    expect(screen.getByText("00:25:00")).toHaveClass("custom-value");
  });
});
