import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import { APP_SETTINGS_KEY } from "../../utils/appSettings";
import { SETTINGS_EVENTS } from "../../utils/settingsEvents";
import { AppearanceProvider, useAppearance } from "../AppearanceContext";

function Harness() {
  const {
    activeAppearance,
    committedAppearance,
    beginAppearancePreview,
    updateAppearanceDraft,
    commitAppearanceDraft,
    cancelAppearancePreview,
  } = useAppearance();
  const activeColor =
    activeAppearance.scenes.clock.components.clock?.slots?.time.color ?? "inherit";
  const committedColor =
    committedAppearance.scenes.clock.components.clock?.slots?.time.color ?? "inherit";
  const backgroundType = activeAppearance.scenes.clock.background.type;
  return (
    <>
      <output aria-label="预览颜色">{activeColor}</output>
      <output aria-label="保存颜色">{committedColor}</output>
      <output aria-label="背景类型">{backgroundType}</output>
      <button type="button" onClick={() => beginAppearancePreview("clock")}>
        开始
      </button>
      <button
        type="button"
        onClick={() =>
          updateAppearanceDraft(
            ["scenes", "clock", "components", "clock", "slots", "time", "color"],
            "#ff0000"
          )
        }
      >
        修改
      </button>
      <button type="button" onClick={commitAppearanceDraft}>
        保存
      </button>
      <button
        type="button"
        onClick={() => updateAppearanceDraft(["scenes", "clock", "background", "type"], "color")}
      >
        选择纯色背景
      </button>
      <button
        type="button"
        onClick={() =>
          updateAppearanceDraft(
            ["scenes", "clock", "components", "clock", "slots", "time", "color"],
            "not-a-color"
          )
        }
      >
        写入非法颜色
      </button>
      <button type="button" onClick={cancelAppearancePreview}>
        取消
      </button>
    </>
  );
}

describe("AppearanceProvider", () => {
  beforeEach(() => localStorage.clear());

  it("实时预览但取消后不写入配置", () => {
    render(
      <AppearanceProvider>
        <Harness />
      </AppearanceProvider>
    );
    fireEvent.click(screen.getByRole("button", { name: "开始" }));
    fireEvent.click(screen.getByRole("button", { name: "修改" }));
    expect(screen.getByLabelText("预览颜色")).toHaveTextContent("#ff0000");
    expect(screen.getByLabelText("保存颜色")).toHaveTextContent("inherit");
    fireEvent.click(screen.getByRole("button", { name: "取消" }));
    expect(screen.getByLabelText("预览颜色")).toHaveTextContent("inherit");
    expect(localStorage.getItem(APP_SETTINGS_KEY)).toBeNull();
  });

  it("保存时一次提交草稿并更新已保存状态", () => {
    render(
      <AppearanceProvider>
        <Harness />
      </AppearanceProvider>
    );
    fireEvent.click(screen.getByRole("button", { name: "开始" }));
    fireEvent.click(screen.getByRole("button", { name: "修改" }));
    fireEvent.click(screen.getByRole("button", { name: "保存" }));
    expect(screen.getByLabelText("保存颜色")).toHaveTextContent("#ff0000");
    const stored = JSON.parse(localStorage.getItem(APP_SETTINGS_KEY) ?? "{}");
    expect(stored.appearance.scenes.clock.components.clock.slots.time.color).toBe("#ff0000");
  });

  it("保留背景编辑中间状态并拒绝非法字段", () => {
    render(
      <AppearanceProvider>
        <Harness />
      </AppearanceProvider>
    );
    fireEvent.click(screen.getByRole("button", { name: "开始" }));
    fireEvent.click(screen.getByRole("button", { name: "选择纯色背景" }));
    expect(screen.getByLabelText("背景类型")).toHaveTextContent("color");
    fireEvent.click(screen.getByRole("button", { name: "写入非法颜色" }));
    expect(screen.getByLabelText("预览颜色")).toHaveTextContent("inherit");
  });

  it("外观资源迁移完成后同步当前会话中的已保存外观", () => {
    render(
      <AppearanceProvider>
        <Harness />
      </AppearanceProvider>
    );
    fireEvent.click(screen.getByRole("button", { name: "开始" }));
    fireEvent.click(screen.getByRole("button", { name: "修改" }));
    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    const stored = JSON.parse(localStorage.getItem(APP_SETTINGS_KEY) ?? "{}");
    stored.appearance.scenes.clock.components.clock.slots.time.color = "#00ff00";
    localStorage.setItem(APP_SETTINGS_KEY, JSON.stringify(stored));
    act(() => {
      window.dispatchEvent(new CustomEvent(SETTINGS_EVENTS.AppearanceResourcesMigrated));
    });

    expect(screen.getByLabelText("保存颜色")).toHaveTextContent("#00ff00");
  });
});
