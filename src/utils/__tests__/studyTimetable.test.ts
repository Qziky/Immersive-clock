import { describe, expect, it } from "vitest";

import type { CsesDocument } from "../../types/studySchedule";
import {
  CsesValidationError,
  createDefaultStudyTimetable,
  migrateLegacyStudySchedule,
  parseCsesYaml,
  resolveStudyDaySchedule,
  serializeCsesYaml,
  validateCsesDocument,
} from "../studyTimetable";

describe("studyTimetable", () => {
  it("提供语义正确的工作日晚自习默认模板", () => {
    const timetable = createDefaultStudyTimetable();

    expect(timetable).toMatchObject({
      cycleAnchorDate: "2000-01-03",
      document: {
        configuration: {
          name: "工作日晚自习",
          description: "默认上 5 休 2 的晚自习模板，可按实际作息修改",
          cycle: { work_count: 5, rest_count: 2 },
        },
        subjects: [
          { name: "自习", simplified_name: "自习" },
          { name: "语文", simplified_name: "语" },
          { name: "数学", simplified_name: "数" },
          { name: "英语", simplified_name: "英" },
        ],
        schedules: [
          {
            name: "工作日",
            enable_day: [1, 2, 3, 4, 5],
            classes: [
              { subject: "自习", start_time: "19:10:00", end_time: "20:20:00" },
              { subject: "自习", start_time: "20:30:00", end_time: "22:20:00" },
            ],
          },
        ],
      },
    });
  });

  it("严格解析 CSES v2 并在导出时保留扩展字段", () => {
    const document = parseCsesYaml(`
version: 2
vendor_extension: keep-me
configuration:
  name: 测试课表
  description: 扩展字段往返
  cycle:
    work_count: 5
    rest_count: 2
    spans:
      - activity: work
        count: 5
      - activity: rest
        count: 2
subjects:
  - name: 数学
    color: blue
schedules:
  - name: 周一
    enable_day: [1]
    classes:
      - subject: 数学
        start_time: "08:00:00"
        end_time: "08:45:30"
`);

    const reparsed = parseCsesYaml(serializeCsesYaml(document));
    expect(reparsed.vendor_extension).toBe("keep-me");
    expect(reparsed.subjects[0].color).toBe("blue");
    expect(reparsed.schedules[0].classes[0].end_time).toBe("08:45:30");
  });

  it("拒绝未知课程引用、错误时间和实际启用日上的重叠", () => {
    const document = createDefaultStudyTimetable().document;
    document.schedules[0].classes.push({
      subject: "不存在的课程",
      start_time: "19:30:00",
      end_time: "20:40:00",
    });

    const result = validateCsesDocument(document);
    expect(result.valid).toBe(false);
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: "schedules[0].classes[2].subject" }),
        expect.objectContaining({ path: "schedules[0].classes[2]" }),
      ])
    );
  });

  it("无效 YAML 以带路径问题列表的异常拒绝", () => {
    expect(() => parseCsesYaml("version: 1\nsubjects: []\nschedules: []")).toThrow(
      CsesValidationError
    );
    try {
      parseCsesYaml("version: 1\nsubjects: []\nschedules: []");
    } catch (error) {
      expect(error).toBeInstanceOf(CsesValidationError);
      expect((error as CsesValidationError).issues[0].path).toBe("version");
    }
  });

  it("固定周一锚点把 5+2 周期映射到自然工作日与休息日", () => {
    const timetable = createDefaultStudyTimetable();
    const monday = resolveStudyDaySchedule(timetable, new Date(2026, 7, 3, 10, 0, 0));
    const sunday = resolveStudyDaySchedule(timetable, new Date(2026, 7, 9, 10, 0, 0));

    expect(monday).toMatchObject({ activity: "work", workDay: 1 });
    expect(monday.periods).toHaveLength(2);
    expect(sunday).toMatchObject({ activity: "rest", workDay: null, periods: [] });
  });

  it("解析跨周的多段 CSES 周期", () => {
    const timetable = createDefaultStudyTimetable();
    timetable.cycleAnchorDate = "2026-08-03";
    timetable.document.configuration.cycle = {
      work_count: 10,
      rest_count: 4,
      spans: [
        { activity: "work", count: 5 },
        { activity: "rest", count: 2 },
        { activity: "work", count: 5 },
        { activity: "rest", count: 2 },
      ],
    };
    timetable.document.schedules[0].enable_day = [6];

    const secondMonday = resolveStudyDaySchedule(timetable, new Date(2026, 7, 10, 9, 0, 0));
    expect(secondMonday).toMatchObject({ activity: "work", cycleDay: 8, workDay: 6 });
    expect(secondMonday.periods).toHaveLength(2);
  });

  it("把旧每日时段迁移为周一至周五 CSES 课程表", () => {
    const timetable = migrateLegacyStudySchedule([
      { id: "a", name: "数学", startTime: "08:00", endTime: "09:00" },
      { id: "b", name: "自习", startTime: "09:10:30", endTime: "10:00:00" },
    ]);

    expect(timetable.document).toMatchObject<CsesDocument>({
      version: 2,
      configuration: {
        name: "迁移的工作日课表",
        description: "由旧版每日课表迁移，仅在周一至周五生效",
        cycle: {
          work_count: 5,
          rest_count: 2,
          spans: [
            { activity: "work", count: 5 },
            { activity: "rest", count: 2 },
          ],
        },
      },
      subjects: [{ name: "数学" }, { name: "自习" }],
      schedules: [
        {
          name: "周一至周五",
          enable_day: [1, 2, 3, 4, 5],
          classes: [
            { subject: "数学", start_time: "08:00:00", end_time: "09:00:00" },
            { subject: "自习", start_time: "09:10:30", end_time: "10:00:00" },
          ],
        },
      ],
    });
  });

  it("把未修改的旧默认时段升级为新的工作日晚自习模板", () => {
    const timetable = migrateLegacyStudySchedule([
      { id: "1", name: "第1节自习", startTime: "19:10", endTime: "20:20" },
      { id: "2", name: "第2节自习", startTime: "20:30", endTime: "22:20" },
    ]);

    expect(timetable.document.configuration.name).toBe("工作日晚自习");
    expect(timetable.document.subjects).toEqual([
      { name: "自习", simplified_name: "自习" },
      { name: "语文", simplified_name: "语" },
      { name: "数学", simplified_name: "数" },
      { name: "英语", simplified_name: "英" },
    ]);
    expect(timetable.document.schedules[0]).toMatchObject({
      name: "工作日",
      classes: [{ subject: "自习" }, { subject: "自习" }],
    });
  });
});
