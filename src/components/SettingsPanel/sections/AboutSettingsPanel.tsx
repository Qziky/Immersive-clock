import React, { useCallback, useEffect, useMemo, useState } from "react";

import pkg from "../../../../package.json";
import { LEGAL_DOCUMENTS, LEGAL_DOCUMENT_VERSION } from "../../../constants/legal";
import { useAppDispatch, useAppState } from "../../../contexts/AppContext";
import {
  initializeClarityIfAllowed,
  isClarityDeploymentConfigured,
  revokeClarityConsent,
} from "../../../services/clarityAnalytics";
import {
  Button as FormButton,
  ConfirmDialog,
  FormSection,
  InfoPanel,
  Inline as FormButtonGroup,
  MetricCard,
  RadioGroup as FormSegmented,
  SettingGrid,
  SettingItem,
  Stack,
  StatusPill,
  Switch as FormSwitch,
} from "../../../ui";
import { getAppSettings, updateGeneralSettings } from "../../../utils/appSettings";
import {
  clearErrorCenter,
  ErrorCenterMode,
  exportErrorCenterJson,
  getErrorCenterRecords,
  subscribeErrorCenter,
} from "../../../utils/errorCenter";
import { getLegalConsent } from "../../../utils/legalConsent";
import { getRuntimePlatform } from "../../../utils/runtimePlatform";
import { getWeatherCache } from "../../../utils/weatherStorage";
import styles from "../SettingsPanel.module.css";

// 版本建议优先从环境变量（vite.config 注入）读取，回退到 package.json
const appVersion = import.meta.env.VITE_APP_VERSION;

export interface AboutSettingsPanelProps {
  onRegisterSave?: (fn: () => void) => void;
  onAnalyticsReloadRequired?: () => void;
  section?: AboutSettingsSection;
}

export type AboutSettingsSection = "privacy" | "project" | "debug";

const AboutSettingsPanel: React.FC<AboutSettingsPanelProps> = ({
  onAnalyticsReloadRequired,
  onRegisterSave,
  section,
}) => {
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
  const [appliedDeveloperModeEnabled] = useState(
    () => getAppSettings().general.developerModeEnabled
  );
  const [draftDeveloperModeEnabled, setDraftDeveloperModeEnabled] = useState(
    appliedDeveloperModeEnabled
  );
  const [draftExperienceProgramEnabled, setDraftExperienceProgramEnabled] = useState(
    () => getAppSettings().general.analytics?.experienceProgramEnabled ?? true
  );
  const [showExperienceDisableConfirm, setShowExperienceDisableConfirm] = useState(false);

  useEffect(() => {
    setDraftErrorPopupEnabled(!!study.errorPopupEnabled);
  }, [study.errorPopupEnabled]);

  useEffect(() => {
    setDraftErrorCenterMode(appliedErrorCenterMode);
  }, [appliedErrorCenterMode]);

  const handleExperienceProgramChange = useCallback((nextEnabled: boolean) => {
    if (nextEnabled) {
      setDraftExperienceProgramEnabled(true);
      return;
    }

    setShowExperienceDisableConfirm(true);
  }, []);

  useEffect(() => {
    if (!onRegisterSave) return;
    onRegisterSave(() => {
      updateGeneralSettings({ developerModeEnabled: draftDeveloperModeEnabled });
      const currentExperienceProgramEnabled =
        getAppSettings().general.analytics?.experienceProgramEnabled ?? true;
      updateGeneralSettings({
        analytics: { experienceProgramEnabled: draftExperienceProgramEnabled },
      });
      if (currentExperienceProgramEnabled !== draftExperienceProgramEnabled) {
        if (draftExperienceProgramEnabled) {
          void initializeClarityIfAllowed();
        } else {
          revokeClarityConsent();
          onAnalyticsReloadRequired?.();
        }
      }
      dispatch({ type: "SET_ERROR_POPUP_ENABLED", payload: draftErrorPopupEnabled });
      dispatch({ type: "SET_ERROR_CENTER_MODE", payload: draftErrorCenterMode });
    });
  }, [
    onRegisterSave,
    dispatch,
    draftDeveloperModeEnabled,
    draftErrorPopupEnabled,
    draftErrorCenterMode,
    draftExperienceProgramEnabled,
    onAnalyticsReloadRequired,
  ]);

  useEffect(() => {
    const off = subscribeErrorCenter((next) => {
      setRecords(next.slice());
    });
    return off;
  }, []);

  const version = (appVersion && String(appVersion)) || pkg.version;
  const license = pkg.license || "MIT";
  const authorName = pkg.author.name;
  const authorUrl = pkg.author.url;
  const repoUrl = pkg.homepage;
  const licenseUrl = `${repoUrl}/blob/main/LICENSE`;
  const thirdPartyNoticesUrl = `${repoUrl}/blob/main/THIRD_PARTY_NOTICES.md`;
  const legalConsent = getLegalConsent();
  const legalConsentTime = legalConsent
    ? new Date(legalConsent.acceptedAt).toLocaleString()
    : "尚未记录";
  const isSectionHidden = (candidate: AboutSettingsSection) =>
    section ? section !== candidate : undefined;

  const envInfo = useMemo(() => {
    const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
    const platform = getRuntimePlatform(ua);
    return { ua, platform };
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
    <Stack id="about-panel" gap="xl">
      <FormSection
        title="隐私与分析"
        variant="plain"
        description="查看公开法律文档，并控制是否帮助作者改进应用。"
        hidden={isSectionHidden("privacy")}
      >
        <SettingGrid>
          <SettingItem
            icon="feature.privacy"
            title="用户体验改进计划"
            description="默认开启，用于发现难以复现的界面问题；关闭后应用仍可正常使用。"
            tone={draftExperienceProgramEnabled ? "accent" : "neutral"}
            control={
              <FormSwitch
                checked={draftExperienceProgramEnabled}
                onCheckedChange={handleExperienceProgramChange}
                aria-label="用户体验改进计划"
              />
            }
          >
            <StatusPill tone={isClarityDeploymentConfigured() ? "success" : "neutral"}>
              {isClarityDeploymentConfigured() ? "部署已配置" : "当前部署未启用"}
            </StatusPill>
          </SettingItem>
          <SettingItem
            icon="feature.privacy"
            title="同意记录"
            description={`文档版本：${LEGAL_DOCUMENT_VERSION}`}
          >
            <StatusPill tone="info">{legalConsentTime}</StatusPill>
          </SettingItem>
        </SettingGrid>
        <SettingGrid>
          {Object.values(LEGAL_DOCUMENTS).map((document) => (
            <SettingItem
              key={document.key}
              icon="feature.sourceCode"
              title={document.title}
              description={document.summary}
            >
              <a href={document.path}>公开查看</a>
            </SettingItem>
          ))}
        </SettingGrid>
        <InfoPanel tone="info">
          分析只在生产环境、部署已配置、当前协议已同意且此开关开启时运行。关闭后保存设置会自动刷新应用。
        </InfoPanel>
      </FormSection>

      <FormSection
        title="项目信息"
        variant="plain"
        description="当前应用版本、授权信息与项目链接。"
        hidden={isSectionHidden("project")}
      >
        <SettingGrid columns={2}>
          <MetricCard icon="feature.about" label="版本" value={`v${version}`} />
          <MetricCard icon="feature.license" label="授权" value={license} />
        </SettingGrid>
        <SettingGrid>
          <SettingItem icon="feature.authorWebsite" title="项目作者" description={authorName}>
            <a href={authorUrl} target="_blank" rel="noopener noreferrer">
              {authorName}
            </a>
          </SettingItem>
          <SettingItem icon="feature.sourceCode" title="开源地址" description={repoUrl}>
            <a href={repoUrl} target="_blank" rel="noopener noreferrer">
              {repoUrl}
            </a>
          </SettingItem>
          <SettingItem icon="feature.license" title="许可证原文" description={license}>
            <a href={licenseUrl} target="_blank" rel="noopener noreferrer">
              查看 GPLv3 许可证
            </a>
          </SettingItem>
          <SettingItem
            icon="feature.sourceCode"
            title="第三方声明"
            description="字体、图标与依赖许可证"
          >
            <a href={thirdPartyNoticesUrl} target="_blank" rel="noopener noreferrer">
              查看第三方声明
            </a>
          </SettingItem>
        </SettingGrid>
      </FormSection>

      <FormSection title="使用声明" variant="plain" hidden={isSectionHidden("project")}>
        <InfoPanel tone="info" title="开源许可">
          Copyright © 2025–2026 Qziky。本软件按 GPL-3.0-only
          发布。修改与再分发须遵守许可证、保留版权与许可证通知，并按要求提供对应源代码。本软件按“原样”提供，不附带任何明示或默示担保。
        </InfoPanel>
        <InfoPanel tone="warning" title="服务与隐私说明">
          今日诗词免费版仅限非商业使用；该限制只适用于这一可选第三方服务，不限制本软件本身。启用后会由服务方处理公开
          IP，并在当前终端保存推荐 Token/Cookie。
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
            icon="feature.command"
            title="开发者模式"
            description="开启后显示组件规范、音频诊断等独立调试页面入口。"
            tone={draftDeveloperModeEnabled ? "accent" : "neutral"}
            control={
              <FormSwitch
                checked={draftDeveloperModeEnabled}
                onCheckedChange={setDraftDeveloperModeEnabled}
                aria-label="开发者模式"
              />
            }
          />
          <SettingItem
            icon="status.error"
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
            icon="feature.privacy"
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
              icon="feature.diagnostics"
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
                icon="action.copy"
              >
                复制摘要
              </FormButton>
              <FormButton
                variant="secondary"
                size="md"
                onClick={handleExportErrorRecords}
                icon="action.download"
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
              <p>
                环境：
                {envInfo.platform === "android"
                  ? "Android"
                  : envInfo.platform === "electron"
                    ? "Electron"
                    : "Web"}
              </p>
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

      <FormSection
        title="调试页面"
        variant="plain"
        description="独立于设置面板运行的开发诊断工具。"
        hidden={isSectionHidden("debug") || !draftDeveloperModeEnabled}
      >
        <SettingGrid>
          <SettingItem
            icon="feature.sourceCode"
            title="组件规范"
            description="查看 src/ui 公共组件、公开状态、交互示例与组件覆盖清单。"
            control={
              <FormButton
                variant="secondary"
                aria-label={appliedDeveloperModeEnabled ? "打开组件规范" : "保存后可打开组件规范"}
                disabled={!appliedDeveloperModeEnabled}
                onClick={() => window.location.assign("/design-system")}
              >
                {appliedDeveloperModeEnabled ? "打开" : "保存后可用"}
              </FormButton>
            }
          />
          <SettingItem
            icon="feature.audio"
            title="音频诊断"
            description="检查输入设备、采集流程、信号特征、评分、校准与持久化状态。"
            control={
              <FormButton
                variant="secondary"
                aria-label={appliedDeveloperModeEnabled ? "打开音频诊断" : "保存后可打开音频诊断"}
                disabled={!appliedDeveloperModeEnabled}
                onClick={() => window.location.assign("/debug/audio")}
              >
                {appliedDeveloperModeEnabled ? "打开" : "保存后可用"}
              </FormButton>
            }
          />
        </SettingGrid>
        {!appliedDeveloperModeEnabled ? (
          <InfoPanel tone="info">保存设置后即可打开这些调试页面。</InfoPanel>
        ) : null}
      </FormSection>
      <ConfirmDialog
        isOpen={showExperienceDisableConfirm}
        title="要关闭用户体验改进计划吗？"
        description="这个项目主要由作者个人维护。匿名的页面使用情况能帮助我发现难以复现的问题，也能判断哪些功能需要优先修复。关闭后应用仍可正常使用，也不会影响你的现有设置，只是我能获得的改进线索会少一些。"
        cancelLabel="继续帮助改进"
        confirmLabel="仍然关闭"
        onCancel={() => setShowExperienceDisableConfirm(false)}
        onConfirm={() => {
          setDraftExperienceProgramEnabled(false);
          setShowExperienceDisableConfirm(false);
        }}
      />
    </Stack>
  );
};

export default AboutSettingsPanel;
