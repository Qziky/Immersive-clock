import { describe, expect, it } from "vitest";

import { shouldAllowFullscreenPermission } from "../../../electron/permissionPolicy";

describe("Electron 全屏权限策略", () => {
  it.each([
    {
      name: "允许主窗口的主框架",
      context: { isMainWindow: true, isMainFrame: true },
      expected: true,
    },
    {
      name: "拒绝主窗口中的子框架",
      context: { isMainWindow: true, isMainFrame: false },
      expected: false,
    },
    {
      name: "拒绝其他窗口的主框架",
      context: { isMainWindow: false, isMainFrame: true },
      expected: false,
    },
    {
      name: "拒绝缺失窗口且不是主框架的请求",
      context: { isMainWindow: false, isMainFrame: false },
      expected: false,
    },
  ])("$name", ({ context, expected }) => {
    expect(shouldAllowFullscreenPermission(context)).toBe(expected);
  });
});
