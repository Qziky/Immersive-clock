import { describe, expect, it } from "vitest";

import { adaptMinutely } from "../weatherService";

describe("weatherService adaptMinutely", () => {
  it("保留响应中的真实 fxTime 序列", () => {
    const times = [
      "2026-03-07T10:00:00+08:00",
      "2026-03-07T10:02:00+08:00",
      "2026-03-07T10:04:00+08:00",
    ];

    const result = adaptMinutely({
      status: 0,
      precipitation: {
        pubTime: "2026-03-07T10:00:00+08:00",
        value: [0, 0.2, 0.3],
        fxTime: times,
      },
    });

    expect(result.minutely?.map((item) => item.fxTime)).toEqual(
      times.map((time) => new Date(time).toISOString())
    );
  });

  it("只有 pubTime 时按供应商 interval 推导时间轴", () => {
    const base = Date.parse("2026-03-07T10:00:00+08:00");
    const result = adaptMinutely({
      status: 0,
      precipitation: {
        pubTime: base,
        interval: 2,
        value: [0, 0.2, 0],
      },
    });

    expect(result.minutely?.[1].fxTime).toBe(new Date(base + 2 * 60 * 1000).toISOString());
  });

  it("缺失服务端发布时间时不使用客户端当前时间伪造 fxTime", () => {
    const result = adaptMinutely({
      status: 0,
      precipitation: {
        value: [0, 0.2],
      },
    });

    expect(result.updateTime).toBeUndefined();
    expect(result.minutely?.every((item) => item.fxTime == null)).toBe(true);
  });
});
