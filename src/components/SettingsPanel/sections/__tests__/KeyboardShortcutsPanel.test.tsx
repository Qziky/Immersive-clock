import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";

import {
  getAppSettings,
  normalizeAppSettings,
  updateGeneralSettings,
} from "../../../../utils/appSettings";
import { DEFAULT_KEYBOARD_SHORTCUTS } from "../../../../utils/keyboardShortcuts";
import { KeyboardShortcutsPanel } from "../KeyboardShortcutsPanel";

function setup() {
  let save = () => {};
  const view = render(
    <KeyboardShortcutsPanel
      hidden={false}
      onRegisterSave={(fn) => {
        save = fn;
      }}
    />
  );
  return { ...view, save: () => act(() => save()) };
}

describe("快捷键设置", () => {
  beforeEach(() => localStorage.clear());

  it("旧备份补齐默认值，损坏和冲突配置得到规范化，局部更新保留其它绑定", () => {
    expect(normalizeAppSettings({}).general.keyboardShortcuts).toEqual(DEFAULT_KEYBOARD_SHORTCUTS);
    expect(
      normalizeAppSettings({
        general: {
          keyboardShortcuts: {
            toggleTimer: "KeyT",
            resetCountdown: "KeyT",
            toggleFullscreen: "Escape",
          },
        },
      }).general.keyboardShortcuts
    ).toEqual({ toggleTimer: "KeyT", resetCountdown: null, toggleFullscreen: "KeyF" });
    updateGeneralSettings({ keyboardShortcuts: { toggleTimer: "KeyT" } });
    updateGeneralSettings({ keyboardShortcuts: { resetCountdown: null } });
    expect(getAppSettings().general.keyboardShortcuts).toEqual({
      toggleTimer: "KeyT",
      resetCountdown: null,
      toggleFullscreen: "KeyF",
    });
  });

  it("草稿在保存前不生效，重新打开丢弃未保存修改", async () => {
    const user = userEvent.setup();
    const view = setup();
    await user.click(screen.getByRole("button", { name: "修改开始 / 暂停 / 继续快捷键" }));
    await user.keyboard("t");
    expect(getAppSettings().general.keyboardShortcuts.toggleTimer).toBe("Space");
    view.unmount();
    const reopened = setup();
    expect(screen.getByRole("button", { name: "修改开始 / 暂停 / 继续快捷键" })).toHaveTextContent(
      "空格"
    );
    await user.click(screen.getByRole("button", { name: "修改开始 / 暂停 / 继续快捷键" }));
    await user.keyboard("t");
    reopened.save();
    expect(getAppSettings().general.keyboardShortcuts.toggleTimer).toBe("KeyT");
  });

  it("冲突保留原设置，明确替换才移走原绑定，允许清除和恢复默认", async () => {
    const user = userEvent.setup();
    const view = setup();
    await user.click(screen.getByRole("button", { name: "修改开始 / 暂停 / 继续快捷键" }));
    await user.keyboard("r");
    expect(screen.getByRole("alert")).toHaveTextContent("R 已用于“重置倒计时”");
    view.save();
    expect(getAppSettings().general.keyboardShortcuts).toEqual(DEFAULT_KEYBOARD_SHORTCUTS);
    await user.click(screen.getByRole("button", { name: "替换绑定" }));
    view.save();
    expect(getAppSettings().general.keyboardShortcuts).toMatchObject({
      toggleTimer: "KeyR",
      resetCountdown: null,
    });
    await user.click(screen.getByRole("button", { name: "清除开始 / 暂停 / 继续快捷键" }));
    view.save();
    expect(getAppSettings().general.keyboardShortcuts.toggleTimer).toBeNull();
    await user.click(screen.getByRole("button", { name: "恢复默认快捷键" }));
    view.save();
    expect(getAppSettings().general.keyboardShortcuts).toEqual(DEFAULT_KEYBOARD_SHORTCUTS);
  });

  it("Enter 和 Esc 保留原用途，切换子页面结束录入", async () => {
    const user = userEvent.setup();
    const view = setup();
    await user.click(screen.getByRole("button", { name: "修改重置倒计时快捷键" }));
    await user.keyboard("{Enter}");
    expect(screen.getByText(/Enter 和 Esc 保留原有操作/)).toBeVisible();
    await user.keyboard("{Escape}");
    expect(screen.getByRole("button", { name: "修改重置倒计时快捷键" })).toHaveTextContent("R");
    await user.click(screen.getByRole("button", { name: "修改重置倒计时快捷键" }));
    view.rerender(<KeyboardShortcutsPanel hidden onRegisterSave={() => {}} />);
    fireEvent.keyDown(window, { code: "KeyT" });
    view.rerender(<KeyboardShortcutsPanel hidden={false} onRegisterSave={() => {}} />);
    expect(screen.getByRole("button", { name: "修改重置倒计时快捷键" })).toHaveTextContent("R");
  });
});
