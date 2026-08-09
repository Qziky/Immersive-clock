import type { StudyTimetableSettings } from "../types/studySchedule";

import { getAppSettings, updateAppSettings } from "./appSettings";
import { createDefaultStudyTimetable, normalizeStudyTimetable } from "./studyTimetable";

export function readStudyTimetable(): StudyTimetableSettings {
  return getAppSettings().study.timetable;
}

export function writeStudyTimetable(timetable: StudyTimetableSettings): void {
  updateAppSettings((current) => ({
    study: {
      ...current.study,
      timetable: normalizeStudyTimetable(timetable),
    },
  }));
}

export function resetStudyTimetable(): void {
  updateAppSettings((current) => ({
    study: {
      ...current.study,
      timetable: createDefaultStudyTimetable(),
    },
  }));
}
