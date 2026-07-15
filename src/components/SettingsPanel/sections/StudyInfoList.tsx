import React, { useMemo, useState } from "react";

import type {
  StudyInfoCarouselSettings,
  StudyInfoItemConfig,
  StudyNextScheduleLeadMinutes,
  StudyProgressKind,
  StudyRainLeadMinutes,
} from "../../../types";
import {
  AppIcon,
  Button as FormButton,
  Dropdown,
  IconButton,
  Input as FormInput,
  Select as FormSelect,
  SettingItem,
  Slider as FormSlider,
  VisuallyHidden,
  type AppIconName,
  type DropdownGroup,
} from "../../../ui";
import {
  MAX_STUDY_INFO_INTERVAL_SEC,
  MAX_STUDY_INFO_ITEMS,
  MAX_STUDY_INFO_TEXT_LENGTH,
  MIN_STUDY_INFO_INTERVAL_SEC,
  STUDY_INFO_BUILTIN_IDS,
} from "../../../utils/appSettings";

import styles from "./StudyInfoList.module.css";

type ProgressItem = Extract<StudyInfoItemConfig, { source: "progress" }>;
type NextScheduleItem = Extract<StudyInfoItemConfig, { source: "nextSchedule" }>;
type RainItem = Extract<StudyInfoItemConfig, { source: "rain" }>;
type CustomItem = Extract<StudyInfoItemConfig, { source: "custom" }>;

interface StudyInfoListProps {
  settings: StudyInfoCarouselSettings;
  onChange: (settings: StudyInfoCarouselSettings) => void;
}

const PROGRESS_OPTIONS = [
  { value: "day", label: "24 小时进度" },
  { value: "schedule", label: "课时/课间进度" },
];

const NEXT_SCHEDULE_LEAD_OPTIONS = [
  { value: "always", label: "始终显示" },
  { value: "120", label: "提前 120 分钟" },
  { value: "60", label: "提前 60 分钟" },
  { value: "30", label: "提前 30 分钟" },
  { value: "15", label: "提前 15 分钟" },
];

const RAIN_LEAD_OPTIONS = [
  { value: "60", label: "提前 60 分钟" },
  { value: "30", label: "提前 30 分钟" },
  { value: "15", label: "提前 15 分钟" },
  { value: "10", label: "提前 10 分钟" },
];

function sortItems(items: StudyInfoItemConfig[]): StudyInfoItemConfig[] {
  return items
    .map((item, originalIndex) => ({ item, originalIndex }))
    .sort(
      (left, right) =>
        left.item.order - right.item.order || left.originalIndex - right.originalIndex
    )
    .map(({ item }) => item);
}

function getProgressLabel(kind: StudyProgressKind): string {
  return kind === "schedule" ? "课时/课间进度" : "24 小时进度";
}

function getItemTitle(item: StudyInfoItemConfig): string {
  if (item.source === "progress") return getProgressLabel(item.progressKind);
  if (item.source === "nextSchedule") return "下一课时";
  if (item.source === "rain") return "短时降雨";
  return item.text.trim() || "自定义文案";
}

function getItemIcon(item: StudyInfoItemConfig): AppIconName {
  if (item.source === "progress") return "feature.progress";
  if (item.source === "nextSchedule") return "feature.event";
  if (item.source === "rain") return "feature.weatherPrecipitation";
  return "feature.message";
}

function getLeadLabel(leadMinutes: StudyNextScheduleLeadMinutes | StudyRainLeadMinutes): string {
  return leadMinutes === "always" ? "始终显示" : `提前 ${leadMinutes} 分钟`;
}

function getItemDescription(item: StudyInfoItemConfig): string {
  if (item.source === "progress") {
    return item.progressKind === "schedule"
      ? "中央内容与后方进度同步使用当前课程表。"
      : "中央内容与后方进度同步显示今日 24 小时进度。";
  }

  const background = getProgressLabel(item.backgroundProgressKind);
  if (item.source === "custom") return `提示信息 · 背景：${background}`;
  return `提示信息 · ${getLeadLabel(item.leadMinutes)} · 背景：${background}`;
}

function getBuiltinProgressId(kind: StudyProgressKind): string {
  return kind === "schedule"
    ? STUDY_INFO_BUILTIN_IDS.progressSchedule
    : STUDY_INFO_BUILTIN_IDS.progressDay;
}

function createBuiltinItem(kind: "progress-day" | "progress-schedule" | "nextSchedule" | "rain") {
  if (kind === "progress-day" || kind === "progress-schedule") {
    const progressKind: StudyProgressKind = kind === "progress-schedule" ? "schedule" : "day";
    return {
      id: getBuiltinProgressId(progressKind),
      source: "progress",
      progressKind,
      enabled: true,
      order: 0,
    } satisfies ProgressItem;
  }
  if (kind === "nextSchedule") {
    return {
      id: STUDY_INFO_BUILTIN_IDS.nextSchedule,
      source: "nextSchedule",
      backgroundProgressKind: "day",
      leadMinutes: "always",
      enabled: true,
      order: 0,
    } satisfies NextScheduleItem;
  }
  return {
    id: STUDY_INFO_BUILTIN_IDS.rain,
    source: "rain",
    backgroundProgressKind: "day",
    leadMinutes: 30,
    enabled: true,
    order: 0,
  } satisfies RainItem;
}

function createCustomItem(existingIds: Set<string>): CustomItem {
  let suffix = 1;
  let id = `custom-${Date.now()}-${suffix}`;
  while (existingIds.has(id)) {
    suffix += 1;
    id = `custom-${Date.now()}-${suffix}`;
  }
  return {
    id,
    source: "custom",
    backgroundProgressKind: "day",
    enabled: true,
    order: 0,
    text: "",
  };
}

export function StudyInfoList({ settings, onChange }: StudyInfoListProps) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set());
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");

  const orderedItems = useMemo(() => sortItems(settings.items), [settings.items]);
  const enabledItems = useMemo(() => orderedItems.filter((item) => item.enabled), [orderedItems]);
  const disabledCustomItems = useMemo(
    () =>
      orderedItems.filter((item): item is CustomItem => item.source === "custom" && !item.enabled),
    [orderedItems]
  );
  const atLimit = enabledItems.length >= MAX_STUDY_INFO_ITEMS;

  const commitItems = (items: StudyInfoItemConfig[]) => {
    onChange({
      ...settings,
      items: items.map((item, order) => ({ ...item, order })),
    });
  };

  const commitEnabledOrder = (
    allItems: StudyInfoItemConfig[],
    enabledOrder: StudyInfoItemConfig[]
  ) => {
    const enabledIds = new Set(enabledOrder.map((item) => item.id));
    const inactive = sortItems(allItems).filter((item) => !enabledIds.has(item.id));
    commitItems([...enabledOrder, ...inactive]);
  };

  const replaceItem = (nextItem: StudyInfoItemConfig) => {
    commitItems(orderedItems.map((item) => (item.id === nextItem.id ? nextItem : item)));
  };

  const setItemEnabled = (id: string, enabled: boolean) => {
    const item = orderedItems.find((candidate) => candidate.id === id);
    if (!item || (enabled && !item.enabled && atLimit)) return;
    const updated = { ...item, enabled } as StudyInfoItemConfig;
    const allItems = orderedItems.map((candidate) => (candidate.id === id ? updated : candidate));
    const nextEnabled = enabled
      ? [...enabledItems.filter((candidate) => candidate.id !== id), updated]
      : enabledItems.filter((candidate) => candidate.id !== id);
    commitEnabledOrder(allItems, nextEnabled);
    setAnnouncement(
      enabled
        ? `已将${getItemTitle(item)}添加到第 ${nextEnabled.length} 项`
        : `已移出${getItemTitle(item)}`
    );
  };

  const addBuiltinItem = (kind: "progress-day" | "progress-schedule" | "nextSchedule" | "rain") => {
    if (atLimit) return;
    const existing = orderedItems.find((item) => {
      if (kind === "progress-day" || kind === "progress-schedule") {
        const progressKind = kind === "progress-schedule" ? "schedule" : "day";
        return item.source === "progress" && item.progressKind === progressKind;
      }
      return item.source === kind;
    });
    if (existing) {
      setItemEnabled(existing.id, true);
      return;
    }
    const created = createBuiltinItem(kind);
    commitEnabledOrder([...orderedItems, created], [...enabledItems, created]);
    setAnnouncement(`已将${getItemTitle(created)}添加到第 ${enabledItems.length + 1} 项`);
  };

  const addCustomItem = () => {
    if (atLimit) return;
    const created = createCustomItem(new Set(orderedItems.map((item) => item.id)));
    commitEnabledOrder([...orderedItems, created], [...enabledItems, created]);
    setExpandedIds((current) => new Set(current).add(created.id));
    setAnnouncement(`已添加自定义文案，当前为第 ${enabledItems.length + 1} 项`);
  };

  const deleteCustomItem = (id: string) => {
    const item = orderedItems.find((candidate) => candidate.id === id);
    if (!item || item.source !== "custom") return;
    commitItems(orderedItems.filter((candidate) => candidate.id !== id));
    setExpandedIds((current) => {
      const next = new Set(current);
      next.delete(id);
      return next;
    });
    setAnnouncement("已永久删除自定义文案");
  };

  const moveItem = (id: string, direction: -1 | 1, announce = true) => {
    const sourceIndex = enabledItems.findIndex((item) => item.id === id);
    const targetIndex = sourceIndex + direction;
    if (sourceIndex < 0 || targetIndex < 0 || targetIndex >= enabledItems.length) return;
    const next = [...enabledItems];
    const [moved] = next.splice(sourceIndex, 1);
    next.splice(targetIndex, 0, moved);
    commitEnabledOrder(orderedItems, next);
    if (announce) setAnnouncement(`已将${getItemTitle(moved)}移至第 ${targetIndex + 1} 项`);
  };

  const moveItemTo = (id: string, targetId: string) => {
    const sourceIndex = enabledItems.findIndex((item) => item.id === id);
    const targetIndex = enabledItems.findIndex((item) => item.id === targetId);
    if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) return;
    const next = [...enabledItems];
    const [moved] = next.splice(sourceIndex, 1);
    next.splice(targetIndex, 0, moved);
    commitEnabledOrder(orderedItems, next);
  };

  const toggleExpanded = (id: string) => {
    setExpandedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleAddSelection = (value: string) => {
    if (!value) return;
    if (value === "new-custom") {
      addCustomItem();
      return;
    }
    if (value.startsWith("restore:")) {
      setItemEnabled(value.slice("restore:".length), true);
      return;
    }
    addBuiltinItem(value as "progress-day" | "progress-schedule" | "nextSchedule" | "rain");
  };

  const hasEnabledBuiltin = (
    kind: "progress-day" | "progress-schedule" | "nextSchedule" | "rain"
  ) =>
    enabledItems.some((item) => {
      if (kind === "progress-day" || kind === "progress-schedule") {
        const progressKind = kind === "progress-schedule" ? "schedule" : "day";
        return item.source === "progress" && item.progressKind === progressKind;
      }
      return item.source === kind;
    });

  const addDropdownGroups: DropdownGroup[] = [
    {
      label: "进度信息",
      options: [
        {
          value: "progress-day",
          label: `24 小时进度${hasEnabledBuiltin("progress-day") ? "（已添加）" : ""}`,
          disabled: atLimit || hasEnabledBuiltin("progress-day"),
          icon: "feature.progress",
        },
        {
          value: "progress-schedule",
          label: `课时/课间进度${hasEnabledBuiltin("progress-schedule") ? "（已添加）" : ""}`,
          disabled: atLimit || hasEnabledBuiltin("progress-schedule"),
          icon: "feature.progress",
        },
      ],
    },
    {
      label: "提示信息",
      options: [
        {
          value: "nextSchedule",
          label: `下一课时${hasEnabledBuiltin("nextSchedule") ? "（已添加）" : ""}`,
          disabled: atLimit || hasEnabledBuiltin("nextSchedule"),
          icon: "feature.event",
        },
        {
          value: "rain",
          label: `短时降雨${hasEnabledBuiltin("rain") ? "（已添加）" : ""}`,
          disabled: atLimit || hasEnabledBuiltin("rain"),
          icon: "feature.weatherPrecipitation",
        },
        {
          value: "new-custom",
          label: "新建自定义文案",
          disabled: atLimit,
          icon: "feature.message",
        },
        ...disabledCustomItems.map((item, index) => ({
          value: `restore:${item.id}`,
          label: `恢复：${item.text.trim() || `未命名文案 ${index + 1}`}`,
          disabled: atLimit,
          icon: "action.restoreSaved" as const,
        })),
      ],
    },
  ];

  return (
    <div className={styles.root}>
      <div className={styles.toolbar}>
        <Dropdown
          className={styles.addField}
          groups={addDropdownGroups}
          label="添加信息"
          placeholder="选择要添加的信息"
          prefixIcon="action.add"
          value=""
          onChange={(value) => handleAddSelection(String(value ?? ""))}
        />
        <span className={styles.helperText}>
          {enabledItems.length > 1 ? "将按下方顺序自动轮播" : "添加两项后自动轮播"}
        </span>
      </div>

      {enabledItems.length === 0 ? (
        <div className={styles.emptyState}>未选择信息，顶部进度与信息将隐藏。</div>
      ) : (
        <ol className={styles.list} aria-label="已选中央信息">
          {enabledItems.map((item, index) => {
            const isExpanded = expandedIds.has(item.id);
            const configurable = item.source !== "progress";
            return (
              <li className={styles.listItem} key={item.id}>
                <SettingItem
                  className={styles.item}
                  icon={getItemIcon(item)}
                  title={getItemTitle(item)}
                  description={getItemDescription(item)}
                  tone={draggingId === item.id ? "accent" : "neutral"}
                  onDragOver={(event) => {
                    if (!draggingId) return;
                    event.preventDefault();
                    moveItemTo(draggingId, item.id);
                  }}
                  onDrop={(event) => {
                    event.preventDefault();
                    if (!draggingId) return;
                    const droppedIndex = enabledItems.findIndex(
                      (candidate) => candidate.id === draggingId
                    );
                    const droppedItem = enabledItems[droppedIndex];
                    if (droppedItem) {
                      setAnnouncement(
                        `已将${getItemTitle(droppedItem)}移至第 ${droppedIndex + 1} 项`
                      );
                    }
                    setDraggingId(null);
                  }}
                  control={
                    <div className={styles.actions}>
                      <span
                        aria-label={`拖动${getItemTitle(item)}排序`}
                        className={styles.dragHandle}
                        draggable
                        role="img"
                        onDragStart={(event) => {
                          setDraggingId(item.id);
                          event.dataTransfer.effectAllowed = "move";
                          event.dataTransfer.setData("text/plain", item.id);
                        }}
                        onDragEnd={() => setDraggingId(null)}
                      >
                        <AppIcon name="action.drag" size="sm" />
                      </span>
                      <IconButton
                        variant="ghost"
                        size="sm"
                        icon="action.moveUp"
                        aria-label={`上移${getItemTitle(item)}`}
                        onClick={() => moveItem(item.id, -1)}
                        disabled={index === 0}
                      />
                      <IconButton
                        variant="ghost"
                        size="sm"
                        icon="action.moveDown"
                        aria-label={`下移${getItemTitle(item)}`}
                        onClick={() => moveItem(item.id, 1)}
                        disabled={index === enabledItems.length - 1}
                      />
                      {configurable && (
                        <IconButton
                          variant="ghost"
                          size="sm"
                          icon={isExpanded ? "action.collapse" : "action.configure"}
                          aria-label={`${isExpanded ? "收起" : "配置"}${getItemTitle(item)}`}
                          aria-controls={`study-info-config-${item.id}`}
                          aria-expanded={isExpanded}
                          onClick={() => toggleExpanded(item.id)}
                        />
                      )}
                      <IconButton
                        variant="ghost"
                        size="sm"
                        icon="action.close"
                        aria-label={`移出${getItemTitle(item)}`}
                        onClick={() => setItemEnabled(item.id, false)}
                      />
                    </div>
                  }
                >
                  {isExpanded && item.source !== "progress" && (
                    <div className={styles.configGrid} id={`study-info-config-${item.id}`}>
                      <FormSelect
                        label="背景进度"
                        value={item.backgroundProgressKind}
                        options={PROGRESS_OPTIONS}
                        onChange={(event) =>
                          replaceItem({
                            ...item,
                            backgroundProgressKind: event.target.value as StudyProgressKind,
                          })
                        }
                      />
                      {item.source === "nextSchedule" && (
                        <FormSelect
                          label="显示时机"
                          value={String(item.leadMinutes)}
                          options={NEXT_SCHEDULE_LEAD_OPTIONS}
                          onChange={(event) =>
                            replaceItem({
                              ...item,
                              leadMinutes:
                                event.target.value === "always"
                                  ? "always"
                                  : (Number(event.target.value) as Exclude<
                                      StudyNextScheduleLeadMinutes,
                                      "always"
                                    >),
                            })
                          }
                        />
                      )}
                      {item.source === "rain" && (
                        <FormSelect
                          label="显示时机"
                          value={String(item.leadMinutes)}
                          options={RAIN_LEAD_OPTIONS}
                          onChange={(event) =>
                            replaceItem({
                              ...item,
                              leadMinutes: Number(event.target.value) as StudyRainLeadMinutes,
                            })
                          }
                        />
                      )}
                      {item.source === "custom" && (
                        <>
                          <FormInput
                            label="文案内容"
                            value={item.text}
                            maxLength={MAX_STUDY_INFO_TEXT_LENGTH}
                            placeholder="例如：记得完成今日复盘"
                            onChange={(event) => replaceItem({ ...item, text: event.target.value })}
                          />
                          <FormButton
                            className={styles.deleteButton}
                            variant="danger"
                            size="sm"
                            icon="action.delete"
                            onClick={() => deleteCustomItem(item.id)}
                          >
                            永久删除
                          </FormButton>
                        </>
                      )}
                    </div>
                  )}
                </SettingItem>
              </li>
            );
          })}
        </ol>
      )}

      {enabledItems.length > 1 && (
        <SettingItem
          icon="feature.carousel"
          title="轮播间隔"
          description="多个可显示信息之间自动切换，提醒仍会按时优先显示。"
        >
          <FormSlider
            aria-label="信息轮播间隔"
            label="信息轮播间隔"
            min={MIN_STUDY_INFO_INTERVAL_SEC}
            max={MAX_STUDY_INFO_INTERVAL_SEC}
            step={1}
            value={Math.max(
              MIN_STUDY_INFO_INTERVAL_SEC,
              Math.min(MAX_STUDY_INFO_INTERVAL_SEC, settings.intervalSec)
            )}
            onChange={(value) => onChange({ ...settings, intervalSec: Math.round(value) })}
            formatValue={(value) => `${Math.round(value)} 秒`}
            rangeLabels={[`${MIN_STUDY_INFO_INTERVAL_SEC} 秒`, `${MAX_STUDY_INFO_INTERVAL_SEC} 秒`]}
          />
        </SettingItem>
      )}

      <VisuallyHidden role="status" aria-live="polite" aria-atomic="true">
        {announcement}
      </VisuallyHidden>
    </div>
  );
}
