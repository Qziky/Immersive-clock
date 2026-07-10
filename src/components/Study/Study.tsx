import React, { useState, useCallback, useEffect, useRef, useMemo } from "react";

import { useAppState } from "../../contexts/AppContext";
import { useAppearance, useComponentAppearance } from "../../contexts/AppearanceContext";
import { useTimer } from "../../hooks/useTimer";
import { CountdownItem } from "../../types";
import { DEFAULT_SCHEDULE, StudyPeriod } from "../../types/studySchedule";
import { appearanceBackgroundToCss } from "../../utils/appearanceModel";
import { formatClock } from "../../utils/formatTime";
import { getAutoPopupSetting } from "../../utils/noiseReportSettings";
import { readStudySchedule } from "../../utils/studyScheduleStorage";
import { getAdjustedDate } from "../../utils/timeSync";
import { MotivationalQuote } from "../MotivationalQuote";
import NoiseHistoryModal from "../NoiseHistoryModal/NoiseHistoryModal";
import NoiseMonitor from "../NoiseMonitor";
import NoiseReportModal, { NoiseReportPeriod } from "../NoiseReportModal/NoiseReportModal";
import StudyStatus from "../StudyStatus";
import { Weather } from "../Weather";

import styles from "./Study.module.css";

/**
 * 自习组件
 * 显示当前时间和倒计时轮播
 */
export function Study() {
  const { study } = useAppState();
  const { activeAppearance, getBackgroundImage, resolveStyle } = useAppearance();
  const [currentTime, setCurrentTime] = useState<Date>(getAdjustedDate());
  const [reportOpen, setReportOpen] = useState(false);
  const [reportPeriod, setReportPeriod] = useState<NoiseReportPeriod | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  // [新增] 记录报告是否从历史记录界面打开
  const [reportFromHistory, setReportFromHistory] = useState(false);
  // 记录当前课时是否已弹出过报告，以及是否被手动关闭以避免重复弹出
  const lastPopupPeriodIdRef = useRef<string | null>(null);
  const dismissedPeriodIdRef = useRef<string | null>(null);

  // 轮播：容器与尺寸测量
  const countdownRef = useRef<HTMLDivElement | null>(null);
  const [itemHeight, setItemHeight] = useState<number>(0);
  const [activeIndex, setActiveIndex] = useState<number>(0);

  /**
   * 更新时间
   */
  const updateTime = useCallback(() => {
    setCurrentTime(getAdjustedDate());
  }, []);

  // 使用计时器每秒更新时间
  useTimer(updateTime, true, 1000);

  // 组件挂载时立即更新时间
  useEffect(() => {
    updateTime();
  }, [updateTime]);

  // 自动在本节课结束前1分钟弹出统计报告（不自动关闭；若手动关闭则在该课时结束前不再弹出）
  useEffect(() => {
    let schedule: StudyPeriod[] = DEFAULT_SCHEDULE;
    try {
      const data = readStudySchedule();
      if (Array.isArray(data) && data.length > 0) schedule = data;
    } catch {}

    const now = getAdjustedDate();
    const nowMin = now.getHours() * 60 + now.getMinutes();

    const toDate = (timeStr: string) => {
      const [h, m] = timeStr.split(":").map(Number);
      const d = getAdjustedDate();
      d.setHours(h, m, 0, 0);
      return d;
    };

    for (const p of schedule) {
      const start = toDate(p.startTime);
      const end = toDate(p.endTime);
      const startMin = start.getHours() * 60 + start.getMinutes();
      const endMin = end.getHours() * 60 + end.getMinutes();

      // 课时已结束，重置当前课时的弹出/关闭标记
      if (nowMin >= endMin) {
        if (lastPopupPeriodIdRef.current === p.id) {
          lastPopupPeriodIdRef.current = null;
        }
        if (dismissedPeriodIdRef.current === p.id) {
          dismissedPeriodIdRef.current = null;
        }
      }

      // 正在本节课内，并且进入结束前1分钟窗口（[end-1min, end)）
      if (nowMin >= startMin && nowMin < endMin && endMin - nowMin <= 1) {
        // 检查是否启用自动弹出设置
        const autoPopupEnabled = getAutoPopupSetting();

        // 若本课时已经弹出过，或被手动关闭过，或设置中禁用了自动弹出，则不再重复弹出
        const alreadyPopped = lastPopupPeriodIdRef.current === p.id;
        const dismissed = dismissedPeriodIdRef.current === p.id;
        if (!alreadyPopped && !dismissed && autoPopupEnabled) {
          setReportPeriod({ id: p.id, name: p.name, start, end });
          setReportOpen(true);
          setReportFromHistory(false); // 自动弹出不属于历史记录来源
          lastPopupPeriodIdRef.current = p.id;
        }
        break;
      }
    }
  }, [currentTime, reportOpen]);

  /** 工具函数：计算到指定日期的剩余天数（YYYY-MM-DD） */
  const calcDaysToDate = useCallback((dateStr?: string) => {
    if (!dateStr) return 0;
    const now = getAdjustedDate();
    const [y, m, d] = dateStr.split("-").map(Number);
    if (!y || !m || !d) return 0;
    const target = new Date(y, m - 1, d);
    const diffTime = target.getTime() - now.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return Math.max(0, diffDays);
  }, []);

  /** 计算到最近一次高考（6月7日）的剩余天数（函数级注释：根据设置的目标年份计算到6月7日的剩余天数，返回非负整数） */
  const calcDaysToNextGaokao = useCallback(() => {
    const now = getAdjustedDate();
    const year = study.targetYear || now.getFullYear();
    const target = new Date(year, 5, 7);
    const diffTime = target.getTime() - now.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return Math.max(0, diffDays);
  }, [study.targetYear]);

  const timeString = formatClock(currentTime);
  const [hours = "00", minutes = "00", seconds = "00"] = timeString.split(":");
  const primaryTime = `${hours}:${minutes}`;
  const dateString = currentTime.toLocaleDateString("zh-CN", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "long",
  });

  /** 构建轮播项（兼容旧配置） */
  const countdownItems: CountdownItem[] = (() => {
    const list = (study.countdownItems || []) as CountdownItem[];

    if (list && list.length > 0) {
      return [...list].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    }

    // 兼容旧版：仅一个倒计时
    const isCustom = (study.countdownType ?? "gaokao") === "custom";
    if (isCustom && study.customDate) {
      return [
        {
          id: "legacy-custom",
          kind: "custom",
          name: study.customName || "自定义事件",
          targetDate: study.customDate,
          order: 0,
          bgColor: undefined,
          textColor: undefined,
        },
      ];
    }
    return [
      {
        id: "legacy-gaokao",
        kind: "gaokao",
        name: `高考倒计时`,
        order: 0,
        bgColor: undefined,
        textColor: undefined,
      },
    ];
  })();

  const display = useMemo(
    () =>
      study.display || {
        showStatusBar: true,
        showNoiseMonitor: true,
        showCountdown: true,
        showQuote: true,
        showTime: true,
        showDate: true,
      },
    [study.display]
  );

  /** 测量倒计时可视项尺寸（函数级注释：读取轮播容器高度，保证切换时位移与单项高度一致） */
  const measureCountdown = useCallback(() => {
    const el = countdownRef.current;
    if (!el) {
      setItemHeight(0);
      return;
    }
    const containerRect = el.getBoundingClientRect();
    const nextHeight = Math.round(containerRect.height);
    setItemHeight((prev) => (prev === nextHeight ? prev : nextHeight));
  }, []);

  // 容器尺寸与宽度测量
  useEffect(() => {
    if (!display.showCountdown) {
      setItemHeight(0);
      return;
    }

    const measureWithRaf = () => {
      requestAnimationFrame(() => measureCountdown());
    };

    measureWithRaf();

    const el = countdownRef.current;
    const observer = el ? new ResizeObserver(measureWithRaf) : null;
    if (el && observer) {
      observer.observe(el);
    }

    window.addEventListener("resize", measureWithRaf);
    window.addEventListener("orientationchange", measureWithRaf);
    window.addEventListener("study-fonts-updated", measureWithRaf as EventListener);

    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", measureWithRaf);
      window.removeEventListener("orientationchange", measureWithRaf);
      window.removeEventListener("study-fonts-updated", measureWithRaf as EventListener);
    };
  }, [display.showCountdown, measureCountdown, countdownItems.length, activeIndex]);

  // 自动轮播：按配置间隔切换
  useEffect(() => {
    const total = countdownItems.length;
    if (total <= 1) return;
    const intervalSec = Math.max(1, Math.min(60, study.carouselIntervalSec ?? 6));
    const timer = setInterval(() => {
      setActiveIndex((i) => (i + 1) % total);
    }, intervalSec * 1000);
    return () => clearInterval(timer);
  }, [countdownItems.length, study.carouselIntervalSec]);

  const backgroundSettings = activeAppearance.scenes.study.background;
  const containerStyle = appearanceBackgroundToCss(backgroundSettings, getBackgroundImage("study"));
  const topDockAppearance = useComponentAppearance("studyTopDock", "surface");
  const primaryTimeAppearance = useComponentAppearance("studyTime", "primary");
  const secondsAppearance = useComponentAppearance("studyTime", "seconds");
  const dateAppearance = useComponentAppearance("studyTime", "date");

  // 手动关闭报告：记录当前课时的关闭标记，避免在窗口内重复弹出
  const handleCloseReport = useCallback(() => {
    if (reportPeriod) {
      dismissedPeriodIdRef.current = reportPeriod.id;
    }
    setReportOpen(false);
  }, [reportPeriod]);

  /** 返回历史记录（函数级注释：仅在从历史记录进入报告时提供“返回历史记录”按钮，避免关闭按钮产生隐式跳转） */
  const handleBackToHistory = useCallback(() => {
    if (reportPeriod) {
      dismissedPeriodIdRef.current = reportPeriod.id;
    }
    setReportOpen(false);
    setHistoryOpen(true);
    setReportFromHistory(false);
  }, [reportPeriod]);

  const handleCloseHistory = useCallback(() => {
    setHistoryOpen(false);
  }, []);

  /**
   * 打开噪音历史记录（函数级注释：由噪音监测“呼吸灯”触发，进入历史记录管理界面）
   */
  const handleOpenHistory = useCallback(() => {
    setHistoryOpen(true);
  }, []);

  /**
   * 从历史列表查看详情（函数级注释：关闭历史弹窗并打开报告弹窗，复用统一的统计报告 UI）
   */
  const handleViewHistoryDetail = useCallback((period: NoiseReportPeriod) => {
    setHistoryOpen(false);
    setReportPeriod(period);
    setReportOpen(true);
    setReportFromHistory(true); // 标记来源为历史记录
  }, []);

  // 计算每个项的文案与天数（函数级注释：前缀与天数分离，便于窄容器下优先保留核心天数）
  const renderItem = (item: (typeof countdownItems)[number]) => {
    const days = item.kind === "gaokao" ? calcDaysToNextGaokao() : calcDaysToDate(item.targetDate);
    // 高考事件：优先从名称中解析年份，否则使用设置中的目标年份
    let nameText: string;
    if (item.kind === "gaokao") {
      const rawName = (item.name || "").trim();
      const m = rawName.match(/\b(19|20)\d{2}\b/); // 尝试从名称中提取四位年份
      const year = m ? parseInt(m[0], 10) : study.targetYear || getAdjustedDate().getFullYear();
      nameText = `${year}高考`;
    } else {
      nameText = item.name && item.name.trim().length > 0 ? item.name!.trim() : "自定义事件";
    }
    const labelAppearance = resolveStyle("studyCountdown", "label", "text", {
      instanceId: item.id,
    });
    const digitAppearance = resolveStyle("studyCountdown", "digit", "numeric", {
      instanceId: item.id,
    });
    const unitAppearance = resolveStyle("studyCountdown", "unit", "text", {
      instanceId: item.id,
    });
    const itemAppearance = resolveStyle("studyCountdown", "surface", "surface", {
      instanceId: item.id,
    });
    return (
      <div key={item.id} className={styles.carouselItem} style={itemAppearance}>
        <span className={styles.countdownPrefix} style={labelAppearance}>
          距离{nameText}
        </span>
        <span className={styles.countdownOnly} style={labelAppearance}>
          仅
        </span>
        <span className={styles.days} style={digitAppearance}>
          {days}
        </span>
        <span className={styles.countdownUnit} style={unitAppearance}>
          天
        </span>
      </div>
    );
  };

  return (
    <div
      className={styles.container}
      data-background-type={backgroundSettings.type}
      style={containerStyle}
    >
      {/* 顶部：环境、课时与倒计时共用一条状态栏。 */}
      {(display.showStatusBar || display.showNoiseMonitor || display.showCountdown) && (
        <div className={styles.topDock} style={topDockAppearance}>
          {(display.showStatusBar || display.showNoiseMonitor) && (
            <div className={styles.auxDock}>
              {display.showStatusBar && (
                <div className={styles.weatherDock}>
                  <Weather />
                </div>
              )}
              {display.showNoiseMonitor && (
                <div className={styles.noiseDock}>
                  <NoiseMonitor
                    onBreathingLightClick={handleOpenHistory}
                    onStatusClick={handleOpenHistory}
                  />
                </div>
              )}
            </div>
          )}
          {display.showStatusBar && (
            <div className={styles.statusDock}>
              <StudyStatus />
            </div>
          )}
          {display.showCountdown && (
            <div className={styles.countdownDock}>
              <div className={styles.countdownCarousel} ref={countdownRef} aria-live="polite">
                <div
                  className={styles.carouselTrack}
                  style={{ transform: `translateY(-${activeIndex * (itemHeight || 0)}px)` }}
                >
                  {countdownItems.map(renderItem)}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 居中：时间始终显示，日期可隐藏 */}
      <div className={styles.centerTime}>
        <div className={styles.currentTime} aria-label={`当前时间：${timeString}`}>
          <span className={styles.timePrimary} style={primaryTimeAppearance}>
            {primaryTime}
          </span>
          <span className={styles.timeSeconds} style={secondsAppearance}>
            :{seconds}
          </span>
        </div>
        {display.showDate && (
          <div className={styles.currentDate} style={dateAppearance}>
            {dateString}
          </div>
        )}
        {display.showQuote && (
          <div className={styles.quoteSection}>
            <MotivationalQuote />
          </div>
        )}
      </div>

      {/* 噪音报告弹窗 */}
      {reportOpen && reportPeriod && (
        <NoiseReportModal
          isOpen={reportOpen}
          onClose={handleCloseReport}
          onBack={reportFromHistory ? handleBackToHistory : undefined}
          period={reportPeriod}
        />
      )}

      {/* 噪音历史记录弹窗 */}
      {historyOpen && (
        <NoiseHistoryModal
          isOpen={historyOpen}
          onClose={handleCloseHistory}
          onViewDetail={handleViewHistoryDetail}
        />
      )}
    </div>
  );
}
