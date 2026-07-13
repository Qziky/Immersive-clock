import { describe, expect, it } from "vitest";

import {
  appearanceStyleToCss,
  createDefaultAppearance,
  migrateV1Appearance,
  normalizeAppearance,
  normalizeAppearanceStyle,
  resolveAppearanceBackground,
  resolveAppearanceEditorStyle,
  resolveAppearanceStyle,
} from "../appearanceModel";

describe("appearanceModel", () => {
  it("按全局、组件、状态和实例顺序解析覆盖", () => {
    const appearance = createDefaultAppearance();
    appearance.global.numeric = { color: "#111111", fontWeight: 400 };
    appearance.scenes.study.components.studyCountdown = {
      slots: { digit: { color: "#222222", opacity: 0.8 } },
      states: { warning: { color: "#333333" } },
    };
    appearance.instances.studyCountdown.exam = {
      slots: { digit: { color: "#444444" } },
    };

    expect(
      resolveAppearanceStyle(appearance, "study", "studyCountdown", "digit", "numeric", {
        state: "warning",
        instanceId: "exam",
      })
    ).toEqual({ color: "#444444", fontWeight: 400, opacity: 0.8 });
  });

  it("页面背景继承全局并允许页面覆盖", () => {
    const appearance = createDefaultAppearance();
    appearance.global.background = { type: "color", color: "#123456", colorAlpha: 0.8 };

    expect(resolveAppearanceBackground(appearance, "clock")).toEqual({
      type: "color",
      color: "#123456",
      colorAlpha: 0.8,
    });

    appearance.scenes.clock.background = { type: "black" };
    expect(resolveAppearanceBackground(appearance, "clock")).toEqual({ type: "black" });

    appearance.scenes.clock.background = { type: "builtin" };
    expect(resolveAppearanceBackground(appearance, "clock")).toEqual({ type: "default" });
  });

  it("将旧页面默认背景规范化为继承全局", () => {
    const normalized = normalizeAppearance({
      global: {},
      scenes: { clock: { background: { type: "default" }, components: {} } },
    });

    expect(normalized.global.background).toEqual({ type: "default" });
    expect(normalized.scenes.clock.background).toEqual({ type: "inherit" });
  });

  it("将顶部信息栏旧表面样式合并到唯一容器", () => {
    const normalized = normalizeAppearance({
      scenes: {
        study: {
          background: { type: "inherit" },
          components: {
            studyTopDock: {
              container: { backgroundColor: "#111111", borderWidth: 1 },
              slots: {
                surface: { backgroundColor: "#222222", borderRadius: 12 },
              },
            },
          },
        },
      },
    });
    const topDock = normalized.scenes.study.components.studyTopDock;

    expect(topDock?.container).toEqual({
      backgroundColor: "#222222",
      borderRadius: 12,
      borderWidth: 1,
    });
    expect(topDock?.slots).toBeUndefined();
    expect(
      resolveAppearanceStyle(normalized, "study", "studyTopDock", "surface", "surface")
    ).toEqual(topDock?.container);
  });

  it("编辑器展示内置默认值但不把默认值写入配置", () => {
    const appearance = createDefaultAppearance();

    expect(resolveAppearanceEditorStyle(appearance, "clock", "clock", "date", "text")).toEqual(
      expect.objectContaining({
        color: "#bbbbbb",
        opacity: 0.8,
        fontWeight: 400,
      })
    );
    expect(appearance.scenes.clock.components.clock).toBeUndefined();

    appearance.global.text = { color: "#123456" };
    expect(resolveAppearanceEditorStyle(appearance, "clock", "clock", "date", "text").color).toBe(
      "#123456"
    );
  });

  it("将 v1 样式、背景和倒计时实例迁移到 v2", () => {
    const migrated = migrateV1Appearance({
      general: { background: { type: "color", color: "#123456", colorAlpha: 0.7 } },
      study: {
        background: { type: "black" },
        style: {
          digitColor: "#00ffcc",
          digitOpacity: 0.6,
          numericFontFamily: "Legacy Numeric",
          timeColor: "#ffffff",
        },
        countdownItems: [
          {
            id: "exam",
            bgColor: "#111111",
            bgOpacity: 0.4,
            digitColor: "#ff0000",
          },
        ],
      },
    });

    expect(migrated.scenes.clock.background.color).toBe("#123456");
    expect(migrated.scenes.countdown.background.color).toBe("#123456");
    expect(migrated.scenes.stopwatch.background.color).toBe("#123456");
    expect(migrated.scenes.study.background.type).toBe("black");
    expect(migrated.global.numeric?.font?.family).toBe("Legacy Numeric");
    expect(migrated.scenes.study.components.studyTime?.slots?.primary.color).toBe("#ffffff");
    expect(migrated.instances.studyCountdown.exam.slots?.digit.color).toBe("#ff0000");
  });

  it("丢弃非法值并钳制数值范围", () => {
    expect(
      normalizeAppearanceStyle({
        color: "javascript:red",
        opacity: 9,
        fontWeight: 42,
        borderRadius: Number.NaN,
        filter: "url(example)",
      })
    ).toEqual({ opacity: 1, fontWeight: 100 });
  });

  it("只将经过规范化的属性编译为 React 样式", () => {
    expect(
      appearanceStyleToCss({
        color: "#ffffff",
        backgroundColor: "#000000",
        backgroundOpacity: 0.5,
        textShadow: { color: "#000000", blur: 8, offsetX: 0, offsetY: 2 },
      })
    ).toMatchObject({
      color: "#ffffff",
      backgroundColor: "rgba(0, 0, 0, 0.5)",
      textShadow: "0px 2px 8px #000000",
    });
  });
});
