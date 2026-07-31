import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { RealTimeNoiseChart } from "../RealTimeNoiseChart";

const noiseStreamMock = vi.hoisted(() => ({
  useNoiseStream: vi.fn(),
}));

vi.mock("../../../hooks/useNoiseStream", () => noiseStreamMock);

describe("RealTimeNoiseChart", () => {
  it("renders realtime samples and the warning threshold through the shared chart", () => {
    noiseStreamMock.useNoiseStream.mockReturnValue({
      ringBuffer: [
        { t: 1_000, quietnessScore: 82, estimatedDbA: null },
        { t: 1_100, quietnessScore: 76, estimatedDbA: null },
        { t: 1_200, quietnessScore: 64, estimatedDbA: null },
      ],
      primaryMetric: "quietness-score",
      scoreAlertThreshold: 70,
      status: "noisy",
    });

    const { container } = render(<RealTimeNoiseChart />);

    expect(screen.getByRole("img", { name: "实时环境评分折线图" })).toBeInTheDocument();
    expect(screen.getByText("64.0 分")).toBeInTheDocument();
    expect(container.querySelector('[data-chart-series="realtime-noise"]')).not.toBeNull();
    expect(container.querySelector('[data-chart-threshold="70"]')).not.toBeNull();
  });
});
