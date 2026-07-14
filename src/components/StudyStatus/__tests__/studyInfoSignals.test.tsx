import { act, fireEvent, render, renderHook, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { StudyInfoCarouselSettings } from "../../../types";
import type { MinutelyRainStats } from "../../../utils/minutelyPrecipLogic";
import {
  DEFAULT_STUDY_INFO_CAROUSEL,
  MAX_STUDY_INFO_ITEMS,
  resolveStudyInfoSignals,
  type StudyInfoSignal,
} from "../studyInfoSignals";
import { StudyStatusPresentation } from "../StudyStatusPresentation";
import { useStudyInfoCarousel } from "../useStudyInfoCarousel";

const now = new Date(2026, 6, 14, 10, 0, 0);
const progress = {
  stageText: "保持专注",
  stageAriaText: "保持专注",
  remainingTimeText: "还剩 30 分钟",
  statusText: "第1节自习",
  hasProgress: true,
};

function scheduleAt(startTime: string) {
  return [{ id: "next", name: "第2节自习", startTime, endTime: "11:00" }];
}

function rainStats(overrides: Partial<MinutelyRainStats>): MinutelyRainStats {
  const leadMinutes = overrides.leadMinutes ?? 20;
  const durationMinutes = overrides.durationMinutes ?? 18;
  const remainingMinutes = overrides.remainingMinutes ?? null;
  const isRainingNow = overrides.isRainingNow ?? false;
  const rainStartAt = overrides.rainStartAt ?? now.getTime() + leadMinutes * 60 * 1000;
  const rainEndAt =
    overrides.rainEndAt ??
    (isRainingNow && remainingMinutes != null
      ? now.getTime() + remainingMinutes * 60 * 1000
      : rainStartAt + durationMinutes * 60 * 1000);

  return {
    hasRain: true,
    probability: 100,
    intensityLabel: "小雨",
    startInMinutes: leadMinutes,
    durationMinutes,
    remainingMinutes,
    expectedAmountMm: 1,
    summary: "",
    isRainingNow,
    nextRainStartAt: rainStartAt,
    rainStartAt,
    rainEndAt,
    leadMinutes,
    ...overrides,
  };
}

function routineSignal(id: string): StudyInfoSignal {
  return {
    id,
    source: id === "progress" ? "progress" : "custom",
    priority: "routine",
    displayMode: "rotating",
    primaryText: id,
    ariaText: id,
    dedupeKey: id,
  };
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("StudyStatus 中央信号", () => {
  it("持续显示下一课时，并按 15/5 分钟阈值提升优先级", () => {
    const routineSignals = resolveStudyInfoSignals({
      now,
      progress,
      schedule: scheduleAt("10:16"),
    });
    const routine = routineSignals.find((signal) => signal.source === "nextSchedule");
    const timely = resolveStudyInfoSignals({ now, progress, schedule: scheduleAt("10:15") }).find(
      (signal) => signal.source === "nextSchedule"
    );
    const critical = resolveStudyInfoSignals({ now, progress, schedule: scheduleAt("10:05") }).find(
      (signal) => signal.source === "nextSchedule"
    );

    expect(routine?.priority).toBe("routine");
    expect(routineSignals.map((signal) => signal.source)).toEqual(["progress", "nextSchedule"]);
    expect(timely?.priority).toBe("timely");
    expect(critical?.priority).toBe("critical");
    expect(critical?.displayMode).toBe("interrupt");
    expect(
      resolveStudyInfoSignals({ now, progress, schedule: scheduleAt("09:59") }).some(
        (signal) => signal.source === "nextSchedule"
      )
    ).toBe(false);
  });

  it("按 30/10 分钟窗口调度将雨消息，正在下雨时始终打断", () => {
    const timely = resolveStudyInfoSignals({
      now,
      progress,
      weather: { stats: rainStats({ leadMinutes: 30 }), freshness: "fresh" },
    }).find((signal) => signal.source === "rain");
    const critical = resolveStudyInfoSignals({
      now,
      progress,
      weather: { stats: rainStats({ leadMinutes: 10 }), freshness: "fresh" },
    }).find((signal) => signal.source === "rain");
    const raining = resolveStudyInfoSignals({
      now,
      progress,
      weather: {
        stats: rainStats({ isRainingNow: true, leadMinutes: 0, remainingMinutes: 8 }),
        freshness: "fresh",
      },
    }).find((signal) => signal.source === "rain");

    expect(timely?.priority).toBe("timely");
    expect(critical?.priority).toBe("critical");
    expect(raining?.priority).toBe("critical");
    expect(raining?.secondaryText).toBe("预计还剩 8 分钟");
    expect(
      resolveStudyInfoSignals({
        now,
        progress,
        weather: { stats: rainStats({ leadMinutes: 31 }), freshness: "fresh" },
      }).some((signal) => signal.source === "rain")
    ).toBe(false);

    const sameRainAfterStart = resolveStudyInfoSignals({
      now: now.getTime() + 10 * 60 * 1000,
      progress,
      weather: {
        stats: rainStats({ isRainingNow: true, leadMinutes: 10 }),
        freshness: "fresh",
      },
    }).find((signal) => signal.source === "rain");
    expect(sameRainAfterStart?.id).toBe(critical?.id);
    expect(sameRainAfterStart?.dedupeKey).not.toBe(critical?.dedupeKey);
  });

  it("忽略过期天气并把有效运行队列限制为 20 条", () => {
    const items = [
      ...DEFAULT_STUDY_INFO_CAROUSEL.items,
      ...Array.from({ length: 30 }, (_, index) => ({
        id: `custom-${index}`,
        source: "custom" as const,
        enabled: true,
        order: index + 3,
        text: `消息 ${index}`,
      })),
    ];
    const settings: StudyInfoCarouselSettings = {
      ...DEFAULT_STUDY_INFO_CAROUSEL,
      items,
    };
    const signals = resolveStudyInfoSignals({
      now,
      progress,
      settings,
      weather: { stats: rainStats({}), freshness: "stale" },
    });

    expect(signals.length).toBeLessThanOrEqual(MAX_STUDY_INFO_ITEMS);
    expect(signals.some((signal) => signal.source === "rain")).toBe(false);
    expect(signals.filter((signal) => signal.source === "custom")).toHaveLength(17);
  });

  it("多个 critical 按事件时间和配置顺序稳定排列", () => {
    const settings: StudyInfoCarouselSettings = {
      autoRotate: true,
      intervalSec: 3,
      items: [
        { id: "next-schedule-default", source: "nextSchedule", enabled: true, order: 0 },
        { id: "rain-default", source: "rain", enabled: true, order: 1 },
        { id: "progress-default", source: "progress", enabled: true, order: 2 },
      ],
    };
    const earlierRainSignals = resolveStudyInfoSignals({
      now,
      progress,
      schedule: scheduleAt("10:05"),
      settings,
      weather: {
        stats: rainStats({
          leadMinutes: 4,
          startInMinutes: 4,
        }),
        freshness: "fresh",
      },
    });

    expect(
      earlierRainSignals
        .filter((signal) => signal.priority === "critical")
        .map((signal) => signal.source)
    ).toEqual(["rain", "nextSchedule"]);

    const simultaneousSignals = resolveStudyInfoSignals({
      now,
      progress,
      schedule: scheduleAt("10:05"),
      settings,
      weather: { stats: rainStats({ leadMinutes: 5, startInMinutes: 5 }), freshness: "fresh" },
    });
    expect(
      simultaneousSignals
        .filter((signal) => signal.priority === "critical")
        .map((signal) => signal.source)
    ).toEqual(["nextSchedule", "rain"]);
  });

  it("过滤已经过期的事件信号", () => {
    const signals = resolveStudyInfoSignals({
      now,
      progress,
      weather: {
        phase: "raining",
        freshness: "fresh",
        stats: rainStats({
          isRainingNow: true,
          rainStartAt: now.getTime() - 10 * 60 * 1000,
          rainEndAt: now.getTime(),
          remainingMinutes: 0,
        }),
      },
    });

    expect(signals.some((signal) => signal.source === "rain")).toBe(false);
  });
});

describe("StudyStatus 信息调度器", () => {
  it("critical 到来时打断，消失后恢复此前普通消息", () => {
    const progressSignal = routineSignal("progress");
    const customSignal = routineSignal("custom");
    const rainSignal: StudyInfoSignal = {
      ...routineSignal("rain"),
      source: "rain",
      priority: "critical",
      displayMode: "interrupt",
    };
    const { result, rerender } = renderHook(
      ({ signals }) => useStudyInfoCarousel({ signals, autoRotate: false }),
      { initialProps: { signals: [progressSignal, customSignal] } }
    );

    act(() => result.current.next());
    expect(result.current.currentSignal?.id).toBe("custom");

    rerender({ signals: [rainSignal, progressSignal, customSignal] });
    expect(result.current.currentSignal?.id).toBe("rain");

    rerender({ signals: [progressSignal, customSignal] });
    expect(result.current.currentSignal?.id).toBe("custom");
  });

  it("按设置间隔自动切换普通消息", () => {
    vi.useFakeTimers();
    const signals = [routineSignal("progress"), routineSignal("custom")];
    const { result } = renderHook(() =>
      useStudyInfoCarousel({ signals, autoRotate: true, intervalSec: 3 })
    );

    expect(result.current.currentSignal?.id).toBe("progress");
    act(() => vi.advanceTimersByTime(3000));
    expect(result.current.currentSignal?.id).toBe("custom");
  });

  it("每秒重建信号对象时不会重置轮播计时器", () => {
    vi.useFakeTimers();
    const { result, rerender } = renderHook(
      ({ tick }) =>
        useStudyInfoCarousel({
          signals: [routineSignal("progress"), routineSignal("custom")].map((signal) => ({
            ...signal,
            secondaryText: String(tick),
          })),
          autoRotate: true,
          intervalSec: 3,
        }),
      { initialProps: { tick: 0 } }
    );

    for (let tick = 1; tick <= 3; tick += 1) {
      rerender({ tick });
      act(() => vi.advanceTimersByTime(1000));
    }

    expect(result.current.currentSignal?.id).toBe("custom");
  });

  it("timely 运行中到来不会打断当前消息，后续轮播仍会经过完整队列", () => {
    const timely: StudyInfoSignal = {
      ...routineSignal("schedule"),
      source: "nextSchedule",
      priority: "timely",
    };
    const progressSignal = routineSignal("progress");
    const customSignal = routineSignal("custom");
    const { result, rerender } = renderHook(
      ({ signals }) => useStudyInfoCarousel({ signals, autoRotate: false }),
      { initialProps: { signals: [progressSignal, customSignal] } }
    );

    expect(result.current.currentSignal?.id).toBe("progress");

    rerender({ signals: [timely, progressSignal, customSignal] });
    expect(result.current.currentSignal?.id).toBe("progress");

    act(() => result.current.next());
    expect(result.current.currentSignal?.id).toBe("schedule");
    act(() => result.current.next());
    expect(result.current.currentSignal?.id).toBe("progress");
  });

  it("多个 critical 会在关键队列内轮换，不会露出 routine", () => {
    vi.useFakeTimers();
    const first: StudyInfoSignal = {
      ...routineSignal("first-critical"),
      priority: "critical",
      displayMode: "interrupt",
      eventAt: 1,
    };
    const second: StudyInfoSignal = {
      ...routineSignal("second-critical"),
      priority: "critical",
      displayMode: "interrupt",
      eventAt: 2,
    };
    const { result } = renderHook(() =>
      useStudyInfoCarousel({
        signals: [first, second, routineSignal("progress")],
        autoRotate: true,
        intervalSec: 3,
      })
    );

    expect(result.current.currentSignal?.id).toBe("first-critical");
    act(() => vi.advanceTimersByTime(3000));
    expect(result.current.currentSignal?.id).toBe("second-critical");
    expect(result.current.currentSignal?.priority).toBe("critical");
  });

  it("暂停和页面隐藏时停止计时，恢复后继续轮播", () => {
    vi.useFakeTimers();
    let hidden = false;
    vi.spyOn(document, "hidden", "get").mockImplementation(() => hidden);
    const signals = [routineSignal("progress"), routineSignal("custom")];
    const { result } = renderHook(() =>
      useStudyInfoCarousel({ signals, autoRotate: true, intervalSec: 3 })
    );

    act(() => result.current.setPaused(true));
    act(() => vi.advanceTimersByTime(3000));
    expect(result.current.currentSignal?.id).toBe("progress");

    act(() => result.current.setPaused(false));
    hidden = true;
    act(() => document.dispatchEvent(new Event("visibilitychange")));
    act(() => vi.advanceTimersByTime(3000));
    expect(result.current.currentSignal?.id).toBe("progress");

    hidden = false;
    act(() => document.dispatchEvent(new Event("visibilitychange")));
    act(() => vi.advanceTimersByTime(3000));
    expect(result.current.currentSignal?.id).toBe("custom");
  });

  it("减少动态效果时关闭自动轮播，但保留手动切换", () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      "matchMedia",
      vi.fn(() => ({
        matches: true,
        media: "(prefers-reduced-motion: reduce)",
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }))
    );
    const signals = [routineSignal("progress"), routineSignal("custom")];
    const { result } = renderHook(() =>
      useStudyInfoCarousel({ signals, autoRotate: true, intervalSec: 3 })
    );

    act(() => vi.advanceTimersByTime(3000));
    expect(result.current.currentSignal?.id).toBe("progress");
    act(() => result.current.next());
    expect(result.current.currentSignal?.id).toBe("custom");
  });

  it("空队列返回 null，并能在条目恢复后重新选择", () => {
    const { result, rerender } = renderHook(
      ({ signals }) => useStudyInfoCarousel({ signals, autoRotate: false }),
      { initialProps: { signals: [] as StudyInfoSignal[] } }
    );
    expect(result.current.currentSignal).toBeNull();
    act(() => result.current.next());

    rerender({ signals: [routineSignal("progress")] });
    expect(result.current.currentSignal?.id).toBe("progress");
    rerender({ signals: [] });
    expect(result.current.currentSignal).toBeNull();
  });
});

describe("StudyStatus 信息展示", () => {
  it("进度语义与可交互消息互不嵌套，并支持点击和键盘切换", () => {
    const onNext = vi.fn();
    render(
      <StudyStatusPresentation
        progress={50}
        progressText="50%"
        statusText="今日进度"
        hasProgress
        infoCanAdvance
        infoSignal={routineSignal("custom")}
        infoSignalManaged
        onInfoNext={onNext}
        rootAttributes={{
          role: "progressbar",
          "aria-label": "今日进度",
          "aria-valuemin": 0,
          "aria-valuemax": 100,
          "aria-valuenow": 50,
        }}
      />
    );

    const progressbar = screen.getByRole("progressbar", { name: "今日进度" });
    const button = screen.getByRole("button", { name: "custom" });
    const liveRegion = screen.getByRole("status");
    expect(progressbar).not.toContainElement(button);
    expect(progressbar).not.toContainElement(liveRegion);

    fireEvent.click(button);
    fireEvent.keyDown(button, { key: "Enter" });
    fireEvent.keyDown(button, { key: " " });
    expect(onNext).toHaveBeenCalledTimes(3);
  });

  it("单条有效信息不暴露无效果按钮，多条时才允许切换", () => {
    const onNext = vi.fn();
    const { rerender } = render(
      <StudyStatusPresentation
        progress={50}
        progressText="50%"
        statusText="今日进度"
        infoCanAdvance={false}
        infoSignal={routineSignal("progress")}
        infoSignalManaged
        onInfoNext={onNext}
      />
    );

    expect(screen.queryByRole("button", { name: "progress" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByTitle("progress"));
    expect(onNext).not.toHaveBeenCalled();

    rerender(
      <StudyStatusPresentation
        progress={50}
        progressText="50%"
        statusText="今日进度"
        infoCanAdvance
        infoSignal={routineSignal("progress")}
        infoSignalManaged
        onInfoNext={onNext}
      />
    );
    expect(screen.getByRole("button", { name: "progress" })).toBeInTheDocument();
  });

  it("同一 dedupeKey 的倒计时更新不会重复播报", () => {
    const first = { ...routineSignal("progress"), ariaText: "还剩 30 分钟" };
    const { rerender } = render(
      <StudyStatusPresentation
        progress={50}
        progressText="50%"
        statusText="今日进度"
        infoSignal={first}
        infoSignalManaged
      />
    );
    expect(screen.getByRole("status")).toHaveTextContent("还剩 30 分钟");

    rerender(
      <StudyStatusPresentation
        progress={50}
        progressText="50%"
        statusText="今日进度"
        infoSignal={{ ...first, ariaText: "还剩 29 分钟" }}
        infoSignalManaged
      />
    );
    expect(screen.getByRole("status")).toHaveTextContent("还剩 30 分钟");

    rerender(
      <StudyStatusPresentation
        progress={50}
        progressText="50%"
        statusText="今日进度"
        infoSignal={{ ...first, dedupeKey: "progress:next-stage", ariaText: "准备收尾" }}
        infoSignalManaged
      />
    );
    expect(screen.getByRole("status")).toHaveTextContent("准备收尾");
  });

  it("仅在消息或优先级变化时重建动画内容，倒计时更新保持当前节点", () => {
    const first = { ...routineSignal("progress"), secondaryText: "还剩 30 分钟" };
    const { container, rerender } = render(
      <StudyStatusPresentation
        progress={50}
        progressText="50%"
        statusText="今日进度"
        infoSignal={first}
        infoSignalManaged
      />
    );
    const firstContent = container.querySelector('[class*="infoContent"]');
    expect(firstContent).not.toBeNull();

    rerender(
      <StudyStatusPresentation
        progress={50}
        progressText="50%"
        statusText="今日进度"
        infoSignal={{ ...first, secondaryText: "还剩 29 分钟" }}
        infoSignalManaged
      />
    );
    expect(container.querySelector('[class*="infoContent"]')).toBe(firstContent);

    rerender(
      <StudyStatusPresentation
        progress={50}
        progressText="50%"
        statusText="今日进度"
        infoSignal={{ ...first, priority: "timely" }}
        infoSignalManaged
      />
    );
    const timelyContent = container.querySelector('[class*="infoContent"]');
    expect(timelyContent).not.toBe(firstContent);

    rerender(
      <StudyStatusPresentation
        progress={50}
        progressText="50%"
        statusText="今日进度"
        infoSignal={routineSignal("custom")}
        infoSignalManaged
      />
    );
    expect(container.querySelector('[class*="infoContent"]')).not.toBe(timelyContent);
  });

  it("悬停和聚焦分别维持暂停，两个状态都结束后才恢复", () => {
    const onPauseChange = vi.fn();
    render(
      <StudyStatusPresentation
        progress={50}
        progressText="50%"
        statusText="今日进度"
        infoCanAdvance
        infoSignal={routineSignal("custom")}
        infoSignalManaged
        onInfoNext={() => undefined}
        onInfoPauseChange={onPauseChange}
      />
    );
    const button = screen.getByRole("button", { name: "custom" });

    fireEvent.mouseEnter(button);
    fireEvent.focus(button);
    fireEvent.mouseLeave(button);
    fireEvent.blur(button);

    expect(onPauseChange.mock.calls.map(([paused]) => paused)).toEqual([true, true, true, false]);
  });
});
