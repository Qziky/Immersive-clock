import { useEffect, useRef, useState } from "react";

import { useAppState } from "../../../contexts/AppContext";
import type {
  Quote,
  QuoteAnimationMode,
  QuoteSettingsState,
  QuoteTypingSpeed,
} from "../../../types";
import {
  FormSection,
  IconButton,
  InfoPanel,
  RadioGroup,
  SettingItem,
  Slider as FormSlider,
  Switch as FormSwitch,
} from "../../../ui";
import { QuoteReveal } from "../../MotivationalQuote";
import { QuoteChannelManager } from "../../QuoteChannelManager";

import styles from "./ContentSettingsPanel.module.css";

/**
 * 内容设置分段组件属性
 */
export interface ContentSettingsPanelProps {
  onRegisterSave?: (fn: () => void) => void;
  section?: ContentSettingsSection;
}

export type ContentSettingsSection = "refresh" | "effects" | "channels";

const ANIMATION_MODE_OPTIONS = [
  { value: "typewriter", label: "自然打字" },
  { value: "crossfade", label: "平滑显示" },
  { value: "none", label: "直接显示" },
] satisfies Array<{ value: QuoteAnimationMode; label: string }>;

const TYPING_SPEED_OPTIONS = [
  { value: "slow", label: "慢速" },
  { value: "normal", label: "标准" },
  { value: "fast", label: "快速" },
] satisfies Array<{ value: QuoteTypingSpeed; label: string }>;

const DISABLED_TYPING_SPEED_OPTIONS = TYPING_SPEED_OPTIONS.map((option) => ({
  ...option,
  disabled: true,
}));

const PREVIEW_QUOTES: readonly [Quote, Quote] = [
  {
    id: "quote-animation-preview-focus",
    text: "专注于眼前的一小步，时间会给出答案。",
    author: "语录预览",
    providerId: "local",
    language: "zh",
    fetchedAt: 0,
  },
  {
    id: "quote-animation-preview-patience",
    text: "慢慢来，比较快。",
    origin: "留给自己的提醒",
    providerId: "local",
    language: "zh",
    fetchedAt: 0,
  },
];

function formatRefreshIntervalText(seconds: number): string {
  if (seconds < 60) return `${seconds}秒`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return remainingSeconds === 0 ? `${minutes}分钟` : `${minutes}分${remainingSeconds}秒`;
}

/**
 * 内容管理分段组件
 * - 语录自动刷新间隔设置
 * - 频道管理
 */
export function ContentSettingsPanel({ onRegisterSave, section }: ContentSettingsPanelProps) {
  const { quoteSettings } = useAppState();
  const [draftInterval, setDraftInterval] = useState<number>(quoteSettings.autoRefreshIntervalSec);
  const [draftEnabled, setDraftEnabled] = useState(quoteSettings.autoRefreshEnabled);
  const [draftAnimationMode, setDraftAnimationMode] = useState<QuoteAnimationMode>(
    quoteSettings.animationMode
  );
  const [draftTypingSpeed, setDraftTypingSpeed] = useState<QuoteTypingSpeed>(
    quoteSettings.typingSpeed
  );
  const [draftTypewriterBackspaceEnabled, setDraftTypewriterBackspaceEnabled] = useState(
    quoteSettings.typewriterBackspaceEnabled
  );
  const [previewIndex, setPreviewIndex] = useState(0);
  const [previewReplayKey, setPreviewReplayKey] = useState(0);
  const channelSaveRef = useRef<((settings: QuoteSettingsState) => void) | null>(null);

  useEffect(() => {
    onRegisterSave?.(() => {
      channelSaveRef.current?.({
        autoRefreshEnabled: draftEnabled,
        autoRefreshIntervalSec: draftInterval,
        animationMode: draftAnimationMode,
        typewriterBackspaceEnabled: draftTypewriterBackspaceEnabled,
        typingSpeed: draftTypingSpeed,
      });
    });
  }, [
    draftAnimationMode,
    draftEnabled,
    draftInterval,
    draftTypewriterBackspaceEnabled,
    draftTypingSpeed,
    onRegisterSave,
  ]);

  const replayPreview = () => {
    setPreviewIndex((current) => (current + 1) % PREVIEW_QUOTES.length);
    setPreviewReplayKey((current) => current + 1);
  };

  const handleAnimationModeChange = (mode: QuoteAnimationMode) => {
    setDraftAnimationMode(mode);
    replayPreview();
  };

  const handleTypingSpeedChange = (speed: QuoteTypingSpeed) => {
    setDraftTypingSpeed(speed);
    replayPreview();
  };

  const handleTypewriterBackspaceChange = (enabled: boolean) => {
    setDraftTypewriterBackspaceEnabled(enabled);
    replayPreview();
  };

  const isSectionHidden = (candidate: ContentSettingsSection) =>
    section ? section !== candidate : undefined;

  return (
    <div id="content-panel">
      <FormSection
        title="语录自动刷新"
        variant="plain"
        description="控制自习页面语录内容的自动刷新节奏。"
        hidden={isSectionHidden("refresh")}
      >
        <SettingItem
          icon="feature.carousel"
          title="自动轮换"
          description="关闭后仍可点击主界面的语录区域手动刷新。"
          control={
            <FormSwitch
              checked={draftEnabled}
              onCheckedChange={setDraftEnabled}
              aria-label="自动轮换语录"
            />
          }
        />
        <SettingItem
          icon="feature.carousel"
          title="刷新频率"
          description="自动轮换开启时，每隔指定时间切换一次内容。"
        >
          <FormSlider
            label="刷新频率"
            value={draftInterval}
            min={30}
            max={1800}
            step={30}
            onChange={setDraftInterval}
            formatValue={formatRefreshIntervalText}
            disabled={!draftEnabled}
            showRange={true}
            rangeLabels={["30秒", "30分钟"]}
          />
        </SettingItem>
        <InfoPanel tone="neutral" title="刷新策略">
          自动轮换会优先显示缓存或本地内容，并在后台补充在线句子；手动刷新会优先请求在线服务。
        </InfoPanel>
      </FormSection>

      <FormSection
        title="语录显示效果"
        variant="plain"
        description="选择语录出现时的呈现方式，并在保存前即时预览。"
        hidden={isSectionHidden("effects")}
      >
        <SettingItem
          icon="appearance.effects"
          title="出现动画"
          description="自然打字更有节奏感，平滑显示适合安静过渡，也可以直接显示完整内容。"
        >
          <RadioGroup<QuoteAnimationMode>
            label="出现动画"
            name="quote-animation-mode"
            value={draftAnimationMode}
            options={ANIMATION_MODE_OPTIONS}
            onChange={handleAnimationModeChange}
          />
        </SettingItem>

        <SettingItem
          icon="feature.typingSpeed"
          title="打字速度"
          description="仅用于自然打字；切换其他效果时会保留当前速度。"
          disabled={draftAnimationMode !== "typewriter"}
        >
          <RadioGroup<QuoteTypingSpeed>
            label="打字速度"
            name="quote-typing-speed"
            value={draftTypingSpeed}
            options={
              draftAnimationMode === "typewriter"
                ? TYPING_SPEED_OPTIONS
                : DISABLED_TYPING_SPEED_OPTIONS
            }
            onChange={handleTypingSpeedChange}
          />
        </SettingItem>

        <SettingItem
          icon="feature.backspace"
          title="切换时回删"
          description="切换到下一条语录前，先按打字节奏回删当前内容。"
          disabled={draftAnimationMode !== "typewriter"}
          control={
            <FormSwitch
              checked={draftTypewriterBackspaceEnabled}
              disabled={draftAnimationMode !== "typewriter"}
              onCheckedChange={handleTypewriterBackspaceChange}
              aria-label="切换时回删"
            />
          }
        />

        <div className={styles.preview} data-testid="quote-animation-preview">
          <div className={styles.previewHeader}>
            <div>
              <strong>即时预览</strong>
              <span>保存后应用到自习页面</span>
            </div>
            <IconButton
              className={styles.replayButton}
              aria-label="重播语录动画预览"
              title="重播语录动画预览"
              icon="action.refresh"
              size="sm"
              onClick={replayPreview}
            />
          </div>
          <div className={styles.previewViewport} aria-hidden="true">
            <QuoteReveal
              className={styles.previewQuote}
              quote={PREVIEW_QUOTES[previewIndex]}
              animationMode={draftAnimationMode}
              typewriterBackspaceEnabled={draftTypewriterBackspaceEnabled}
              typingSpeed={draftTypingSpeed}
              replayKey={previewReplayKey}
            />
          </div>
        </div>

        <InfoPanel tone="neutral" title="动效偏好">
          系统开启“减少动态效果”时，语录会直接完整显示，不播放出现动画。
        </InfoPanel>
      </FormSection>

      <div hidden={isSectionHidden("channels")}>
        <QuoteChannelManager
          onRegisterSave={(fn) => {
            channelSaveRef.current = fn;
          }}
        />
      </div>
    </div>
  );
}

export default ContentSettingsPanel;
