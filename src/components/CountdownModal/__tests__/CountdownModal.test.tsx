import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { APP_SETTINGS_KEY, updateAppSettings } from "../../../utils/appSettings";
import { CountdownModal } from "../CountdownModal";

const appContextMocks = vi.hoisted(() => ({
  dispatch: vi.fn(),
  isModalOpen: true,
}));

vi.mock("../../../contexts/AppContext", () => ({
  useAppDispatch: () => appContextMocks.dispatch,
  useAppState: () => ({ isModalOpen: appContextMocks.isModalOpen }),
}));

function renderCountdownModal() {
  return render(<CountdownModal />);
}

describe("CountdownModal", () => {
  beforeEach(() => {
    localStorage.clear();
    appContextMocks.dispatch.mockClear();
    appContextMocks.isModalOpen = true;
  });

  it("只显示三个固定预设和自定义项", () => {
    renderCountdownModal();
    const dialog = screen.getByRole("dialog", { name: "设置倒计时" });

    for (const label of ["10分钟", "30分钟", "1小时", "自定义"]) {
      expect(within(dialog).getByRole("radio", { name: label })).toBeInTheDocument();
    }
    for (const legacyLabel of ["1小时15分", "2小时"]) {
      expect(within(dialog).queryByRole("radio", { name: legacyLabel })).not.toBeInTheDocument();
    }
  });

  it("选中已保存的自定义项后加载时分秒并固定显示自定义文案", async () => {
    const user = userEvent.setup();
    updateAppSettings({ countdown: { customQuickPresetSeconds: 5420 } });

    renderCountdownModal();
    const dialog = screen.getByRole("dialog", { name: "设置倒计时" });
    const customPreset = within(dialog).getByRole("radio", {
      name: "自定义（1小时30分20秒）",
    });
    expect(within(dialog).getByText("自定义", { exact: true })).toBeInTheDocument();

    await user.click(customPreset);

    expect(within(dialog).getByRole("group", { name: "小时设置" })).toHaveTextContent("01");
    expect(within(dialog).getByRole("group", { name: "分钟设置" })).toHaveTextContent("30");
    expect(within(dialog).getByRole("group", { name: "秒设置" })).toHaveTextContent("20");
  });

  it("调整自定义时长并确认时保存配置和倒计时", async () => {
    const user = userEvent.setup();
    renderCountdownModal();
    const dialog = screen.getByRole("dialog", { name: "设置倒计时" });

    await user.click(within(dialog).getByRole("radio", { name: "自定义" }));
    const minuteGroup = within(dialog).getByRole("group", { name: "分钟设置" });
    for (let index = 0; index < 35; index += 1) {
      await user.click(within(minuteGroup).getByRole("button", { name: "增加分钟" }));
    }
    await user.click(within(dialog).getByRole("button", { name: "确认" }));

    expect(JSON.parse(localStorage.getItem(APP_SETTINGS_KEY) ?? "{}").countdown).toEqual({
      customQuickPresetSeconds: 2700,
    });
    expect(appContextMocks.dispatch).toHaveBeenNthCalledWith(1, {
      type: "SET_COUNTDOWN",
      payload: 2700,
    });
    expect(appContextMocks.dispatch).toHaveBeenNthCalledWith(2, { type: "CLOSE_MODAL" });
  });

  it("取消自定义修改时不写入新的设置或倒计时", async () => {
    const user = userEvent.setup();
    updateAppSettings({ countdown: { customQuickPresetSeconds: 1800 } });

    renderCountdownModal();
    const dialog = screen.getByRole("dialog", { name: "设置倒计时" });
    await user.click(within(dialog).getByRole("radio", { name: "自定义（30分钟）" }));
    await user.click(
      within(within(dialog).getByRole("group", { name: "分钟设置" })).getByRole("button", {
        name: "增加分钟",
      })
    );
    await user.click(within(dialog).getByRole("button", { name: "取消" }));

    expect(JSON.parse(localStorage.getItem(APP_SETTINGS_KEY) ?? "{}").countdown).toEqual({
      customQuickPresetSeconds: 1800,
    });
    expect(appContextMocks.dispatch).toHaveBeenCalledWith({ type: "CLOSE_MODAL" });
    expect(appContextMocks.dispatch).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: "SET_COUNTDOWN" })
    );
  });
});
