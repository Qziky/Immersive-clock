import { useCallback, useEffect, useMemo, useState } from "react";

import {
  clearDataScope,
  createBackup,
  dataDomainRegistry,
  discardQuarantinedSettingsRecovery,
  eraseAllData,
  getQuarantinedSettingsRecovery,
  inspectData,
  inspectUnusedAssets,
  prepareBackupFile,
  resetPreferences,
  restoreBackup,
  type BackupScope,
  type DataOperationResult,
  type DataOverview,
  type PreparedBackup,
  type UnusedAssetInspection,
} from "../../../services/dataManagement";
import {
  exportNoiseFeatureArchive,
  importNoiseFeatureArchive,
  preflightNoiseFeatureArchive,
  type NoiseFeatureArchivePreview,
} from "../../../services/noise/noiseFeatureArchiveService";
import {
  inspectNoiseFeatureData,
  type NoiseFeatureRepositoryInspection,
} from "../../../services/noise/noiseFeatureRepository";
import {
  getNoiseRescoreState,
  subscribeNoiseRescoreState,
  type NoiseRescoreState,
} from "../../../services/noise/noiseRescoreService";
import {
  Button,
  Checkbox,
  FormSection,
  InfoPanel,
  Inline,
  Input,
  MetricCard,
  Progress,
  RadioGroup,
  SettingGrid,
  SettingItem,
  StatusPill,
  useFeedback,
  type AppIconName,
} from "../../../ui";

import styles from "./DataSettingsPanel.module.css";

type DataClearScope = "cache" | "noiseHistory" | "diagnostics" | "unusedAssets";
type DataOperation =
  | "inspect"
  | "backup"
  | "prepare"
  | "restore"
  | "noiseExport"
  | "noisePrepare"
  | "noiseImport"
  | "cache"
  | "noiseHistory"
  | "diagnostics"
  | "unusedAssets"
  | "discardQuarantine"
  | "reset"
  | "erase";

export interface DataSettingsPanelProps {
  hasUnsavedAppearanceChanges: boolean;
  onBusyChange: (isBusy: boolean) => void;
  onReloadRequired: () => void;
}

const BACKUP_SCOPE_OPTIONS: Array<{ value: BackupScope; label: string }> = [
  { value: "full", label: "完整备份" },
  { value: "settings-and-assets", label: "设置与资源" },
];

const REGISTERED_DATA_DOMAIN_COUNT = Object.keys(dataDomainRegistry).length;

const CLEANUP_ITEMS: Array<{
  scope: DataClearScope;
  title: string;
  description: string;
  confirmTitle: string;
  confirmDescription: string;
  confirmLabel: string;
  buttonLabel: string;
  tone: "neutral" | "warning" | "danger";
  icon: AppIconName;
}> = [
  {
    scope: "cache",
    title: "临时缓存",
    description: "清理天气、接口状态和可重新获取的离线缓存，不改变个人设置。",
    confirmTitle: "清理临时缓存",
    confirmDescription: "缓存会在后续使用时重新生成，已保存的设置和历史记录会保留。",
    confirmLabel: "清理缓存",
    buttonLabel: "清理临时缓存",
    tone: "neutral",
    icon: "feature.storage",
  },
  {
    scope: "noiseHistory",
    title: "噪音历史",
    description: "删除采集会话、100 ms 原始帧、派生评分和重算状态；保留监测设置与 dB(A) 校准。",
    confirmTitle: "清理噪音历史",
    confirmDescription:
      "采集会话、100 ms 原始帧、派生评分和重算状态将被永久删除；监测设置与 dB(A) 校准会保留。此操作无法撤销。",
    confirmLabel: "删除历史",
    buttonLabel: "清理噪音历史",
    tone: "danger",
    icon: "feature.noiseHistory",
  },
  {
    scope: "diagnostics",
    title: "诊断记录",
    description: "删除错误中心记录和本机诊断信息，不改变错误记录方式。",
    confirmTitle: "清理诊断记录",
    confirmDescription: "现有错误与诊断记录将被永久删除，此操作无法撤销。",
    confirmLabel: "删除记录",
    buttonLabel: "清理诊断记录",
    tone: "danger",
    icon: "feature.diagnostics",
  },
  {
    scope: "unusedAssets",
    title: "未使用资源",
    description: "删除未被任何外观设置引用的本地字体和背景资源。",
    confirmTitle: "清理未使用资源",
    confirmDescription: "仅删除当前未被设置引用的字体和背景资源。",
    confirmLabel: "清理资源",
    buttonLabel: "清理未使用资源",
    tone: "warning",
    icon: "feature.file",
  },
];

function formatBytes(bytes: number | undefined): string {
  if (bytes == null || !Number.isFinite(bytes) || bytes < 0) return "--";
  if (bytes < 1024) return `${Math.round(bytes)} B`;
  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value >= 10 ? value.toFixed(0) : value.toFixed(1)} ${units[unitIndex]}`;
}

function formatDate(value: number | string | undefined): string {
  if (value == null) return "未知时间";
  const date = typeof value === "number" ? new Date(value) : new Date(value);
  return Number.isNaN(date.getTime()) ? "未知时间" : date.toLocaleString();
}

function resultDescription(result: DataOperationResult): string {
  const freed = result.bytesFreed != null ? `，释放 ${formatBytes(result.bytesFreed)}` : "";
  return `已处理 ${result.itemCount} 项${freed}。`;
}

function downloadBackup(backup: unknown, scope: BackupScope): void {
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  const date = new Date().toISOString().slice(0, 10);
  link.href = url;
  link.download = `immersive-clock-backup-${scope}-${date}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function downloadQuarantinedSettings(raw: string, fileName: string): void {
  const blob = new Blob([raw], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function downloadNoiseArchive(blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  const date = new Date().toISOString().slice(0, 10);
  link.href = url;
  link.download = `immersive-clock-noise-${date}.icnoise`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function dateBoundary(value: string, endOfDay = false): number | undefined {
  if (!value) return undefined;
  const time = new Date(`${value}T${endOfDay ? "23:59:59.999" : "00:00:00"}`).getTime();
  return Number.isFinite(time) ? time : undefined;
}

function rescoreStatusLabel(state: NoiseRescoreState | null): string {
  switch (state?.status) {
    case "queued":
      return "等待重算";
    case "running":
      return "正在重算";
    case "paused":
      return "重算已暂停";
    case "complete":
      return "评分已是最新";
    case "error":
      return "重算失败";
    default:
      return "暂无重算任务";
  }
}

export function DataSettingsPanel({
  hasUnsavedAppearanceChanges,
  onBusyChange,
  onReloadRequired,
}: DataSettingsPanelProps) {
  const { confirm, notify } = useFeedback();
  const [overview, setOverview] = useState<DataOverview | null>(null);
  const [unusedAssets, setUnusedAssets] = useState<UnusedAssetInspection | null>(null);
  const [quarantinedSettings, setQuarantinedSettings] = useState(() =>
    getQuarantinedSettingsRecovery()
  );
  const [overviewError, setOverviewError] = useState("");
  const [operation, setOperation] = useState<DataOperation | null>("inspect");
  const [backupScope, setBackupScope] = useState<BackupScope>("full");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileInputRevision, setFileInputRevision] = useState(0);
  const [preparedBackup, setPreparedBackup] = useState<PreparedBackup | null>(null);
  const [fileError, setFileError] = useState("");
  const [includeNoiseHistory, setIncludeNoiseHistory] = useState(false);
  const [noiseFeatureData, setNoiseFeatureData] = useState<NoiseFeatureRepositoryInspection | null>(
    null
  );
  const [noiseDataError, setNoiseDataError] = useState("");
  const [persistentStorage, setPersistentStorage] = useState<boolean | null>(null);
  const [noiseArchiveStart, setNoiseArchiveStart] = useState("");
  const [noiseArchiveEnd, setNoiseArchiveEnd] = useState("");
  const [selectedNoiseArchive, setSelectedNoiseArchive] = useState<File | null>(null);
  const [noiseArchiveInputRevision, setNoiseArchiveInputRevision] = useState(0);
  const [noiseArchivePreview, setNoiseArchivePreview] = useState<NoiseFeatureArchivePreview | null>(
    null
  );
  const [noiseArchiveError, setNoiseArchiveError] = useState("");
  const [rescoreState, setRescoreState] = useState<NoiseRescoreState | null>(null);
  const isBusy = operation !== null;

  useEffect(() => {
    onBusyChange(isBusy);
  }, [isBusy, onBusyChange]);

  useEffect(() => () => onBusyChange(false), [onBusyChange]);

  const refreshOverview = useCallback(async () => {
    const [nextOverview, nextUnusedAssets] = await Promise.all([
      inspectData(),
      inspectUnusedAssets(),
    ]);
    setOverview(nextOverview);
    setUnusedAssets(nextUnusedAssets);
    setQuarantinedSettings(getQuarantinedSettingsRecovery());
    setOverviewError("");
  }, []);

  const refreshNoiseData = useCallback(async () => {
    const [inspection, isPersistent] = await Promise.all([
      inspectNoiseFeatureData(),
      navigator.storage?.persisted?.().catch(() => false) ?? Promise.resolve(false),
    ]);
    setNoiseFeatureData(inspection);
    setPersistentStorage(isPersistent);
    setNoiseDataError("");
  }, []);

  useEffect(() => {
    let active = true;
    void refreshOverview()
      .catch((error: unknown) => {
        if (!active) return;
        setOverviewError(error instanceof Error ? error.message : "无法读取本地数据概览");
      })
      .finally(() => {
        if (active) setOperation(null);
      });
    return () => {
      active = false;
    };
  }, [refreshOverview]);

  useEffect(() => {
    let active = true;
    void refreshNoiseData().catch((error: unknown) => {
      if (!active) return;
      setNoiseDataError(error instanceof Error ? error.message : "无法读取原始监测数据");
    });
    return () => {
      active = false;
    };
  }, [refreshNoiseData]);

  useEffect(() => {
    let active = true;
    const unsubscribe = subscribeNoiseRescoreState((state) => {
      if (active) setRescoreState(state);
    });
    void getNoiseRescoreState().then((state) => {
      if (active) setRescoreState(state);
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  const domainLabels = useMemo(
    () => new Map(overview?.domains.map((domain) => [domain.id, domain.label]) ?? []),
    [overview]
  );
  const totalAssetCount =
    overview?.domains.find((domain) => domain.id === "assets")?.itemCount ?? 0;

  const reportError = useCallback(
    (title: string, error: unknown) => {
      notify({
        variant: "danger",
        title,
        description: error instanceof Error ? error.message : String(error),
      });
    },
    [notify]
  );

  const handleRetryOverview = useCallback(async () => {
    if (isBusy) return;
    setOperation("inspect");
    try {
      await refreshOverview();
    } catch (error) {
      setOverviewError(error instanceof Error ? error.message : "无法读取本地数据概览");
      reportError("读取数据概览失败", error);
    } finally {
      setOperation(null);
    }
  }, [isBusy, refreshOverview, reportError]);

  const handleCreateBackup = useCallback(async () => {
    if (isBusy) return;
    setOperation("backup");
    try {
      const backup = await createBackup(backupScope);
      downloadBackup(backup, backupScope);
      notify({
        variant: "success",
        title: "备份已创建",
        description: backupScope === "full" ? "完整本地数据已导出。" : "设置与自定义资源已导出。",
      });
    } catch (error) {
      reportError("创建备份失败", error);
    } finally {
      setOperation(null);
    }
  }, [backupScope, isBusy, notify, reportError]);

  const handleDownloadQuarantinedSettings = useCallback(() => {
    if (!quarantinedSettings || isBusy) return;
    try {
      downloadQuarantinedSettings(quarantinedSettings.raw, quarantinedSettings.fileName);
      notify({
        variant: "success",
        title: "原始设置已下载",
        description: "隔离副本仍保留在当前设备上。",
      });
    } catch (error) {
      reportError("下载原始设置失败", error);
    }
  }, [isBusy, notify, quarantinedSettings, reportError]);

  const handleDiscardQuarantinedSettings = useCallback(async () => {
    if (!quarantinedSettings || isBusy) return;
    const accepted = await confirm({
      title: "删除隔离设置副本",
      description: "删除后将无法再从数据中心下载这份原始设置，此操作不会影响当前设置。",
      confirmLabel: "删除副本",
      variant: "danger",
    });
    if (!accepted) return;

    setOperation("discardQuarantine");
    try {
      discardQuarantinedSettingsRecovery();
      setQuarantinedSettings(null);
      notify({
        variant: "success",
        title: "隔离副本已删除",
        description: "当前设置未受影响。",
      });
    } catch (error) {
      reportError("删除隔离副本失败", error);
    } finally {
      setOperation(null);
    }
  }, [confirm, isBusy, notify, quarantinedSettings, reportError]);

  const handleBackupFile = useCallback(
    async (file: File | null) => {
      if (isBusy) return;
      setSelectedFile(file);
      setPreparedBackup(null);
      setFileError("");
      setIncludeNoiseHistory(false);
      setFileInputRevision((current) => current + 1);
      if (!file) return;

      setOperation("prepare");
      try {
        const prepared = await prepareBackupFile(file);
        setPreparedBackup(prepared);
        setIncludeNoiseHistory(prepared.preview.hasNoiseHistory);
      } catch (error) {
        const message = error instanceof Error ? error.message : "无法读取备份文件";
        setFileError(message);
        reportError("备份预检失败", error);
      } finally {
        setOperation(null);
      }
    },
    [isBusy, reportError]
  );

  const handleRestore = useCallback(async () => {
    if (!preparedBackup || isBusy) return;
    const accepted = await confirm({
      title: "恢复本地数据",
      description: (
        <div className={styles.confirmCopy}>
          <p>当前对应分类的数据将被备份内容替换。</p>
          <p>设置面板中尚未保存的更改会丢失，恢复完成后应用将自动刷新。</p>
        </div>
      ),
      confirmLabel: "恢复并刷新",
      variant: "danger",
    });
    if (!accepted) return;

    setOperation("restore");
    try {
      const result = await restoreBackup(preparedBackup, {
        includeNoiseHistory: preparedBackup.preview.hasNoiseHistory && includeNoiseHistory,
      });
      notify({
        variant: "success",
        title: "本地数据已恢复",
        description: `${resultDescription(result)}应用即将刷新。`,
        duration: 1200,
      });
      setOperation(null);
      onReloadRequired();
    } catch (error) {
      reportError("恢复备份失败", error);
      setOperation(null);
    }
  }, [confirm, includeNoiseHistory, isBusy, notify, onReloadRequired, preparedBackup, reportError]);

  const handleExportNoiseArchive = useCallback(async () => {
    if (isBusy) return;
    const startAt = dateBoundary(noiseArchiveStart);
    const endAt = dateBoundary(noiseArchiveEnd, true);
    if (startAt !== undefined && endAt !== undefined && startAt > endAt) {
      reportError("导出范围无效", new Error("开始日期不能晚于结束日期"));
      return;
    }
    setOperation("noiseExport");
    try {
      const archive = await exportNoiseFeatureArchive({ startAt, endAt });
      downloadNoiseArchive(archive);
      notify({
        variant: "success",
        title: "原始监测数据已导出",
        description: `${formatBytes(archive.size)} · 不包含 PCM 音频`,
      });
    } catch (error) {
      reportError("导出原始监测数据失败", error);
    } finally {
      setOperation(null);
    }
  }, [isBusy, noiseArchiveEnd, noiseArchiveStart, notify, reportError]);

  const handleNoiseArchiveFile = useCallback(
    async (file: File | null) => {
      if (isBusy) return;
      setSelectedNoiseArchive(file);
      setNoiseArchivePreview(null);
      setNoiseArchiveError("");
      setNoiseArchiveInputRevision((current) => current + 1);
      if (!file) return;
      setOperation("noisePrepare");
      try {
        setNoiseArchivePreview(await preflightNoiseFeatureArchive(file));
      } catch (error) {
        const message = error instanceof Error ? error.message : "无法读取 .icnoise 文件";
        setNoiseArchiveError(message);
        reportError("原始监测数据预检失败", error);
      } finally {
        setOperation(null);
      }
    },
    [isBusy, reportError]
  );

  const handleImportNoiseArchive = useCallback(async () => {
    if (!selectedNoiseArchive || !noiseArchivePreview || isBusy) return;
    const accepted = await confirm({
      title: "导入原始监测数据",
      description: (
        <div className={styles.confirmCopy}>
          <p>
            将写入 {noiseArchivePreview.sessionCount} 个会话、
            {noiseArchivePreview.frameCount.toLocaleString()} 帧特征数据。
          </p>
          <p>
            预计新增 {formatBytes(noiseArchivePreview.additionalBytes)}
            ，导入后将自动重算环境安静评分。
          </p>
        </div>
      ),
      confirmLabel: "导入并重算",
    });
    if (!accepted) return;

    setOperation("noiseImport");
    try {
      const result = await importNoiseFeatureArchive(selectedNoiseArchive);
      setNoiseArchivePreview(result);
      await refreshNoiseData();
      notify({
        variant: "success",
        title: "原始监测数据已导入",
        description: `${result.sessionCount} 个会话已写入，评分重算将在后台继续。`,
      });
    } catch (error) {
      reportError("导入原始监测数据失败", error);
    } finally {
      setOperation(null);
    }
  }, [
    confirm,
    isBusy,
    noiseArchivePreview,
    notify,
    refreshNoiseData,
    reportError,
    selectedNoiseArchive,
  ]);

  const handleClearScope = useCallback(
    async (scope: DataClearScope) => {
      if (isBusy) return;
      if (scope === "unusedAssets" && hasUnsavedAppearanceChanges) return;
      const item = CLEANUP_ITEMS.find((candidate) => candidate.scope === scope);
      if (!item) return;
      const accepted = await confirm({
        title: item.confirmTitle,
        description: item.confirmDescription,
        confirmLabel: item.confirmLabel,
        variant: item.tone === "neutral" ? "default" : "danger",
      });
      if (!accepted) return;

      setOperation(scope);
      try {
        const result = await clearDataScope(scope);
        notify({
          variant: "success",
          title: `${item.title}已清理`,
          description: resultDescription(result),
        });
        await refreshOverview();
        if (scope === "noiseHistory") await refreshNoiseData();
      } catch (error) {
        reportError(`清理${item.title}失败`, error);
      } finally {
        setOperation(null);
      }
    },
    [
      confirm,
      hasUnsavedAppearanceChanges,
      isBusy,
      notify,
      refreshNoiseData,
      refreshOverview,
      reportError,
    ]
  );

  const handleResetPreferences = useCallback(async () => {
    if (isBusy) return;
    const accepted = await confirm({
      title: "恢复默认设置",
      description: (
        <div className={styles.confirmCopy}>
          <p>将重置 1 份设置偏好：显示、提醒、天气、噪音与外观。</p>
          <p>课表、倒计时、语录内容、历史和自定义资源会保留。</p>
          <p>设置面板中尚未保存的更改会丢失，完成后应用将自动刷新。</p>
        </div>
      ),
      confirmLabel: "恢复并刷新",
      variant: "danger",
    });
    if (!accepted) return;

    setOperation("reset");
    try {
      const result = await resetPreferences();
      notify({
        variant: "success",
        title: "设置已恢复",
        description: `${resultDescription(result)}应用即将刷新。`,
        duration: 1200,
      });
      setOperation(null);
      onReloadRequired();
    } catch (error) {
      reportError("恢复默认设置失败", error);
      setOperation(null);
    }
  }, [confirm, isBusy, notify, onReloadRequired, reportError]);

  const handleEraseAllData = useCallback(async () => {
    if (isBusy) return;
    const registeredItemCount = overview?.domains.reduce(
      (total, domain) => total + domain.itemCount,
      0
    );
    const impactDescription = overview
      ? `将永久删除 ${registeredItemCount} 项本地数据（${formatBytes(overview.appDataBytes)}），包括设置、历史、诊断记录、自定义字体与背景及应用缓存。`
      : `将永久删除 ${REGISTERED_DATA_DOMAIN_COUNT} 个已注册数据分类（大小未知），包括设置、历史、诊断记录、自定义字体与背景及应用缓存。`;
    const accepted = await confirm({
      title: "删除全部本地数据",
      description: (
        <div className={styles.confirmCopy}>
          <p>{impactDescription}</p>
          <p>设置面板中尚未保存的更改也会丢失，此操作无法撤销。</p>
        </div>
      ),
      confirmLabel: "全部删除",
      variant: "danger",
    });
    if (!accepted) return;

    setOperation("erase");
    try {
      const result = await eraseAllData();
      notify({
        variant: "success",
        title: "本地数据已删除",
        description: `${resultDescription(result)}应用即将刷新。`,
        duration: 1200,
      });
      setOperation(null);
      onReloadRequired();
    } catch (error) {
      reportError("删除本地数据失败", error);
      setOperation(null);
    }
  }, [confirm, isBusy, notify, onReloadRequired, overview, reportError]);

  const preview = preparedBackup?.preview;
  const storageUsage = overview?.storageEstimate.usage;
  const storageQuota = overview?.storageEstimate.quota;
  const rescoreCompleted = rescoreState?.completedSessionCount ?? 0;
  const rescoreTotal = rescoreState?.totalSessionCount ?? 0;
  const rescoreTone =
    rescoreState?.status === "error"
      ? "danger"
      : rescoreState?.status === "running" || rescoreState?.status === "queued"
        ? "info"
        : rescoreState?.status === "paused"
          ? "warning"
          : "success";

  return (
    <div id="data-settings-panel" className={styles.panel} aria-busy={isBusy || undefined}>
      <FormSection
        title="本地数据概览"
        variant="plain"
        description="按用途统计当前设备上由沉浸式时钟管理的数据。"
      >
        <SettingGrid>
          <MetricCard
            icon="feature.data"
            label="应用数据"
            value={formatBytes(overview?.appDataBytes)}
            meta={`${overview?.domains.length ?? 0} 个数据分类`}
          />
          <MetricCard
            icon="feature.userData"
            label="用户数据"
            value={formatBytes(overview?.userDataBytes)}
            meta="设置、资源与历史"
          />
          <MetricCard
            icon="feature.storage"
            label="可清理缓存"
            value={formatBytes(overview?.cacheBytes)}
            meta="可按需重新生成"
            tone="neutral"
          />
          <MetricCard
            icon="feature.storage"
            label="浏览器存储"
            value={formatBytes(storageUsage)}
            meta={
              overview?.storageEstimate.supported && storageQuota != null
                ? `配额 ${formatBytes(storageQuota)}`
                : "浏览器未提供配额信息"
            }
            tone="neutral"
          />
        </SettingGrid>
        {quarantinedSettings ? (
          <InfoPanel tone="warning" title="发现隔离的旧设置" role="status">
            <div className={styles.quarantineDetails}>
              <span>
                原因：
                {quarantinedSettings.reason === "invalid-json"
                  ? "设置文件格式损坏"
                  : "设置版本高于当前应用"}
              </span>
              <span>隔离时间：{formatDate(quarantinedSettings.createdAt)}</span>
            </div>
            <Inline gap="sm" align="left">
              <Button
                size="sm"
                icon="action.download"
                disabled={isBusy}
                onClick={handleDownloadQuarantinedSettings}
              >
                下载原始设置
              </Button>
              <Button
                variant="danger"
                size="sm"
                icon="action.delete"
                loading={operation === "discardQuarantine"}
                disabled={isBusy}
                onClick={handleDiscardQuarantinedSettings}
              >
                删除隔离副本
              </Button>
            </Inline>
          </InfoPanel>
        ) : null}
        {overviewError ? (
          <InfoPanel tone="warning" title="数据概览暂不可用" role="status">
            <Inline gap="sm" justify="space-between">
              <span>{overviewError}</span>
              <Button size="sm" disabled={isBusy} onClick={handleRetryOverview}>
                重试
              </Button>
            </Inline>
          </InfoPanel>
        ) : null}
      </FormSection>

      <FormSection
        title="原始监测数据"
        variant="plain"
        description="管理可重算环境安静评分的 100 ms 特征帧。"
      >
        <SettingGrid>
          <MetricCard
            icon="feature.storage"
            label="原始帧占用"
            value={formatBytes(noiseFeatureData?.bytes)}
            meta={`${noiseFeatureData?.frameCount.toLocaleString() ?? "--"} 帧`}
          />
          <MetricCard
            icon="feature.noiseHistory"
            label="采集会话"
            value={noiseFeatureData?.sessionCount ?? "--"}
            meta={`${noiseFeatureData?.chunkCount ?? "--"} 个分块`}
          />
          <MetricCard
            icon="feature.storage"
            label="持久存储"
            value={persistentStorage === null ? "未知" : persistentStorage ? "已启用" : "未启用"}
            meta={persistentStorage ? "浏览器不会主动回收" : "可能受浏览器空间回收影响"}
            tone={persistentStorage ? "success" : "warning"}
          />
          <MetricCard
            icon="feature.data"
            label="派生评分"
            value={rescoreStatusLabel(rescoreState)}
            meta={
              rescoreTotal > 0
                ? `${rescoreCompleted}/${rescoreTotal} 个会话`
                : "spectral-activity-v2"
            }
            tone={rescoreTone}
          />
        </SettingGrid>

        {noiseDataError ? (
          <InfoPanel tone="warning" title="原始监测数据暂不可用" role="status">
            {noiseDataError}
          </InfoPanel>
        ) : null}

        {rescoreState?.status === "running" || rescoreState?.status === "queued" ? (
          <div className={styles.rescoreProgress} role="status">
            <Inline justify="space-between">
              <span>后台重算进度</span>
              <span>
                {rescoreCompleted}/{rescoreTotal}
              </span>
            </Inline>
            <Progress
              label="环境安静评分重算进度"
              value={rescoreCompleted}
              max={Math.max(1, rescoreTotal)}
            />
          </div>
        ) : null}

        {rescoreState?.status === "error" ? (
          <InfoPanel tone="danger" title="评分重算失败" role="alert">
            {rescoreState.error ?? "未知错误"}
          </InfoPanel>
        ) : null}

        <div className={styles.archiveGroup}>
          <strong>导出范围</strong>
          <div className={styles.dateRange}>
            <Input
              type="date"
              label="开始日期"
              value={noiseArchiveStart}
              disabled={isBusy}
              onChange={(event) => setNoiseArchiveStart(event.target.value)}
            />
            <Input
              type="date"
              label="结束日期"
              value={noiseArchiveEnd}
              disabled={isBusy}
              onChange={(event) => setNoiseArchiveEnd(event.target.value)}
            />
          </div>
          <Inline align="left">
            <Button
              icon="action.download"
              loading={operation === "noiseExport"}
              disabled={isBusy}
              onClick={handleExportNoiseArchive}
            >
              导出 .icnoise
            </Button>
          </Inline>
        </div>

        <div className={styles.archiveGroup}>
          <Input
            key={noiseArchiveInputRevision}
            type="file"
            label="导入原始监测数据"
            hint="仅支持 .icnoise v1；确认前不会写入任何数据"
            accept=".icnoise,application/x-immersive-clock-noise-features"
            buttonText="选择 .icnoise 文件"
            fileName={selectedNoiseArchive?.name}
            error={noiseArchiveError}
            disabled={isBusy}
            onFileChange={handleNoiseArchiveFile}
          />

          {operation === "noisePrepare" ? (
            <InfoPanel tone="info" role="status">
              正在检查文件、存储配额和数据冲突...
            </InfoPanel>
          ) : null}

          {noiseArchivePreview ? (
            <div className={styles.preview} aria-label="原始监测数据预检摘要">
              <SettingGrid>
                <MetricCard
                  icon="feature.noiseHistory"
                  label="会话与分块"
                  value={`${noiseArchivePreview.sessionCount} / ${noiseArchivePreview.chunkCount}`}
                  meta="会话 / 分块"
                />
                <MetricCard
                  icon="feature.data"
                  label="特征帧"
                  value={noiseArchivePreview.frameCount.toLocaleString()}
                  meta={formatBytes(noiseArchivePreview.requiredBytes)}
                />
                <MetricCard
                  icon="feature.storage"
                  label="预计新增"
                  value={formatBytes(noiseArchivePreview.additionalBytes)}
                  meta={
                    noiseArchivePreview.additionalBytes === 0
                      ? "本地已有相同数据"
                      : "已通过配额检查"
                  }
                  tone={noiseArchivePreview.additionalBytes === 0 ? "neutral" : "success"}
                />
              </SettingGrid>
              <InfoPanel tone="neutral">
                {formatDate(noiseArchivePreview.startAt ?? undefined)} 至{" "}
                {formatDate(noiseArchivePreview.endAt ?? undefined)}
              </InfoPanel>
              <Inline align="left">
                <Button
                  variant="primary"
                  icon="action.upload"
                  loading={operation === "noiseImport"}
                  disabled={isBusy}
                  onClick={handleImportNoiseArchive}
                >
                  导入并重算
                </Button>
              </Inline>
            </div>
          ) : null}
        </div>
      </FormSection>

      <FormSection
        title="创建备份"
        variant="plain"
        description="将本地数据导出为可恢复的 JSON 文件。"
      >
        <RadioGroup
          label="备份范围"
          value={backupScope}
          options={BACKUP_SCOPE_OPTIONS.map((option) => ({ ...option, disabled: isBusy }))}
          onChange={setBackupScope}
        />
        <InfoPanel tone={backupScope === "full" ? "warning" : "neutral"}>
          {backupScope === "full"
            ? "备份文件为明文，包含设置、自定义资源和本地历史；可能包含位置、课程安排、语录和噪音活动时间等敏感数据。请仅在可信设备上保存。"
            : "备份文件为明文，包含设置、自定义字体和背景；可能包含位置、课程安排和语录，不包含噪音历史、诊断记录与临时缓存。请仅在可信设备上保存。"}
        </InfoPanel>
        <Inline align="left">
          <Button
            variant="primary"
            icon="action.download"
            loading={operation === "backup"}
            disabled={isBusy}
            onClick={handleCreateBackup}
          >
            创建备份
          </Button>
        </Inline>
      </FormSection>

      <FormSection
        title="从备份恢复"
        variant="plain"
        description="文件会先在本机预检，确认前不会修改任何数据。"
      >
        <Input
          key={fileInputRevision}
          type="file"
          label="备份文件"
          hint="支持沉浸式时钟 JSON 备份"
          accept=".json,application/json"
          buttonText="选择备份文件"
          fileName={selectedFile?.name}
          error={fileError}
          disabled={isBusy}
          onFileChange={handleBackupFile}
        />

        {operation === "prepare" ? (
          <InfoPanel tone="info" role="status">
            正在预检备份文件...
          </InfoPanel>
        ) : null}

        {preview ? (
          <div className={styles.preview} aria-label="备份预检摘要">
            <SettingGrid>
              <MetricCard
                icon="feature.backup"
                label="备份范围"
                value={preview.scope === "full" ? "完整" : "设置资源"}
                meta={`格式 ${preparedBackup.sourceFormat}`}
              />
              <MetricCard
                icon="feature.file"
                label="内容数量"
                value={preview.totalItems}
                meta={formatBytes(preview.totalBytes)}
              />
              <MetricCard
                icon="feature.data"
                label="备份协议"
                value={`v${preview.backupVersion}`}
                meta={`${formatDate(preview.exportedAt)} · 应用 ${preview.appVersion || "未知"}`}
              />
            </SettingGrid>

            <div className={styles.domainSummary} aria-label="备份包含的数据分类">
              {preview.domains.map((domain) => (
                <StatusPill key={domain.id} tone="neutral">
                  {domainLabels.get(domain.id) ?? domain.id} · {domain.itemCount} 项 ·{" "}
                  {formatBytes(domain.bytes)}
                </StatusPill>
              ))}
            </div>

            {preview.containsSensitiveData ? (
              <InfoPanel tone="warning" title="包含敏感数据">
                请仅在可信设备上保存和恢复此备份文件。
              </InfoPanel>
            ) : null}

            {preview.warnings.length > 0 ? (
              <InfoPanel tone="warning" title="预检提示">
                <ul className={styles.warningList}>
                  {preview.warnings.map((warning) => (
                    <li key={warning}>{warning}</li>
                  ))}
                </ul>
              </InfoPanel>
            ) : null}

            <div className={styles.restoreOptions}>
              <strong>恢复分类</strong>
              <Checkbox label="设置与自定义资源（必选）" checked disabled />
              <Checkbox
                label="噪音历史"
                checked={includeNoiseHistory}
                disabled={isBusy || !preview.hasNoiseHistory}
                onChange={(event) => setIncludeNoiseHistory(event.target.checked)}
              />
              {!preview.hasNoiseHistory ? (
                <span className={styles.optionHint}>此备份不包含噪音历史。</span>
              ) : null}
            </div>

            <InfoPanel tone="warning">
              恢复会覆盖对应分类，并丢弃设置面板中尚未保存的更改。
            </InfoPanel>
            <Inline align="left">
              <Button
                variant="primary"
                icon="action.upload"
                loading={operation === "restore"}
                disabled={isBusy}
                onClick={handleRestore}
              >
                恢复并刷新
              </Button>
            </Inline>
          </div>
        ) : null}
      </FormSection>

      <FormSection
        title="分类清理"
        variant="plain"
        description="只处理选定的数据类别，其余本地数据保持不变。"
      >
        <SettingGrid>
          {CLEANUP_ITEMS.map((item) => {
            const blockedByAppearanceDraft =
              item.scope === "unusedAssets" && hasUnsavedAppearanceChanges;
            const meta =
              item.scope === "unusedAssets" && unusedAssets
                ? `正在使用 ${Math.max(0, totalAssetCount - unusedAssets.itemCount)} 项 · 未使用 ${unusedAssets.itemCount} 项 · ${formatBytes(unusedAssets.bytes)}`
                : undefined;
            return (
              <SettingItem
                key={item.scope}
                icon={item.icon}
                title={item.title}
                description={
                  <>
                    {item.description}
                    {meta ? <span className={styles.itemMeta}>{meta}</span> : null}
                    {blockedByAppearanceDraft ? (
                      <span className={styles.itemMeta}>
                        请先保存或取消外观更改，再清理未使用资源。
                      </span>
                    ) : null}
                  </>
                }
                tone={item.tone}
                disabled={isBusy || blockedByAppearanceDraft}
                control={
                  <Button
                    variant={item.tone === "danger" ? "danger" : "secondary"}
                    size="sm"
                    loading={operation === item.scope}
                    disabled={isBusy || blockedByAppearanceDraft}
                    aria-label={item.buttonLabel}
                    onClick={() => handleClearScope(item.scope)}
                  >
                    清理
                  </Button>
                }
              />
            );
          })}
        </SettingGrid>
      </FormSection>

      <FormSection
        title="危险操作"
        variant="plain"
        description="以下操作会立即生效，并丢弃设置面板中尚未保存的更改。"
        className={styles.dangerSection}
      >
        <SettingGrid>
          <SettingItem
            icon="action.reset"
            title="恢复默认设置"
            description="重置显示等偏好，保留课表、倒计时、语录内容、历史和自定义资源。"
            tone="warning"
            disabled={isBusy}
            control={
              <Button
                variant="danger"
                size="sm"
                loading={operation === "reset"}
                disabled={isBusy}
                onClick={handleResetPreferences}
              >
                恢复默认
              </Button>
            }
          />
          <SettingItem
            icon="action.delete"
            title="删除全部本地数据"
            description="永久删除本应用在当前设备上的设置、记录、资源和缓存。"
            tone="danger"
            disabled={isBusy}
            control={
              <Button
                variant="danger"
                size="sm"
                loading={operation === "erase"}
                disabled={isBusy}
                onClick={handleEraseAllData}
              >
                全部删除
              </Button>
            }
          />
        </SettingGrid>
      </FormSection>
    </div>
  );
}

export default DataSettingsPanel;
