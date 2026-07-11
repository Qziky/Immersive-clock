import {
  Bell,
  Bug,
  Copy,
  Download,
  File as FileIcon,
  Globe,
  Info,
  ShieldAlert,
} from "lucide-react";
import React, { useCallback, useEffect, useMemo, useState } from "react";

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
} from "../../../ui";
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

export type AboutSettingsSection = "project" | "debug";

const AboutSettingsPanel: React.FC<AboutSettingsPanelProps> = ({ onRegisterSave, section }) => {
  const { study } = useAppState();
  const dispatch = useAppDispatch();
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
