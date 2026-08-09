import React, { useCallback, useEffect, useMemo, useState } from "react";

import type {
  CsesClass,
  CsesCycleSpan,
  CsesDocument,
  CsesSchedule,
  CsesSubject,
  StudyTimetableSettings,
} from "../../types/studySchedule";
import {
  Button,
  Checkbox,
  Dropdown,
  FormSection,
  IconButton,
  InfoPanel,
  Inline,
  Input,
  MetricCard,
  SettingGrid,
  SettingItem,
  Stack,
  StatusPill,
  Tabs,
  Textarea,
  useFeedback,
} from "../../ui";
import { logger } from "../../utils/logger";
import { broadcastSettingsEvent, SETTINGS_EVENTS } from "../../utils/settingsEvents";
import {
  cloneCsesDocument,
  createDefaultStudyTimetable,
  createNewCsesClass,
  CsesValidationError,
  deriveCycleCounts,
  MAX_CSES_YAML_BYTES,
  parseCsesTime,
  parseCsesYaml,
  resolveStudyDaySchedule,
  serializeCsesYaml,
  validateStudyTimetable,
  type CsesValidationIssue,
} from "../../utils/studyTimetable";
import { readStudyTimetable, writeStudyTimetable } from "../../utils/studyTimetableStorage";
import { getAdjustedDate } from "../../utils/timeSync";

import styles from "./ScheduleSettings.module.css";

interface ScheduleEditorProps {
  onRegisterSave?: (save: () => void) => void;
}

type EditorTab = "overview" | "subjects" | "schedules" | "cycle";

const EDITOR_TABS = [
  { value: "overview", label: "概览与文件", icon: "feature.file" },
  { value: "subjects", label: "课程库", icon: "feature.study" },
  { value: "schedules", label: "日课程表", icon: "feature.schedule" },
  { value: "cycle", label: "周期与锚点", icon: "feature.sync" },
] as const;

function nextUniqueName(prefix: string, values: readonly string[]): string {
  let index = values.length + 1;
  let candidate = `${prefix}${index}`;
  while (values.includes(candidate)) {
    index += 1;
    candidate = `${prefix}${index}`;
  }
  return candidate;
}

function moveItem<T>(items: T[], index: number, direction: "down" | "up"): T[] {
  const targetIndex = direction === "up" ? index - 1 : index + 1;
  if (targetIndex < 0 || targetIndex >= items.length) return items;
  const next = [...items];
  [next[index], next[targetIndex]] = [next[targetIndex], next[index]];
  return next;
}

function replaceDocument(
  timetable: StudyTimetableSettings,
  update: (document: CsesDocument) => void
): StudyTimetableSettings {
  const document = cloneCsesDocument(timetable.document);
  update(document);
  return { ...timetable, document };
}

function downloadYaml(document: CsesDocument): void {
  const yaml = serializeCsesYaml(document);
  const blob = new Blob([yaml], { type: "application/yaml;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.configuration.name.trim()
    ? document.configuration.name.trim().replace(/[\\/:*?"<>|\s]+/g, "-")
    : "course-schedule";
  const date = new Date().toISOString().slice(0, 10);
  const anchor = window.document.createElement("a");
  anchor.href = url;
  anchor.download = `${link}-${date}.yaml`;
  window.document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function describeResolvedDay(activity: ReturnType<typeof resolveStudyDaySchedule>): string {
  if (activity.activity === "before-cycle") return "周期尚未开始";
  if (activity.activity === "rest") return `周期第 ${activity.cycleDay} 天 · 休息日`;
  return `周期第 ${activity.cycleDay} 天 · 第 ${activity.workDay} 个上课日`;
}

function ValidationIssues({ issues }: { issues: CsesValidationIssue[] }) {
  return (
    <ul className={styles.issueList}>
      {issues.slice(0, 12).map((issue, index) => (
        <li key={`${issue.path}-${issue.message}-${index}`}>
          <code>{issue.path}</code>
          <span>{issue.message}</span>
        </li>
      ))}
      {issues.length > 12 && <li>另有 {issues.length - 12} 项错误未展开。</li>}
    </ul>
  );
}

export const ScheduleEditor: React.FC<ScheduleEditorProps> = ({ onRegisterSave }) => {
  const { confirm, notify } = useFeedback();
  const [activeTab, setActiveTab] = useState<EditorTab>("overview");
  const [draft, setDraft] = useState<StudyTimetableSettings>(createDefaultStudyTimetable);
  const [importDocument, setImportDocument] = useState<CsesDocument | null>(null);
  const [importFileName, setImportFileName] = useState("");
  const [importIssues, setImportIssues] = useState<CsesValidationIssue[]>([]);
  const [importBusy, setImportBusy] = useState(false);
  const [fileInputRevision, setFileInputRevision] = useState(0);

  const validation = useMemo(() => validateStudyTimetable(draft), [draft]);
  const resolvedToday = useMemo(() => resolveStudyDaySchedule(draft, getAdjustedDate()), [draft]);
  const cycle = draft.document.configuration.cycle;

  const loadSaved = useCallback(() => {
    try {
      setDraft(structuredClone(readStudyTimetable()));
    } catch (error) {
      logger.error("加载 CSES 课程表失败:", error);
      setDraft(createDefaultStudyTimetable());
    }
  }, []);

  const clearImport = useCallback(() => {
    setImportDocument(null);
    setImportFileName("");
    setImportIssues([]);
    setFileInputRevision((revision) => revision + 1);
  }, []);

  useEffect(() => {
    loadSaved();
    clearImport();
  }, [clearImport, loadSaved]);

  const handleSave = useCallback(() => {
    const result = validateStudyTimetable(draft);
    if (!result.valid) {
      throw new CsesValidationError(result.issues);
    }
    writeStudyTimetable(draft);
    broadcastSettingsEvent(SETTINGS_EVENTS.StudyTimetableUpdated, { timetable: draft });
  }, [draft]);

  useEffect(() => {
    onRegisterSave?.(handleSave);
  }, [handleSave, onRegisterSave]);

  const handleImportFile = useCallback(async (file: File | null) => {
    setImportDocument(null);
    setImportIssues([]);
    setImportFileName(file?.name ?? "");
    if (!file) return;
    if (file.size > MAX_CSES_YAML_BYTES) {
      setImportIssues([{ path: "$", message: "CSES YAML 文件不能超过 1MB" }]);
      return;
    }
    setImportBusy(true);
    try {
      const document = parseCsesYaml(await file.text());
      setImportDocument(document);
    } catch (error) {
      if (error instanceof CsesValidationError) {
        setImportIssues(error.issues);
      } else {
        setImportIssues([
          { path: "$", message: error instanceof Error ? error.message : "读取文件失败" },
        ]);
      }
    } finally {
      setImportBusy(false);
    }
  }, []);

  const applyImport = useCallback(() => {
    if (!importDocument) return;
    setDraft((current) => ({ ...current, document: structuredClone(importDocument) }));
    notify({
      variant: "success",
      title: "已应用到草稿",
      description: "周期锚点保持不变，点击设置底部“保存”后正式生效。",
    });
    clearImport();
  }, [clearImport, importDocument, notify]);

  const handleExport = useCallback(() => {
    if (!validation.valid) {
      notify({
        variant: "danger",
        title: "无法导出",
        description: "请先修正课程表中的校验错误。",
      });
      return;
    }
    downloadYaml(draft.document);
    notify({ variant: "success", title: "CSES YAML 已导出" });
  }, [draft.document, notify, validation.valid]);

  const handleReset = useCallback(async () => {
    const confirmed = await confirm({
      title: "重置课程表",
      description: "当前草稿将替换为默认的上 5 休 2 工作日课表，保存后生效。",
      confirmLabel: "重置草稿",
      variant: "danger",
    });
    if (confirmed) setDraft(createDefaultStudyTimetable());
  }, [confirm]);

  const updateSubject = useCallback(
    (subjectIndex: number, field: keyof CsesSubject, value: string) => {
      setDraft((current) =>
        replaceDocument(current, (document) => {
          const subject = document.subjects[subjectIndex];
          if (!subject) return;
          const previousName = subject.name;
          if (field === "name") {
            subject.name = value;
            document.schedules.forEach((schedule) => {
              schedule.classes.forEach((classValue) => {
                if (classValue.subject === previousName) classValue.subject = value;
              });
            });
            return;
          }
          if (value.trim()) subject[field] = value;
          else delete subject[field];
        })
      );
    },
    []
  );

  const addSubject = useCallback(() => {
    setDraft((current) =>
      replaceDocument(current, (document) => {
        document.subjects.push({
          name: nextUniqueName(
            "新课程",
            document.subjects.map((subject) => subject.name)
          ),
        });
      })
    );
  }, []);

  const deleteSubject = useCallback((subjectIndex: number) => {
    setDraft((current) =>
      replaceDocument(current, (document) => {
        document.subjects.splice(subjectIndex, 1);
      })
    );
  }, []);

  const updateSchedule = useCallback(
    (scheduleIndex: number, update: (schedule: CsesSchedule) => void) => {
      setDraft((current) =>
        replaceDocument(current, (document) => {
          const schedule = document.schedules[scheduleIndex];
          if (schedule) update(schedule);
        })
      );
    },
    []
  );

  const addSchedule = useCallback(() => {
    setDraft((current) =>
      replaceDocument(current, (document) => {
        const usedDays = new Set(document.schedules.flatMap((schedule) => schedule.enable_day));
        const firstAvailableDay =
          Array.from(
            { length: document.configuration.cycle.work_count },
            (_, index) => index + 1
          ).find((day) => !usedDays.has(day)) ?? 1;
        document.schedules.push({
          name: nextUniqueName(
            "日课表",
            document.schedules.map((schedule) => schedule.name)
          ),
          enable_day: [firstAvailableDay],
          classes: [],
        });
      })
    );
  }, []);

  const deleteSchedule = useCallback(
    async (scheduleIndex: number) => {
      const confirmed = await confirm({
        title: "删除日课程表",
        description: "该日课程表及其中全部课时将从草稿中删除。",
        confirmLabel: "删除",
        variant: "danger",
      });
      if (!confirmed) return;
      setDraft((current) =>
        replaceDocument(current, (document) => {
          document.schedules.splice(scheduleIndex, 1);
        })
      );
    },
    [confirm]
  );

  const addClass = useCallback(
    (scheduleIndex: number) => {
      const firstSubject = draft.document.subjects[0]?.name;
      if (!firstSubject) {
        notify({
          variant: "warning",
          title: "请先添加课程",
          description: "课时必须引用课程库中的课程。",
        });
        setActiveTab("subjects");
        return;
      }
      updateSchedule(scheduleIndex, (schedule) => {
        schedule.classes.push(createNewCsesClass(schedule.classes, firstSubject));
      });
    },
    [draft.document.subjects, notify, updateSchedule]
  );

  const updateClass = useCallback(
    (scheduleIndex: number, classIndex: number, update: Partial<CsesClass>) => {
      updateSchedule(scheduleIndex, (schedule) => {
        schedule.classes[classIndex] = { ...schedule.classes[classIndex], ...update };
      });
    },
    [updateSchedule]
  );

  const updateCycleSpans = useCallback((spans: CsesCycleSpan[]) => {
    setDraft((current) =>
      replaceDocument(current, (document) => {
        const counts = deriveCycleCounts(spans);
        document.configuration.cycle = {
          ...document.configuration.cycle,
          ...counts,
          spans,
        };
      })
    );
  }, []);

  const subjectOptions = draft.document.subjects.map((subject) => ({
    value: subject.name,
    label: subject.name,
    description: [subject.teacher, subject.location].filter(Boolean).join(" · ") || undefined,
  }));

  return (
    <div className={styles.editor} aria-label="CSES 课程表编辑器">
      <Tabs
        value={activeTab}
        items={[...EDITOR_TABS]}
        label="课程表编辑分区"
        variant="browser"
        onChange={setActiveTab}
      />

      {!validation.valid && (
        <InfoPanel tone="danger" title={`草稿包含 ${validation.issues.length} 项错误`} role="alert">
          <ValidationIssues issues={validation.issues} />
        </InfoPanel>
      )}

      <div id="schedule-overview-panel" role="tabpanel" hidden={activeTab !== "overview"}>
        <Stack gap="lg">
          <FormSection
            title="今日课程概览"
            description="根据周期锚点和 CSES spans 自动计算今天生效的课程。"
            variant="plain"
            action={
              <StatusPill tone={resolvedToday.activity === "work" ? "success" : "neutral"}>
                {describeResolvedDay(resolvedToday)}
              </StatusPill>
            }
          >
            <SettingGrid className={styles.metricGrid} columns={3}>
              <MetricCard
                icon="feature.schedule"
                label="有效日课程表"
                value={resolvedToday.scheduleNames.length}
                meta={resolvedToday.scheduleNames.join("、") || "今天没有课程表"}
              />
              <MetricCard
                icon="feature.study"
                label="今日课时"
                value={resolvedToday.periods.length}
                meta={
                  resolvedToday.periods.map((period) => period.name).join("、") || "休息日或空课表"
                }
                tone={resolvedToday.periods.length > 0 ? "success" : "neutral"}
              />
              <MetricCard
                icon="feature.sync"
                label="周期"
                value={`${cycle.work_count} 上 / ${cycle.rest_count} 休`}
                meta={`锚点 ${draft.cycleAnchorDate}`}
              />
            </SettingGrid>
          </FormSection>

          <FormSection
            title="CSES YAML"
            description="仅支持 CSES v2。导入先进入预览，导出使用当前已校验草稿。"
            variant="plain"
            action={
              <Button icon="action.download" onClick={handleExport} disabled={!validation.valid}>
                导出 YAML
              </Button>
            }
          >
            <SettingItem
              icon="action.upload"
              title="导入课程表"
              description="支持 .yaml / .yml，最大 1MB；周期锚点不会被文件覆盖。"
            >
              <Input
                key={fileInputRevision}
                type="file"
                label="CSES YAML 文件"
                accept=".yaml,.yml,application/yaml,text/yaml,text/x-yaml"
                buttonText={importBusy ? "解析中…" : "选择文件"}
                fileName={importFileName}
                disabled={importBusy}
                onFileChange={handleImportFile}
              />
            </SettingItem>
            {importIssues.length > 0 && (
              <InfoPanel tone="danger" title="导入被拒绝" role="alert">
                <ValidationIssues issues={importIssues} />
              </InfoPanel>
            )}
            {importDocument && (
              <InfoPanel tone="success" title="文件校验通过">
                <Stack gap="sm">
                  <span>
                    {importDocument.configuration.name} · {importDocument.subjects.length} 门课程 ·{" "}
                    {importDocument.schedules.length} 个日课程表
                  </span>
                  <Inline align="left">
                    <Button variant="primary" icon="action.apply" onClick={applyImport}>
                      覆盖当前草稿
                    </Button>
                    <Button variant="secondary" onClick={clearImport}>
                      取消预览
                    </Button>
                  </Inline>
                </Stack>
              </InfoPanel>
            )}
          </FormSection>

          <FormSection
            title="草稿操作"
            description="所有修改仍由设置面板底部的保存按钮统一提交。"
            variant="plain"
          >
            <Inline align="left">
              <Button icon="action.restoreSaved" onClick={loadSaved}>
                恢复已保存
              </Button>
              <Button variant="danger" icon="action.reset" onClick={() => void handleReset()}>
                重置默认模板
              </Button>
            </Inline>
          </FormSection>
        </Stack>
      </div>

      <div id="schedule-subjects-panel" role="tabpanel" hidden={activeTab !== "subjects"}>
        <FormSection
          title="课程库"
          description="课程名称是 CSES 课时引用键；重命名会同步更新所有日课程表。"
          variant="plain"
          action={
            <Button size="sm" variant="primary" icon="action.add" onClick={addSubject}>
              添加课程
            </Button>
          }
        >
          <div className={styles.subjectList}>
            {draft.document.subjects.length === 0 && (
              <InfoPanel tone="warning">课程库为空，添加课程后才能创建课时。</InfoPanel>
            )}
            {draft.document.subjects.map((subject, subjectIndex) => {
              const referenceCount = draft.document.schedules.reduce(
                (count, schedule) =>
                  count +
                  schedule.classes.filter((classValue) => classValue.subject === subject.name)
                    .length,
                0
              );
              return (
                <article className={styles.subjectRow} key={subjectIndex}>
                  <header className={styles.dataRowHeader}>
                    <div className={styles.dataRowIdentity}>
                      <span className={styles.dataRowIndex} aria-hidden="true">
                        {String(subjectIndex + 1).padStart(2, "0")}
                      </span>
                      <div>
                        <h4>{subject.name || `未命名课程 ${subjectIndex + 1}`}</h4>
                        <span>
                          {referenceCount > 0
                            ? `被 ${referenceCount} 个课时引用 · 需先移除引用才能删除`
                            : "未被课时引用"}
                        </span>
                      </div>
                    </div>
                    <IconButton
                      aria-label={`删除课程 ${subject.name || subjectIndex + 1}`}
                      icon="action.delete"
                      size="sm"
                      variant="danger"
                      disabled={referenceCount > 0}
                      onClick={() => deleteSubject(subjectIndex)}
                    />
                  </header>
                  <div className={styles.subjectFields}>
                    <Input
                      label="课程名称"
                      value={subject.name}
                      onChange={(event) => updateSubject(subjectIndex, "name", event.target.value)}
                    />
                    <Input
                      label="简称"
                      value={subject.simplified_name ?? ""}
                      onChange={(event) =>
                        updateSubject(subjectIndex, "simplified_name", event.target.value)
                      }
                    />
                    <Input
                      label="教师"
                      value={subject.teacher ?? ""}
                      onChange={(event) =>
                        updateSubject(subjectIndex, "teacher", event.target.value)
                      }
                    />
                    <Input
                      label="地点"
                      value={subject.location ?? ""}
                      onChange={(event) =>
                        updateSubject(subjectIndex, "location", event.target.value)
                      }
                    />
                  </div>
                </article>
              );
            })}
          </div>
        </FormSection>
      </div>

      <div id="schedule-schedules-panel" role="tabpanel" hidden={activeTab !== "schedules"}>
        <FormSection
          title="日课程表"
          description="一个日课程表可以在多个上课日生效；同一天的多个日课程表会合并。"
          variant="plain"
          action={
            <Button size="sm" variant="primary" icon="action.add" onClick={addSchedule}>
              添加日课程表
            </Button>
          }
        >
          <div className={styles.scheduleList}>
            {draft.document.schedules.length === 0 && (
              <InfoPanel tone="warning">当前没有日课程表，所有上课日都将没有课程。</InfoPanel>
            )}
            {draft.document.schedules.map((schedule, scheduleIndex) => (
              <section className={styles.scheduleSection} key={scheduleIndex}>
                <header className={styles.scheduleHeader}>
                  <div className={styles.dataRowIdentity}>
                    <span className={styles.dataRowIndex} aria-hidden="true">
                      {String(scheduleIndex + 1).padStart(2, "0")}
                    </span>
                    <div>
                      <h4>{schedule.name || `未命名日课程表 ${scheduleIndex + 1}`}</h4>
                      <span>
                        {schedule.enable_day.length} 个启用日 · {schedule.classes.length} 个课时
                      </span>
                    </div>
                  </div>
                  <IconButton
                    aria-label={`删除日课程表 ${schedule.name || scheduleIndex + 1}`}
                    icon="action.delete"
                    size="sm"
                    variant="danger"
                    onClick={() => void deleteSchedule(scheduleIndex)}
                  />
                </header>

                <div className={styles.scheduleSetup}>
                  <Input
                    label="日课程表名称"
                    value={schedule.name}
                    onChange={(event) =>
                      updateSchedule(scheduleIndex, (current) => {
                        current.name = event.target.value;
                      })
                    }
                  />
                  <fieldset className={styles.dayGroup}>
                    <legend>启用上课日</legend>
                    <div
                      className={styles.daySelector}
                      role="group"
                      aria-label={`${schedule.name}启用日`}
                    >
                      {Array.from({ length: cycle.work_count }, (_, index) => index + 1).map(
                        (day) => (
                          <Checkbox
                            key={day}
                            label={`第 ${day} 日`}
                            checked={schedule.enable_day.includes(day)}
                            onChange={(event) =>
                              updateSchedule(scheduleIndex, (current) => {
                                current.enable_day = event.target.checked
                                  ? [...current.enable_day, day].sort(
                                      (first, second) => first - second
                                    )
                                  : current.enable_day.filter((value) => value !== day);
                              })
                            }
                          />
                        )
                      )}
                    </div>
                  </fieldset>
                </div>

                <div className={styles.classSection}>
                  <header className={styles.subsectionHeader}>
                    <div>
                      <h5>课时安排</h5>
                      <span>按实际执行顺序排列，时间精确到秒。</span>
                    </div>
                    <Inline gap="xs">
                      <Button
                        size="sm"
                        variant="primary"
                        icon="action.add"
                        onClick={() => addClass(scheduleIndex)}
                      >
                        添加课时
                      </Button>
                      <Button
                        size="sm"
                        icon="action.sort"
                        disabled={schedule.classes.length < 2}
                        onClick={() =>
                          updateSchedule(scheduleIndex, (current) => {
                            current.classes.sort(
                              (first, second) =>
                                (parseCsesTime(first.start_time) ?? Number.POSITIVE_INFINITY) -
                                (parseCsesTime(second.start_time) ?? Number.POSITIVE_INFINITY)
                            );
                          })
                        }
                      >
                        按时间排序
                      </Button>
                    </Inline>
                  </header>

                  <div className={styles.classList}>
                    {schedule.classes.length === 0 && (
                      <InfoPanel>该日课程表尚未添加课时。</InfoPanel>
                    )}
                    {schedule.classes.map((classValue, classIndex) => (
                      <article
                        className={styles.classRow}
                        key={classIndex}
                        aria-label={`第 ${classIndex + 1} 个课时`}
                      >
                        <div className={styles.classOrder}>
                          <strong>{String(classIndex + 1).padStart(2, "0")}</strong>
                          <span>{classValue.start_time || "--:--:--"}</span>
                        </div>
                        <div className={styles.classFields}>
                          <div className={styles.classSubjectField}>
                            <Dropdown
                              label="课程"
                              searchable
                              value={classValue.subject}
                              options={subjectOptions}
                              onChange={(value) =>
                                updateClass(scheduleIndex, classIndex, {
                                  subject: typeof value === "string" ? value : "",
                                })
                              }
                            />
                          </div>
                          <Input
                            label="开始时间"
                            type="time"
                            step={1}
                            value={classValue.start_time}
                            onChange={(event) =>
                              updateClass(scheduleIndex, classIndex, {
                                start_time: event.target.value,
                              })
                            }
                          />
                          <Input
                            label="结束时间"
                            type="time"
                            step={1}
                            value={classValue.end_time}
                            onChange={(event) =>
                              updateClass(scheduleIndex, classIndex, {
                                end_time: event.target.value,
                              })
                            }
                          />
                        </div>
                        <Inline className={styles.classActions} gap="xs" wrap={false}>
                          <IconButton
                            aria-label="上移课时"
                            icon="action.moveUp"
                            size="sm"
                            variant="ghost"
                            disabled={classIndex === 0}
                            onClick={() =>
                              updateSchedule(scheduleIndex, (current) => {
                                current.classes = moveItem(current.classes, classIndex, "up");
                              })
                            }
                          />
                          <IconButton
                            aria-label="下移课时"
                            icon="action.moveDown"
                            size="sm"
                            variant="ghost"
                            disabled={classIndex === schedule.classes.length - 1}
                            onClick={() =>
                              updateSchedule(scheduleIndex, (current) => {
                                current.classes = moveItem(current.classes, classIndex, "down");
                              })
                            }
                          />
                          <IconButton
                            aria-label="复制课时"
                            icon="action.copy"
                            size="sm"
                            variant="ghost"
                            onClick={() =>
                              updateSchedule(scheduleIndex, (current) => {
                                current.classes.splice(
                                  classIndex + 1,
                                  0,
                                  structuredClone(classValue)
                                );
                              })
                            }
                          />
                          <IconButton
                            aria-label="删除课时"
                            icon="action.delete"
                            size="sm"
                            variant="danger"
                            onClick={() =>
                              updateSchedule(scheduleIndex, (current) => {
                                current.classes.splice(classIndex, 1);
                              })
                            }
                          />
                        </Inline>
                      </article>
                    ))}
                  </div>
                </div>
              </section>
            ))}
          </div>
        </FormSection>
      </div>

      <div id="schedule-cycle-panel" role="tabpanel" hidden={activeTab !== "cycle"}>
        <Stack gap="lg">
          <FormSection title="配置说明" description="名称与描述会写入 CSES YAML。" variant="plain">
            <SettingGrid>
              <Input
                label="配置名称"
                value={draft.document.configuration.name}
                onChange={(event) =>
                  setDraft((current) =>
                    replaceDocument(current, (document) => {
                      document.configuration.name = event.target.value;
                    })
                  )
                }
              />
              <Input
                label="周期锚点"
                type="date"
                hint="对应 spans 中的第 1 个日历日，仅保存在本应用"
                value={draft.cycleAnchorDate}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, cycleAnchorDate: event.target.value }))
                }
              />
            </SettingGrid>
            <Textarea
              label="配置描述"
              value={draft.document.configuration.description}
              onChange={(event) =>
                setDraft((current) =>
                  replaceDocument(current, (document) => {
                    document.configuration.description = event.target.value;
                  })
                )
              }
            />
          </FormSection>

          <FormSection
            title="周期 spans"
            description="上课日与休息日总数由 spans 自动计算，避免 CSES 冗余字段不一致。"
            variant="plain"
            action={
              <StatusPill tone="info">{`${cycle.work_count} 上 / ${cycle.rest_count} 休`}</StatusPill>
            }
          >
            <div className={styles.spanList}>
              {cycle.spans.map((span, spanIndex) => (
                <article
                  className={styles.spanRow}
                  data-activity={span.activity}
                  key={`${spanIndex}-${span.activity}`}
                >
                  <div className={styles.spanSummary}>
                    <span className={styles.dataRowIndex} aria-hidden="true">
                      {String(spanIndex + 1).padStart(2, "0")}
                    </span>
                    <div>
                      <strong>{span.activity === "work" ? "连续上课" : "连续休息"}</strong>
                      <span>周期片段 {spanIndex + 1}</span>
                    </div>
                  </div>
                  <div className={styles.spanFields}>
                    <Dropdown
                      label="活动类型"
                      value={span.activity}
                      options={[
                        { value: "work", label: "上课" },
                        { value: "rest", label: "休息" },
                      ]}
                      onChange={(value) => {
                        const spans = structuredClone(cycle.spans);
                        spans[spanIndex].activity = value === "rest" ? "rest" : "work";
                        updateCycleSpans(spans);
                      }}
                    />
                    <Input
                      label="连续天数"
                      type="number"
                      min={1}
                      step={1}
                      suffix="天"
                      value={span.count}
                      onChange={(event) => {
                        const spans = structuredClone(cycle.spans);
                        spans[spanIndex].count = Number(event.target.value);
                        updateCycleSpans(spans);
                      }}
                    />
                  </div>
                  <Inline className={styles.spanActions} gap="xs" wrap={false}>
                    <IconButton
                      aria-label="上移周期片段"
                      icon="action.moveUp"
                      size="sm"
                      variant="ghost"
                      disabled={spanIndex === 0}
                      onClick={() => updateCycleSpans(moveItem(cycle.spans, spanIndex, "up"))}
                    />
                    <IconButton
                      aria-label="下移周期片段"
                      icon="action.moveDown"
                      size="sm"
                      variant="ghost"
                      disabled={spanIndex === cycle.spans.length - 1}
                      onClick={() => updateCycleSpans(moveItem(cycle.spans, spanIndex, "down"))}
                    />
                    <IconButton
                      aria-label="删除周期片段"
                      icon="action.delete"
                      size="sm"
                      variant="danger"
                      onClick={() =>
                        updateCycleSpans(cycle.spans.filter((_, index) => index !== spanIndex))
                      }
                    />
                  </Inline>
                </article>
              ))}
            </div>
            <Inline align="left">
              <Button
                size="sm"
                icon="action.add"
                onClick={() => updateCycleSpans([...cycle.spans, { activity: "work", count: 1 }])}
              >
                添加上课片段
              </Button>
              <Button
                size="sm"
                icon="action.add"
                onClick={() => updateCycleSpans([...cycle.spans, { activity: "rest", count: 1 }])}
              >
                添加休息片段
              </Button>
            </Inline>
          </FormSection>
        </Stack>
      </div>
    </div>
  );
};

export default ScheduleEditor;
