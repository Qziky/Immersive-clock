import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { StudyInfoCarouselSettings, StudyInfoItemConfig } from "../../../../types";
import {
  APP_SETTINGS_KEY,
  consumeStudyInfoLimitAdjustedNotice,
  migrateStoredAppSettings,
} from "../../../../utils/appSettings";
import { BasicSettingsPanel } from "../BasicSettingsPanel";

const dispatch = vi.hoisted(() => vi.fn());
const infoCarousel = vi.hoisted<StudyInfoCarouselSettings>(() => ({
  intervalSec: 6,
  items: [],
}));
const studyState = vi.hoisted(() => ({
  targetYear: 2027,
  countdownType: "gaokao" as const,
  countdownItems: [],
  infoCarousel,
  display: {
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

function defaultInfoItems(): StudyInfoItemConfig[] {
  return [
    {
      id: "progress-day-default",
      source: "progress",
      progressKind: "day",
      enabled: true,
      order: 0,
    },
    {
      id: "progress-schedule-default",
      source: "progress",
      progressKind: "schedule",
      enabled: false,
      order: 1,
    },
    {
      id: "next-schedule-default",
      source: "nextSchedule",
      backgroundProgressKind: "day",
      leadMinutes: "always",
      enabled: false,
      order: 2,
    },
    {
      id: "rain-default",
      source: "rain",
      backgroundProgressKind: "day",
      leadMinutes: 30,
      enabled: false,
      order: 3,
    },
  ];
}

async function selectAddInformation(user: ReturnType<typeof userEvent.setup>, optionName: RegExp) {
  await user.click(screen.getByRole("button", { name: "添加信息" }));
  await user.click(screen.getByRole("option", { name: optionName }));
}

describe("BasicSettingsPanel 中央信息设置", () => {
  let registeredSave: (() => void) | undefined;

  beforeEach(() => {
    localStorage.clear();
    consumeStudyInfoLimitAdjustedNotice();
    dispatch.mockReset();
    registeredSave = undefined;
    infoCarousel.intervalSec = 6;
    infoCarousel.items = defaultInfoItems();
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

  function getSavedCarousel(): StudyInfoCarouselSettings {
    act(() => registeredSave?.());
    const saveAction = dispatch.mock.calls
      .map(([action]) => action)
      .find((action) => action.type === "SET_INFO_CAROUSEL");
    return saveAction?.payload as StudyInfoCarouselSettings;
  }

  it("只显示已选条目，移除旧进度设置和自动轮播开关", () => {
    renderPanel();

    expect(screen.getByText("顶部进度与信息")).toBeInTheDocument();
    const selectedList = screen.getByLabelText("已选中央信息");
    expect(within(selectedList).getByText("24 小时进度")).toBeInTheDocument();
    expect(within(selectedList).queryByText("课时/课间进度")).not.toBeInTheDocument();
    expect(screen.queryByRole("switch", { name: "计划进度" })).not.toBeInTheDocument();
    expect(screen.queryByText("进度模式")).not.toBeInTheDocument();
    expect(screen.queryByRole("switch", { name: "中央信息自动轮播" })).not.toBeInTheDocument();
    expect(screen.queryByRole("slider", { name: "信息轮播间隔" })).not.toBeInTheDocument();
    expect(screen.getByText("1 / 20 条启用")).toBeInTheDocument();
  });

  it("添加两类信息后自动提供间隔，并保存背景、提前量和跨类型顺序", async () => {
    const user = userEvent.setup();
    renderPanel();

    await selectAddInformation(user, /^课时\/课间进度/);
    expect(screen.getByRole("slider", { name: "信息轮播间隔" })).toBeEnabled();
    fireEvent.change(screen.getByRole("slider", { name: "信息轮播间隔" }), {
      target: { value: "12" },
    });

    await selectAddInformation(user, /^下一课时/);
    await user.click(screen.getByRole("button", { name: "配置下一课时" }));
    await user.selectOptions(screen.getByLabelText("背景进度"), "schedule");
    await user.selectOptions(screen.getByLabelText("显示时机"), "60");
    expect(screen.getByLabelText("拖动下一课时排序")).toHaveAttribute("draggable", "true");
    await user.click(screen.getByRole("button", { name: "上移下一课时" }));
    expect(screen.getByRole("status")).toHaveTextContent("已将下一课时移至第 2 项");

    expect(dispatch).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: "SET_INFO_CAROUSEL" })
    );

    const saved = getSavedCarousel();
    expect(saved).toMatchObject({ intervalSec: 12 });
    expect(saved).not.toHaveProperty("autoRotate");
    expect(
      saved.items
        .filter((item) => item.enabled)
        .sort((left, right) => left.order - right.order)
        .map((item) =>
          item.source === "progress" ? `${item.source}:${item.progressKind}` : item.source
        )
    ).toEqual(["progress:day", "nextSchedule", "progress:schedule"]);
    expect(saved.items.find((item) => item.source === "nextSchedule")).toMatchObject({
      backgroundProgressKind: "schedule",
      leadMinutes: 60,
    });
  });

  it("移出和恢复自定义文案时保留配置，且支持永久删除", async () => {
    const user = userEvent.setup();
    renderPanel();

    await selectAddInformation(user, /^新建自定义文案/);
    await user.type(screen.getByLabelText("文案内容"), "完成今日复盘");
    await user.selectOptions(screen.getByLabelText("背景进度"), "schedule");
    await user.click(screen.getByRole("button", { name: "移出完成今日复盘" }));

    expect(screen.queryByText("完成今日复盘")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "添加信息" }));
    const restoreOption = screen.getByRole("option", {
      name: /^恢复：完成今日复盘/,
    });
    expect(restoreOption).toBeEnabled();

    await user.click(restoreOption);
    expect(screen.getByText("完成今日复盘")).toBeInTheDocument();
    expect(screen.getByLabelText("文案内容")).toHaveValue("完成今日复盘");
    expect(screen.getByLabelText("背景进度")).toHaveValue("schedule");

    const saved = getSavedCarousel();
    expect(saved.items.find((item) => item.source === "custom")).toMatchObject({
      enabled: true,
      backgroundProgressKind: "schedule",
      text: "完成今日复盘",
    });

    await user.click(screen.getByRole("button", { name: "永久删除" }));
    expect(screen.queryByText("完成今日复盘")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "添加信息" }));
    expect(screen.queryByRole("option", { name: /^恢复：完成今日复盘/ })).not.toBeInTheDocument();
  });

  it("达到 20 条后禁止继续添加，移出一项后释放名额", async () => {
    const user = userEvent.setup();
    infoCarousel.items = [
      ...Array.from({ length: 20 }, (_, index) => ({
        id: `custom-${index}`,
        source: "custom" as const,
        backgroundProgressKind: "day" as const,
        enabled: true,
        order: index,
        text: `消息 ${index + 1}`,
      })),
      ...defaultInfoItems().map((item, index) => ({ ...item, enabled: false, order: index + 20 })),
    ];

    renderPanel();

    expect(screen.getByText("20 / 20 条启用")).toBeInTheDocument();
    const addDropdown = screen.getByRole("button", { name: "添加信息" });
    await user.click(addDropdown);
    expect(screen.getByRole("option", { name: /^新建自定义文案/ })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "移出消息 1" }));
    expect(screen.getByText("19 / 20 条启用")).toBeInTheDocument();
    await user.click(addDropdown);
    expect(screen.getByRole("option", { name: /^新建自定义文案/ })).toBeEnabled();
  });

  it("清空列表后显示隐藏提示，并可恢复内置来源", async () => {
    const user = userEvent.setup();
    renderPanel();

    await user.click(screen.getByRole("button", { name: "移出24 小时进度" }));
    expect(screen.getByText("未选择信息，顶部进度与信息将隐藏。")).toBeInTheDocument();
    expect(screen.getByText("0 / 20 条启用")).toBeInTheDocument();

    await selectAddInformation(user, /^24 小时进度/);
    expect(screen.getByText("24 小时进度")).toBeInTheDocument();
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
