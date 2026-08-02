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
const reportTimeFormatter = new Intl.DateTimeFormat("zh-CN", {
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});
const period: NoiseReportPeriod = {
  id: "morning-study",
  name: "晨间自习",
  start: new Date(START_TIME),
  end: new Date(START_TIME + 3 * 60_000),
};

type NoiseDetailOverrides = Partial<
  Pick<NoiseSliceSummary["detail"], "activityFloor" | "activityMean" | "eventFactor">
>;

function createSlice(
  index: number,
  calibrated = false,
  coverageRatio = 1,
  scoreOverride?: number,
  detailOverrides: NoiseDetailOverrides = {}
): NoiseSliceSummary {
  const start = START_TIME + index * 60_000;
  const end = start + 60_000;
  const activityMean = detailOverrides.activityMean ?? 0.1 + index * 0.1;
  const activityFloor = detailOverrides.activityFloor ?? 0.05 + index * 0.05;
  const eventFactor = detailOverrides.eventFactor ?? (index + 1) / 10;
  const formulaScore =
    Math.round((100 - activityMean * 65 - activityFloor * 25 - eventFactor * 10) * 10) / 10;
  return createNoiseSliceFixture({
    id: `capture-report:${index + 1}`,
    captureSessionId: "capture-report",
    windowSequence: index + 1,
    start,
    end,
    featureCount: 600,
    coverageRatio,
    score: scoreOverride ?? formulaScore,
    estimated: calibrated
      ? { calibrationId: "calibration-report", avgDbA: 48 + index * 4, p95DbA: 56 + index * 4 }
      : null,
    detail: {
      ...createNoiseSliceFixture().detail,
      activityMean,
      activityFloor,
      eventCount: index + 1,
      eventFactor,
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
    expect(within(dialog).getByText("82.5")).toBeInTheDocument();
    expect(within(dialog).getByText("平均分达标")).toBeInTheDocument();
    expect(within(dialog).getByText(/当前提醒线 70 分/)).toBeInTheDocument();
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
    expect(within(dialog).getByText("持续声活动")).toBeInTheDocument();
    expect(within(dialog).getByText("声音事件频度")).toBeInTheDocument();
    expect(within(dialog).getByText("约扣 13.0 分")).toBeInTheDocument();
    expect(within(dialog).getByText("约扣 2.5 分")).toBeInTheDocument();
    expect(within(dialog).getByText("约扣 2.0 分")).toBeInTheDocument();
    expect(within(dialog).getByText("占本次扣分 74.3%")).toBeInTheDocument();
    expect(within(dialog).getByText("占本次扣分 14.3%")).toBeInTheDocument();
    expect(within(dialog).getByText("占本次扣分 11.4%")).toBeInTheDocument();
    expect(within(dialog).getByText("评分构成与解读")).toBeInTheDocument();
    expect(within(dialog).getByText("本次评分构成")).toBeInTheDocument();
    expect(within(dialog).getByText("本时段解读")).toBeInTheDocument();
    expect(within(dialog).getByText(/平均 82\.5 分，高于提醒线 12\.5 分/)).toBeInTheDocument();
    expect(within(dialog).getByText(/主要扣分来自整体声活动，约扣 13\.0 分/)).toBeInTheDocument();
    const expectedLowestTime = reportTimeFormatter.format(new Date(START_TIME + 3 * 60_000));
    expect(
      within(dialog).getByText(`最低 73.8 分，出现在 ${expectedLowestTime} 左右。`)
    ).toBeInTheDocument();
    expect(
      within(dialog).getByText(/报告覆盖 100\.0%，有效 3分0秒，结果可代表本时段的大部分情况/)
    ).toBeInTheDocument();
    for (const implementationLabel of [
      "数据如何进入评分",
      "60 秒滚动窗口",
      "至少 80% 有效覆盖",
      "异常信号不计分",
      "质量与校准独立",
    ]) {
      expect(within(dialog).queryByText(implementationLabel)).not.toBeInTheDocument();
    }
    expect(
      within(dialog).queryByText(/单窗口覆盖要求|有效窗口仍会参与|合并后的高活动声音事件/)
    ).not.toBeInTheDocument();
    for (const legacyLabel of ["优秀", "良好", "一般", "较差"]) {
      expect(within(dialog).queryByText(legacyLabel)).not.toBeInTheDocument();
    }
    expect(
      within(dialog).queryByRole("radiogroup", { name: "报告主指标" })
    ).not.toBeInTheDocument();
    expect(within(dialog).queryByText(/\d+(\.\d+)? dB\(A\)/)).not.toBeInTheDocument();
  });

  it("平均分低于提醒线时使用需留意状态而非旧等级", async () => {
    noiseSliceServiceMocks.readNoiseSlices.mockResolvedValue([
      createSlice(0, false, 1, 60),
      createSlice(1, false, 1, 65),
      createSlice(2, false, 1, 69),
    ]);
    render(<NoiseReportModal isOpen onClose={vi.fn()} period={period} />);

    const dialog = await screen.findByRole("dialog", { name: "噪音统计报告" });

    expect(await within(dialog).findByText("64.7")).toBeInTheDocument();
    expect(within(dialog).getByText("平均分需留意")).toBeInTheDocument();
    expect(within(dialog).getByText(/平均 64\.7 分，低于提醒线 5\.3 分/)).toBeInTheDocument();
    expect(within(dialog).queryByText("一般")).not.toBeInTheDocument();
  });

  it.each([
    {
      label: "整体声活动",
      detail: { activityMean: 0.5, activityFloor: 0.1, eventFactor: 0.1 },
    },
    {
      label: "持续声活动",
      detail: { activityMean: 0.05, activityFloor: 0.8, eventFactor: 0.1 },
    },
    {
      label: "声音事件频度",
      detail: { activityMean: 0.02, activityFloor: 0.02, eventFactor: 0.9 },
    },
  ])("主要影响可识别 $label", async ({ label, detail }) => {
    noiseSliceServiceMocks.readNoiseSlices.mockResolvedValue([
      createSlice(0, false, 1, undefined, detail),
    ]);
    render(<NoiseReportModal isOpen onClose={vi.fn()} period={period} />);

    const dialog = await screen.findByRole("dialog", { name: "噪音统计报告" });

    expect(await within(dialog).findByText(new RegExp(`主要扣分来自${label}`))).toBeInTheDocument();
  });

  it("主要影响同分时按约定顺序选择整体声活动", async () => {
    noiseSliceServiceMocks.readNoiseSlices.mockResolvedValue([
      createSlice(0, false, 1, undefined, {
        activityMean: 5 / 65,
        activityFloor: 5 / 25,
        eventFactor: 5 / 10,
      }),
    ]);
    render(<NoiseReportModal isOpen onClose={vi.fn()} period={period} />);

    const dialog = await screen.findByRole("dialog", { name: "噪音统计报告" });

    expect(await within(dialog).findByText(/主要扣分来自整体声活动/)).toBeInTheDocument();
  });

  it("没有明显扣分时占比归零并显示安静结论", async () => {
    noiseSliceServiceMocks.readNoiseSlices.mockResolvedValue([
      createSlice(0, false, 1, undefined, {
        activityMean: 0,
        activityFloor: 0,
        eventFactor: 0,
      }),
    ]);
    render(<NoiseReportModal isOpen onClose={vi.fn()} period={period} />);

    const dialog = await screen.findByRole("dialog", { name: "噪音统计报告" });

    expect(await within(dialog).findByText("本次未产生明显扣分")).toBeInTheDocument();
    expect(within(dialog).getAllByText("占本次扣分 0.0%")).toHaveLength(3);
    expect(within(dialog).getByText("三项声音活动均未形成明显扣分。")).toBeInTheDocument();
  });

  it("最低记录同分时选择最早时段", async () => {
    noiseSliceServiceMocks.readNoiseSlices.mockResolvedValue([
      createSlice(0, false, 1, 50),
      createSlice(1, false, 1, 50),
      createSlice(2, false, 1, 80),
    ]);
    render(<NoiseReportModal isOpen onClose={vi.fn()} period={period} />);

    const dialog = await screen.findByRole("dialog", { name: "噪音统计报告" });
    const expectedEarliestTime = reportTimeFormatter.format(new Date(START_TIME + 60_000));

    expect(
      await within(dialog).findByText(`最低 50.0 分，出现在 ${expectedEarliestTime} 左右。`)
    ).toBeInTheDocument();
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
    const estimatedMode = await within(dialog).findByRole("radio", { name: "分贝" });
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
    expect(
      within(dialog).getByText(/报告仅覆盖 26\.7%，结论只代表 0分48秒有效数据，不代表完整时段/)
    ).toBeInTheDocument();
  });

  it("没有有效评分时保留报告空状态", async () => {
    noiseSliceServiceMocks.readNoiseSlices.mockResolvedValue([]);
    render(<NoiseReportModal isOpen onClose={vi.fn()} period={period} />);

    const dialog = await screen.findByRole("dialog", { name: "噪音统计报告" });

    expect(await within(dialog).findByText("该时段暂无有效噪音评分")).toBeInTheDocument();
  });
});
