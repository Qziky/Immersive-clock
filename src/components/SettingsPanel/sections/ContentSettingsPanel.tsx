import { RotateCw } from "lucide-react";
import React, { useCallback } from "react";

import { useAppDispatch, useAppState } from "../../../contexts/AppContext";
import { FormSection, InfoPanel, SettingItem, Slider as FormSlider } from "../../../ui";
import { QuoteChannelManager } from "../../QuoteChannelManager";

/**
 * 内容设置分段组件属性
 */
export interface ContentSettingsPanelProps {
  onRegisterSave?: (fn: () => void) => void;
  section?: ContentSettingsSection;
}

export type ContentSettingsSection = "refresh" | "channels";

/**
 * 内容管理分段组件
 * - 语录自动刷新间隔设置
 * - 频道管理
 */
export const ContentSettingsPanel: React.FC<ContentSettingsPanelProps> = ({
  onRegisterSave,
  section,
}) => {
  const { quoteSettings } = useAppState();
  const dispatch = useAppDispatch();
  const [draftInterval, setDraftInterval] = React.useState<number>(
    quoteSettings.autoRefreshInterval
  );
  const channelSaveRef = React.useRef<(() => void) | null>(null);

  const formatRefreshIntervalText = useCallback((seconds: number): string => {
    if (seconds === 0) return "手动刷新";
    if (seconds < 60) return `${seconds}秒`;
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return remainingSeconds === 0 ? `${minutes}分钟` : `${minutes}分${remainingSeconds}秒`;
  }, []);

  const handleQuoteRefreshIntervalChange = useCallback((value: number) => {
    setDraftInterval(value);
  }, []);

  React.useEffect(() => {
    onRegisterSave?.(() => {
      // 保存刷新间隔
      dispatch({ type: "SET_QUOTE_AUTO_REFRESH_INTERVAL", payload: draftInterval });
      // 保存渠道草稿
      channelSaveRef.current?.();
    });
  }, [onRegisterSave, draftInterval, dispatch]);

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
          title="刷新频率"
          description="左端为最短间隔 30 秒，右端为最长间隔。"
          tone="accent"
        >
          <FormSlider
            label="刷新频率"
            value={draftInterval}
            min={30}
            max={1800}
            step={30}
            onChange={handleQuoteRefreshIntervalChange}
            formatValue={formatRefreshIntervalText}
            showRange={true}
            rangeLabels={["30秒", "30分钟"]}
          />
        </SettingItem>
        <InfoPanel tone="neutral" title="刷新策略">
          该设置保存后影响语录自动轮换；如需手动刷新，可在主界面使用语录区域的刷新操作。
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
};

export default ContentSettingsPanel;
