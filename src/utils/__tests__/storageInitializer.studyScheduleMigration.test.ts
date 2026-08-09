import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

import { getAppSettings } from "../appSettings";
import { initializeStorage } from "../storageInitializer";

class MemoryStorage implements Storage {
  private store = new Map<string, string>();

  get length(): number {
    return this.store.size;
  }

  clear(): void {
    this.store.clear();
  }

  getItem(key: string): string | null {
    return this.store.has(key) ? this.store.get(key)! : null;
  }

  key(index: number): string | null {
    return Array.from(this.store.keys())[index] ?? null;
  }

  removeItem(key: string): void {
    this.store.delete(key);
  }

  setItem(key: string, value: string): void {
    this.store.set(key, value);
  }
}

/** storageInitializer 单元测试（函数级注释：验证 legacy 课程表键在启动时能安全迁移到 AppSettings） */
describe("storageInitializer - study schedule migration", () => {
  const originalLocalStorage = globalThis.localStorage;

  beforeEach(() => {
    vi.restoreAllMocks();
    (globalThis as unknown as { localStorage: Storage }).localStorage = new MemoryStorage();
  });

  afterEach(() => {
    (globalThis as unknown as { localStorage: Storage }).localStorage = originalLocalStorage;
  });

  it("当仅存在 legacy 课表键时，会迁移到 AppSettings 并删除 legacy 键", () => {
    const legacySchedule = [
      { id: "a", startTime: "08:00", endTime: "09:00", name: "早读" },
      { id: "b", startTime: "09:10", endTime: "10:00", name: "自习" },
    ];
    localStorage.setItem("study-schedule", JSON.stringify(legacySchedule));

    vi.spyOn(Date, "now").mockImplementation(() => 1234567890);
    initializeStorage();

    expect(localStorage.getItem("study-schedule")).toBeNull();
    expect(localStorage.getItem("studySchedule")).toBeNull();

    const timetable = getAppSettings().study.timetable;
    expect(timetable.cycleAnchorDate).toBe("2000-01-03");
    expect(timetable.document.configuration.cycle).toMatchObject({
      work_count: 5,
      rest_count: 2,
    });
    expect(timetable.document.schedules[0]).toMatchObject({
      enable_day: [1, 2, 3, 4, 5],
      classes: [
        { subject: "早读", start_time: "08:00:00", end_time: "09:00:00" },
        { subject: "自习", start_time: "09:10:00", end_time: "10:00:00" },
      ],
    });
  });

  it("当 AppSettings 已显式保存课表时，不覆盖但会清理 legacy 键", () => {
    const appSettingsSchedule = [{ id: "x", startTime: "19:00", endTime: "20:00", name: "晚自习" }];
    localStorage.setItem(
      "AppSettings",
      JSON.stringify({ study: { schedule: appSettingsSchedule } })
    );
    localStorage.setItem(
      "studySchedule",
      JSON.stringify([{ id: "legacy", startTime: "01:00", endTime: "02:00", name: "旧数据" }])
    );

    vi.spyOn(Date, "now").mockImplementation(() => 1234567890);
    initializeStorage();

    expect(localStorage.getItem("study-schedule")).toBeNull();
    expect(localStorage.getItem("studySchedule")).toBeNull();

    const timetable = getAppSettings().study.timetable;
    expect(timetable.document.subjects).toEqual([{ name: "晚自习" }]);
    expect(timetable.document.schedules[0].classes).toEqual([
      { subject: "晚自习", start_time: "19:00:00", end_time: "20:00:00" },
    ]);
    const raw = JSON.parse(localStorage.getItem("AppSettings") ?? "{}") as {
      study?: Record<string, unknown>;
    };
    expect(raw.study).not.toHaveProperty("schedule");
    expect(raw.study).toHaveProperty("timetable");
  });
});
