import { useCallback, useEffect, useMemo, useState } from "react";

import { useUpdateSnapshot } from "../../../hooks/useUpdateRuntime";
import { checkForUpdates, startUpdateRuntime } from "../../../services/update/updateRuntime";
import type { UpdateStatus } from "../../../types/update";
import {
  Button,
  FormSection,
  InfoPanel,
  MetricCard,
  Progress,
  SettingGrid,
  SettingItem,
  Stack,
  StatusPill,
  Switch as FormSwitch,
} from "../../../ui";
import { getAppSettings, updateGeneralSettings } from "../../../utils/appSettings";
import { getRuntimePlatform } from "../../../utils/runtimePlatform";

export interface UpdateSettingsPanelProps {
  onRegisterSave?: (fn: () => void) => void;
}

const STATUS_LABELS: Record<UpdateStatus, string> = {
  idle: "等待检查",
  checking: "检查中",
  current: "已是最新",
  available: "有新版本",
  downloading: "下载中",
  ready: "已就绪",
  error: "检查失败",
};

const STATUS_TONES: Record<UpdateStatus, "neutral" | "accent" | "success" | "warning" | "danger"> =
  {
    idle: "neutral",
    checking: "accent",
    current: "success",
    available: "warning",
    downloading: "accent",
    ready: "success",
    error: "danger",
  };

function getPlatformLabel(platform: ReturnType<typeof getRuntimePlatform>): string {
  if (platform === "android") return "Android";
  if (platform === "electron") return "桌面客户端";
  return "Web / PWA";
}

function formatCheckedAt(timestamp?: number): string {
  return timestamp ? new Date(timestamp).toLocaleString() : "尚未检查";
}

export default function UpdateSettingsPanel({ onRegisterSave }: UpdateSettingsPanelProps) {
  const snapshot = useUpdateSnapshot();
  const [autoCheckEnabled, setAutoCheckEnabled] = useState(
    () => getAppSettings().general.update.autoCheckEnabled
  );
  const platform = useMemo(() => getRuntimePlatform(), []);

  useEffect(() => startUpdateRuntime(), []);

  useEffect(() => {
    setAutoCheckEnabled(getAppSettings().general.update.autoCheckEnabled);
  }, []);

  useEffect(() => {
    onRegisterSave?.(() => updateGeneralSettings({ update: { autoCheckEnabled } }));
  }, [autoCheckEnabled, onRegisterSave]);

  const handleManualCheck = useCallback(() => {
    void checkForUpdates({ manual: true });
  }, []);
  const isChecking = snapshot.status === "checking";

  return (
    <Stack gap="lg">
      <FormSection
        title="应用更新"
        variant="plain"
        description="自动检查 Web、桌面客户端和 Android 的稳定版更新。"
      >
        <SettingGrid columns={2}>
          <MetricCard icon="feature.about" label="当前版本" value={`v${snapshot.currentVersion}`} />
          <MetricCard
            icon="feature.sync"
            label="运行平台"
            value={getPlatformLabel(platform)}
            meta={`上次检查：${formatCheckedAt(snapshot.checkedAt)}`}
          />
          <MetricCard
            icon="feature.sync"
            label="最新版本"
            value={snapshot.latestVersion ? `v${snapshot.latestVersion}` : "--"}
            tone={snapshot.minimumVersionWarning ? "warning" : "neutral"}
          />
          <SettingItem
            icon="feature.notification"
            title="更新状态"
            description="自动检查不会清除本地设置或历史数据。"
            control={
              <StatusPill tone={STATUS_TONES[snapshot.status]} icon="status.info">
                {STATUS_LABELS[snapshot.status]}
              </StatusPill>
            }
          />
        </SettingGrid>

        <SettingGrid>
          <SettingItem
            icon="feature.sync"
            title="手动检查更新"
            description="立即连接更新服务，检查当前平台的稳定版更新。"
            control={
              <Button icon="feature.sync" loading={isChecking} onClick={handleManualCheck}>
                检查更新
              </Button>
            }
          />
          <SettingItem
            icon="feature.sync"
            title="自动检查更新"
            description="启动时检查；回到前台且超过 6 小时未检查时再次检查。"
            control={
              <FormSwitch
                checked={autoCheckEnabled}
                onCheckedChange={setAutoCheckEnabled}
                aria-label="自动检查更新"
              />
            }
          />
        </SettingGrid>

        {snapshot.minimumVersionWarning ? (
          <InfoPanel tone="warning" title="建议尽快升级">
            当前版本低于清单要求的最低支持版本。应用仍可继续使用，但部分功能可能不再获得兼容性保障。
          </InfoPanel>
        ) : null}
        {snapshot.error ? <InfoPanel tone="danger">{snapshot.error}</InfoPanel> : null}
        {snapshot.platform === "electron" && snapshot.status === "ready" ? (
          <InfoPanel tone="info" title="新版本已下载">
            请重启应用，退出时会自动安装。
          </InfoPanel>
        ) : null}
        {snapshot.status === "downloading" ? (
          <InfoPanel tone="info" title={`下载进度 ${snapshot.progress ?? 0}%`}>
            <Stack gap="sm">
              <Progress label="应用更新下载进度" value={snapshot.progress ?? 0} />
              <span>更新正在后台下载，完成后可以重启安装。</span>
            </Stack>
          </InfoPanel>
        ) : null}
      </FormSection>
    </Stack>
  );
}
