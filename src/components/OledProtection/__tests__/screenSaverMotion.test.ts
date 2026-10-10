import { describe, expect, it } from "vitest";

import {
  advanceOledScreenPosition,
  createRandomOledScreenPosition,
  OLED_SCREEN_SAFE_MARGIN,
} from "../screenSaverMotion";

describe("OLED 屏保移动", () => {
  it("从安全边距内随机选取位置，并为内容预留完整移动空间", () => {
    const randomValues = [0.5, 0.25, 0.8, 0.2];
    const position = createRandomOledScreenPosition(
      1440,
      900,
      320,
      100,
      () => randomValues.shift()!
    );

    expect(position.x).toBe(560);
    expect(position.y).toBe(212);
    expect(position.x).toBeGreaterThanOrEqual(OLED_SCREEN_SAFE_MARGIN);
    expect(position.y).toBeGreaterThanOrEqual(OLED_SCREEN_SAFE_MARGIN);
    expect(position.x + 320).toBeLessThanOrEqual(1440 - OLED_SCREEN_SAFE_MARGIN);
    expect(position.y + 100).toBeLessThanOrEqual(900 - OLED_SCREEN_SAFE_MARGIN);
  });

  it("移动到边界时反弹并保持在安全范围", () => {
    expect(
      advanceOledScreenPosition({ x: 95, y: 4, velocityX: 10, velocityY: -8 }, 1, 100, 60)
    ).toEqual({ x: 95, y: 4, velocityX: -10, velocityY: 8 });
  });
});
