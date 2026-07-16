import { useCallback, useEffect, useMemo, useState } from "react";

import { useAppDispatch, useAppState } from "../../contexts/AppContext";
import { getDefaultQuoteChannels } from "../../services/quotes/quoteRegistry";
import {
  HITOKOTO_CATEGORY_LIST,
  type HitokotoCategory,
  type QuoteChannel,
  type QuoteSettingsState,
} from "../../types";
import {
  AppIcon,
  Card,
  FormSection,
  IconButton as FormIconButton,
  InfoPanel,
  Inline as FormButtonGroup,
  Input as FormInput,
  RadioGroup as FormSegmented,
  SettingGrid,
  SettingItem,
  StatusPill,
  Switch as FormSwitch,
  Textarea as FormTextarea,
} from "../../ui";
import { saveQuoteSettings } from "../../utils/appSettings";
import { logger } from "../../utils/logger";

import styles from "./QuoteChannelManager.module.css";

interface QuoteChannelManagerProps {
  onRegisterSave?: (save: (quoteSettings: QuoteSettingsState) => void) => void;
}

const ORDER_MODE_OPTIONS = [
  { value: "sequential", label: "顺序" },
  { value: "random", label: "随机" },
];

function cloneChannels(channels: readonly QuoteChannel[]): QuoteChannel[] {
  return channels.map((channel) =>
    channel.kind === "local"
      ? { ...channel, quotes: [...channel.quotes] }
      : {
          ...channel,
          hitokotoCategories: channel.hitokotoCategories
            ? [...channel.hitokotoCategories]
            : undefined,
        }
  );
}

export function QuoteChannelManager({ onRegisterSave }: QuoteChannelManagerProps) {
  const state = useAppState();
  const dispatch = useAppDispatch();
  const [channels, setChannels] = useState<QuoteChannel[]>(() =>
    cloneChannels(state.quoteChannels.channels)
  );
  const [expandedChannelId, setExpandedChannelId] = useState<string | null>(null);
  const [expandedEditorChannelId, setExpandedEditorChannelId] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [editorError, setEditorError] = useState<string | null>(null);
  const [editorDraftMap, setEditorDraftMap] = useState<Record<string, string>>({});

  const defaultQuotesMap = useMemo<Record<string, string[]>>(
    () =>
      Object.fromEntries(
        getDefaultQuoteChannels()
          .filter((channel) => channel.kind === "local")
          .map((channel) => [channel.id, [...channel.quotes]])
      ),
    []
  );

  useEffect(() => {
    setChannels(cloneChannels(state.quoteChannels.channels));
  }, [state.quoteChannels.channels]);

  const handleToggleChannel = useCallback((channelId: string) => {
    setChannels((current) =>
      current.map((channel) =>
        channel.id === channelId ? { ...channel, enabled: !channel.enabled } : channel
      )
    );
  }, []);

  const handleUpdateWeight = useCallback((channelId: string, weight: number) => {
    const clampedWeight = Math.max(1, Math.min(9999, weight));
    setChannels((current) =>
      current.map((channel) =>
        channel.id === channelId ? { ...channel, weight: clampedWeight } : channel
      )
    );
  }, []);

  const handleToggleCategory = useCallback((channelId: string, category: HitokotoCategory) => {
    setChannels((current) =>
      current.map((channel) => {
        if (
          channel.id !== channelId ||
          channel.kind !== "remote" ||
          channel.providerId !== "hitokoto"
        ) {
          return channel;
        }
        const categories = channel.hitokotoCategories ?? [];
        const nextCategories = categories.includes(category)
          ? categories.filter((item) => item !== category)
          : [...categories, category];
        return {
          ...channel,
          hitokotoCategories: nextCategories.length > 0 ? nextCategories : categories,
        };
      })
    );
  }, []);

  const handleUpdateOrderMode = useCallback(
    (channelId: string, orderMode: "random" | "sequential") => {
      setChannels((current) =>
        current.map((channel) =>
          channel.id === channelId && channel.kind === "local" ? { ...channel, orderMode } : channel
        )
      );
    },
    []
  );

  const handleToggleEditorExpanded = useCallback(
    (channelId: string) => {
      setExpandedEditorChannelId((current) => {
        const next = current === channelId ? null : channelId;
        if (next) {
          const channel = channels.find((candidate) => candidate.id === channelId);
          const value = channel?.kind === "local" ? channel.quotes.join("\n") : "";
          setEditorDraftMap((drafts) => ({ ...drafts, [channelId]: value }));
        }
        return next;
      });
    },
    [channels]
  );

  const handleImportTxtFileChange = useCallback(async (file: File | null) => {
    setImportError(null);
    if (!file) return;

    try {
      const text = await file.text();
      const lines = text
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line.length > 0 && line.length <= 200);

      if (lines.length === 0) {
        setImportError("导入失败：TXT 内容为空，或没有长度在 200 字符以内的句子。");
        return;
      }
      if (lines.length > 1000) {
        setImportError("导入失败：语录条目超过上限（1000 条）。");
        return;
      }

      const basename = file.name.replace(/\.[^.]+$/, "").trim() || "未命名";
      setChannels((current) => [
        ...current,
        {
          id: `custom-txt-${Date.now()}`,
          name: `自定义语录：${basename}`,
          kind: "local",
          weight: 10,
          enabled: true,
          builtIn: false,
          quotes: lines,
          orderMode: "random",
        },
      ]);
    } catch (error) {
      logger.error("TXT 导入错误:", error);
      setImportError("导入失败：无法读取文件。");
    }
  }, []);

  const handleUpdateQuotesFromTextarea = useCallback((channelId: string, text: string) => {
    setEditorDraftMap((current) => ({ ...current, [channelId]: text }));
    const lines = text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);

    if (lines.length > 1000) {
      setEditorError("编辑提示：语录条目超过上限（1000 行）。");
    } else if (lines.some((line) => line.length > 200)) {
      setEditorError("编辑提示：存在超过 200 字符的长句，保存时会被过滤。");
    } else {
      setEditorError(null);
    }

    const validLines = lines.filter((line) => line.length <= 200).slice(0, 1000);
    setChannels((current) =>
      current.map((channel) =>
        channel.id === channelId && channel.kind === "local"
          ? { ...channel, quotes: validLines }
          : channel
      )
    );
  }, []);

  const handleDeleteChannel = useCallback((channelId: string) => {
    setChannels((current) =>
      current.filter((channel) => channel.id !== channelId || channel.builtIn)
    );
    setExpandedEditorChannelId((current) => (current === channelId ? null : current));
    setEditorDraftMap((current) => {
      const { [channelId]: _removed, ...rest } = current;
      return rest;
    });
  }, []);

  const handleRestoreDefaultAll = useCallback(
    (channelId: string) => {
      const defaults = defaultQuotesMap[channelId];
      if (!defaults) return;
      setChannels((current) =>
        current.map((channel) =>
          channel.id === channelId && channel.kind === "local"
            ? { ...channel, quotes: [...defaults] }
            : channel
        )
      );
      setEditorDraftMap((current) => ({ ...current, [channelId]: defaults.join("\n") }));
      setEditorError(null);
    },
    [defaultQuotesMap]
  );

  useEffect(() => {
    onRegisterSave?.((quoteSettings) => {
      saveQuoteSettings(channels, quoteSettings);
      dispatch({ type: "UPDATE_QUOTE_CHANNELS", payload: cloneChannels(channels) });
      dispatch({ type: "SET_QUOTE_SETTINGS", payload: quoteSettings });
    });
  }, [channels, dispatch, onRegisterSave]);

  return (
    <FormSection
      title="语录频道管理"
      description="分别管理本地内容与三个在线服务；在线失败时会自动切换到其他可用来源。"
      variant="plain"
    >
      <InfoPanel tone="neutral">
        权重越高，被选中的概率越大。所有修改会在保存设置后统一生效。
      </InfoPanel>

      <FormButtonGroup align="right">
        <FormInput
          type="file"
          accept=".txt,text/plain"
          aria-label="导入 TXT 语录文件"
          buttonText="导入 TXT"
          placeholder="未选择 TXT 文件"
          onFileChange={handleImportTxtFileChange}
        />
      </FormButtonGroup>

      {importError && (
        <InfoPanel tone="danger" title="导入失败" role="alert">
          {importError}
        </InfoPanel>
      )}

      <div className={styles.channelList}>
        {channels.map((channel) => {
          const isHitokoto = channel.kind === "remote" && channel.providerId === "hitokoto";
          const isCategoryExpanded = expandedChannelId === channel.id;
          const isEditorExpanded = expandedEditorChannelId === channel.id;
          const categoryDetailsId = `quote-channel-categories-${channel.id}`;
          const editorDetailsId = `quote-channel-editor-${channel.id}`;
          return (
            <Card
              as="article"
              surface="base"
              key={channel.id}
              className={channel.enabled ? styles.channelCardActive : styles.channelCard}
              data-ui-motion-item
            >
              <span className={styles.channelIcon} aria-hidden="true">
                <AppIcon
                  name={
                    channel.kind === "remote" ? "feature.remoteContent" : "feature.localContent"
                  }
                  size="lg"
                />
              </span>

              <div className={styles.channelSummary}>
                <div className={styles.channelTitleBlock}>
                  <h4 className={styles.channelTitle}>{channel.name}</h4>
                  <p className={styles.channelDescription}>
                    {channel.kind === "remote"
                      ? channel.description
                      : `${channel.quotes.length} 条本地内容`}
                  </p>
                </div>
                <div className={styles.channelStatus}>
                  <StatusPill tone={channel.kind === "remote" ? "info" : "neutral"}>
                    {channel.kind === "remote" ? "在线" : "本地"}
                  </StatusPill>
                  {channel.kind === "remote" && (
                    <StatusPill tone="neutral">
                      {channel.language === "zh" ? "中文" : "English"}
                    </StatusPill>
                  )}
                  <StatusPill tone={channel.enabled ? "accent" : "neutral"}>
                    {channel.enabled ? "已启用" : "已停用"}
                  </StatusPill>
                </div>
              </div>

              <div className={styles.channelControls}>
                <div className={styles.channelWeight}>
                  <FormInput
                    label="权重"
                    type="number"
                    variant="number"
                    value={channel.weight}
                    min={1}
                    max={9999}
                    onChange={(event) =>
                      handleUpdateWeight(channel.id, Number.parseInt(event.target.value, 10) || 1)
                    }
                  />
                </div>

                <div className={styles.channelActions}>
                  {isHitokoto && (
                    <FormIconButton
                      onClick={() =>
                        setExpandedChannelId((current) =>
                          current === channel.id ? null : channel.id
                        )
                      }
                      pressed={isCategoryExpanded}
                      title="分类设置"
                      aria-label="分类设置"
                      aria-expanded={isCategoryExpanded}
                      aria-controls={categoryDetailsId}
                      icon="action.configure"
                    />
                  )}
                  {channel.kind === "local" && (
                    <FormIconButton
                      onClick={() => handleToggleEditorExpanded(channel.id)}
                      pressed={isEditorExpanded}
                      title="编辑语录"
                      aria-label="编辑语录"
                      aria-expanded={isEditorExpanded}
                      aria-controls={editorDetailsId}
                      icon="action.edit"
                    />
                  )}
                </div>
              </div>

              <div className={styles.channelSwitch}>
                <FormSwitch
                  checked={channel.enabled}
                  onCheckedChange={() => handleToggleChannel(channel.id)}
                  aria-label={`${channel.enabled ? "停用" : "启用"}${channel.name}`}
                />
              </div>

              {isHitokoto && (
                <div
                  id={categoryDetailsId}
                  className={
                    isCategoryExpanded ? styles.channelDetailsExpanded : styles.channelDetails
                  }
                  aria-hidden={!isCategoryExpanded}
                  inert={isCategoryExpanded ? undefined : true}
                >
                  <div className={styles.channelDetailsContent}>
                    <div className={styles.categorySettings}>
                      <SettingGrid columns={2}>
                        {HITOKOTO_CATEGORY_LIST.map((category) => (
                          <SettingItem
                            key={category.key}
                            title={category.name}
                            control={
                              <FormSwitch
                                checked={
                                  channel.hitokotoCategories?.includes(category.key) ?? false
                                }
                                onCheckedChange={() =>
                                  handleToggleCategory(channel.id, category.key)
                                }
                                aria-label={`${category.name}分类`}
                              />
                            }
                          />
                        ))}
                      </SettingGrid>
                    </div>
                  </div>
                </div>
              )}

              {channel.kind === "local" && (
                <div
                  id={editorDetailsId}
                  className={
                    isEditorExpanded ? styles.channelDetailsExpanded : styles.channelDetails
                  }
                  aria-hidden={!isEditorExpanded}
                  inert={isEditorExpanded ? undefined : true}
                >
                  <div className={styles.channelDetailsContent}>
                    <div className={styles.editorSection}>
                      <div className={styles.editorHeader}>
                        <h5 className={styles.editorTitle}>语录编辑器</h5>
                        <div className={styles.quoteActions}>
                          <FormSegmented
                            value={channel.orderMode}
                            onChange={(value) =>
                              handleUpdateOrderMode(channel.id, value as "random" | "sequential")
                            }
                            options={ORDER_MODE_OPTIONS}
                          />
                          <FormIconButton
                            variant="default"
                            size="sm"
                            title="恢复默认内容"
                            aria-label="恢复默认内容"
                            icon="action.restoreSaved"
                            disabled={!defaultQuotesMap[channel.id]}
                            onClick={() => handleRestoreDefaultAll(channel.id)}
                          />
                          {!channel.builtIn && (
                            <FormIconButton
                              onClick={() => handleDeleteChannel(channel.id)}
                              variant="danger"
                              size="sm"
                              title="删除语录源"
                              aria-label="删除语录源"
                              icon="action.delete"
                            />
                          )}
                        </div>
                      </div>
                      <FormTextarea
                        label="语录文本（每行一个）"
                        className={styles.quoteTextarea}
                        value={editorDraftMap[channel.id] ?? channel.quotes.join("\n")}
                        onChange={(event) =>
                          handleUpdateQuotesFromTextarea(channel.id, event.target.value)
                        }
                        placeholder="例如：\n保持专注，持续前进。\n小步快跑，积累成塔。"
                        rows={10}
                      />
                      <div className={styles.importInfo}>当前条目：{channel.quotes.length}</div>
                      {editorError && (
                        <InfoPanel tone="warning" role="alert">
                          {editorError}
                        </InfoPanel>
                      )}
                      {channel.quotes.length === 0 && (
                        <InfoPanel tone="warning">当前频道暂无可用语录。</InfoPanel>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </Card>
          );
        })}
      </div>
    </FormSection>
  );
}
