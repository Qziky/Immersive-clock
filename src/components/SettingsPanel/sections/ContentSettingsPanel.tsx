import { RotateCw } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { useAppState } from "../../../contexts/AppContext";
import type { QuoteSettingsState } from "../../../types";
import {
  FormSection,
  InfoPanel,
  SettingItem,
  Slider as FormSlider,
  Switch as FormSwitch,
} from "../../../ui";
import { QuoteChannelManager } from "../../QuoteChannelManager";

/**
 * 内容设置分段组件属性
 */
export interface ContentSettingsPanelProps {
  onRegisterSave?: (fn: () => void) => void;
  section?: ContentSettingsSection;
}

export type ContentSettingsSection = "refresh" | "channels";

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
  const channelSaveRef = useRef<((settings: QuoteSettingsState) => void) | null>(null);

  useEffect(() => {
    onRegisterSave?.(() => {
      channelSaveRef.current?.({
        autoRefreshEnabled: draftEnabled,
        autoRefreshIntervalSec: draftInterval,
      });
    });
  }, [draftEnabled, draftInterval, onRegisterSave]);

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
          icon={<RotateCw size={18} />}
          title="自动轮换"
          description="关闭后仍可点击主界面的语录区域手动刷新。"
          tone="accent"
          control={
            <FormSwitch
              checked={draftEnabled}
              onCheckedChange={setDraftEnabled}
              aria-label="自动轮换语录"
            />
          }
        />
        <SettingItem
          icon={<RotateCw size={18} />}
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
