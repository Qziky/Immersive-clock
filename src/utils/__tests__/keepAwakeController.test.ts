import { describe, expect, it, vi } from "vitest";

import { createKeepAwakeController } from "../../../electron/keepAwakeController";

describe("Electron 屏幕常亮控制器", () => {
  it("重复启用复用同一个 blocker，关闭时释放", () => {
    const api = {
      isStarted: vi.fn(() => true),
      start: vi.fn(() => 42),
      stop: vi.fn(() => true),
    };
    const controller = createKeepAwakeController(api);

    expect(controller.setEnabled(true)).toBe(true);
    expect(controller.setEnabled(true)).toBe(true);
    expect(api.start).toHaveBeenCalledTimes(1);
    expect(controller.setEnabled(false)).toBe(false);
    expect(api.stop).toHaveBeenCalledWith(42);
  });

  it("启动失败时返回未激活并允许后续重试", () => {
    const api = {
      isStarted: vi.fn(() => false),
      start: vi
        .fn()
        .mockImplementationOnce(() => {
          throw new Error("blocked");
        })
        .mockReturnValueOnce(7),
      stop: vi.fn(() => true),
    };
    const controller = createKeepAwakeController(api);

    expect(controller.setEnabled(true)).toBe(false);
    expect(controller.setEnabled(true)).toBe(true);
  });
});
