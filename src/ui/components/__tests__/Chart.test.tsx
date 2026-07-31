import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ChartLegend, LineChart } from "../Chart";

const xTicks = [
  { value: 0, label: "08:00" },
  { value: 2, label: "08:02" },
];
const yTicks = [
  { value: 20, label: "20" },
  { value: 60, label: "60" },
];

describe("LineChart", () => {
  it("renders accessible line, area, threshold, gap, bar and legend layers", () => {
    const { container } = render(
      <LineChart
        ariaLabel="专注环境走势"
        description="两分钟内的环境噪音与打断次数。"
        xDomain={[0, 2]}
        yDomain={[20, 60]}
        xTicks={xTicks}
        yTicks={yTicks}
        thresholds={[{ value: 50, label: "50 dB", tone: "danger" }]}
        series={[
          {
            id: "noise",
            label: "噪音",
            data: [{ x: 0, y: 34 }, { x: 0.5, y: 38 }, null, { x: 1.5, y: 44 }, { x: 2, y: 52 }],
            area: true,
            colorAbove: { value: 50, tone: "danger" },
          },
          {
            id: "focus",
            label: "专注度",
            data: [
              { x: 0, y: 52 },
              { x: 2, y: 48 },
            ],
            tone: "success",
          },
        ]}
        bars={[
          {
            id: "events",
            label: "打断",
            data: [{ x: 1.5, y: 2 }],
            yDomain: [0, 4],
            tone: "danger",
          },
        ]}
        showLegend
      />
    );

    const chart = screen.getByRole("img", { name: "专注环境走势" });
    expect(chart).toHaveAccessibleDescription("两分钟内的环境噪音与打断次数。");
    expect(container.querySelectorAll('[data-chart-series="noise"]')).toHaveLength(2);
    expect(container.querySelector('[data-chart-series="focus"]')).toHaveAttribute(
      "stroke",
      "var(--ui-color-success)"
    );
    expect(container.querySelectorAll('[class*="lineHalo"]')).toHaveLength(0);
    expect(container.querySelector('[data-chart-bar-series="events"]')).not.toBeNull();
    expect(container.querySelector('[data-chart-threshold="50"]')).not.toBeNull();
    expect(screen.getByLabelText("图表图例")).toHaveTextContent("噪音");
    expect(screen.getByLabelText("图表图例")).toHaveTextContent("打断");
  });

  it("renders a stable empty state", () => {
    render(
      <LineChart
        ariaLabel="空图表"
        emptyMessage="趋势样本不足"
        series={[]}
        xDomain={[0, 1]}
        yDomain={[0, 100]}
      />
    );

    expect(screen.getByRole("status")).toHaveTextContent("趋势样本不足");
    expect(screen.queryByRole("img", { name: "空图表" })).not.toBeInTheDocument();
  });
});

describe("ChartLegend", () => {
  it("renders line and bar semantics from the public API", () => {
    render(
      <ChartLegend
        items={[
          { id: "focus", label: "专注度", tone: "accent", kind: "line" },
          { id: "interruptions", label: "打断", tone: "danger", kind: "bar" },
        ]}
      />
    );

    expect(screen.getByLabelText("图表图例")).toHaveTextContent("专注度");
    expect(screen.getByLabelText("图表图例")).toHaveTextContent("打断");
  });
});
