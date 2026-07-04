import {
  Bell,
  BookOpen,
  Brush,
  CalendarClock,
  Clock3,
  CloudSun,
  Database,
  Eye,
  FileText,
  Gauge,
  Image as ImageIcon,
  Info,
  MapPin,
  MessageSquareText,
  Mic2,
  Palette,
  RotateCw,
  ShieldAlert,
  SlidersHorizontal,
  TimerReset,
  Type,
  Wifi,
} from "lucide-react";
import React, { useCallback, useEffect, useRef, useState } from "react";

import { useAppDispatch, useAppState } from "../../contexts/AppContext";
import { Button, Modal, StatusPill } from "../../ui";
import { logger } from "../../utils/logger";
import { broadcastSettingsEvent, SETTINGS_EVENTS } from "../../utils/settingsEvents";

import AboutSettingsPanel, { type AboutSettingsSection } from "./sections/AboutSettingsPanel";
import BasicSettingsPanel, { type BasicSettingsSection } from "./sections/BasicSettingsPanel";
import ContentSettingsPanel, {
  type ContentSettingsSection,
} from "./sections/ContentSettingsPanel";
import StudySettingsPanel, { type StudySettingsSection } from "./sections/StudySettingsPanel";
import WeatherSettingsPanel, {
  type WeatherSettingsSection,
} from "./sections/WeatherSettingsPanel";
import styles from "./SettingsPanel.module.css";

type SettingsPrimaryGroup = "workspace" | "appearance" | "environment" | "content" | "system";

type SettingsPaneId =
  | "startup"
  | "display"
  | "countdown"
  | "schedule"
  | "colors"
  | "fonts"
  | "background"
  | "weatherAlerts"
  | "weatherLocation"
  | "weatherLive"
  | "noiseControl"
  | "noiseCalibration"
  | "noiseReports"
  | "quoteRefresh"
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
      icon: React.ReactNode;
      panel: "basic";
      section: BasicSettingsSection;
    }
  | {
      value: SettingsPaneId;
      group: SettingsPrimaryGroup;
      label: string;
      description: string;
      icon: React.ReactNode;
      panel: "weather";
      section: WeatherSettingsSection;
    }
  | {
      value: SettingsPaneId;
      group: SettingsPrimaryGroup;
      label: string;
      description: string;
      icon: React.ReactNode;
      panel: "monitor";
      section: StudySettingsSection;
    }
  | {
      value: SettingsPaneId;
      group: SettingsPrimaryGroup;
      label: string;
      description: string;
      icon: React.ReactNode;
      panel: "quotes";
      section: ContentSettingsSection;
    }
  | {
      value: SettingsPaneId;
      group: SettingsPrimaryGroup;
      label: string;
      description: string;
      icon: React.ReactNode;
      panel: "about";
      section: AboutSettingsSection;
    };

interface SettingsPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

const primaryGroups: Array<{
  value: SettingsPrimaryGroup;
  label: string;
  description: string;
  icon: React.ReactNode;
  defaultPane: SettingsPaneId;
}> = [
  {
    value: "workspace",
    label: "常用工作台",
    description: "启动、自习与倒计时",
    icon: <SlidersHorizontal size={18} aria-hidden="true" />,
    defaultPane: "startup",
  },
  {
    value: "appearance",
    label: "视觉外观",
    description: "颜色、字体与背景",
    icon: <Palette size={18} aria-hidden="true" />,
    defaultPane: "colors",
  },
  {
    value: "environment",
    label: "环境提醒",
    description: "天气、噪音与报告",
    icon: <Bell size={18} aria-hidden="true" />,
    defaultPane: "weatherAlerts",
  },
  {
    value: "content",
    label: "内容语录",
    description: "刷新与渠道管理",
    icon: <MessageSquareText size={18} aria-hidden="true" />,
    defaultPane: "quoteRefresh",
  },
  {
    value: "system",
    label: "系统数据",
    description: "校时、导入导出与调试",
    icon: <Database size={18} aria-hidden="true" />,
    defaultPane: "timeSync",
  },
];

const paneItems: SettingsPane[] = [
  {
    value: "startup",
    group: "workspace",
    label: "启动页面",
    description: "设置刷新或下次启动时默认进入的页面。",
    icon: <Clock3 size={20} aria-hidden="true" />,
    panel: "basic",
    section: "startup",
  },
  {
    value: "display",
    group: "workspace",
    label: "自习显示",
    description: "选择自习主屏显示哪些辅助组件。",
    icon: <Eye size={20} aria-hidden="true" />,
    panel: "basic",
    section: "display",
  },
  {
    value: "countdown",
    group: "workspace",
    label: "倒计时",
    description: "配置高考、单事件或多事件倒计时。",
    icon: <TimerReset size={20} aria-hidden="true" />,
    panel: "basic",
    section: "countdown",
  },
  {
    value: "schedule",
    group: "workspace",
    label: "课程表",
    description: "管理自习课程时间段和导入数据。",
    icon: <BookOpen size={20} aria-hidden="true" />,
    panel: "basic",
    section: "schedule",
  },
  {
    value: "colors",
    group: "appearance",
    label: "时间颜色",
    description: "调整中央时间和日期颜色。",
    icon: <Brush size={20} aria-hidden="true" />,
    panel: "basic",
    section: "colors",
  },
  {
    value: "fonts",
    group: "appearance",
    label: "字体",
    description: "设置数字字体、文本字体和本地字体导入。",
    icon: <Type size={20} aria-hidden="true" />,
    panel: "basic",
    section: "fonts",
  },
  {
    value: "background",
    group: "appearance",
    label: "背景",
    description: "选择自习页面背景来源、颜色或图片。",
    icon: <ImageIcon size={20} aria-hidden="true" />,
    panel: "basic",
    section: "background",
  },
  {
    value: "weatherAlerts",
    group: "environment",
    label: "天气提醒",
    description: "控制预警、降水、空气质量和日出日落提醒。",
    icon: <CloudSun size={20} aria-hidden="true" />,
    panel: "weather",
    section: "alerts",
  },
  {
    value: "weatherLocation",
    group: "environment",
    label: "定位刷新",
    description: "设置天气刷新频率、定位方式和当前坐标。",
    icon: <MapPin size={20} aria-hidden="true" />,
    panel: "weather",
    section: "location",
  },
  {
    value: "weatherLive",
    group: "environment",
    label: "实时天气",
    description: "查看当前天气、空气质量和未来三日概览。",
    icon: <CalendarClock size={20} aria-hidden="true" />,
    panel: "weather",
    section: "live",
  },
  {
    value: "noiseControl",
    group: "environment",
    label: "噪音控制",
    description: "调整阈值、分贝显示和平滑策略。",
    icon: <Gauge size={20} aria-hidden="true" />,
    panel: "monitor",
    section: "control",
  },
  {
    value: "noiseCalibration",
    group: "environment",
    label: "校准修正",
    description: "校准环境基准噪音或手动修正噪音水平。",
    icon: <Mic2 size={20} aria-hidden="true" />,
    panel: "monitor",
    section: "calibration",
  },
  {
    value: "noiseReports",
    group: "environment",
    label: "报告统计",
    description: "管理噪音报告、实时监控和统计数据。",
    icon: <FileText size={20} aria-hidden="true" />,
    panel: "monitor",
    section: "reports",
  },
  {
    value: "quoteRefresh",
    group: "content",
    label: "刷新策略",
    description: "设置自习页面语录自动刷新节奏。",
    icon: <RotateCw size={20} aria-hidden="true" />,
    panel: "quotes",
    section: "refresh",
  },
  {
    value: "quoteChannels",
    group: "content",
    label: "语录渠道",
    description: "管理语录来源、权重、分类和本地内容。",
    icon: <MessageSquareText size={20} aria-hidden="true" />,
    panel: "quotes",
    section: "channels",
  },
  {
    value: "timeSync",
    group: "system",
    label: "时间校准",
    description: "启用外部时间源和手动偏移修正。",
    icon: <Wifi size={20} aria-hidden="true" />,
    panel: "basic",
    section: "timeSync",
  },
  {
    value: "project",
    group: "system",
    label: "项目信息",
    description: "查看版本、授权信息和项目链接。",
    icon: <Info size={20} aria-hidden="true" />,
    panel: "about",
    section: "project",
  },
  {
    value: "data",
    group: "system",
    label: "设置数据",
    description: "导入导出设置、清理缓存和重置本地数据。",
    icon: <Database size={20} aria-hidden="true" />,
    panel: "about",
    section: "data",
  },
  {
    value: "debug",
    group: "system",
    label: "错误与调试",
    description: "控制错误弹窗、记录方式和调试摘要。",
    icon: <ShieldAlert size={20} aria-hidden="true" />,
    panel: "about",
    section: "debug",
  },
];

function getPane(value: SettingsPaneId): SettingsPane {
  return paneItems.find((item) => item.value === value) ?? paneItems[0];
}

function getGroup(value: SettingsPrimaryGroup) {
  return primaryGroups.find((item) => item.value === value) ?? primaryGroups[0];
}

function getGroupForPane(value: SettingsPaneId): SettingsPrimaryGroup {
  return getPane(value).group;
}

function getDefaultPaneForGroup(value: SettingsPrimaryGroup): SettingsPaneId {
  return getGroup(value).defaultPane;
}

export function SettingsPanel({ isOpen, onClose }: SettingsPanelProps) {
  const { study } = useAppState();
  const dispatch = useAppDispatch();

  const [activeGroup, setActiveGroup] = useState<SettingsPrimaryGroup>("workspace");
  const [activePane, setActivePane] = useState<SettingsPaneId>("startup");
  const [targetYear, setTargetYear] = useState(study.targetYear);

  const basicSaveRef = useRef<() => void>(() => {});
  const weatherSaveRef = useRef<() => void>(() => {});
  const monitorSaveRef = useRef<() => void>(() => {});
  const quotesSaveRef = useRef<() => void>(() => {});
  const aboutSaveRef = useRef<() => void>(() => {});
  const contentRef = useRef<HTMLDivElement>(null);

  const handleClose = useCallback(() => {
    try {
      broadcastSettingsEvent(SETTINGS_EVENTS.SettingsPanelClosed);
    } finally {
      onClose();
    }
  }, [onClose]);

  const handleSaveAll = useCallback(() => {
    dispatch({ type: "SET_TARGET_YEAR", payload: targetYear });

    try {
      basicSaveRef.current?.();
      weatherSaveRef.current?.();
      monitorSaveRef.current?.();
      quotesSaveRef.current?.();
      aboutSaveRef.current?.();
    } catch (error) {
      logger.error("保存分区设置失败:", error);
      alert("保存设置时出现错误，请重试");
      return;
    }

    broadcastSettingsEvent(SETTINGS_EVENTS.SettingsSaved, { targetYear });
    handleClose();
  }, [targetYear, dispatch, handleClose]);

  useEffect(() => {
    if (isOpen) {
      setTargetYear(study.targetYear);
      setActiveGroup("workspace");
      setActivePane("startup");
    }
  }, [isOpen, study.targetYear]);

  useEffect(() => {
    if (!isOpen) return;
    contentRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  }, [activePane, isOpen]);

  if (!isOpen) return null;

  const activeGroupItem = getGroup(activeGroup);
  const activePaneItem = getPane(activePane);
  const visiblePaneItems = paneItems.filter((item) => item.group === activeGroup);

  const renderActivePane = () => {
    switch (activePaneItem.panel) {
      case "basic":
        return (
          <BasicSettingsPanel
            section={activePaneItem.section}
            targetYear={targetYear}
            onTargetYearChange={setTargetYear}
            onRegisterSave={(fn) => {
              basicSaveRef.current = fn;
            }}
          />
        );
      case "weather":
        return (
          <WeatherSettingsPanel
            section={activePaneItem.section}
            onRegisterSave={(fn) => {
              weatherSaveRef.current = fn;
            }}
          />
        );
      case "monitor":
        return (
          <StudySettingsPanel
            section={activePaneItem.section}
            onRegisterSave={(fn) => {
              monitorSaveRef.current = fn;
            }}
          />
        );
      case "quotes":
        return (
          <ContentSettingsPanel
            section={activePaneItem.section}
            onRegisterSave={(fn) => {
              quotesSaveRef.current = fn;
            }}
          />
        );
      case "about":
        return (
          <AboutSettingsPanel
            section={activePaneItem.section}
            onRegisterSave={(fn) => {
              aboutSaveRef.current = fn;
            }}
          />
        );
      default:
        return null;
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title="设置"
      fullScreen
      hideHeader
      className={styles.settingsModal}
    >
      <div id="settings-panel-container" className={styles.settingsApp}>
        <header className={styles.topNav}>
          <nav className={styles.topNavList} aria-label="设置一级分类">
            {primaryGroups.map((group) => {
              const active = group.value === activeGroup;
              return (
                <button
                  key={group.value}
                  className={active ? styles.topNavItemActive : styles.topNavItem}
                  type="button"
                  aria-label={group.label}
                  aria-current={active ? "page" : undefined}
                  title={group.label}
                  onClick={() => {
                    setActiveGroup(group.value);
                    setActivePane(getDefaultPaneForGroup(group.value));
                  }}
                >
                  {group.icon}
                  <span className={styles.topNavText}>
                    <span>{group.label}</span>
                    <small>{group.description}</small>
                  </span>
                </button>
              );
            })}
          </nav>
        </header>

        <div className={styles.settingsWorkspace}>
          <aside className={styles.sideNav} aria-label="设置二级分类">
            <div className={styles.sideNavHeader}>
              <strong>{activeGroupItem.label}</strong>
              <span>{activeGroupItem.description}</span>
            </div>
            <nav className={styles.sideNavList}>
              {visiblePaneItems.map((pane) => {
                const active = pane.value === activePane;
                return (
                  <button
                    key={pane.value}
                    className={active ? styles.sideNavItemActive : styles.sideNavItem}
                    type="button"
                    aria-label={pane.label}
                    aria-current={active ? "page" : undefined}
                    title={pane.label}
                    onClick={() => {
                      setActivePane(pane.value);
                      setActiveGroup(getGroupForPane(pane.value));
                    }}
                  >
                    {pane.icon}
                    <span>{pane.label}</span>
                  </button>
                );
              })}
            </nav>
          </aside>

          <main className={styles.contentPane}>
            <div className={styles.contentHeader}>
              <div className={styles.contentHeaderText}>
                <p className={styles.contentEyebrow}>{activeGroupItem.label}</p>
                <h2>{activePaneItem.label}</h2>
                <p className={styles.contentDescription}>{activePaneItem.description}</p>
              </div>
              <StatusPill
                className={styles.contentPill}
                tone="accent"
                icon={activePaneItem.icon}
              >
                {activeGroupItem.label}
              </StatusPill>
            </div>

            <div ref={contentRef} className={styles.contentBody}>
              {renderActivePane()}
            </div>

            <footer className={styles.actionBar}>
              <Button id="settings-close-btn" variant="secondary" onClick={handleClose}>
                取消
              </Button>
              <Button id="settings-save-btn" variant="primary" onClick={handleSaveAll}>
                保存
              </Button>
            </footer>
          </main>
        </div>
      </div>
    </Modal>
  );
}
