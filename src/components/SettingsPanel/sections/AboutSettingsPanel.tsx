import {
  Bell,
  Bug,
  Copy,
  Download,
  File as FileIcon,
  Globe,
  HardDrive,
  Info,
  Save as SaveIcon,
  ShieldAlert,
  Trash2 as TrashIcon,
} from "lucide-react";
import React, { useEffect, useCallback, useMemo, useRef, useState } from "react";

import pkg from "../../../../package.json";
import { useAppDispatch, useAppState } from "../../../contexts/AppContext";
import {
  Button as FormButton,
  FormSection,
  InfoPanel,
  Inline as FormButtonGroup,
  MetricCard,
  RadioGroup as FormSegmented,
  SettingGrid,
  SettingItem,
  StatusPill,
  Switch as FormSwitch,
  useFeedback,
} from "../../../ui";
import { clearAppearanceAssets } from "../../../utils/appearanceAssets";
import { exportSettingsBundle, importSettingsBundle } from "../../../utils/appearanceSettings";
import {
  clearErrorCenter,
  ErrorCenterMode,
  exportErrorCenterJson,
  getErrorCenterRecords,
  subscribeErrorCenter,
} from "../../../utils/errorCenter";
import { getWeatherCache } from "../../../utils/weatherStorage";
import styles from "../SettingsPanel.module.css";

// 版本建议优先从环境变量（vite.config 注入）读取，回退到 package.json
const appVersion = import.meta.env.VITE_APP_VERSION;

export interface AboutSettingsPanelProps {
  onRegisterSave?: (fn: () => void) => void;
  section?: AboutSettingsSection;
}

export type AboutSettingsSection = "project" | "data" | "debug";

const AboutSettingsPanel: React.FC<AboutSettingsPanelProps> = ({ onRegisterSave, section }) => {
  const { study } = useAppState();
  const dispatch = useAppDispatch();
  const { confirm, notify } = useFeedback();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [notice, setNotice] = useState<string>("");
  const [records, setRecords] = useState(() => getErrorCenterRecords().slice());
  const [levelFilter, setLevelFilter] = useState<"all" | "error" | "warn" | "info" | "debug">(
    "all"
  );
  const appliedErrorCenterMode = (study.errorCenterMode ?? "off") as ErrorCenterMode;
  const isErrorCenterActive = appliedErrorCenterMode !== "off";
  const [draftErrorPopupEnabled, setDraftErrorPopupEnabled] = useState<boolean>(
    !!study.errorPopupEnabled
  );
  const [draftErrorCenterMode, setDraftErrorCenterMode] =
    useState<ErrorCenterMode>(appliedErrorCenterMode);

  useEffect(() => {
    setDraftErrorPopupEnabled(!!study.errorPopupEnabled);
  }, [study.errorPopupEnabled]);

  useEffect(() => {
    setDraftErrorCenterMode(appliedErrorCenterMode);
  }, [appliedErrorCenterMode]);

  useEffect(() => {
    if (!onRegisterSave) return;
    onRegisterSave(() => {
      dispatch({ type: "SET_ERROR_POPUP_ENABLED", payload: draftErrorPopupEnabled });
      dispatch({ type: "SET_ERROR_CENTER_MODE", payload: draftErrorCenterMode });
    });
  }, [onRegisterSave, dispatch, draftErrorPopupEnabled, draftErrorCenterMode]);

  useEffect(() => {
    const off = subscribeErrorCenter((next) => {
      setRecords(next.slice());
    });
    return off;
  }, []);

  const version = (appVersion && String(appVersion)) || pkg.version;
  const license = pkg.license || "MIT";
  const authorSite = pkg.homepage || "https://qqhkx.com";
  const repoUrl = "https://github.com/QQHKX/immersive-clock";
  const isSectionHidden = (candidate: AboutSettingsSection) =>
    section ? section !== candidate : undefined;

  const envInfo = useMemo(() => {
    const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
    const isElectron = (() => {
      try {
        return typeof navigator !== "undefined" && /electron/i.test(navigator.userAgent);
      } catch {
        return false;
      }
    })();
    return { ua, isElectron };
  }, []);

  const filteredRecords = useMemo(() => {
    const list = levelFilter === "all" ? records : records.filter((r) => r.level === levelFilter);
    return list.slice().reverse().slice(0, 50);
  }, [records, levelFilter]);

  /**
   * 导出设置
   */
  const handleExportSettings = useCallback(async () => {
    try {
      setNotice("");
      const bundle = await exportSettingsBundle();
      const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "immersive-clock-settings.json";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err) {
      setNotice(isErrorCenterActive ? "导出设置失败，已记录到“错误与调试”。" : "导出设置失败。");
      const msg = err instanceof Error ? err.message : String(err);
      window.dispatchEvent(
        new CustomEvent("messagePopup:open", {
          detail: { type: "error", title: "导出设置失败", message: msg },
        })
      );
    }
  }, [isErrorCenterActive]);

  /**
   * 触发文件选择
   */
  const handleTriggerImport = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  /**
   * 导入设置
   */
  const handleImportSettings = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;

      // 清除 value，以便重复选择同一文件触发 onChange
      event.target.value = "";

      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          setNotice("");
          const result = e.target?.result;
          if (typeof result !== "string") return;

          const importedSettings = JSON.parse(result);

          // 简单校验：检查是否为对象且包含基本字段
          if (typeof importedSettings !== "object" || !importedSettings) {
            throw new Error("无效的设置文件格式");
          }

          const ok = await confirm({
            title: "导入设置",
            description: "当前配置将被文件内容覆盖，完成后页面会自动刷新。",
            confirmLabel: "导入并刷新",
            variant: "danger",
          });
          if (!ok) return;

          await importSettingsBundle(importedSettings);
          notify({
            variant: "success",
            title: "设置导入成功",
            description: "页面即将刷新。",
            duration: 1200,
          });
          window.setTimeout(() => window.location.reload(), 800);
        } catch (err) {
          setNotice(
            isErrorCenterActive ? "导入设置失败，已记录到“错误与调试”。" : "导入设置失败。"
          );
          const msg = err instanceof Error ? err.message : String(err);
          window.dispatchEvent(
            new CustomEvent("messagePopup:open", {
              detail: { type: "error", title: "导入设置失败", message: msg },
            })
          );
        }
      };
      reader.readAsText(file);
    },
    [confirm, isErrorCenterActive, notify]
  );

  /**
   * 清除所有本地缓存（localStorage）
   * - 提示确认，避免误操作
   * - 清理后不会自动刷新页面，用户可手动刷新生效
   */
  const handleClearCaches = useCallback(async () => {
    const ok = await confirm({
      title: "清除所有本地数据",
      description: "设置、缓存和本地记录都将被删除，此操作无法撤销。",
      confirmLabel: "清除数据",
      variant: "danger",
    });
    if (!ok) return;
    try {
      setNotice("");
      await clearAppearanceAssets();
      localStorage.clear();
      notify({
        variant: "success",
        title: "本地数据已清除",
        description: "建议刷新页面以完成设置重置。",
      });
    } catch (err) {
      setNotice(isErrorCenterActive ? "清除缓存失败，已记录到“错误与调试”。" : "清除缓存失败。");
      const msg = err instanceof Error ? err.message : String(err);
      window.dispatchEvent(
        new CustomEvent("messagePopup:open", {
          detail: { type: "error", title: "清除缓存失败", message: msg },
        })
      );
    }
  }, [confirm, isErrorCenterActive, notify]);

  const handleClearErrorRecords = useCallback(() => {
    setNotice("");
    clearErrorCenter();
    setNotice("已清空错误记录。");
  }, []);

  const handleExportErrorRecords = useCallback(() => {
    setNotice("");
    try {
      const text = exportErrorCenterJson();
      const blob = new Blob([text], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "immersive-clock-error-records.json";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err) {
      setNotice("导出错误记录失败。");
      const msg = err instanceof Error ? err.message : String(err);
      window.dispatchEvent(
        new CustomEvent("messagePopup:open", {
          detail: { type: "error", title: "导出错误记录失败", message: msg },
        })
      );
    }
  }, []);

  const handleCopyErrorSummary = useCallback(async () => {
    setNotice("");
    const lines = records
      .slice()
      .reverse()
      .slice(0, 50)
      .map((r) => {
        const t = new Date(r.ts).toLocaleString();
        return `[${t}] ${r.level.toUpperCase()} ${r.source} ${r.title} x${r.count} - ${r.message}`;
      })
      .join("\n");
    try {
      await navigator.clipboard.writeText(lines);
      setNotice("已复制错误摘要到剪贴板。");
    } catch {
      setNotice("复制失败（浏览器可能未授予剪贴板权限）。");
    }
  }, [records]);

  return (
    <div id="about-panel">
      <FormSection
        title="项目信息"
        variant="plain"
        description="当前应用版本、授权信息与项目链接。"
        hidden={isSectionHidden("project")}
      >
        <SettingGrid columns={2}>
          <MetricCard icon={<Info size={16} />} label="版本" value={`v${version}`} tone="accent" />
          <MetricCard icon={<Info size={16} />} label="授权" value={`${license} License`} />
        </SettingGrid>
        <SettingGrid>
          <SettingItem icon={<Globe size={18} />} title="作者网站" description={authorSite}>
            <a href={authorSite} target="_blank" rel="noopener noreferrer">
              {authorSite}
            </a>
          </SettingItem>
          <SettingItem icon={<FileIcon size={18} />} title="开源地址" description={repoUrl}>
            <a href={repoUrl} target="_blank" rel="noopener noreferrer">
              {repoUrl}
            </a>
          </SettingItem>
        </SettingGrid>
      </FormSection>

      <FormSection title="使用声明" variant="plain" hidden={isSectionHidden("project")}>
        <InfoPanel tone="warning" title="开源声明">
          本软件为开源软件，严禁倒卖商用。
        </InfoPanel>
      </FormSection>

      <FormSection
        title="设置管理"
        variant="plain"
        description="导出当前设置进行备份，或导入之前的设置文件。"
        hidden={isSectionHidden("data")}
      >
        <InfoPanel tone="neutral">导入设置会覆盖当前配置，并在确认后刷新页面。</InfoPanel>
        <FormButtonGroup align="left">
          <FormButton
            variant="secondary"
            size="md"
            onClick={handleExportSettings}
            icon={<SaveIcon size={16} />}
            aria-label="导出设置"
          >
            导出设置
          </FormButton>
          <FormButton
            variant="secondary"
            size="md"
            onClick={handleTriggerImport}
            icon={<FileIcon size={16} />}
            aria-label="导入设置"
          >
            导入设置
          </FormButton>
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleImportSettings}
            accept=".json"
            className={styles.hiddenInput}
            aria-hidden="true"
          />
        </FormButtonGroup>
      </FormSection>

      <FormSection
        title="缓存与重置"
        variant="plain"
        description="用于处理本地缓存异常或配置污染。"
        hidden={isSectionHidden("data")}
      >
        <SettingItem
          icon={<HardDrive size={18} />}
          title="本地缓存"
          description="清理 localStorage 中的设置与本地数据，操作前会再次确认。"
          tone="danger"
          control={
            <FormButton
              variant="danger"
              size="md"
              onClick={handleClearCaches}
              icon={<TrashIcon size={16} />}
              aria-label="清除所有缓存"
              title="清除所有缓存"
            >
              清除
            </FormButton>
          }
        />
      </FormSection>

      <FormSection
        title="错误与调试"
        variant="plain"
        description="控制错误提示、记录方式与最近调试记录。"
        hidden={isSectionHidden("debug")}
      >
        <SettingGrid columns={2}>
          <SettingItem
            icon={<Bell size={18} />}
            title="错误弹窗提示"
            description="出现关键错误时弹出提示。"
            control={
              <FormSwitch
                checked={draftErrorPopupEnabled}
                onCheckedChange={setDraftErrorPopupEnabled}
                aria-label="错误弹窗提示"
              />
            }
          />
          <SettingItem
            icon={<ShieldAlert size={18} />}
            title="记录方式"
            description="关闭、仅内存或持久化保存错误记录。"
            tone={draftErrorCenterMode === "off" ? "neutral" : "accent"}
          >
            <FormSegmented
              label="记录方式"
              value={draftErrorCenterMode}
              options={[
                { label: "关闭", value: "off" },
                { label: "仅内存", value: "memory" },
                { label: "持久化", value: "persist" },
              ]}
              onChange={(v) => setDraftErrorCenterMode(v as ErrorCenterMode)}
            />
          </SettingItem>
        </SettingGrid>

        {isErrorCenterActive ? (
          <>
            <SettingItem
              icon={<Bug size={18} />}
              title="记录筛选"
              description="查看最近 50 条记录，可按级别过滤。"
              control={
                <StatusPill tone="info">
                  {filteredRecords.length} / {records.length}
                </StatusPill>
              }
            >
              <FormSegmented
                label="级别筛选"
                value={levelFilter}
                options={[
                  { label: "全部", value: "all" },
                  { label: "错误", value: "error" },
                  { label: "告警", value: "warn" },
                  { label: "信息", value: "info" },
                ]}
                onChange={(v) => setLevelFilter(v as typeof levelFilter)}
              />
            </SettingItem>

            <FormButtonGroup align="left">
              <FormButton
                variant="secondary"
                size="md"
                onClick={handleCopyErrorSummary}
                icon={<Copy size={16} />}
              >
                复制摘要
              </FormButton>
              <FormButton
                variant="secondary"
                size="md"
                onClick={handleExportErrorRecords}
                icon={<Download size={16} />}
              >
                导出记录
              </FormButton>
              <FormButton variant="danger" size="md" onClick={handleClearErrorRecords}>
                清空记录
              </FormButton>
            </FormButtonGroup>

            {notice ? <InfoPanel tone="info">{notice}</InfoPanel> : null}

            <div className={styles.debugRecordList}>
              {filteredRecords.length === 0 ? (
                <InfoPanel tone="neutral">暂无记录</InfoPanel>
              ) : (
                filteredRecords.map((r) => (
                  <details key={r.id} className={styles.debugRecord}>
                    <summary className={styles.debugRecordSummary}>
                      {new Date(r.ts).toLocaleString()} [{r.level}] {r.title} ({r.source}) x
                      {r.count}
                    </summary>
                    <div className={styles.debugRecordBody}>
                      <p>{r.message || "--"}</p>
                      {r.stack ? <pre className={styles.debugStack}>{r.stack}</pre> : null}
                    </div>
                  </details>
                ))
              )}
            </div>

            <InfoPanel tone="neutral" title="运行环境">
              <p>环境：{envInfo.isElectron ? "Electron" : "Web"}</p>
              <p>UA：{envInfo.ua || "--"}</p>
              {(() => {
                const cache = getWeatherCache();
                const diag = cache.geolocation?.diagnostics;
                if (!diag) return null;
                return (
                  <p>
                    定位诊断：权限={diag.permissionState}{" "}
                    {diag.errorMessage ? `(${diag.errorMessage})` : ""}
                  </p>
                );
              })()}
            </InfoPanel>
          </>
        ) : null}
      </FormSection>
    </div>
  );
};

export default AboutSettingsPanel;
