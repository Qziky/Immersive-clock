import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { APP_SETTINGS_KEY, getAppSettings, updateAppSettings } from "../../../utils/appSettings";
import { CountdownModal } from "../CountdownModal";

const context = vi.hoisted(() => ({
  dispatch: vi.fn(),
  countdown: { initialTime: 0, currentTime: 0, isActive: false },
}));

vi.mock("../../../contexts/AppContext", () => ({
  useAppDispatch: () => context.dispatch,
  useAppState: () => ({ isModalOpen: true, countdown: context.countdown }),
}));

const field = (name: string) => screen.getByRole("textbox", { name });
const button = (name: string) => screen.getByRole("button", { name });

function setDuration(hours: string, minutes: string, seconds: string) {
  for (const [name, value] of [
    ["小时", hours],
    ["分钟", minutes],
    ["秒", seconds],
  ]) {
    fireEvent.change(field(name), { target: { value } });
  }
}

describe("CountdownModal", () => {
  beforeEach(() => {
    localStorage.clear();
    context.dispatch.mockClear();
    context.countdown = { initialTime: 0, currentTime: 0, isActive: false };
  });

  it("从键盘聚焦时分秒数字可直接替换，步进仍然可用", async () => {
    const user = userEvent.setup();
    render(<CountdownModal />);
    const editor = screen.getByRole("region", { name: "时间设置" });
    const hours = within(editor).getByRole("textbox", { name: "小时" });

    expect(within(editor).queryByText("点击数字直接输入")).not.toBeInTheDocument();
    await user.tab();
    expect(hours).toHaveFocus();
    expect(hours).toHaveAttribute("inputmode", "numeric");
    await user.keyboard("2");
    await user.tab();
    expect(hours).toHaveValue("02");
    await user.click(within(editor).getByRole("button", { name: "增加小时" }));
    expect(hours).toHaveValue("03");
    expect(context.dispatch).not.toHaveBeenCalled();
  });

  it("保留三个固定预设和自定义项，旧配置不自动成为常用", async () => {
    const user = userEvent.setup();
    updateAppSettings({ countdown: { customQuickPresetSeconds: 5420 } });
    render(<CountdownModal />);
    for (const name of ["10分钟", "30分钟", "1小时", "自定义（1小时30分20秒）"]) {
      expect(screen.getByRole("radio", { name })).toBeInTheDocument();
    }
    expect(screen.getAllByRole("radio")).toHaveLength(4);
    expect(screen.queryByRole("list", { name: "常用时长列表" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("radio", { name: "自定义（1小时30分20秒）" }));
    expect(field("小时")).toHaveValue("01");
    expect(field("分钟")).toHaveValue("30");
    expect(field("秒")).toHaveValue("20");
    await user.click(button("增加分钟"));
    await user.click(button("减少秒"));
    await user.click(button("确认"));
    expect(getAppSettings().countdown.customQuickPresetSeconds).toBe(5479);
    expect(context.dispatch).toHaveBeenCalledWith({ type: "SET_COUNTDOWN", payload: 5479 });
  });

  it("保存 2小时30分 和 3小时；重开可复用，临时自定义和快捷应用互不覆盖", async () => {
    const user = userEvent.setup();
    const first = render(<CountdownModal />);
    setDuration("2", "30", "0");
    await user.click(button("加入常用"));
    expect(button("已加入常用")).toBeDisabled();
    setDuration("3", "0", "0");
    await user.click(button("加入常用"));
    setDuration("0", "45", "0");
    await user.click(button("确认"));
    expect(getAppSettings().countdown).toMatchObject({
      favoritePresetSeconds: [9000, 10800],
      customQuickPresetSeconds: 2700,
    });
    first.unmount();

    context.dispatch.mockClear();
    render(<CountdownModal />);
    const list = screen.getByRole("list", { name: "常用时长列表" });
    expect(within(list).getByRole("button", { name: "3小时" })).toBeInTheDocument();
    const beforeApply = localStorage.getItem(APP_SETTINGS_KEY);
    await user.click(within(list).getByRole("button", { name: "2小时30分" }));
    expect(context.dispatch.mock.calls).toEqual([
      [{ type: "SET_COUNTDOWN", payload: 9000 }],
      [{ type: "CLOSE_MODAL" }],
    ]);
    expect(localStorage.getItem(APP_SETTINGS_KEY)).toBe(beforeApply);
  });

  it("添加、删除和编辑均为草稿；取消还原，确认删除才写入", async () => {
    const user = userEvent.setup();
    updateAppSettings({
      countdown: { customQuickPresetSeconds: 300, favoritePresetSeconds: [9000, 10800] },
    });
    const original = localStorage.getItem(APP_SETTINGS_KEY);
    const first = render(<CountdownModal />);
    await user.click(button("移除常用时长：2小时30分"));
    await user.click(button("加入常用"));
    await user.click(button("3小时"));
    expect(field("小时")).toHaveValue("03");
    expect(context.dispatch).not.toHaveBeenCalled();
    await user.click(button("取消"));
    expect(context.dispatch.mock.calls).toEqual([[{ type: "CLOSE_MODAL" }]]);
    expect(localStorage.getItem(APP_SETTINGS_KEY)).toBe(original);
    first.unmount();

    render(<CountdownModal />);
    expect(button("2小时30分")).toBeVisible();
    await user.click(button("移除常用时长：3小时"));
    await user.click(button("确认"));
    expect(getAppSettings().countdown).toMatchObject({
      customQuickPresetSeconds: 300,
      favoritePresetSeconds: [9000],
    });
  });

  it("拒绝无效值、越界及全零；最大合法时长可用", () => {
    render(<CountdownModal />);
    for (const [h, m, s] of [
      ["0", "0", "0"],
      ["24", "0", "0"],
      ["0", "60", "0"],
      ["0", "0", "60"],
      ["-1", "10", "0"],
      ["2.5", "0", "0"],
      ["2e1", "0", "0"],
      ["", "30", "0"],
    ]) {
      setDuration(h, m, s);
      expect(button("确认")).toBeDisabled();
      expect(button("加入常用")).toBeDisabled();
    }
    expect(field("小时")).toHaveAttribute("inputmode", "numeric");
    expect(field("小时")).toHaveAttribute("aria-invalid", "true");
    expect(context.dispatch).not.toHaveBeenCalled();
    setDuration("23", "59", "59");
    expect(button("增加小时")).toBeDisabled();
    expect(button("增加分钟")).toBeDisabled();
    expect(button("增加秒")).toBeDisabled();
    fireEvent.click(button("确认"));
    expect(context.dispatch).toHaveBeenCalledWith({ type: "SET_COUNTDOWN", payload: 86399 });
  });

  it.each([
    ["运行中", true, 600],
    ["已暂停且有进度", false, 520],
  ] as const)("%s：点选常用不改计时，必须确认替换", async (_, isActive, currentTime) => {
    const user = userEvent.setup();
    context.countdown = { isActive, currentTime, initialTime: 600 };
    updateAppSettings({
      countdown: { favoritePresetSeconds: [9000], customQuickPresetSeconds: 300 },
    });
    render(<CountdownModal />);

    await user.click(button("2小时30分"));
    expect(field("小时")).toHaveValue("02");
    expect(field("分钟")).toHaveValue("30");
    expect(context.dispatch).not.toHaveBeenCalled();
    await user.click(button("替换当前倒计时"));
    expect(button("保留当前倒计时")).toHaveFocus();
    await user.click(button("保留当前倒计时"));
    expect(context.dispatch).not.toHaveBeenCalled();
    await user.click(button("替换当前倒计时"));
    await user.click(button("确认替换"));
    expect(context.dispatch.mock.calls).toEqual([
      [{ type: "SET_COUNTDOWN", payload: 9000 }],
      [{ type: "CLOSE_MODAL" }],
    ]);
    expect(getAppSettings().countdown.customQuickPresetSeconds).toBe(300);
  });
});
