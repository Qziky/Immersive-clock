import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { NoiseSliceSummary } from "../../../types/noise";
import { NoiseReportModal, type NoiseReportPeriod } from "../NoiseReportModal";

const noiseSliceServiceMocks = vi.hoisted(() => ({
  readNoiseSlices: vi.fn(),
  subscribeNoiseSlicesUpdated: vi.fn(() => vi.fn()),
}));

vi.mock("../../../utils/noiseSliceService", () => noiseSliceServiceMocks);
vi.mock("../../../utils/noiseControlSettings", () => ({
  getNoiseControlSettings: () => ({ maxLevelDb: 55 }),
}));

const START_TIME = new Date("2026-07-15T08:00:00+08:00").getTime();

const period: NoiseReportPeriod = {
  id: "morning-study",
  name: "晨间自习",
  start: new Date(START_TIME),
  end: new Date(START_TIME + 3 * 60_000),
};

function createSlice(index: number): NoiseSliceSummary {
  const start = START_TIME + index * 60_000;
  const end = start + 60_000;

  return {
    start,
    end,
    frames: 60,
    raw: {
      avgDbfs: -48 + index * 4,
      maxDbfs: -35 + index * 4,
      p50Dbfs: -50 + index * 4,
      p95Dbfs: -40 + index * 4,
      overRatioDbfs: 0.1 + index * 0.1,
      segmentCount: index + 1,
      sampledDurationMs: end - start,
    },
    display: {
      avgDb: 42 + index * 8,
      p95Db: 50 + index * 8,
    },
    score: 92 - index * 8,
    scoreDetail: {
      sustainedPenalty: 0.04 + index * 0.02,
      timePenalty: 0.03 + index * 0.02,
      segmentPenalty: 0.02 + index * 0.02,
      thresholdsUsed: {
        scoreThresholdDbfs: -32,
        segmentMergeGapMs: 1000,
        maxSegmentsPerMin: 8,
      },
      sustainedLevelDbfs: -48 + index * 4,
      overRatioDbfs: 0.1 + index * 0.1,
      segmentCount: index + 1,
      minutes: 1,
      durationMs: end - start,
      sampledDurationMs: end - start,
      coverageRatio: 1,
    },
  };
}

describe("NoiseReportModal", () => {
  beforeEach(() => {
    localStorage.clear();
    noiseSliceServiceMocks.readNoiseSlices.mockReset();
    noiseSliceServiceMocks.readNoiseSlices.mockResolvedValue([
      createSlice(0),
      createSlice(1),
      createSlice(2),
    ]);
    noiseSliceServiceMocks.subscribeNoiseSlicesUpdated.mockClear();
  });

  it("switches the main plot between one and three data layers", async () => {
    const user = userEvent.setup();
    render(<NoiseReportModal isOpen onClose={vi.fn()} period={period} />);

    const dialog = await screen.findByRole("dialog", { name: "晨间自习 统计报告" });
    await waitFor(() => expect(within(dialog).getAllByRole("img")).toHaveLength(3));

    const mainChart = within(dialog).getByRole("img", { name: /^噪音走势/ });
    const singleMode = within(dialog).getByRole("radio", { name: "单图" });
    const combinedMode = within(dialog).getByRole("radio", { name: "三图" });
    const combinedScorePath = 'path[mask="url(#scoreCoverageMaskMain)"]';
    const combinedEventBar = 'rect[shape-rendering="crispEdges"]';

    expect(singleMode).toBeChecked();
    expect(mainChart.querySelector(combinedScorePath)).not.toBeInTheDocument();
    expect(mainChart.querySelector(combinedEventBar)).not.toBeInTheDocument();

    await user.click(combinedMode);

    expect(combinedMode).toBeChecked();
    expect(mainChart.querySelector(combinedScorePath)).toBeInTheDocument();
    expect(mainChart.querySelectorAll(combinedEventBar).length).toBeGreaterThan(0);
    expect(within(dialog).getAllByRole("img")).toHaveLength(3);
    expect(localStorage.getItem("noise-report.is-main-chart-combined")).toBe("true");

    await user.click(singleMode);

    expect(singleMode).toBeChecked();
    expect(mainChart.querySelector(combinedScorePath)).not.toBeInTheDocument();
    expect(mainChart.querySelector(combinedEventBar)).not.toBeInTheDocument();
    expect(within(dialog).getAllByRole("img")).toHaveLength(3);
    expect(localStorage.getItem("noise-report.is-main-chart-combined")).toBe("false");
  });
});
