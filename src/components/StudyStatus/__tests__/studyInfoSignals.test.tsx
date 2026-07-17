import { act, fireEvent, render, renderHook, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type {
  StudyInfoCarouselSettings,
  StudyInfoItemConfig,
  StudyProgressKind,
} from "../../../types";
import type { MinutelyRainStats } from "../../../utils/minutelyPrecipLogic";
import {
  MAX_STUDY_INFO_ITEMS,
  resolveStudyInfoSignals,
  resolveStudyInfoStandbySignal,
  type StudyInfoProgressSnapshot,
  type StudyInfoSignal,
} from "../studyInfoSignals";
import { StudyStatusPresentation } from "../StudyStatusPresentation";
import { useStudyInfoCarousel } from "../useStudyInfoCarousel";

const now = new Date(2026, 6, 14, 10, 0, 0);
const dayProgress: StudyInfoProgressSnapshot = {
  stageText: "上午好",
  stageAriaText: "上午好",
  remainingTimeText: "还剩 14 小时",
  statusText: "今日进度",
  hasProgress: true,
};
const scheduleProgress: StudyInfoProgressSnapshot = {
  stageText: "保持专注",
  stageAriaText: "保持专注",
  remainingTimeText: "还剩 30 分钟",
  statusText: "第1节自习",
  hasProgress: true,
};
const progress: Record<StudyProgressKind, StudyInfoProgressSnapshot> = {
  day: dayProgress,
  schedule: scheduleProgress,
};

function settings(items: StudyInfoItemConfig[], intervalSec = 6): StudyInfoCarouselSettings {
  return { intervalSec, items };
}

function progressItem(
  progressKind: StudyProgressKind,
  order: number,
  enabled = true
): StudyInfoItemConfig {
  return {
    id: `progress-${progressKind}`,
    source: "progress",
    progressKind,
    enabled,
    order,
  };
}

function nextScheduleItem(
  leadMinutes: "always" | 120 | 60 | 30 | 15 = "always",
  backgroundProgressKind: StudyProgressKind = "day",
  order = 0
): StudyInfoItemConfig {
  return {
    id: "next-schedule",
    source: "nextSchedule",
    backgroundProgressKind,
    leadMinutes,
    enabled: true,
    order,
  };
}

function rainItem(
  leadMinutes: 120 | 60 | 30 | 15 | 10 = 30,
  backgroundProgressKind: StudyProgressKind = "day",
  order = 0
): StudyInfoItemConfig {
  return {
    id: "rain",
    source: "rain",
    backgroundProgressKind,
    leadMinutes,
    enabled: true,
    order,
  };
}

function weatherAlertItem(
  backgroundProgressKind: StudyProgressKind = "day",
  order = 0
): StudyInfoItemConfig {
  return {
    id: "weather-alert",
    source: "weatherAlert",
    backgroundProgressKind,
    enabled: true,
    order,
  };
}

function customItem(id: string, text: string, order: number): StudyInfoItemConfig {
  return {
    id,
    source: "custom",
    backgroundProgressKind: "day",
    text,
    enabled: true,
    order,
  };
}

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
    hasReliableTimestamps: true,
    ...overrides,
  };
}

function routineSignal(itemId: string, progressKind: StudyProgressKind = "day"): StudyInfoSignal {
  return {
    itemId,
    frameId: itemId,
    source: itemId === "progress" ? "progress" : "custom",
    progressKind,
    priority: "routine",
    displayMode: "rotating",
    primaryText: itemId,
    ariaText: itemId,
    dedupeKey: itemId,
  };
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("StudyStatus 中央信号", () => {
  it("同时生成两种进度帧，课时空态也不会被过滤", () => {
    const emptyScheduleProgress = {
      ...scheduleProgress,
      stageText: "",
      stageAriaText: "",
      remainingTimeText: undefined,
      statusText: "未在自习时间",
      hasProgress: false,
    };
    const signals = resolveStudyInfoSignals({
      now,
      progress: { day: dayProgress, schedule: emptyScheduleProgress },
      settings: settings([progressItem("day", 0), progressItem("schedule", 1)]),
    });

    expect(signals.map((signal) => [signal.itemId, signal.progressKind])).toEqual([
      ["progress-day", "day"],
      ["progress-schedule", "schedule"],
    ]);
    expect(signals[1]).toMatchObject({ primaryText: "", ariaText: "未在自习时间" });
  });

  it("按条目提前窗口过滤下一课时，并保留 15/5 分钟智能优先级", () => {
    const outsideWindow = resolveStudyInfoSignals({
      now,
      progress,
      schedule: scheduleAt("10:16"),
      settings: settings([nextScheduleItem(15, "schedule")]),
    });
    const routine = resolveStudyInfoSignals({
      now,
      progress,
      schedule: scheduleAt("10:16"),
      settings: settings([nextScheduleItem("always", "schedule")]),
    })[0];
    const timely = resolveStudyInfoSignals({
      now,
      progress,
      schedule: scheduleAt("10:15"),
      settings: settings([nextScheduleItem(15, "schedule")]),
    })[0];
    const critical = resolveStudyInfoSignals({
      now,
      progress,
      schedule: scheduleAt("10:05"),
      settings: settings([nextScheduleItem(15, "schedule")]),
    })[0];

    expect(outsideWindow).toEqual([]);
    expect(routine).toMatchObject({ priority: "routine", progressKind: "schedule" });
    expect(timely.priority).toBe("timely");
    expect(critical).toMatchObject({ priority: "critical", displayMode: "interrupt" });
  });

  it("按条目提前窗口过滤降雨，事件阶段只改变 dedupeKey", () => {
    const rainStartAt = now.getTime() + 31 * 60 * 1000;
    const rainingAt = rainStartAt;
    const outsideWindow = resolveStudyInfoSignals({
      now,
      progress,
      settings: settings([rainItem(30, "schedule")]),
      weather: { stats: rainStats({ leadMinutes: 31 }), freshness: "fresh" },
    });
    const outsideTwoHourWindow = resolveStudyInfoSignals({
      now,
      progress,
      settings: settings([rainItem(120, "schedule")]),
      weather: { stats: rainStats({ leadMinutes: 121 }), freshness: "fresh" },
    });
    const atTwoHourBoundary = resolveStudyInfoSignals({
      now,
      progress,
      settings: settings([rainItem(120, "schedule")]),
      weather: { stats: rainStats({ leadMinutes: 120 }), freshness: "fresh" },
    })[0];
    const beforeRain = resolveStudyInfoSignals({
      now,
      progress,
      settings: settings([rainItem(60, "schedule")]),
      weather: { stats: rainStats({ leadMinutes: 31 }), freshness: "fresh" },
    })[0];
    const whileRaining = resolveStudyInfoSignals({
      now: now.getTime() + 31 * 60 * 1000,
      progress,
      settings: settings([rainItem(60, "schedule")]),
      weather: {
        stats: rainStats({
          leadMinutes: 31,
          isRainingNow: true,
          remainingMinutes: 8,
          rainStartAt,
          rainEndAt: rainingAt + 8 * 60 * 1000,
        }),
        freshness: "fresh",
      },
    })[0];

    expect(outsideWindow).toEqual([]);
    expect(outsideTwoHourWindow).toEqual([]);
    expect(atTwoHourBoundary).toMatchObject({ itemId: "rain", priority: "timely" });
    expect(beforeRain).toMatchObject({
      itemId: "rain",
      progressKind: "schedule",
      priority: "timely",
    });
    expect(whileRaining).toMatchObject({ itemId: "rain", priority: "critical" });
    expect(whileRaining.dedupeKey).not.toBe(beforeRain.dedupeKey);
  });

  it("预雨快照跨过开始时间后立即显示正在下雨", () => {
    const rainStartAt = now.getTime();
    const rainEndAt = rainStartAt + 10 * 60 * 1000;
    const signal = resolveStudyInfoSignals({
      now: rainStartAt + 1000,
      progress,
      settings: settings([rainItem(30)]),
      weather: {
        phase: "PRE_RAIN",
        freshness: "fresh",
        stats: rainStats({
          isRainingNow: false,
          rainStartAt,
          nextRainStartAt: rainStartAt,
          rainEndAt,
        }),
      },
    })[0];

    expect(signal).toMatchObject({
      primaryText: "正在小雨",
      secondaryText: "预计还剩 10 分钟",
      priority: "critical",
    });
    expect(signal.primaryText).not.toContain("0 分钟");
  });

  it("一个天气预警配置展开为多条普通轮播帧并保持组内顺序", () => {
    const signals = resolveStudyInfoSignals({
      now,
      progress,
      settings: settings([
        customItem("before", "前一条", 0),
        weatherAlertItem("schedule", 1),
        customItem("after", "后一条", 2),
      ]),
      weatherAlerts: {
        alerts: [
          {
            expiresAt: now.getTime() + 2 * 60 * 60 * 1000,
            publishedAt: now.getTime() - 5 * 60 * 1000,
            signature: "orange",
            summary: "至13:00降雨≥50毫米",
            title: "暴雨橙色预警",
          },
          {
            expiresAt: now.getTime() + 2 * 60 * 60 * 1000,
            publishedAt: now.getTime() - 10 * 60 * 1000,
            signature: "yellow",
            summary: "雷电活动，注意防范",
            title: "大风黄色预警",
          },
        ],
      },
    });

    expect(signals.map((signal) => signal.frameId)).toEqual([
      "before",
      "weather-alert:orange",
      "weather-alert:yellow",
      "after",
    ]);
    expect(signals.slice(1, 3)).toEqual([
      expect.objectContaining({
        itemId: "weather-alert",
        priority: "routine",
        displayMode: "rotating",
        progressKind: "schedule",
        primaryText: "暴雨橙色预警",
        secondaryText: "至13:00降雨≥50毫米",
      }),
      expect.objectContaining({
        itemId: "weather-alert",
        priority: "routine",
        displayMode: "rotating",
        primaryText: "大风黄色预警",
      }),
    ]);
  });

  it("动态天气预警帧不占用持久化配置上限且过期帧会被过滤", () => {
    const alerts = Array.from({ length: MAX_STUDY_INFO_ITEMS + 3 }, (_, index) => ({
      expiresAt: now.getTime() + (index === 0 ? -1 : 60 * 60 * 1000),
      publishedAt: now.getTime() - index * 60 * 1000,
      signature: `alert-${index}`,
      summary: "注意防范",
      title: `预警 ${index}`,
    }));
    const signals = resolveStudyInfoSignals({
      now,
      progress,
      settings: settings([weatherAlertItem()]),
      weatherAlerts: { alerts },
    });

    expect(signals).toHaveLength(MAX_STUDY_INFO_ITEMS + 2);
    expect(signals.some((signal) => signal.frameId === "weather-alert:alert-0")).toBe(false);
  });

  it("普通信息保持用户顺序，timely 不会在解析阶段越过前项", () => {
    const signals = resolveStudyInfoSignals({
      now,
      progress,
      schedule: scheduleAt("10:15"),
      settings: settings([
        customItem("first", "第一条", 0),
        nextScheduleItem(15, "day", 1),
        progressItem("day", 2),
      ]),
    });

    expect(signals.map((signal) => signal.itemId)).toEqual([
      "first",
      "next-schedule",
      "progress-day",
    ]);
  });

  it("多个 critical 按事件时间和配置顺序稳定排列", () => {
    const signals = resolveStudyInfoSignals({
      now,
      progress,
      schedule: scheduleAt("10:05"),
      settings: settings([nextScheduleItem(15, "day", 0), rainItem(30, "day", 1)]),
      weather: { stats: rainStats({ leadMinutes: 4 }), freshness: "fresh" },
    });

    expect(
      signals.filter((signal) => signal.priority === "critical").map((signal) => signal.source)
    ).toEqual(["rain", "nextSchedule"]);
  });

  it("过滤过期天气和过量信息，严格保留前 20 条", () => {
    const items = Array.from({ length: 30 }, (_, index) =>
      customItem(`custom-${index}`, `消息 ${index}`, index)
    );
    const signals = resolveStudyInfoSignals({
      now,
      progress,
      settings: settings(items),
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

    expect(signals).toHaveLength(MAX_STUDY_INFO_ITEMS);
    expect(signals[signals.length - 1]?.itemId).toBe("custom-19");
  });

  it("无有效条件提示时提供首项背景的待机信号，空列表则返回 null", () => {
    const configured = settings([nextScheduleItem(15, "schedule")]);
    expect(resolveStudyInfoSignals({ now, progress, settings: configured })).toEqual([]);
    expect(resolveStudyInfoStandbySignal(configured)).toMatchObject({
      itemId: "next-schedule",
      progressKind: "schedule",
      primaryText: "",
    });
    expect(resolveStudyInfoStandbySignal(settings([]))).toBeNull();
  });
});

describe("StudyStatus 信息调度器", () => {
  it("critical 到来时打断，消失后恢复此前普通消息", () => {
    const progressSignal = routineSignal("progress");
    const customSignal = routineSignal("custom");
    const rainSignal: StudyInfoSignal = {
      ...routineSignal("rain", "schedule"),
      source: "rain",
      priority: "critical",
      displayMode: "interrupt",
    };
    const { result, rerender } = renderHook(({ signals }) => useStudyInfoCarousel({ signals }), {
      initialProps: { signals: [progressSignal, customSignal] },
    });

    act(() => result.current.next());
    expect(result.current.currentSignal?.itemId).toBe("custom");

    rerender({ signals: [rainSignal, progressSignal, customSignal] });
    expect(result.current.currentSignal).toMatchObject({
      itemId: "rain",
      progressKind: "schedule",
    });

    rerender({ signals: [progressSignal, customSignal] });
    expect(result.current.currentSignal?.itemId).toBe("custom");
  });

  it("有效队列超过一条时按设置间隔自动切换", () => {
    vi.useFakeTimers();
    const signals = [routineSignal("progress"), routineSignal("custom")];
    const { result } = renderHook(() => useStudyInfoCarousel({ signals, intervalSec: 3 }));

    expect(result.current.currentSignal?.itemId).toBe("progress");
    act(() => vi.advanceTimersByTime(3000));
    expect(result.current.currentSignal?.itemId).toBe("custom");
  });

  it("单个 critical 打断后继续与普通信息轮播", () => {
    vi.useFakeTimers();
    const progressSignal = routineSignal("progress");
    const rainSignal: StudyInfoSignal = {
      ...routineSignal("rain", "schedule"),
      source: "rain",
      priority: "critical",
      displayMode: "interrupt",
      dedupeKey: "rain:active",
    };
    const { result, rerender } = renderHook(
      ({ signals }) => useStudyInfoCarousel({ signals, intervalSec: 3 }),
      { initialProps: { signals: [progressSignal] } }
    );

    rerender({ signals: [rainSignal, progressSignal] });
    expect(result.current.currentSignal?.itemId).toBe("rain");
    expect(result.current.canAdvance).toBe(true);

    act(() => vi.advanceTimersByTime(3000));
    expect(result.current.currentSignal?.itemId).toBe("progress");
  });

  it("每秒更新内容和事件键时不会重置轮播位置或计时器", () => {
    vi.useFakeTimers();
    const { result, rerender } = renderHook(
      ({ tick }) =>
        useStudyInfoCarousel({
          signals: [routineSignal("progress"), routineSignal("custom")].map((signal) => ({
            ...signal,
            secondaryText: String(tick),
            dedupeKey: `${signal.itemId}:${tick}`,
          })),
          intervalSec: 3,
        }),
      { initialProps: { tick: 0 } }
    );

    for (let tick = 1; tick <= 3; tick += 1) {
      rerender({ tick });
      act(() => vi.advanceTimersByTime(1000));
    }

    expect(result.current.currentSignal?.itemId).toBe("custom");
  });

  it("timely 到来不会立即打断，但会成为下一条", () => {
    const timely: StudyInfoSignal = {
      ...routineSignal("schedule"),
      source: "nextSchedule",
      priority: "timely",
    };
    const progressSignal = routineSignal("progress");
    const customSignal = routineSignal("custom");
    const { result, rerender } = renderHook(({ signals }) => useStudyInfoCarousel({ signals }), {
      initialProps: { signals: [progressSignal, customSignal] },
    });

    rerender({ signals: [progressSignal, timely, customSignal] });
    expect(result.current.currentSignal?.itemId).toBe("progress");
    act(() => result.current.next());
    expect(result.current.currentSignal?.itemId).toBe("schedule");
    act(() => result.current.next());
    expect(result.current.currentSignal?.itemId).toBe("custom");
  });

  it("新增天气预警帧不会打断当前内容并会逐条参与轮播", () => {
    const progressSignal = routineSignal("progress");
    const firstAlert: StudyInfoSignal = {
      ...routineSignal("weather-alert"),
      frameId: "weather-alert:first",
      source: "weatherAlert",
      primaryText: "暴雨橙色预警",
    };
    const secondAlert: StudyInfoSignal = {
      ...routineSignal("weather-alert"),
      frameId: "weather-alert:second",
      source: "weatherAlert",
      primaryText: "大风黄色预警",
    };
    const { result, rerender } = renderHook(({ signals }) => useStudyInfoCarousel({ signals }), {
      initialProps: { signals: [progressSignal] },
    });

    rerender({ signals: [progressSignal, firstAlert, secondAlert] });
    expect(result.current.currentSignal?.frameId).toBe("progress");
    act(() => result.current.next());
    expect(result.current.currentSignal?.frameId).toBe("weather-alert:first");
    act(() => result.current.next());
    expect(result.current.currentSignal?.frameId).toBe("weather-alert:second");
  });

  it("多个 critical 优先展示后继续轮播普通信息", () => {
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
        intervalSec: 3,
      })
    );

    expect(result.current.currentSignal?.itemId).toBe("first-critical");
    act(() => vi.advanceTimersByTime(3000));
    expect(result.current.currentSignal?.itemId).toBe("second-critical");
    expect(result.current.currentSignal?.priority).toBe("critical");
    act(() => vi.advanceTimersByTime(3000));
    expect(result.current.currentSignal?.itemId).toBe("progress");
  });

  it("暂停和页面隐藏时停止计时，恢复后继续轮播", () => {
    vi.useFakeTimers();
    let hidden = false;
    vi.spyOn(document, "hidden", "get").mockImplementation(() => hidden);
    const signals = [routineSignal("progress"), routineSignal("custom")];
    const { result } = renderHook(() => useStudyInfoCarousel({ signals, intervalSec: 3 }));

    act(() => result.current.setPaused(true));
    act(() => vi.advanceTimersByTime(3000));
    expect(result.current.currentSignal?.itemId).toBe("progress");

    act(() => result.current.setPaused(false));
    hidden = true;
    act(() => document.dispatchEvent(new Event("visibilitychange")));
    act(() => vi.advanceTimersByTime(3000));
    expect(result.current.currentSignal?.itemId).toBe("progress");

    hidden = false;
    act(() => document.dispatchEvent(new Event("visibilitychange")));
    act(() => vi.advanceTimersByTime(3000));
    expect(result.current.currentSignal?.itemId).toBe("custom");
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
    const { result } = renderHook(() => useStudyInfoCarousel({ signals, intervalSec: 3 }));

    act(() => vi.advanceTimersByTime(3000));
    expect(result.current.currentSignal?.itemId).toBe("progress");
    act(() => result.current.next());
    expect(result.current.currentSignal?.itemId).toBe("custom");
  });

  it("空队列返回 null，并能在条目恢复后重新选择", () => {
    const { result, rerender } = renderHook(({ signals }) => useStudyInfoCarousel({ signals }), {
      initialProps: { signals: [] as StudyInfoSignal[] },
    });
    expect(result.current.currentSignal).toBeNull();
    act(() => result.current.next());

    rerender({ signals: [routineSignal("progress")] });
    expect(result.current.currentSignal?.itemId).toBe("progress");
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
