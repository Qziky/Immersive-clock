export type CsesExtensionFields = Record<string, unknown>;

export interface CsesCycleSpan extends CsesExtensionFields {
  activity: "work" | "rest";
  count: number;
}

export interface CsesCycle extends CsesExtensionFields {
  work_count: number;
  rest_count: number;
  spans: CsesCycleSpan[];
}

export interface CsesConfiguration extends CsesExtensionFields {
  name: string;
  description: string;
  cycle: CsesCycle;
}

export interface CsesSubject extends CsesExtensionFields {
  name: string;
  simplified_name?: string;
  location?: string;
  teacher?: string;
}

export interface CsesClass extends CsesExtensionFields {
  subject: string;
  start_time: string;
  end_time: string;
}

export interface CsesSchedule extends CsesExtensionFields {
  name: string;
  enable_day: number[];
  classes: CsesClass[];
}

export interface CsesDocument extends CsesExtensionFields {
  version: 2;
  configuration: CsesConfiguration;
  subjects: CsesSubject[];
  schedules: CsesSchedule[];
}

/** 应用私有的课程表设置；周期锚点不会写入 CSES YAML。 */
export interface StudyTimetableSettings {
  document: CsesDocument;
  cycleAnchorDate: string;
}

/** 供自习页进度、下一节提示和噪音报告消费的当日课时投影。 */
export interface StudyPeriod {
  id: string;
  startTime: string;
  endTime: string;
  name: string;
  simplifiedName?: string;
  location?: string;
  teacher?: string;
  scheduleNames?: string[];
}

/** 仅用于迁移旧版每日一维课表。 */
export interface LegacyStudyPeriod {
  id?: string;
  startTime: string;
  endTime: string;
  name: string;
}
