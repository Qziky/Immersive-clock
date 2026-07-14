import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import { useAppDispatch, useAppState } from "../../contexts/AppContext";
import { useAppearance } from "../../contexts/AppearanceContext";
import { AppIcon, Button, IconButton, Modal, type AppIconName, useFeedback } from "../../ui";
import { usePresence } from "../../ui/utils/usePresence";
import { logger } from "../../utils/logger";
import { broadcastSettingsEvent, SETTINGS_EVENTS } from "../../utils/settingsEvents";

import AboutSettingsPanel, { type AboutSettingsSection } from "./sections/AboutSettingsPanel";
import {
  AppearanceSettingsPanel,
  type AppearanceSettingsSection,
} from "./sections/AppearanceSettingsPanel";
import BasicSettingsPanel, { type BasicSettingsSection } from "./sections/BasicSettingsPanel";
import ContentSettingsPanel, { type ContentSettingsSection } from "./sections/ContentSettingsPanel";
import DataSettingsPanel from "./sections/DataSettingsPanel";
import StudySettingsPanel, { type StudySettingsSection } from "./sections/StudySettingsPanel";
import WeatherSettingsPanel, { type WeatherSettingsSection } from "./sections/WeatherSettingsPanel";
import styles from "./SettingsPanel.module.css";

type SettingsPrimaryGroup = "workspace" | "appearance" | "environment" | "content" | "system";

type SettingsPaneId =
  | "startup"
  | "display"
  | "countdown"
  | "schedule"
  | "appearanceOverview"
  | "appearanceTime"
  | "appearanceStudyQuote"
  | "appearanceStudyTopDock"
  | "weatherAlerts"
  | "weatherLocation"
  | "weatherLive"
  | "noiseControl"
  | "noiseCalibration"
  | "noiseReports"
  | "quoteRefresh"
  | "quoteEffects"
  | "quoteChannels"
  | "timeSync"
  | "project"
  | "data"
  | "debug";

type SettingsPane =
  | {
      value: SettingsPaneId;
      group: SettingsPrimaryGroup;
      label: string;
      description: string;
      icon: AppIconName;
      panel: "basic";
      section: BasicSettingsSection;
    }
  | {
      value: SettingsPaneId;
      group: "appearance";
      label: string;
      description: string;
      icon: AppIconName;
      panel: "appearance";
      section: AppearanceSettingsSection;
    }
  | {
      value: SettingsPaneId;
      group: SettingsPrimaryGroup;
      label: string;
      description: string;
      icon: AppIconName;
      panel: "weather";
      section: WeatherSettingsSection;
    }
  | {
      value: SettingsPaneId;
      group: SettingsPrimaryGroup;
      label: string;
      description: string;
      icon: AppIconName;
      panel: "monitor";
      section: StudySettingsSection;
    }
  | {
      value: SettingsPaneId;
      group: SettingsPrimaryGroup;
      label: string;
      description: string;
      icon: AppIconName;
      panel: "quotes";
      section: ContentSettingsSection;
    }
  | {
      value: SettingsPaneId;
      group: SettingsPrimaryGroup;
      label: string;
      description: string;
      icon: AppIconName;
      panel: "about";
      section: AboutSettingsSection;
    }
  | {
      value: "data";
      group: "system";
      label: string;
      description: string;
      icon: AppIconName;
      panel: "data";
      section: "data";
    };

interface SettingsPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

const primaryGroups: Array<{
  value: SettingsPrimaryGroup;
  label: string;
  description: string;
  icon: AppIconName;
  defaultPane: SettingsPaneId;
}> = [
  {
    value: "workspace",
    label: "常用工作台",
    description: "启动、自习与倒计时",
    icon: "feature.workspace",
    defaultPane: "startup",
  },
  {
    value: "appearance",
    label: "视觉外观",
    description: "颜色、字体与背景",
    icon: "feature.appearance",
    defaultPane: "appearanceOverview",
  },
  {
    value: "environment",
    label: "环境提醒",
    description: "天气、噪音与报告",
    icon: "feature.notification",
    defaultPane: "weatherAlerts",
  },
  {
    value: "content",
    label: "内容语录",
    description: "刷新、显示与渠道管理",
    icon: "feature.quotes",
    defaultPane: "quoteRefresh",
  },
  {
    value: "system",
    label: "系统数据",
    description: "校时、导入导出与调试",
    icon: "feature.data",
    defaultPane: "timeSync",
  },
];

const paneItems: SettingsPane[] = [
  {
    value: "startup",
    group: "workspace",
    label: "启动页面",
    description: "设置刷新或下次启动时默认进入的页面。",
    icon: "mode.clock",
    panel: "basic",
    section: "startup",
  },
  {
    value: "display",
    group: "workspace",
    label: "自习显示",
    description: "选择自习主屏显示哪些辅助组件。",
    icon: "appearance.preview",
    panel: "basic",
    section: "display",
  },
  {
    value: "countdown",
    group: "workspace",
    label: "倒计时",
    description: "配置高考、单事件或多事件倒计时。",
    icon: "feature.countdown",
    panel: "basic",
    section: "countdown",
  },
  {
    value: "schedule",
    group: "workspace",
    label: "课程表",
    description: "管理自习课程时间段和导入数据。",
    icon: "feature.schedule",
    panel: "basic",
    section: "schedule",
  },
  {
    value: "appearanceOverview",
    group: "appearance",
    label: "整体样式",
    description: "设置所有页面共用的字体、背景与外观资源。",
    icon: "feature.appearance",
    panel: "appearance",
    section: "overview",
  },
  {
    value: "appearanceTime",
    group: "appearance",
    label: "时间显示",
    description: "分别调整时钟、倒计时、秒表和自习时间。",
    icon: "feature.time",
    panel: "appearance",
    section: "time",
  },
  {
    value: "appearanceStudyQuote",
    group: "appearance",
    label: "语录",
    description: "设置语录文字与光标。",
    icon: "feature.quotes",
    panel: "appearance",
    section: "studyQuote",
  },
  {
    value: "appearanceStudyTopDock",
    group: "appearance",
    label: "顶部信息栏",
    description: "设置栏体及天气、噪音、计划进度与事件信息。",
    icon: "feature.workspace",
    panel: "appearance",
    section: "studyTopDock",
  },
  {
    value: "weatherAlerts",
    group: "environment",
    label: "天气提醒",
    description: "控制预警、降水、空气质量和日出日落提醒。",
    icon: "feature.weatherAlerts",
    panel: "weather",
    section: "alerts",
  },
  {
    value: "weatherLocation",
    group: "environment",
    label: "定位刷新",
    description: "设置天气刷新频率、定位方式和当前坐标。",
    icon: "feature.location",
    panel: "weather",
    section: "location",
  },
  {
    value: "weatherLive",
    group: "environment",
    label: "实时天气",
    description: "查看当前天气、空气质量和未来三日概览。",
    icon: "feature.weatherLive",
    panel: "weather",
    section: "live",
  },
  {
    value: "noiseControl",
    group: "environment",
    label: "噪音控制",
    description: "调整阈值、分贝显示和平滑策略。",
    icon: "feature.noise",
    panel: "monitor",
    section: "control",
  },
  {
    value: "noiseCalibration",
    group: "environment",
    label: "校准修正",
    description: "校准环境基准噪音或手动修正噪音水平。",
    icon: "feature.microphone",
    panel: "monitor",
    section: "calibration",
  },
  {
    value: "noiseReports",
    group: "environment",
    label: "报告统计",
    description: "管理噪音报告、实时监控和统计数据。",
    icon: "feature.noiseReport",
    panel: "monitor",
    section: "reports",
  },
  {
    value: "quoteRefresh",
    group: "content",
    label: "刷新策略",
    description: "设置自习页面语录自动刷新节奏。",
    icon: "feature.sync",
    panel: "quotes",
    section: "refresh",
  },
  {
    value: "quoteEffects",
    group: "content",
    label: "显示效果",
    description: "自定义语录出现时的动画与打字速度。",
    icon: "appearance.effects",
    panel: "quotes",
    section: "effects",
  },
  {
    value: "quoteChannels",
    group: "content",
    label: "语录渠道",
    description: "管理语录来源、权重、分类和本地内容。",
    icon: "feature.quotes",
    panel: "quotes",
    section: "channels",
  },
  {
    value: "timeSync",
    group: "system",
    label: "时间校准",
    description: "启用外部时间源和手动偏移修正。",
    icon: "feature.timeCalibration",
    panel: "basic",
    section: "timeSync",
  },
  {
    value: "project",
    group: "system",
    label: "项目信息",
    description: "查看版本、授权信息和项目链接。",
    icon: "feature.about",
    panel: "about",
    section: "project",
  },
  {
    value: "data",
    group: "system",
    label: "设置数据",
    description: "导入导出设置、清理缓存和重置本地数据。",
    icon: "feature.data",
    panel: "data",
    section: "data",
  },
  {
    value: "debug",
    group: "system",
    label: "错误与调试",
    description: "控制错误弹窗、记录方式和调试摘要。",
    icon: "feature.diagnostics",
    panel: "about",
    section: "debug",
  },
];

const DEFAULT_PANES_BY_GROUP: Record<SettingsPrimaryGroup, SettingsPaneId> = {
  workspace: "startup",
  appearance: "appearanceOverview",
  environment: "weatherAlerts",
  content: "quoteRefresh",
  system: "timeSync",
};

function getPane(value: SettingsPaneId): SettingsPane {
  return paneItems.find((item) => item.value === value) ?? paneItems[0];
}

function getGroup(value: SettingsPrimaryGroup) {
  return primaryGroups.find((item) => item.value === value) ?? primaryGroups[0];
}

function getGroupForPane(value: SettingsPaneId): SettingsPrimaryGroup {
  return getPane(value).group;
}

export function SettingsPanel({ isOpen, onClose }: SettingsPanelProps) {
  const { study } = useAppState();
  const dispatch = useAppDispatch();
  const { notify } = useFeedback();
  const { cancelAppearancePreview, commitAppearanceDraft, committedAppearance, draftAppearance } =
    useAppearance();

  const [activeGroup, setActiveGroup] = useState<SettingsPrimaryGroup>("workspace");
  const [expandedGroup, setExpandedGroup] = useState<SettingsPrimaryGroup | null>("workspace");
  const [compactMenuGroup, setCompactMenuGroup] = useState<SettingsPrimaryGroup | null>(null);
  const [renderedCompactMenuGroup, setRenderedCompactMenuGroup] =
    useState<SettingsPrimaryGroup>("workspace");
  const [activePane, setActivePane] = useState<SettingsPaneId>("startup");
  const [lastPaneByGroup, setLastPaneByGroup] =
    useState<Record<SettingsPrimaryGroup, SettingsPaneId>>(DEFAULT_PANES_BY_GROUP);
  const [visitedPanels, setVisitedPanels] = useState<Set<SettingsPane["panel"]>>(
    () => new Set(["basic"])
  );
  const [draftSession, setDraftSession] = useState(0);
  const [targetYear, setTargetYear] = useState(study.targetYear);
  const [dataBusy, setDataBusy] = useState(false);
  const [reloadPending, setReloadPending] = useState(false);

  const hasUnsavedAppearanceChanges = useMemo(
    () =>
      draftAppearance !== null &&
      JSON.stringify(draftAppearance) !== JSON.stringify(committedAppearance),
    [committedAppearance, draftAppearance]
  );
  const settingsBusy = dataBusy || reloadPending;

  const basicSaveRef = useRef<() => void>(() => {});
  const weatherSaveRef = useRef<() => void>(() => {});
  const monitorSaveRef = useRef<() => void>(() => {});
  const quotesSaveRef = useRef<() => void>(() => {});
  const aboutSaveRef = useRef<() => void>(() => {});
  const contentRef = useRef<HTMLDivElement>(null);
  const wasOpenRef = useRef(isOpen);

  useLayoutEffect(() => {
    if (isOpen && !wasOpenRef.current) {
      setTargetYear(study.targetYear);
      setActiveGroup("workspace");
      setExpandedGroup("workspace");
      setCompactMenuGroup(null);
      setRenderedCompactMenuGroup("workspace");
      setActivePane("startup");
      setLastPaneByGroup(DEFAULT_PANES_BY_GROUP);
      setVisitedPanels(new Set(["basic"]));
      setDraftSession((current) => current + 1);
      setDataBusy(false);
      setReloadPending(false);
    }
    wasOpenRef.current = isOpen;
  }, [isOpen, study.targetYear]);

  const registerBasicSave = useCallback((save: () => void) => {
    basicSaveRef.current = save;
  }, []);
  const registerWeatherSave = useCallback((save: () => void) => {
    weatherSaveRef.current = save;
  }, []);
  const registerMonitorSave = useCallback((save: () => void) => {
    monitorSaveRef.current = save;
  }, []);
  const registerQuotesSave = useCallback((save: () => void) => {
    quotesSaveRef.current = save;
  }, []);
  const registerAboutSave = useCallback((save: () => void) => {
    aboutSaveRef.current = save;
  }, []);

  const handleDataBusyChange = useCallback((isBusy: boolean) => {
    setDataBusy(isBusy);
  }, []);

  const handleClose = useCallback(() => {
    if (settingsBusy) return;
    try {
      cancelAppearancePreview();
      broadcastSettingsEvent(SETTINGS_EVENTS.SettingsPanelClosed);
    } finally {
      onClose();
    }
  }, [cancelAppearancePreview, onClose, settingsBusy]);

  const handleDataReloadRequired = useCallback(() => {
    if (reloadPending) return;
    setReloadPending(true);
    try {
      cancelAppearancePreview();
      broadcastSettingsEvent(SETTINGS_EVENTS.SettingsPanelClosed);
    } finally {
      onClose();
      window.setTimeout(() => window.location.reload(), 800);
    }
  }, [cancelAppearancePreview, onClose, reloadPending]);

  const handleSaveAll = useCallback(() => {
    if (settingsBusy) return;
    try {
      if (visitedPanels.has("appearance")) commitAppearanceDraft();
      basicSaveRef.current?.();
      if (visitedPanels.has("weather")) weatherSaveRef.current?.();
      if (visitedPanels.has("monitor")) monitorSaveRef.current?.();
      if (visitedPanels.has("quotes")) quotesSaveRef.current?.();
      if (visitedPanels.has("about")) aboutSaveRef.current?.();
      dispatch({ type: "SET_TARGET_YEAR", payload: targetYear });
    } catch (error) {
      logger.error("保存分区设置失败:", error);
      notify({
        variant: "danger",
        title: "保存失败",
        description: error instanceof Error ? error.message : "保存设置时出现错误，请重试。",
      });
      return;
    }

    broadcastSettingsEvent(SETTINGS_EVENTS.SettingsSaved, { targetYear });
    handleClose();
  }, [
    targetYear,
    dispatch,
    handleClose,
    notify,
    visitedPanels,
    commitAppearanceDraft,
    settingsBusy,
  ]);

  useEffect(() => {
    if (!isOpen) return;
    const panel = getPane(activePane).panel;
    setVisitedPanels((current) => {
      if (current.has(panel)) return current;
      const next = new Set(current);
      next.add(panel);
      return next;
    });
  }, [activePane, isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    contentRef.current?.scrollTo?.({ top: 0 });
  }, [activePane, isOpen]);

  const handleGroupChange = useCallback(
    (group: SettingsPrimaryGroup) => {
      if (settingsBusy) return;
      setActiveGroup(group);
      setExpandedGroup(group);
      setActivePane(lastPaneByGroup[group]);
    },
    [lastPaneByGroup, settingsBusy]
  );

  const handleDesktopGroupToggle = useCallback(
    (group: SettingsPrimaryGroup) => {
      if (settingsBusy) return;
      if (expandedGroup === group) {
        setExpandedGroup(null);
        return;
      }
      handleGroupChange(group);
    },
    [expandedGroup, handleGroupChange, settingsBusy]
  );

  const handlePaneChange = useCallback(
    (pane: SettingsPaneId) => {
      if (settingsBusy) return;
      const group = getGroupForPane(pane);
      setActiveGroup(group);
      setActivePane(pane);
      setCompactMenuGroup(null);
      setLastPaneByGroup((current) => ({ ...current, [group]: pane }));
    },
    [settingsBusy]
  );

  const handleCompactMenuOpen = useCallback(
    (group: SettingsPrimaryGroup) => {
      if (settingsBusy) return;
      setRenderedCompactMenuGroup(group);
      setCompactMenuGroup(group);
    },
    [settingsBusy]
  );

  const activeGroupItem = getGroup(activeGroup);
  const activePaneItem = getPane(activePane);
  const compactMenuOpen = compactMenuGroup !== null;
  const {
    isPresent: compactMenuPresent,
    presenceState: compactMenuPresenceState,
    shouldAnimate: shouldAnimateCompactMenu,
  } = usePresence({ isOpen: compactMenuOpen });
  const compactMenuGroupItem = compactMenuPresent ? getGroup(renderedCompactMenuGroup) : null;
  const compactMenuPaneItems = compactMenuPresent
    ? paneItems.filter((item) => item.group === renderedCompactMenuGroup)
    : [];
  const basicSection: BasicSettingsSection =
    activePaneItem.panel === "basic" ? activePaneItem.section : "startup";
  const weatherSection: WeatherSettingsSection =
    activePaneItem.panel === "weather" ? activePaneItem.section : "alerts";
  const monitorSection: StudySettingsSection =
    activePaneItem.panel === "monitor" ? activePaneItem.section : "control";
  const quotesSection: ContentSettingsSection =
    activePaneItem.panel === "quotes" ? activePaneItem.section : "refresh";
  const aboutSection: AboutSettingsSection =
    activePaneItem.panel === "about" ? activePaneItem.section : "project";
  const appearanceSection: AppearanceSettingsSection =
    activePaneItem.panel === "appearance" ? activePaneItem.section : "overview";

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      closeOnEscape={!settingsBusy}
      title="设置"
      placement="left"
      maxWidth="xxl"
      hideHeader
      className={styles.settingsModal}
    >
      <div
        id="settings-panel-container"
        className={styles.settingsApp}
        aria-busy={settingsBusy || undefined}
      >
        <header className={styles.drawerHeader}>
          <div className={styles.drawerTitle}>
            <AppIcon name="feature.settings" size="lg" />
            <h1>设置</h1>
          </div>
          <IconButton
            className={styles.drawerClose}
            aria-label="关闭设置"
            icon="action.close"
            size="sm"
            disabled={settingsBusy}
            onClick={handleClose}
          />
        </header>

        <div className={styles.settingsWorkspace}>
          <aside className={styles.sideNav} aria-label="设置导航">
            <nav className={styles.groupNav} aria-label="设置分组">
              {primaryGroups.map((group) => {
                const active = group.value === activeGroup;
                const expanded = group.value === expandedGroup;
                const groupPanes = paneItems.filter((pane) => pane.group === group.value);
                return (
                  <section className={styles.groupSection} key={group.value}>
                    <button
                      className={active ? styles.groupHeaderActive : styles.groupHeader}
                      type="button"
                      aria-expanded={expanded}
                      disabled={settingsBusy}
                      onClick={() => handleDesktopGroupToggle(group.value)}
                    >
                      <span className={styles.groupIcon}>
                        <AppIcon name={group.icon} size="lg" />
                      </span>
                      <span className={styles.groupText}>
                        <strong>{group.label}</strong>
                        <small>{group.description}</small>
                      </span>
                      <AppIcon
                        className={expanded ? styles.groupChevronActive : styles.groupChevron}
                        name="action.expand"
                        size="sm"
                      />
                    </button>
                    <div
                      className={
                        expanded ? styles.groupPanesRegionExpanded : styles.groupPanesRegion
                      }
                      aria-hidden={!expanded}
                      inert={expanded ? undefined : true}
                    >
                      <div className={styles.groupPanes} role="group" aria-label={group.label}>
                        {groupPanes.map((pane) => {
                          const paneActive = pane.value === activePane;
                          return (
                            <button
                              key={pane.value}
                              className={paneActive ? styles.sideNavItemActive : styles.sideNavItem}
                              type="button"
                              aria-current={paneActive ? "page" : undefined}
                              disabled={settingsBusy}
                              onClick={() => handlePaneChange(pane.value)}
                            >
                              <AppIcon name={pane.icon} size="xl" />
                              <span>{pane.label}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </section>
                );
              })}
            </nav>
          </aside>

          <div
            className={styles.compactNavigation}
            onMouseLeave={() => setCompactMenuGroup(null)}
            onKeyDown={(event) => {
              if (event.key !== "Escape" || !compactMenuGroup) return;
              event.preventDefault();
              event.stopPropagation();
              setCompactMenuGroup(null);
            }}
          >
            <nav className={styles.compactGroupRail} aria-label="设置紧凑导航">
              {primaryGroups.map((group) => {
                const active = group.value === activeGroup;
                const expanded = group.value === compactMenuGroup;
                return (
                  <IconButton
                    key={group.value}
                    data-settings-group={group.value}
                    className={
                      expanded
                        ? styles.compactGroupOpen
                        : active
                          ? styles.compactGroupActive
                          : styles.compactGroup
                    }
                    aria-label={group.label}
                    aria-current={active ? "page" : undefined}
                    aria-expanded={expanded}
                    aria-controls={expanded ? "settings-compact-submenu" : undefined}
                    icon={group.icon}
                    size="lg"
                    variant="ghost"
                    disabled={settingsBusy}
                    onClick={() => handleCompactMenuOpen(group.value)}
                  />
                );
              })}
            </nav>
            {compactMenuGroupItem && (
              <section
                className={styles.compactMenu}
                id="settings-compact-submenu"
                aria-labelledby="settings-compact-menu-title"
                aria-hidden={compactMenuOpen ? undefined : "true"}
                data-ui-motion={shouldAnimateCompactMenu ? "default" : "none"}
                data-ui-presence={compactMenuPresenceState}
                inert={compactMenuOpen ? undefined : true}
                style={
                  {
                    "--settings-compact-menu-top": `${
                      10 +
                      primaryGroups.findIndex((group) => group.value === renderedCompactMenuGroup) *
                        50
                    }px`,
                  } as React.CSSProperties
                }
              >
                <header className={styles.compactMenuHeader}>
                  <strong id="settings-compact-menu-title">{compactMenuGroupItem.label}</strong>
                  <span>{compactMenuGroupItem.description}</span>
                </header>
                <nav
                  className={styles.compactPaneList}
                  aria-label={`${compactMenuGroupItem.label}子分类`}
                >
                  {compactMenuPaneItems.map((pane) => {
                    const active = pane.value === activePane;
                    return (
                      <button
                        key={pane.value}
                        data-settings-pane={pane.value}
                        className={active ? styles.compactPaneItemActive : styles.compactPaneItem}
                        type="button"
                        aria-current={active ? "page" : undefined}
                        disabled={settingsBusy}
                        onClick={() => handlePaneChange(pane.value)}
                      >
                        <AppIcon name={pane.icon} size="lg" />
                        <span>{pane.label}</span>
                      </button>
                    );
                  })}
                </nav>
              </section>
            )}
          </div>

          {compactMenuGroupItem && (
            <button
              className={styles.compactMenuScrim}
              type="button"
              aria-label="关闭设置子菜单"
              aria-hidden={compactMenuOpen ? undefined : "true"}
              data-ui-motion={shouldAnimateCompactMenu ? "default" : "none"}
              data-ui-presence={compactMenuPresenceState}
              inert={compactMenuOpen ? undefined : true}
              tabIndex={-1}
              onClick={() => setCompactMenuGroup(null)}
            />
          )}

          <section className={styles.contentPane} aria-labelledby="settings-pane-title">
            <header className={styles.contentHeader}>
              <div key={activePane} className={styles.contentHeaderMotion}>
                <span className={styles.contentGroupLabel}>{activeGroupItem.label}</span>
                <h2 id="settings-pane-title">{activePaneItem.label}</h2>
                <p className={styles.contentDescription}>{activePaneItem.description}</p>
              </div>
            </header>

            <div ref={contentRef} className={styles.contentBody}>
              {visitedPanels.has("basic") && (
                <div className={styles.panelMount} hidden={activePaneItem.panel !== "basic"}>
                  <BasicSettingsPanel
                    key={`basic-${draftSession}`}
                    section={basicSection}
                    targetYear={targetYear}
                    onTargetYearChange={setTargetYear}
                    onRegisterSave={registerBasicSave}
                  />
                </div>
              )}
              {visitedPanels.has("appearance") && (
                <div className={styles.panelMount} hidden={activePaneItem.panel !== "appearance"}>
                  <AppearanceSettingsPanel
                    key={`appearance-${draftSession}`}
                    section={appearanceSection}
                  />
                </div>
              )}
              {visitedPanels.has("weather") && (
                <div className={styles.panelMount} hidden={activePaneItem.panel !== "weather"}>
                  <WeatherSettingsPanel
                    key={`weather-${draftSession}`}
                    section={weatherSection}
                    onRegisterSave={registerWeatherSave}
                  />
                </div>
              )}
              {visitedPanels.has("monitor") && (
                <div className={styles.panelMount} hidden={activePaneItem.panel !== "monitor"}>
                  <StudySettingsPanel
                    key={`monitor-${draftSession}`}
                    section={monitorSection}
                    onRegisterSave={registerMonitorSave}
                  />
                </div>
              )}
              {visitedPanels.has("quotes") && (
                <div className={styles.panelMount} hidden={activePaneItem.panel !== "quotes"}>
                  <ContentSettingsPanel
                    key={`quotes-${draftSession}`}
                    section={quotesSection}
                    onRegisterSave={registerQuotesSave}
                  />
                </div>
              )}
              {visitedPanels.has("about") && (
                <div className={styles.panelMount} hidden={activePaneItem.panel !== "about"}>
                  <AboutSettingsPanel
                    key={`about-${draftSession}`}
                    section={aboutSection}
                    onRegisterSave={registerAboutSave}
                  />
                </div>
              )}
              {visitedPanels.has("data") && (
                <div className={styles.panelMount} hidden={activePaneItem.panel !== "data"}>
                  <DataSettingsPanel
                    key={`data-${draftSession}`}
                    hasUnsavedAppearanceChanges={hasUnsavedAppearanceChanges}
                    onBusyChange={handleDataBusyChange}
                    onReloadRequired={handleDataReloadRequired}
                  />
                </div>
              )}
            </div>

            <footer className={styles.actionBar} aria-busy={settingsBusy || undefined}>
              <Button
                id="settings-close-btn"
                variant="secondary"
                disabled={settingsBusy}
                onClick={handleClose}
              >
                取消
              </Button>
              <Button
                id="settings-save-btn"
                variant="primary"
                disabled={settingsBusy}
                onClick={handleSaveAll}
              >
                保存
              </Button>
            </footer>
          </section>
        </div>
      </div>
    </Modal>
  );
}
