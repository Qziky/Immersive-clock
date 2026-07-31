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

function createSlice(
  index: number,
  calibrated = false,
  coverageRatio = 1,
  scoreOverride?: number
): NoiseSliceSummary {
  const start = START_TIME + index * 60_000;
  const end = start + 60_000;
  return createNoiseSliceFixture({
    id: `capture-report:${index + 1}`,
    captureSessionId: "capture-report",
    windowSequence: index + 1,
    start,
    end,
    featureCount: 600,
    coverageRatio,
    score: scoreOverride ?? 92 - index * 8,
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
      sampledDurationMs: (end - start) * coverageRatio,
      coverageRatio,
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

    const dialog = await screen.findByRole("dialog", { name: "噪音统计报告" });
    await waitFor(() =>
      expect(within(dialog).getByRole("img", { name: "环境安静评分走势" })).toBeInTheDocument()
    );

    expect(within(dialog).getByText("晨间自习")).toBeInTheDocument();
    expect(within(dialog).getByText(/共3分0秒/)).toBeInTheDocument();
    expect(within(dialog).getByText("良好")).toBeInTheDocument();
    expect(within(dialog).getByText("覆盖充分")).toBeInTheDocument();
    const quietRateSummary = within(dialog).getByRole("group", { name: "安静达标率摘要" });
    expect(within(quietRateSummary).getByText("安静达标率")).toBeInTheDocument();
    expect(within(quietRateSummary).queryByText(/数据质量/)).not.toBeInTheDocument();
    expect(within(dialog).getByRole("progressbar", { name: "安静达标率" })).toHaveAttribute(
      "aria-valuenow",
      "100"
    );
    expect(within(dialog).getByText(/数据质量：覆盖 100.0%/)).toBeInTheDocument();
    expect(within(dialog).getByText("整体声活动")).toBeInTheDocument();
    expect(within(dialog).getByText("持续背景声")).toBeInTheDocument();
    expect(within(dialog).getByText("突发声频度")).toBeInTheDocument();
    expect(
      within(dialog).queryByRole("radiogroup", { name: "报告主指标" })
    ).not.toBeInTheDocument();
    expect(within(dialog).queryByText(/\d+(\.\d+)? dB\(A\)/)).not.toBeInTheDocument();
  });

  it("安静达标率按有效时段统计并区分需留意时段", async () => {
    noiseSliceServiceMocks.readNoiseSlices.mockResolvedValue([
      createSlice(0, false, 1, 92),
      createSlice(1, false, 1, 68),
      createSlice(2, false, 1, 76),
    ]);
    render(<NoiseReportModal isOpen onClose={vi.fn()} period={period} />);

    const dialog = await screen.findByRole("dialog", { name: "噪音统计报告" });
    const quietRateProgress = await within(dialog).findByRole("progressbar", {
      name: "安静达标率",
    });

    expect(Number(quietRateProgress.getAttribute("aria-valuenow"))).toBeCloseTo(66.7, 1);
    expect(within(dialog).getByText("66.7%")).toBeInTheDocument();
    expect(within(dialog).getByText("安静时段").nextElementSibling).toHaveTextContent("2分0秒");
    expect(within(dialog).getByText("需留意时段").nextElementSibling).toHaveTextContent("1分0秒");
  });

  it("仅在切片带校准快照时允许切换估算 dB(A) 主图", async () => {
    const user = userEvent.setup();
    noiseSliceServiceMocks.readNoiseSlices.mockResolvedValue([
      createSlice(0, true),
      createSlice(1, true),
      createSlice(2, true),
    ]);
    render(<NoiseReportModal isOpen onClose={vi.fn()} period={period} />);

    const dialog = await screen.findByRole("dialog", { name: "噪音统计报告" });
    const estimatedMode = await within(dialog).findByRole("radio", { name: "估算 dB(A)" });
    await user.click(estimatedMode);

    expect(estimatedMode).toBeChecked();
    expect(within(dialog).getByRole("img", { name: "估算 dB(A) 走势" })).toBeInTheDocument();
    expect(within(dialog).getByText("平均估算 dB(A)")).toBeInTheDocument();
  });

  it("报告整体覆盖不足时明确标记覆盖有限", async () => {
    noiseSliceServiceMocks.readNoiseSlices.mockResolvedValue([createSlice(0, false, 0.8)]);
    render(<NoiseReportModal isOpen onClose={vi.fn()} period={period} />);

    const dialog = await screen.findByRole("dialog", { name: "噪音统计报告" });

    expect(await within(dialog).findByText("覆盖有限")).toBeInTheDocument();
    expect(
      within(dialog).getByText(/数据质量：覆盖 26.7% · 有效 0分48秒 · 排除 2分12秒/)
    ).toBeInTheDocument();
  });

  it("没有有效评分时保留报告空状态", async () => {
    noiseSliceServiceMocks.readNoiseSlices.mockResolvedValue([]);
    render(<NoiseReportModal isOpen onClose={vi.fn()} period={period} />);

    const dialog = await screen.findByRole("dialog", { name: "噪音统计报告" });

    expect(await within(dialog).findByText("该时段暂无有效噪音评分")).toBeInTheDocument();
  });
});
