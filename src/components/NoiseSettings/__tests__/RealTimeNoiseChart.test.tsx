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
        { t: 1_000, displayDb: 42, dbfs: -48 },
        { t: 1_100, displayDb: 47, dbfs: -43 },
        { t: 1_200, displayDb: 58, dbfs: -32 },
      ],
      maxLevelDb: 55,
      status: "noisy",
    });

    const { container } = render(<RealTimeNoiseChart />);

    expect(screen.getByRole("img", { name: "实时噪音折线图" })).toBeInTheDocument();
    expect(screen.getByText("58.0 dB")).toBeInTheDocument();
    expect(container.querySelector('[data-chart-series="realtime-noise"]')).not.toBeNull();
    expect(container.querySelector('[data-chart-threshold="55"]')).not.toBeNull();
  });
});
