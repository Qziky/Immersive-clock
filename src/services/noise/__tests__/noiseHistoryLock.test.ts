import { describe, expect, it } from "vitest";

import { withNoiseHistoryWriteLock } from "../noiseHistoryLock";

describe("noiseHistoryLock", () => {
  it("localStorage 回退会串行化追加、清空和恢复写操作", async () => {
    const events: string[] = [];

    await Promise.all([
      withNoiseHistoryWriteLock(async () => {
        events.push("first-start");
        await new Promise((resolve) => setTimeout(resolve, 30));
        events.push("first-end");
      }),
      withNoiseHistoryWriteLock(async () => {
        events.push("second-start");
        events.push("second-end");
      }),
    ]);

    expect(events).toEqual(["first-start", "first-end", "second-start", "second-end"]);
  });
});
