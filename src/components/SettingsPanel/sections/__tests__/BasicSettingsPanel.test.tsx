import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { StudyInfoCarouselSettings } from "../../../../types";
import {
  APP_SETTINGS_KEY,
  consumeStudyInfoLimitAdjustedNotice,
  migrateStoredAppSettings,
} from "../../../../utils/appSettings";
import { BasicSettingsPanel } from "../BasicSettingsPanel";

const dispatch = vi.hoisted(() => vi.fn());
const infoCarousel = vi.hoisted<StudyInfoCarouselSettings>(() => ({
  autoRotate: true,
  intervalSec: 6,
  items: [
    { id: "progress-default", source: "progress", enabled: true, order: 0 },
    { id: "next-schedule-default", source: "nextSchedule", enabled: true, order: 1 },
    { id: "rain-default", source: "rain", enabled: true, order: 2 },
  ],
}));
const studyState = vi.hoisted(() => ({
  targetYear: 2027,
  countdownType: "gaokao" as const,
  countdownItems: [],
  infoCarousel,
  display: {
    showStatusBar: true,
    timeProgressMode: "day" as const,
    showWeather: true,
    showNoiseMonitor: true,
    showCountdown: true,
    showQuote: true,
    showTime: true,
    showDate: true,
  },
}));

vi.mock("../../../../contexts/AppContext", () => ({
  useAppDispatch: () => dispatch,
  useAppState: () => ({ study: studyState }),
}));

vi.mock("../../../ScheduleSettings/ScheduleSettings", () => ({
  ScheduleEditor: () => <div data-testid="schedule-editor" />,
}));

vi.mock("../CountdownManagerPanel", () => ({
  CountdownManagerPanel: () => <div data-testid="countdown-manager" />,
}));

describe("BasicSettingsPanel 中央信息设置", () => {
  let registeredSave: (() => void) | undefined;

  beforeEach(() => {
    localStorage.clear();
    consumeStudyInfoLimitAdjustedNotice();
    dispatch.mockReset();
    registeredSave = undefined;
    infoCarousel.autoRotate = true;
    infoCarousel.intervalSec = 6;
    infoCarousel.items = [
      { id: "progress-default", source: "progress", enabled: true, order: 0 },
      { id: "next-schedule-default", source: "nextSchedule", enabled: true, order: 1 },
      { id: "rain-default", source: "rain", enabled: true, order: 2 },
    ];
  });

  function renderPanel() {
    return render(
      <BasicSettingsPanel
        section="display"
        targetYear={2027}
        onTargetYearChange={vi.fn()}
        onRegisterSave={(save) => {
          registeredSave = save;
        }}
      />
    );
  }

  it("编辑来源和自定义消息后只在统一保存时派发", async () => {
    const user = userEvent.setup();
    renderPanel();

    expect(screen.getByText("中央信息")).toBeInTheDocument();
    await user.click(screen.getByRole("switch", { name: "启用短时降雨" }));
    await user.click(screen.getByRole("button", { name: "添加消息" }));
    await user.type(screen.getByPlaceholderText("例如：记得完成今日复盘"), "完成今日复盘");

    expect(dispatch).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: "SET_INFO_CAROUSEL" })
    );

    act(() => registeredSave?.());

    expect(dispatch).toHaveBeenCalledWith({
      type: "SET_INFO_CAROUSEL",
      payload: expect.objectContaining({
        autoRotate: true,
        intervalSec: 6,
        items: expect.arrayContaining([
          expect.objectContaining({ source: "rain", enabled: false }),
          expect.objectContaining({ source: "custom", text: "完成今日复盘" }),
        ]),
      }),
    });
  });

  it("达到 20 条有效配置时禁用添加，关闭内置来源后释放名额", async () => {
    const user = userEvent.setup();
    infoCarousel.items = [
      { id: "progress-default", source: "progress", enabled: true, order: 0 },
      { id: "next-schedule-default", source: "nextSchedule", enabled: true, order: 1 },
      { id: "rain-default", source: "rain", enabled: true, order: 2 },
      ...Array.from({ length: 17 }, (_, index) => ({
        id: `custom-${index}`,
        source: "custom" as const,
        enabled: true,
        order: index + 3,
        text: `消息 ${index + 1}`,
      })),
    ];

    renderPanel();

    const addButton = screen.getByRole("button", { name: "添加消息" });
    expect(addButton).toBeDisabled();
    expect(screen.getByText("20 / 20 条启用")).toBeInTheDocument();

    await user.click(screen.getByRole("switch", { name: "启用短时降雨" }));
    expect(addButton).toBeEnabled();
    expect(screen.getByText("19 / 20 条启用")).toBeInTheDocument();

    await user.click(addButton);
    const messageInputs = screen.getAllByPlaceholderText("例如：记得完成今日复盘");
    await user.type(messageInputs[messageInputs.length - 1], "新增消息");
    expect(addButton).toBeDisabled();
    expect(screen.getByText("20 / 20 条启用")).toBeInTheDocument();
  });

  it("支持编辑、启停、排序、删除及独立轮播设置，并在保存时一次提交", async () => {
    const user = userEvent.setup();
    infoCarousel.items = [
      { id: "progress-default", source: "progress", enabled: true, order: 0 },
      { id: "next-schedule-default", source: "nextSchedule", enabled: true, order: 1 },
      { id: "rain-default", source: "rain", enabled: true, order: 2 },
      { id: "custom-a", source: "custom", enabled: true, order: 3, text: "消息 A" },
      { id: "custom-b", source: "custom", enabled: true, order: 4, text: "消息 B" },
      { id: "custom-c", source: "custom", enabled: true, order: 5, text: "消息 C" },
    ];
    renderPanel();

    const autoRotate = screen.getByRole("switch", { name: "中央信息自动轮播" });
    const interval = screen.getByRole("slider", { name: "信息轮播间隔" });
    await user.click(autoRotate);
    expect(interval).toBeDisabled();
    await user.click(autoRotate);
    fireEvent.change(interval, { target: { value: "12" } });

    const inputs = screen.getAllByLabelText("消息内容");
    await user.clear(inputs[1]);
    await user.type(inputs[1], "消息 B 已编辑");
    await user.click(screen.getByRole("switch", { name: "启用自定义消息 2" }));
    await user.click(screen.getByRole("button", { name: "上移自定义消息 3" }));
    expect(
      screen.getAllByLabelText("消息内容").map((input) => input.getAttribute("value"))
    ).toEqual(["消息 A", "消息 C", "消息 B 已编辑"]);
    await user.click(screen.getByRole("button", { name: "删除自定义消息 1" }));

    act(() => registeredSave?.());

    const saveAction = dispatch.mock.calls
      .map(([action]) => action)
      .find((action) => action.type === "SET_INFO_CAROUSEL");
    expect(saveAction?.payload).toMatchObject({ autoRotate: true, intervalSec: 12 });
    expect(
      saveAction?.payload.items
        .filter((item: { source: string }) => item.source === "custom")
        .map((item: { enabled: boolean; order: number; text?: string }) => ({
          enabled: item.enabled,
          order: item.order,
          text: item.text,
        }))
    ).toEqual([
      { enabled: true, order: 3, text: "消息 C" },
      { enabled: false, order: 4, text: "消息 B 已编辑" },
    ]);
  });

  it("超额旧配置迁移提示只在首次打开时显示", () => {
    localStorage.setItem(
      APP_SETTINGS_KEY,
      JSON.stringify({
        version: 3,
        study: {
          infoCarousel: {
            autoRotate: true,
            intervalSec: 6,
            items: Array.from({ length: 21 }, (_, index) => ({
              id: `legacy-${index}`,
              source: "custom",
              enabled: true,
              order: index,
              text: `旧消息 ${index}`,
            })),
          },
        },
      })
    );
    migrateStoredAppSettings();

    const first = renderPanel();
    expect(screen.getByText("已调整轮播上限")).toBeInTheDocument();
    first.unmount();

    renderPanel();
    expect(screen.queryByText("已调整轮播上限")).not.toBeInTheDocument();
  });
});
