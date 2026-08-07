import { useEffect, useMemo, useState } from "react";

import { useUpdateSnapshot } from "../../../hooks/useUpdateRuntime";
import {
  checkForUpdates,
  executeUpdateAction,
  startUpdateRuntime,
} from "../../../services/update/updateRuntime";
import type { UpdateStatus } from "../../../types/update";
import {
  Button as FormButton,
  FormSection,
  InfoPanel,
  Inline as FormButtonGroup,
  MetricCard,
  Progress,
  SettingGrid,
  SettingItem,
  Stack,
  StatusPill,
  Switch as FormSwitch,
  useFeedback,
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
  const { notify } = useFeedback();
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

  const handleCheck = async () => {
    const result = await checkForUpdates({ manual: true });
    if (result.status === "current") {
      notify({
        variant: "success",
        title: "已是最新版本",
        description: `当前版本 v${result.currentVersion}。`,
      });
    } else if (result.status === "error") {
      notify({
        variant: "danger",
        title: "更新检查失败",
        description: result.error ?? "请检查网络后重试。",
      });
    }
  };

  const handleAction = async () => {
    try {
      await executeUpdateAction();
    } catch (error) {
      notify({
        variant: "danger",
        title: "更新操作失败",
        description: error instanceof Error ? error.message : "请稍后重试或打开发布页面。",
      });
    }
  };

  const actionLabel =
    snapshot.action === "retry"
      ? "重试准备"
      : snapshot.action === "open"
        ? "打开发布页"
        : snapshot.status === "ready" && platform === "electron"
          ? "重启并安装"
          : platform === "android"
            ? "下载更新"
            : "立即更新";

  return (
    <Stack gap="lg">
      <FormSection
        title="应用更新"
        variant="plain"
        description="检查 Web、桌面客户端和 Android 的稳定版更新。"
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

        <FormButtonGroup align="left">
          <FormButton
            variant="secondary"
            icon="action.refresh"
            loading={snapshot.status === "checking"}
            onClick={() => void handleCheck()}
          >
            检查更新
          </FormButton>
          {snapshot.status === "available" || snapshot.status === "ready" ? (
            <FormButton
              variant="primary"
              icon="action.download"
              onClick={() => void handleAction()}
            >
              {actionLabel}
            </FormButton>
          ) : null}
        </FormButtonGroup>

        {snapshot.minimumVersionWarning ? (
          <InfoPanel tone="warning" title="建议尽快升级">
            当前版本低于清单要求的最低支持版本。应用仍可继续使用，但部分功能可能不再获得兼容性保障。
          </InfoPanel>
        ) : null}
        {snapshot.error ? <InfoPanel tone="danger">{snapshot.error}</InfoPanel> : null}
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
