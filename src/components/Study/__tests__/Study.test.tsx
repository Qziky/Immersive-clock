import { act, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { Study } from "../Study";

const reportSettings = vi.hoisted(() => ({
  value: { autoPopup: true, autoCloseMinutes: 10 },
}));

const weatherRuntimeMocks = vi.hoisted(() => ({
  acquire: vi.fn(() => () => undefined),
}));

vi.mock("../../../contexts/AppContext", () => ({
  useAppState: () => ({
    timeDisplay: { showStudySeconds: true },
    study: {
      carouselIntervalSec: 6,
      countdownItems: [],
      countdownType: "gaokao",
      display: {
        showCountdown: false,
        showDate: true,
        showNoiseMonitor: true,
        showQuote: false,
        showTime: true,
        showWeather: false,
      },
      infoCarousel: { items: [] },
      targetYear: 2027,
    },
  }),
}));

vi.mock("../../../contexts/AppearanceContext", () => ({
  useAppearance: () => ({
    getBackgroundImage: () => undefined,
    resolveBackground: () => ({ type: "default" }),
    resolveStyle: () => ({}),
  }),
  useComponentAppearance: () => ({}),
}));

vi.mock("../../../hooks/useNoiseStream", () => ({
  useNoiseStream: () => undefined,
}));

vi.mock("../../../hooks/useTimer", () => ({
  useTimer: () => undefined,
}));

vi.mock("../../../services/weatherRuntime", () => ({
  acquireWeatherRuntime: weatherRuntimeMocks.acquire,
}));

vi.mock("../../../utils/appearanceModel", () => ({
  appearanceBackgroundToCss: () => ({}),
}));

vi.mock("../../../utils/noiseReportSettings", () => ({
  getNoiseReportSettings: () => reportSettings.value,
}));

vi.mock("../../../utils/studyTimetableStorage", () => ({
  readStudyTimetable: () => ({
    cycleAnchorDate: "2026-08-02",
    document: {
      version: 2,
      configuration: {
        name: "测试课表",
        description: "Study 测试",
        cycle: {
          work_count: 2,
          rest_count: 2,
          spans: [
            { activity: "work", count: 2 },
            { activity: "rest", count: 2 },
          ],
        },
      },
      subjects: [{ name: "上午自习" }],
      schedules: [
        {
          name: "测试日",
          enable_day: [1],
          classes: [
            {
              subject: "上午自习",
              start_time: "10:00:00",
              end_time: "11:00:00",
            },
          ],
        },
      ],
    },
  }),
}));

vi.mock("../../../utils/timeSync", () => ({
  getAdjustedDate: () => new Date(2026, 7, 2, 10, 59, 0),
}));

vi.mock("../../MotivationalQuote", () => ({
  MotivationalQuote: () => null,
}));

vi.mock("../../NoiseHistoryModal/NoiseHistoryModal", () => ({
  default: ({
    onClose,
    onViewDetail,
  }: {
    onClose: () => void;
    onViewDetail: (period: { id: string; name: string; start: Date; end: Date }) => void;
  }) => (
    <div role="dialog" aria-label="噪音历史记录">
      <button
        type="button"
        onClick={() =>
          onViewDetail({
            id: "history",
            name: "历史自习",
            start: new Date(2026, 7, 1, 10, 0, 0),
            end: new Date(2026, 7, 1, 11, 0, 0),
          })
        }
      >
        查看历史报告
      </button>
      <button type="button" onClick={onClose}>
        关闭历史
      </button>
    </div>
  ),
}));

vi.mock("../../NoiseMonitor", () => ({
  default: ({ onStatusClick }: { onStatusClick?: () => void }) => (
    <button type="button" onClick={onStatusClick}>
      查看噪音历史
    </button>
  ),
}));

vi.mock("../../NoiseReportModal/NoiseReportModal", () => ({
  default: ({
    onBack,
    onClose,
    period,
  }: {
    onBack?: () => void;
    onClose: () => void;
    period: { name: string };
  }) => (
    <div role="dialog" aria-label="噪音统计报告">
      <span>{period.name}</span>
      <button type="button" onClick={onClose}>
        关闭报告
      </button>
      {onBack && (
        <button type="button" onClick={onBack}>
          返回历史
        </button>
      )}
    </div>
  ),
}));

vi.mock("../../StudyStatus", () => ({
  default: () => null,
}));

vi.mock("../../Weather", () => ({
  Weather: () => null,
}));

vi.mock("../StudyCenterPresentation", () => ({
  StudyCenterPresentation: ({ timeContent }: { timeContent: ReactNode }) => (
    <div>{timeContent}</div>
  ),
}));

vi.mock("../StudyCountdownCarouselPresentation", () => ({
  StudyCountdownCarouselPresentation: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
}));

vi.mock("../StudyCountdownItemPresentation", () => ({
  StudyCountdownItemPresentation: () => null,
}));

vi.mock("../StudyTimePresentation", () => ({
  StudyTimePresentation: () => <time>10:59</time>,
}));

vi.mock("../StudyTopDockPresentation", () => ({
  StudyTopDockPresentation: ({ noiseContent }: { noiseContent?: ReactNode }) => (
    <div>{noiseContent}</div>
  ),
}));

describe("Study 自习报告自动关闭", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    reportSettings.value = { autoPopup: true, autoCloseMinutes: 10 };
    weatherRuntimeMocks.acquire.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it.each([
    ["默认", 10],
    ["自定义", 3],
  ])("%s时长到期后关闭自动弹出的报告", (_label, minutes) => {
    reportSettings.value = { autoPopup: true, autoCloseMinutes: minutes };
    render(<Study />);

    expect(screen.getByRole("dialog", { name: "噪音统计报告" })).toBeVisible();

    act(() => vi.advanceTimersByTime(minutes * 60 * 1000 - 1));
    expect(screen.getByRole("dialog", { name: "噪音统计报告" })).toBeVisible();

    act(() => vi.advanceTimersByTime(1));
    expect(screen.queryByRole("dialog", { name: "噪音统计报告" })).not.toBeInTheDocument();
  });

  it("挂载自习页时才启动天气运行时", () => {
    render(<Study />);

    expect(weatherRuntimeMocks.acquire).toHaveBeenCalledTimes(1);
  });

  it("手动关闭自动报告时清理待执行的关闭计时器", () => {
    render(<Study />);

    fireEvent.click(screen.getByRole("button", { name: "关闭报告" }));

    expect(screen.queryByRole("dialog", { name: "噪音统计报告" })).not.toBeInTheDocument();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("从历史记录打开的报告不会自动关闭", () => {
    reportSettings.value = { autoPopup: false, autoCloseMinutes: 1 };
    render(<Study />);

    fireEvent.click(screen.getByRole("button", { name: "查看噪音历史" }));
    fireEvent.click(screen.getByRole("button", { name: "查看历史报告" }));
    expect(screen.getByRole("dialog", { name: "噪音统计报告" })).toBeVisible();

    act(() => vi.advanceTimersByTime(5 * 60 * 1000));

    expect(screen.getByRole("dialog", { name: "噪音统计报告" })).toBeVisible();
    expect(vi.getTimerCount()).toBe(0);
  });
});
