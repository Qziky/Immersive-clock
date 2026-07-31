import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createNoiseSliceFixture } from "../../../test/noiseFixtures";
import type { NoiseSliceSummary } from "../../../types/noise";
import { NoiseReportModal, type NoiseReportPeriod } from "../NoiseReportModal";

const noiseSliceServiceMocks = vi.hoisted(() => ({
  readNoiseSlices: vi.fn(),
  subscribeNoiseSlicesUpdated: vi.fn(() => vi.fn()),
}));

vi.mock("../../../utils/noiseSliceService", () => noiseSliceServiceMocks);
vi.mock("../../../utils/noiseControlSettings", () => ({
  getNoiseControlSettings: () => ({ scoreAlertThreshold: 70 }),
}));

const START_TIME = new Date("2026-07-15T08:00:00+08:00").getTime();
const period: NoiseReportPeriod = {
  id: "morning-study",
  name: "晨间自习",
  start: new Date(START_TIME),
  end: new Date(START_TIME + 3 * 60_000),
};

function createSlice(index: number, calibrated = false): NoiseSliceSummary {
  const start = START_TIME + index * 60_000;
  const end = start + 60_000;
  return createNoiseSliceFixture({
    id: `capture-report:${index + 1}`,
    captureSessionId: "capture-report",
    windowSequence: index + 1,
    start,
    end,
    featureCount: 600,
    score: 92 - index * 8,
    estimated: calibrated
      ? { calibrationId: "calibration-report", avgDbA: 48 + index * 4, p95DbA: 56 + index * 4 }
      : null,
    detail: {
      ...createNoiseSliceFixture().detail,
      activityMean: 0.1 + index * 0.1,
      activityFloor: 0.05 + index * 0.05,
      eventCount: index + 1,
      eventFactor: (index + 1) / 10,
      durationMs: end - start,
      sampledDurationMs: end - start,
      coverageRatio: 1,
    },
  });
}

describe("NoiseReportModal v2", () => {
  beforeEach(() => {
    noiseSliceServiceMocks.readNoiseSlices.mockReset();
    noiseSliceServiceMocks.subscribeNoiseSlicesUpdated.mockClear();
  });

  it("未校准时只显示环境安静评分且不出现 dB(A) 数字", async () => {
    noiseSliceServiceMocks.readNoiseSlices.mockResolvedValue([
      createSlice(0),
      createSlice(1),
      createSlice(2),
    ]);
    render(<NoiseReportModal isOpen onClose={vi.fn()} period={period} />);

    const dialog = await screen.findByRole("dialog", { name: "晨间自习 统计报告" });
    await waitFor(() =>
      expect(within(dialog).getByRole("img", { name: "环境安静评分走势" })).toBeInTheDocument()
    );

    expect(within(dialog).getByRole("radio", { name: "评分" })).toBeChecked();
    expect(within(dialog).queryByRole("radio", { name: "估算 dB(A)" })).not.toBeInTheDocument();
    expect(within(dialog).queryByText(/\d+(\.\d+)? dB\(A\)/)).not.toBeInTheDocument();
  });

  it("仅在切片带校准快照时允许切换估算 dB(A) 主图", async () => {
    const user = userEvent.setup();
    noiseSliceServiceMocks.readNoiseSlices.mockResolvedValue([
      createSlice(0, true),
      createSlice(1, true),
      createSlice(2, true),
    ]);
    render(<NoiseReportModal isOpen onClose={vi.fn()} period={period} />);

    const dialog = await screen.findByRole("dialog", { name: "晨间自习 统计报告" });
    const estimatedMode = await within(dialog).findByRole("radio", { name: "估算 dB(A)" });
    await user.click(estimatedMode);

    expect(estimatedMode).toBeChecked();
    expect(within(dialog).getByRole("img", { name: "估算 dB(A) 走势" })).toBeInTheDocument();
    expect(within(dialog).getByText("平均估算 dB(A)")).toBeInTheDocument();
  });
});
