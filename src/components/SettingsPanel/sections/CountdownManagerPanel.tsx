import React, { useCallback, useEffect, useState } from "react";

import { useAppDispatch, useAppState } from "../../../contexts/AppContext";
import { CountdownItem, type CountdownQuickEventKind } from "../../../types";
import {
  Button as FormButton,
  InfoPanel,
  Inline as FormButtonGroup,
  Input as FormInput,
  SettingGrid,
  SettingItem,
  StatusPill,
} from "../../../ui";
import {
  COUNTDOWN_EVENT_PRESETS,
  getCountdownEventPreset,
  isCountdownQuickEventKind,
} from "../../../utils/countdownEvents";
import styles from "../SettingsPanel.module.css";

interface CountdownDraftItem {
  id: string;
  kind: CountdownItem["kind"];
  name?: string;
  targetDate?: string; // YYYY-MM-DD
  order?: number;
}

export interface CountdownManagerPanelProps {
  onRegisterSave?: (fn: () => void) => void;
}

/**
 * 倒计时管理：添加/删除/编辑/拖拽排序
 */
export const CountdownManagerPanel: React.FC<CountdownManagerPanelProps> = ({ onRegisterSave }) => {
  const { study } = useAppState();
  const dispatch = useAppDispatch();
  const [items, setItems] = useState<CountdownDraftItem[]>([]);
  const [draggingId, setDraggingId] = useState<string | null>(null);

  // 初始化草稿
  useEffect(() => {
    const origin = (study.countdownItems || []) as CountdownDraftItem[];
    const init: CountdownDraftItem[] =
      origin.length > 0
        ? [...origin].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
        : [{ id: "gaokao-default", kind: "gaokao", name: "高考倒计时", order: 0 }];
    setItems(init.map((item, index) => ({ ...item, order: index })));
  }, [study.countdownItems]);

  // 保存注册
  useEffect(() => {
    onRegisterSave?.(() => {
      // 重新编号 order 并持久化，确保字段完整且按类型规范
      const normalized: CountdownItem[] = items.map((it, idx) => ({
        id: it.id,
        kind: it.kind,
        name:
          it.name && it.name.trim().length > 0
            ? it.name.trim()
            : isCountdownQuickEventKind(it.kind)
              ? getCountdownEventPreset(it.kind).name
              : "自定义事件",
        targetDate:
          it.kind === "custom" ? (it.targetDate && it.targetDate.trim()) || "" : undefined,
        order: idx,
      }));
      dispatch({ type: "SET_COUNTDOWN_ITEMS", payload: normalized });
    });
  }, [onRegisterSave, items, dispatch]);

  const addCustom = useCallback(() => {
    const id = `custom-${Date.now()}`;
    const nextOrder = items.length;
    setItems([
      ...items,
      {
        id,
        kind: "custom",
        name: "期末考试",
        targetDate: "",
        order: nextOrder,
      },
    ]);
  }, [items]);

  const addQuickEvent = useCallback(
    (kind: CountdownQuickEventKind) => {
      const id = `${kind}-${Date.now()}`;
      const nextOrder = items.length;
      setItems([
        ...items,
        {
          id,
          kind,
          name: getCountdownEventPreset(kind).name,
          order: nextOrder,
        },
      ]);
    },
    [items]
  );

  const updateItem = useCallback((id: string, patch: Partial<CountdownDraftItem>) => {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  }, []);

  const removeItem = useCallback((id: string) => {
    setItems((prev) => prev.filter((it) => it.id !== id).map((it, idx) => ({ ...it, order: idx })));
  }, []);

  // 拖拽排序
  const onDragStart = useCallback((id: string) => setDraggingId(id), []);
  const onDragOver = useCallback(
    (e: React.DragEvent<HTMLDivElement>, overId: string) => {
      e.preventDefault();
      const fromIndex = items.findIndex((it) => it.id === draggingId);
      const toIndex = items.findIndex((it) => it.id === overId);
      if (draggingId && fromIndex >= 0 && toIndex >= 0 && fromIndex !== toIndex) {
        const next = [...items];
        const [moved] = next.splice(fromIndex, 1);
        next.splice(toIndex, 0, moved);
        setItems(next.map((it, idx) => ({ ...it, order: idx })));
      }
    },
    [draggingId, items]
  );
  const onDragEnd = useCallback(() => setDraggingId(null), []);

  return (
    <>
      <InfoPanel tone="neutral" title="多事件轮播">
        添加多个倒计时项目后可拖动排序；保存时会按当前顺序写入配置。
      </InfoPanel>

      <SettingGrid columns={1}>
        {items.map((it) => (
          <SettingItem
            key={it.id}
            className={styles.draggableSetting}
            draggable
            onDragStart={() => onDragStart(it.id)}
            onDragOver={(e) => onDragOver(e, it.id)}
            onDragEnd={onDragEnd}
            aria-grabbed={draggingId === it.id}
            icon="action.drag"
            title={
              isCountdownQuickEventKind(it.kind)
                ? getCountdownEventPreset(it.kind).name
                : it.name || "自定义事件"
            }
            description={
              isCountdownQuickEventKind(it.kind)
                ? getCountdownEventPreset(it.kind).targetDescription
                : it.targetDate || "请选择日期"
            }
            tone={draggingId === it.id ? "accent" : "neutral"}
            control={
              <FormButton
                variant="danger"
                size="sm"
                onClick={() => removeItem(it.id)}
                icon="action.delete"
              >
                删除
              </FormButton>
            }
          >
            <StatusPill tone="neutral">
              {isCountdownQuickEventKind(it.kind)
                ? getCountdownEventPreset(it.kind).label
                : "自定义"}
            </StatusPill>
            <SettingGrid columns={2}>
              <FormInput
                label="名称"
                type="text"
                value={it.name || ""}
                onChange={(e) => updateItem(it.id, { name: e.target.value })}
                placeholder={
                  isCountdownQuickEventKind(it.kind)
                    ? `例如：2027${getCountdownEventPreset(it.kind).label}`
                    : "例如：期末考试"
                }
              />

              {it.kind === "custom" && (
                <FormInput
                  label="目标日期"
                  type="date"
                  value={it.targetDate || ""}
                  onChange={(e) => updateItem(it.id, { targetDate: e.target.value })}
                />
              )}
            </SettingGrid>
          </SettingItem>
        ))}
      </SettingGrid>

      <FormButtonGroup align="left">
        {COUNTDOWN_EVENT_PRESETS.map((preset) => (
          <FormButton
            key={preset.kind}
            variant="secondary"
            onClick={() => addQuickEvent(preset.kind)}
            icon="feature.date"
          >
            添加{preset.label}
          </FormButton>
        ))}
        <FormButton variant="primary" onClick={addCustom} icon="action.add">
          添加自定义倒计时
        </FormButton>
      </FormButtonGroup>
    </>
  );
};

export default CountdownManagerPanel;
