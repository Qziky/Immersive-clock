import React, { useEffect, useMemo, useState } from "react";

import { useAppDispatch, useAppState } from "../../../contexts/AppContext";
import { AppMode, CountdownItem } from "../../../types";
import type { StudyDisplaySettings, StudyInfoCarouselSettings } from "../../../types";
import {
  Button as FormButton,
  FormSection,
  InfoPanel,
  Inline as FormButtonGroup,
  Input as FormInput,
  MetricCard,
  RadioGroup as FormSegmented,
  SettingGrid,
  SettingItem,
  Slider as FormSlider,
  StatusPill,
  Switch as FormSwitch,
} from "../../../ui";
import {
  consumeStudyInfoLimitAdjustedNotice,
  getAppSettings,
  getDefaultStudyInfoCarousel,
  MAX_STUDY_INFO_ITEMS,
  normalizeStudyInfoCarousel,
  updateGeneralSettings,
  updateStudySettings,
  updateTimeSyncSettings,
} from "../../../utils/appSettings";
import { resolveStartupMode } from "../../../utils/startupMode";
import { ScheduleEditor } from "../../ScheduleSettings/ScheduleSettings";

import { CountdownManagerPanel } from "./CountdownManagerPanel";
import { StudyInfoList } from "./StudyInfoList";

/**
 * 基础设置分段组件的属性
 * - `targetYear`：目标高考年份
 * - `onTargetYearChange`：更新目标年份的回调
 */
export interface BasicSettingsPanelProps {
  targetYear: number;
  onTargetYearChange: (year: number) => void;
  onRegisterSave?: (fn: () => void) => void;
  section?: BasicSettingsSection;
}

export type BasicSettingsSection = "startup" | "display" | "countdown" | "timeSync" | "schedule";

/**
 * 基础设置分段组件
 * - 倒计时类型与目标年份/自定义事件设置
 * - 自习组件显示开关（时间始终显示）
 * - 课表设置入口
 */
export const BasicSettingsPanel: React.FC<BasicSettingsPanelProps> = ({
  targetYear,
  onTargetYearChange,
  onRegisterSave,
  section,
}) => {
  const { study } = useAppState();
  const dispatch = useAppDispatch();

  const [startupMode, setStartupMode] = useState<AppMode>("clock");

  // 倒计时模式（重构）：'gaokao' | 'single' | 'multi'
  const [countdownMode, setCountdownMode] = useState<"gaokao" | "single" | "multi">("gaokao");

  // 倒计时设置草稿（保留兼容字段）
  const [draftCustomName, setDraftCustomName] = useState<string>(study.customName ?? "");
  const [draftCustomDate, setDraftCustomDate] = useState<string>(study.customDate ?? "");
  // 多事件轮播间隔（秒）
  const [carouselIntervalSec, setCarouselIntervalSec] = useState<number>(
    study.carouselIntervalSec ?? 6
  );
  // 顶部中央信息调度区草稿（与旧的多事件倒计时轮播间隔相互独立）
  const [draftInfoCarousel, setDraftInfoCarousel] = useState<StudyInfoCarouselSettings>(() =>
    normalizeStudyInfoCarousel(study.infoCarousel)
  );
  const [showInfoLimitAdjustedNotice] = useState(consumeStudyInfoLimitAdjustedNotice);

  // 自习组件显示草稿（时间始终显示，不提供开关）
  const defaultDisplay = useMemo<StudyDisplaySettings>(
    () => ({
      showWeather: true,
      showNoiseMonitor: true,
      showCountdown: true,
      showQuote: true,
      showTime: true,
      showDate: true,
    }),
    []
  );
  const [draftDisplay, setDraftDisplay] = useState<StudyDisplaySettings>({
    ...(study.display || defaultDisplay),
  });

  const enabledInfoCount = draftInfoCarousel.items.filter((item) => item.enabled).length;

  // 子分区保存注册
  const countdownSaveRef = React.useRef<() => void>(() => {});
  const scheduleSaveRef = React.useRef<() => void>(() => {});

  const isDesktop = useMemo(() => {
    if (typeof window === "undefined") return false;
    const anyWindow = window as unknown as { electronAPI?: { platform?: string } };
    const hasBridge = typeof anyWindow.electronAPI?.platform === "string";
    const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
    const isElectronUa = /\bElectron\b/i.test(ua);
    return hasBridge || isElectronUa;
  }, []);

  const ntpAvailable = useMemo(() => {
    if (typeof window === "undefined") return false;
    const anyWindow = window as unknown as { electronAPI?: { timeSync?: { ntp?: unknown } } };
    return typeof anyWindow.electronAPI?.timeSync?.ntp === "function";
  }, []);

  const [timeSyncEnabled, setTimeSyncEnabled] = useState<boolean>(false);
  const [timeSyncProvider, setTimeSyncProvider] = useState<"httpDate" | "timeApi" | "ntp">(
    "httpDate"
  );
  const [timeSyncHttpDateUrl, setTimeSyncHttpDateUrl] = useState<string>("/");
  const [timeSyncApiUrl, setTimeSyncApiUrl] = useState<string>("");
  const [timeSyncNtpHost, setTimeSyncNtpHost] = useState<string>("pool.ntp.org");
  const [timeSyncNtpPort, setTimeSyncNtpPort] = useState<number>(123);
  const [timeSyncManualOffsetSec, setTimeSyncManualOffsetSec] = useState<number>(0);
  const [timeSyncAutoEnabled, setTimeSyncAutoEnabled] = useState<boolean>(false);
  const [timeSyncAutoIntervalMin, setTimeSyncAutoIntervalMin] = useState<number>(60);
  const [timeSyncStatus, setTimeSyncStatus] = useState(getAppSettings().general.timeSync);

  // 打开时优先从 AppSettings 读取上次选择的倒计时模式
  useEffect(() => {
    try {
      setStartupMode(resolveStartupMode(getAppSettings().general.startup.initialMode));
      const saved = getAppSettings().study.countdownMode;
      if (saved === "gaokao" || saved === "single" || saved === "multi") {
        setCountdownMode(saved);
      }
    } catch {}
  }, []);

  useEffect(() => {
    try {
      const saved = getAppSettings().general.timeSync;
      const provider =
        saved.provider === "timeApi" || saved.provider === "httpDate" || saved.provider === "ntp"
          ? saved.provider
          : "httpDate";
      const providerAllowed = provider !== "ntp" || ntpAvailable;

      setTimeSyncEnabled(!!saved.enabled && providerAllowed);
      setTimeSyncProvider(providerAllowed ? provider : "httpDate");
      setTimeSyncHttpDateUrl(typeof saved.httpDateUrl === "string" ? saved.httpDateUrl : "/");
      setTimeSyncApiUrl(typeof saved.timeApiUrl === "string" ? saved.timeApiUrl : "");
      setTimeSyncNtpHost(typeof saved.ntpHost === "string" ? saved.ntpHost : "pool.ntp.org");
      setTimeSyncNtpPort(Number.isFinite(saved.ntpPort) ? Math.trunc(saved.ntpPort) : 123);
      setTimeSyncManualOffsetSec(
        Number.isFinite(saved.manualOffsetMs) ? Math.trunc(saved.manualOffsetMs) / 1000 : 0
      );
      setTimeSyncAutoEnabled(!!saved.autoSyncEnabled);
      setTimeSyncAutoIntervalMin(
        Number.isFinite(saved.autoSyncIntervalSec)
          ? Math.max(1, Math.round(saved.autoSyncIntervalSec / 60))
          : 60
      );
      setTimeSyncStatus(saved);
    } catch {}
  }, [ntpAvailable]);

  useEffect(() => {
    const refresh = () => {
      try {
        setTimeSyncStatus(getAppSettings().general.timeSync);
      } catch {}
    };
    refresh();
    window.addEventListener("timeSync:updated", refresh as EventListener);
    window.addEventListener("settingsSaved", refresh as EventListener);
    return () => {
      window.removeEventListener("timeSync:updated", refresh as EventListener);
      window.removeEventListener("settingsSaved", refresh as EventListener);
    };
  }, []);

  useEffect(() => {
    // 同步草稿为当前应用状态（打开面板或刷新时）

    setDraftCustomName(study.customName ?? "");
    setDraftCustomDate(study.customDate ?? "");
    setDraftDisplay({ ...(study.display || defaultDisplay), showTime: true });
    setDraftInfoCarousel(
      normalizeStudyInfoCarousel(study.infoCarousel ?? getDefaultStudyInfoCarousel())
    );

    // 根据现有 countdownItems 推断模式。
    const items = study.countdownItems || [];
    if (Array.isArray(items) && items.length > 1) {
      setCountdownMode("multi");
    } else if (Array.isArray(items) && items.length === 1) {
      const it = items[0];
      if (it.kind === "gaokao") {
        setCountdownMode("gaokao");
        // 名称可编辑但不需要日期
        setDraftCustomName(it.name || "");
        setDraftCustomDate("");
      } else {
        setCountdownMode("single");
        setDraftCustomName(it.name || study.customName || "");
        setDraftCustomDate(it.targetDate || study.customDate || "");
      }
    } else {
      // 兼容旧逻辑：无 items 时用 countdownType 决定模式
      setCountdownMode((study.countdownType ?? "gaokao") === "gaokao" ? "gaokao" : "single");
    }
  }, [
    study.countdownType,
    study.customName,
    study.customDate,
    study.display,
    defaultDisplay,
    study.countdownItems,
    study.infoCarousel,
  ]);

  // 注册保存动作：统一在父组件保存时派发
  useEffect(() => {
    onRegisterSave?.(() => {
      scheduleSaveRef.current?.();

      // 倒计时模式映射到旧字段：多事件作为自定义类型
      const nextType: "gaokao" | "custom" = countdownMode === "gaokao" ? "gaokao" : "custom";
      dispatch({ type: "SET_COUNTDOWN_TYPE", payload: nextType });

      // 单事件时更新旧字段（用于兼容回退显示）
      if (countdownMode === "single") {
        dispatch({
          type: "SET_CUSTOM_COUNTDOWN",
          payload: { name: draftCustomName, date: draftCustomDate },
        });
      }

      // 保存组件显示设置（强制时间显示）
      dispatch({ type: "SET_STUDY_DISPLAY", payload: { ...draftDisplay, showTime: true } });
      // 保存顶部中央信息调度设置，归一化会过滤空白自定义条目并限制 20 条。
      dispatch({
        type: "SET_INFO_CAROUSEL",
        payload: normalizeStudyInfoCarousel(draftInfoCarousel),
      });
      // 保存轮播间隔；样式由 AppearanceProvider 统一管理。
      if (countdownMode === "multi") {
        dispatch({ type: "SET_CAROUSEL_INTERVAL", payload: carouselIntervalSec });
      }

      // 保存倒计时项目
      if (countdownMode === "gaokao") {
        const one: CountdownItem[] = [
          {
            id: "gaokao-default",
            kind: "gaokao",
            name: "高考倒计时",
            order: 0,
          },
        ];
        dispatch({ type: "SET_COUNTDOWN_ITEMS", payload: one });
      } else if (countdownMode === "single") {
        const one: CountdownItem[] = [
          {
            id: "custom-default",
            kind: "custom",
            name: (draftCustomName && draftCustomName.trim()) || "自定义事件",
            targetDate: (draftCustomDate && draftCustomDate.trim()) || "",
            order: 0,
          },
        ];
        dispatch({ type: "SET_COUNTDOWN_ITEMS", payload: one });
      } else {
        // 多事件：由子面板负责收集并保存
        countdownSaveRef.current?.();
      }
      // 记录最近启用的模式，确保下次打开直接显示
      try {
        updateStudySettings({ countdownMode });
      } catch {}

      updateGeneralSettings({ startup: { initialMode: startupMode } });

      updateTimeSyncSettings((current) => ({
        enabled: timeSyncEnabled,
        provider: timeSyncProvider,
        httpDateUrl: timeSyncHttpDateUrl.trim() || current.httpDateUrl,
        timeApiUrl: timeSyncApiUrl.trim(),
        ntpHost: timeSyncNtpHost.trim() || current.ntpHost,
        ntpPort: Math.max(1, Math.min(65535, Math.trunc(timeSyncNtpPort || 123))),
        manualOffsetMs: Math.round(
          (Number.isFinite(timeSyncManualOffsetSec) ? timeSyncManualOffsetSec : 0) * 1000
        ),
        autoSyncEnabled: timeSyncAutoEnabled,
        autoSyncIntervalSec: Math.max(
          60,
          Math.round((Number.isFinite(timeSyncAutoIntervalMin) ? timeSyncAutoIntervalMin : 60) * 60)
        ),
      }));
    });
  }, [
    onRegisterSave,
    countdownMode,
    draftCustomName,
    draftCustomDate,
    draftDisplay,
    draftInfoCarousel,
    carouselIntervalSec,
    dispatch,
    startupMode,
    timeSyncEnabled,
    timeSyncProvider,
    timeSyncHttpDateUrl,
    timeSyncApiUrl,
    timeSyncNtpHost,
    timeSyncNtpPort,
    timeSyncManualOffsetSec,
    timeSyncAutoEnabled,
    timeSyncAutoIntervalMin,
  ]);

  const timeSyncProviderLabel =
    timeSyncProvider === "httpDate"
      ? "HTTP Date"
      : timeSyncProvider === "timeApi"
        ? "时间 API"
        : "NTP";
  const timeSyncOffsetText = timeSyncStatus?.enabled
    ? `${Math.trunc((timeSyncStatus.offsetMs || 0) + (timeSyncStatus.manualOffsetMs || 0))} ms`
    : "未启用";
  const timeSyncLastText = timeSyncStatus?.lastSyncAt
    ? new Date(timeSyncStatus.lastSyncAt).toLocaleString("zh-CN")
    : "无";
  const isSectionHidden = (candidate: BasicSettingsSection) =>
    section ? section !== candidate : undefined;

  return (
    <div id="basic-panel">
      {/* 显示设置分区已前移到倒计时设置之前 */}

      <FormSection title="启动设置" variant="plain" hidden={isSectionHidden("startup")}>
        <SettingItem
          icon="mode.clock"
          title="启动时默认页面"
          description="该设置将在下次启动或刷新页面后生效。"
        >
          <FormSegmented
            value={startupMode}
            options={[
              { label: "时钟", value: "clock" },
              { label: "倒计时", value: "countdown" },
              { label: "秒表", value: "stopwatch" },
              { label: "自习", value: "study" },
            ]}
            onChange={(v) => setStartupMode(v as AppMode)}
          />
        </SettingItem>
      </FormSection>

      {/* 倒计时设置 */}
      <FormSection
        title="倒计时设置"
        variant="plain"
        description="配置自习页面的倒计时来源、目标和轮播顺序。"
        hidden={isSectionHidden("countdown")}
      >
        <SettingItem
          icon="feature.countdown"
          title="倒计时模式"
          description="选择自习页面的倒计时来源与展示方式。"
        >
          <FormSegmented
            value={countdownMode}
            options={[
              { label: "高考", value: "gaokao" },
              { label: "单事件", value: "single" },
              { label: "多事件", value: "multi" },
            ]}
            onChange={(v) => setCountdownMode(v as "gaokao" | "single" | "multi")}
          />
        </SettingItem>

        {countdownMode === "multi" && (
          <SettingItem
            icon="feature.carousel"
            title="轮播间隔"
            description="多事件模式下，每个倒计时项目停留的时间。"
          >
            <FormSlider
              label="轮播间隔"
              min={1}
              max={60}
              step={1}
              value={carouselIntervalSec}
              onChange={(v) => setCarouselIntervalSec(Math.round(v))}
              formatValue={(v) => `${Math.round(v)} 秒`}
              rangeLabels={[`1 秒`, `60 秒`]}
            />
          </SettingItem>
        )}

        {countdownMode === "gaokao" && (
          <>
            <InfoPanel tone="neutral" title="自动目标">
              使用高考日期（6月7日）自动计算，目标年份保存后即时应用到倒计时。
            </InfoPanel>
            <SettingItem
              icon="feature.event"
              title="目标年份"
              description="用于计算下一次高考倒计时。"
            >
              <FormInput
                label="年份"
                type="number"
                variant="number"
                value={String(targetYear)}
                onChange={(e) => {
                  const v = parseInt(e.target.value, 10);
                  if (!Number.isNaN(v)) onTargetYearChange?.(v);
                }}
                min={1900}
                max={2100}
                step={1}
                placeholder="例如 2026"
              />
            </SettingItem>
          </>
        )}

        {countdownMode === "single" && (
          <>
            <SettingGrid columns={2}>
              <SettingItem
                icon="feature.eventName"
                title="事件名称"
                description="显示在自习页倒计时标题处。"
              >
                <FormInput
                  label="名称"
                  type="text"
                  value={draftCustomName}
                  onChange={(e) => setDraftCustomName(e.target.value)}
                  placeholder="例如：期末考试"
                />
              </SettingItem>
              <SettingItem icon="feature.date" title="事件日期" description="用于计算剩余天数。">
                <FormInput
                  label="日期"
                  type="date"
                  value={draftCustomDate}
                  onChange={(e) => setDraftCustomDate(e.target.value)}
                />
              </SettingItem>
            </SettingGrid>
          </>
        )}

        {countdownMode === "multi" && (
          <CountdownManagerPanel
            onRegisterSave={(fn) => {
              countdownSaveRef.current = fn;
            }}
          />
        )}
      </FormSection>

      <FormSection
        title="显示设置"
        variant="plain"
        description="选择自习页面显示的组件，时间始终显示。"
        hidden={isSectionHidden("display")}
      >
        <SettingGrid>
          <SettingItem
            icon="feature.weather"
            title="天气"
            description="显示当前天气与温度信息。"
            control={
              <FormSwitch
                checked={!!draftDisplay.showWeather}
                onCheckedChange={(checked) =>
                  setDraftDisplay((prev) => ({ ...prev, showWeather: checked }))
                }
                aria-label="天气"
              />
            }
          />
          <SettingItem
            icon="feature.noise"
            title="噪音监测"
            description="显示实时噪音状态与分贝信息。"
            control={
              <FormSwitch
                id="tour-noise-monitor-checkbox"
                checked={!!draftDisplay.showNoiseMonitor}
                onCheckedChange={(checked) =>
                  setDraftDisplay((prev) => ({ ...prev, showNoiseMonitor: checked }))
                }
                aria-label="噪音监测"
              />
            }
          />
          <SettingItem
            icon="feature.countdown"
            title="倒计时"
            description="在自习页显示高考或自定义事件倒计时。"
            control={
              <FormSwitch
                checked={!!draftDisplay.showCountdown}
                onCheckedChange={(checked) =>
                  setDraftDisplay((prev) => ({ ...prev, showCountdown: checked }))
                }
                aria-label="倒计时"
              />
            }
          />
          <SettingItem
            icon="feature.quotes"
            title="励志语录"
            description="显示语录渠道生成的提示文本。"
            control={
              <FormSwitch
                checked={!!draftDisplay.showQuote}
                onCheckedChange={(checked) =>
                  setDraftDisplay((prev) => ({ ...prev, showQuote: checked }))
                }
                aria-label="励志语录"
              />
            }
          />
          <SettingItem
            icon="feature.date"
            title="日期"
            description="在中央时间下方显示当前日期。"
            control={
              <FormSwitch
                checked={!!draftDisplay.showDate}
                onCheckedChange={(checked) =>
                  setDraftDisplay((prev) => ({ ...prev, showDate: checked }))
                }
                aria-label="日期"
              />
            }
          />
        </SettingGrid>
      </FormSection>

      <FormSection
        title="顶部进度与信息"
        variant="plain"
        description="统一安排顶部进度和提示信息；选择多项后会按列表顺序自动轮播。"
        action={
          <StatusPill tone={enabledInfoCount > 0 ? "success" : "warning"}>
            {enabledInfoCount} / {MAX_STUDY_INFO_ITEMS} 条启用
          </StatusPill>
        }
        hidden={isSectionHidden("display")}
      >
        {showInfoLimitAdjustedNotice && (
          <InfoPanel tone="warning" title="已调整轮播上限">
            原配置启用了超过 {MAX_STUDY_INFO_ITEMS}
            条信息，超出部分已按原有顺序关闭，消息内容和配置仍保留。
          </InfoPanel>
        )}
        <StudyInfoList settings={draftInfoCarousel} onChange={setDraftInfoCarousel} />
      </FormSection>

      <FormSection
        title="时间与校时"
        variant="plain"
        description="按需启用外部时间源，并保留手动偏移修正。"
        hidden={isSectionHidden("timeSync")}
      >
        <SettingItem
          icon="feature.timeCalibration"
          title="校时来源"
          description="默认跟随本机时间；启用外部来源后会在保存时更新校时配置。"
          tone={timeSyncEnabled ? "accent" : "neutral"}
          control={
            <StatusPill
              tone={timeSyncEnabled ? "accent" : "neutral"}
              icon={timeSyncEnabled ? "status.selected" : "feature.time"}
            >
              {timeSyncEnabled ? timeSyncProviderLabel : "默认"}
            </StatusPill>
          }
        >
          <FormSegmented
            value={timeSyncEnabled ? timeSyncProvider : "default"}
            options={[
              { label: "默认", value: "default" },
              { label: "HTTP Date", value: "httpDate" },
              { label: "时间 API", value: "timeApi" },
              ...(isDesktop
                ? [
                    {
                      label: "NTP（桌面端）",
                      value: "ntp",
                      disabled: !ntpAvailable,
                    },
                  ]
                : []),
            ]}
            onChange={(v) => {
              if (v === "default") {
                setTimeSyncEnabled(false);
              } else {
                setTimeSyncEnabled(true);
                setTimeSyncProvider(v as "httpDate" | "timeApi" | "ntp");
              }
            }}
          />
        </SettingItem>

        {timeSyncEnabled && (
          <>
            {timeSyncProvider === "httpDate" ? (
              <SettingItem
                icon="feature.timeSourceHttp"
                title="HTTP Date URL"
                description="读取响应头 Date 字段，同源路径可直接填写为 /。"
              >
                <FormInput
                  label="URL"
                  value={timeSyncHttpDateUrl}
                  placeholder="/"
                  onChange={(e) => setTimeSyncHttpDateUrl(e.target.value)}
                />
              </SettingItem>
            ) : timeSyncProvider === "timeApi" ? (
              <SettingItem
                icon="feature.timeSourceApi"
                title="时间 API URL"
                description="支持 epochMs、epochSeconds、unixtime 或 datetime 字段。"
              >
                <FormInput
                  label="URL"
                  value={timeSyncApiUrl}
                  placeholder="https://example.com/time"
                  onChange={(e) => setTimeSyncApiUrl(e.target.value)}
                />
              </SettingItem>
            ) : (
              <SettingItem
                icon="feature.timeSourceNtp"
                title="NTP 服务"
                description="桌面端通过 NTP Host 与端口同步网络时间。"
              >
                <SettingGrid columns={2}>
                  <FormInput
                    label="NTP Host"
                    value={timeSyncNtpHost}
                    placeholder="pool.ntp.org"
                    onChange={(e) => setTimeSyncNtpHost(e.target.value)}
                  />
                  <FormInput
                    label="端口"
                    type="number"
                    variant="number"
                    min={1}
                    max={65535}
                    step={1}
                    value={String(timeSyncNtpPort)}
                    onChange={(e) => {
                      const raw = e.target.value;
                      const n = raw.trim() ? Number(raw) : 123;
                      setTimeSyncNtpPort(Number.isFinite(n) ? Math.trunc(n) : 123);
                    }}
                  />
                </SettingGrid>
              </SettingItem>
            )}

            <SettingGrid columns={2}>
              <SettingItem
                icon="feature.time"
                title="手动偏移"
                description="以秒为单位微调最终生效时间。"
              >
                <FormInput
                  label="偏移秒数"
                  type="number"
                  variant="number"
                  step="0.1"
                  value={String(timeSyncManualOffsetSec)}
                  onChange={(e) => {
                    const raw = e.target.value;
                    const n = raw.trim() ? Number(raw) : 0;
                    setTimeSyncManualOffsetSec(Number.isFinite(n) ? n : 0);
                  }}
                />
              </SettingItem>
              <SettingItem
                icon="feature.sync"
                title="自动校时"
                description="按固定间隔触发后台校时。"
                control={
                  <FormSwitch
                    checked={timeSyncAutoEnabled}
                    onCheckedChange={setTimeSyncAutoEnabled}
                    aria-label="自动校时"
                  />
                }
              >
                <FormInput
                  label="间隔（分钟）"
                  type="number"
                  variant="number"
                  min={1}
                  step={1}
                  value={String(timeSyncAutoIntervalMin)}
                  onChange={(e) => {
                    const raw = e.target.value;
                    const n = raw.trim() ? Number(raw) : 60;
                    setTimeSyncAutoIntervalMin(Number.isFinite(n) ? n : 60);
                  }}
                />
              </SettingItem>
            </SettingGrid>

            <FormButtonGroup align="left">
              <FormButton
                type="button"
                variant="secondary"
                onClick={() => window.dispatchEvent(new CustomEvent("timeSync:syncNow"))}
              >
                立即校时
              </FormButton>
            </FormButtonGroup>

            <SettingGrid columns={2}>
              <MetricCard
                icon="feature.time"
                label="当前有效偏移"
                value={timeSyncOffsetText}
                meta="已保存配置"
                tone={timeSyncStatus?.enabled ? "success" : "neutral"}
              />
              <MetricCard
                icon="feature.sync"
                label="上次校时"
                value={timeSyncLastText}
                meta={
                  typeof timeSyncStatus?.lastRttMs === "number"
                    ? `RTT ${timeSyncStatus.lastRttMs} ms`
                    : "无 RTT 记录"
                }
                tone="info"
              />
            </SettingGrid>

            {timeSyncStatus?.lastError && timeSyncStatus.lastError.trim() && (
              <InfoPanel tone="danger" title="最近错误">
                {timeSyncStatus.lastError}
              </InfoPanel>
            )}
            {isDesktop && !ntpAvailable && (
              <InfoPanel tone="warning" title="NTP 能力未就绪">
                检测到桌面端环境，但 NTP preload
                未加载到最新版本；请重新启动桌面端或重新构建桌面端产物。
              </InfoPanel>
            )}
            {timeSyncProvider === "httpDate" && (
              <InfoPanel tone="info" title="HTTP Date 提示">
                跨域读取 HTTP Date 需要服务端配置 Expose-Headers: Date；建议同源或自建接口。
              </InfoPanel>
            )}
            {timeSyncProvider === "ntp" && (
              <InfoPanel tone="warning" title="NTP 网络提示">
                NTP 使用
                UDP/123，可能会被防火墙或网络策略拦截；若提示桌面端不可用，请先重建桌面端产物。
              </InfoPanel>
            )}
          </>
        )}
      </FormSection>

      <div hidden={isSectionHidden("schedule")}>
        <ScheduleEditor
          onRegisterSave={(save) => {
            scheduleSaveRef.current = save;
          }}
        />
      </div>
    </div>
  );
};

export default BasicSettingsPanel;
