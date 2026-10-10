import React, {
  lazy,
  startTransition,
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { useLocation, useNavigate } from "react-router-dom";

import { AuthorInfo } from "../../components/AuthorInfo/AuthorInfo";
import { DynamicBackgroundLayer } from "../../components/DynamicBackground";
import { HUD } from "../../components/HUD/HUD";
import { OledScreenSaver } from "../../components/OledProtection/OledScreenSaver";
import { RouteSeo } from "../../components/Seo/RouteSeo";
import { SeoContent } from "../../components/Seo/SeoContent";
import { SettingsButton } from "../../components/SettingsButton";
import { useAppState, useAppDispatch } from "../../contexts/AppContext";
import { useAppearance } from "../../contexts/AppearanceContext";
import { OledProtectionProvider } from "../../contexts/OledProtectionContext";
import { useOledScreenProtectionController } from "../../hooks/useOledScreenProtectionController";
import {
  getDynamicAudioSnapshot,
  stopDynamicAudioCapture,
  subscribeDynamicAudio,
} from "../../services/dynamicBackgroundAudio";
import {
  getOledScreenReadout,
  subscribeOledScreenReadout,
} from "../../services/oledProtectionRuntime";
import type { AppMode } from "../../types";
import type { MessagePopupOpenDetail, MessagePopupType } from "../../types/messagePopup";
import { IconButton, useFeedback, useOverlayStackSnapshot, type ToastVariant } from "../../ui";
import { appearanceBackgroundToCss } from "../../utils/appearanceModel";
import { getModeFromPathname, MODE_ROUTE_PATHS } from "../../utils/modeRoutes";
import { nowMs } from "../../utils/timeSource";
import { startTimeSyncManager } from "../../utils/timeSync";
import { startTour, isTourActive } from "../../utils/tour";

import styles from "./ClockPage.module.css";
import { MODE_COMPONENTS, preloadModeComponent } from "./modeComponents";
import { preloadClockPageResources } from "./resourcePreloading";

const BACKGROUND_PRELOAD_TIMEOUT_MS = 1500;
const BACKGROUND_PRELOAD_FALLBACK_DELAY_MS = 120;

const loadAnnouncementModal = () => import("../../components/AnnouncementModal");
const loadCountdownModal = () =>
  import("../../components/CountdownModal/CountdownModal").then((module) => ({
    default: module.CountdownModal,
  }));
let settingsPanelPromise: Promise<typeof import("../../components/SettingsPanel")> | undefined;
const loadSettingsPanel = () => {
  settingsPanelPromise ??= import("../../components/SettingsPanel").catch((error: unknown) => {
    settingsPanelPromise = undefined;
    throw error;
  });
  return settingsPanelPromise;
};

const preloadSettingsPanel = () => {
  void loadSettingsPanel().catch(() => undefined);
};

const AnnouncementModal = lazy(loadAnnouncementModal);
const CountdownModal = lazy(loadCountdownModal);
const SettingsPanel = lazy(() =>
  loadSettingsPanel().then((module) => ({ default: module.SettingsPanel }))
);

function getPopupToastVariant(type: MessagePopupType): ToastVariant {
  switch (type) {
    case "error":
      return "danger";
    case "weatherAlert":
      return "warning";
    case "coolingReminder":
      return "info";
    default:
      return "info";
  }
}

function getPopupDuration(type: MessagePopupType): number | null {
  // 天气提醒需要用户读完并主动关闭，避免重要预警在几秒内消失。
  if (type === "weatherAlert" || type === "weatherForecast" || type === "coolingReminder") {
    return null;
  }
  if (type === "general") return 8000;
  if (type === "error") return 12000;
  return 12000;
}

/**
 * 时钟主页面组件
 * 根据当前模式显示相应的时钟组件，处理HUD显示逻辑
 */
export function ClockPage() {
  const { mode, isModalOpen, study, countdown, oledProtection } = useAppState();
  const { previewScene, getBackgroundImage, resolveBackground, isPreviewing } = useAppearance();
  const audioSnapshot = useSyncExternalStore(
    subscribeDynamicAudio,
    getDynamicAudioSnapshot,
    getDynamicAudioSnapshot
  );
  const oledScreenReadout = useSyncExternalStore(
    subscribeOledScreenReadout,
    getOledScreenReadout,
    getOledScreenReadout
  );
  const dispatch = useAppDispatch();
  const { notify, dismiss } = useFeedback();
  const location = useLocation();
  const navigate = useNavigate();
  const overlays = useOverlayStackSnapshot();
  const hideTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const hudContainerRef = useRef<HTMLDivElement | null>(null);
  const settingsButtonRef = useRef<HTMLButtonElement | null>(null);
  const popupTypeMapRef = useRef(new Map<string, MessagePopupType>());
  const [showSettings, setShowSettings] = useState(false);
  const [showAnnouncement, setShowAnnouncement] = useState(false);
  const [tourActive, setTourActive] = useState(false);
  const mainContentRef = useRef<HTMLElement | null>(null);
  const hadScreenSaverRef = useRef(false);
  const [settingsWasRequested, setSettingsWasRequested] = useState(false);
  const [announcementWasRequested, setAnnouncementWasRequested] = useState(false);
  const shouldMountSettings = showSettings || settingsWasRequested;
  const shouldMountAnnouncement = showAnnouncement || announcementWasRequested;
  const routeMode = getModeFromPathname(location.pathname);
  const displayMode = previewScene ?? routeMode ?? mode;
  const displayBackground = resolveBackground(displayMode);
  const displayBackgroundStyle = appearanceBackgroundToCss(
    displayBackground,
    getBackgroundImage(displayMode)
  );
  const ModeComponent = MODE_COMPONENTS[displayMode];
  const countdownNearFinish =
    mode === "countdown" &&
    countdown.isActive &&
    countdown.endTimestamp !== undefined &&
    countdown.endTimestamp - nowMs() <= 10_000;
  const screenSaverBlocked =
    isModalOpen ||
    showSettings ||
    showAnnouncement ||
    tourActive ||
    overlays.hasActiveModal ||
    overlays.hasActiveFloating ||
    countdownNearFinish;
  const { active: screenSaverActive, wake: wakeScreenSaver } = useOledScreenProtectionController({
    blocked: screenSaverBlocked,
    enabled: oledProtection.enabled,
    idleMinutes: oledProtection.idleMinutes,
    mode: displayMode,
  });
  const screenSaverVisible = screenSaverActive && oledScreenReadout?.mode === displayMode;

  useEffect(() => {
    const dynamic = displayBackground.dynamic;
    if (displayBackground.mode === "dynamic" && dynamic?.type === "music") {
      const musicBackground = dynamic as Extract<NonNullable<typeof dynamic>, { type: "music" }>;
      if (audioSnapshot.status !== "idle" && audioSnapshot.source !== musicBackground.source) {
        stopDynamicAudioCapture("监听音源已切换，请重新开始");
      }
    } else if (audioSnapshot.status !== "idle") {
      stopDynamicAudioCapture("已离开音乐响应背景");
    }
  }, [audioSnapshot, displayBackground.dynamic, displayBackground.mode]);

  useEffect(() => () => stopDynamicAudioCapture("已停止监听"), []);

  useEffect(() => {
    const routeMode = getModeFromPathname(location.pathname);
    if (routeMode && routeMode !== mode) {
      startTransition(() => {
        dispatch({ type: "SET_MODE", payload: routeMode });
      });
    }
  }, [dispatch, location.pathname, mode]);

  const switchMode = useCallback(
    (nextMode: AppMode) => {
      void preloadModeComponent(nextMode);
      startTransition(() => {
        dispatch({ type: "SET_MODE", payload: nextMode });
        const nextPath = MODE_ROUTE_PATHS[nextMode];
        if (window.location.pathname !== nextPath) {
          navigate(nextPath);
        }
      });
    },
    [dispatch, navigate]
  );

  useEffect(() => {
    let cancelled = false;
    let cancelPendingWait: (() => void) | null = null;

    const waitForBackgroundOpportunity = () =>
      new Promise<boolean>((resolve) => {
        if (cancelled) {
          resolve(false);
          return;
        }

        let settled = false;
        let idleId: number | null = null;
        let timeoutId: number | null = null;
        const finish = (shouldContinue: boolean) => {
          if (settled) return;
          settled = true;
          cancelPendingWait = null;
          resolve(shouldContinue);
        };

        if (typeof window.requestIdleCallback === "function") {
          idleId = window.requestIdleCallback(() => finish(!cancelled), {
            timeout: BACKGROUND_PRELOAD_TIMEOUT_MS,
          });
        } else {
          timeoutId = window.setTimeout(
            () => finish(!cancelled),
            BACKGROUND_PRELOAD_FALLBACK_DELAY_MS
          );
        }

        cancelPendingWait = () => {
          if (idleId !== null && typeof window.cancelIdleCallback === "function") {
            window.cancelIdleCallback(idleId);
          }
          if (timeoutId !== null) window.clearTimeout(timeoutId);
          finish(false);
        };
      });

    void preloadClockPageResources({
      currentMode: displayMode,
      secondaryLoaders: [loadSettingsPanel, loadCountdownModal, loadAnnouncementModal],
      waitForBackgroundOpportunity,
    });

    return () => {
      cancelled = true;
      cancelPendingWait?.();
    };
  }, [displayMode]);

  useEffect(() => {
    return startTimeSyncManager();
  }, []);

  useEffect(() => {
    const handleTourStart = () => setTourActive(true);
    const handleTourEnd = () => {
      setTourActive(false);
      wakeScreenSaver();
    };
    window.addEventListener("tour:start", handleTourStart);
    window.addEventListener("tour:end", handleTourEnd);
    return () => {
      window.removeEventListener("tour:start", handleTourStart);
      window.removeEventListener("tour:end", handleTourEnd);
    };
  }, [wakeScreenSaver]);

  useEffect(() => {
    if (screenSaverVisible) {
      hadScreenSaverRef.current = true;
      return;
    }
    if (hadScreenSaverRef.current) {
      hadScreenSaverRef.current = false;
      window.requestAnimationFrame(() => mainContentRef.current?.focus({ preventScroll: true }));
    }
  }, [screenSaverVisible]);

  useEffect(() => {
    if (showSettings) setSettingsWasRequested(true);
  }, [showSettings]);

  useEffect(() => {
    if (showAnnouncement) setAnnouncementWasRequested(true);
  }, [showAnnouncement]);

  /**
   * 清除 HUD 自动隐藏定时器
   */
  const clearHudHideTimeout = useCallback(() => {
    if (hideTimeoutRef.current) {
      clearTimeout(hideTimeoutRef.current);
      hideTimeoutRef.current = null;
    }
  }, []);

  /**
   * 判断是否应阻止 HUD 被自动隐藏（例如：键盘焦点在 HUD 内或引导中）
   */
  const shouldPreventHudAutoHide = useCallback(() => {
    if (isTourActive()) return true;
    if (hudContainerRef.current?.querySelector('[aria-haspopup="listbox"][aria-expanded="true"]'))
      return true;
    const activeElement = document.activeElement;
    if (!activeElement) return false;
    return !!hudContainerRef.current?.contains(activeElement);
  }, []);

  /**
   * 启动 HUD 自动隐藏定时器
   */
  const scheduleHudAutoHide = useCallback(() => {
    clearHudHideTimeout();
    hideTimeoutRef.current = setTimeout(() => {
      if (shouldPreventHudAutoHide()) {
        scheduleHudAutoHide();
        return;
      }
      dispatch({ type: "HIDE_HUD" });
      hideTimeoutRef.current = null;
    }, 8000);
  }, [clearHudHideTimeout, dispatch, shouldPreventHudAutoHide]);

  useEffect(() => {
    return clearHudHideTimeout;
  }, [clearHudHideTimeout]);

  // 自动启动新手指引
  useEffect(() => {
    if (displayMode === "exam") return;
    const timer = setTimeout(() => {
      startTour(false, {
        onStart: () => {
          // 确保 HUD 显示并清除自动隐藏定时器
          dispatch({ type: "SHOW_HUD" });
          clearHudHideTimeout();
        },
        switchMode: (mode) => {
          switchMode(mode);
        },
        openSettings: () => {
          startTransition(() => setShowSettings(true));
        },
      });
    }, 1000);
    return () => clearTimeout(timer);
  }, [dispatch, clearHudHideTimeout, switchMode, displayMode]);

  /**
   * 处理页面点击事件
   * 显示HUD并设置自动隐藏定时器
   */
  const handlePageClick = useCallback(
    (e?: React.MouseEvent) => {
      // 如果模态框打开，不处理点击事件
      if (isModalOpen) {
        return;
      }

      // 显示HUD
      dispatch({ type: "SHOW_HUD" });

      const eventTarget = (e?.target as Element | null) ?? null;
      const isClickInsideHud =
        !!eventTarget && !!hudContainerRef.current?.contains(eventTarget as Node);

      if (isClickInsideHud) {
        clearHudHideTimeout();
        return;
      }

      scheduleHudAutoHide();
    },
    [clearHudHideTimeout, dispatch, isModalOpen, scheduleHudAutoHide]
  );

  /**
   * 处理键盘事件
   */
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      /**
       * 如果倒计时模态框或设置面板打开，则不处理页面级键盘事件
       * 避免拦截输入组件的回车（如 textarea 换行）
       */
      // 注意：SettingsPanel 通过 Portal 渲染，事件仍会沿 React 树冒泡到此处
      if (isModalOpen || showSettings) {
        return;
      }

      /**
       * 在表单输入或可编辑元素中，不拦截回车或空格
       * 保证输入框/文本域/可编辑区域的默认行为（换行、输入等）
       */
      const eventTarget = e.target as HTMLElement | null;
      if (mode === "exam") return;
      if (eventTarget && hudContainerRef.current?.contains(eventTarget)) {
        return;
      }
      const tagName = eventTarget?.tagName?.toUpperCase();
      const isEditingElement =
        !!eventTarget &&
        (tagName === "INPUT" || tagName === "TEXTAREA" || eventTarget.isContentEditable === true);
      if (isEditingElement) {
        return;
      }

      // 空格键或回车键显示HUD（仅当不在输入环境中）
      if (e.code === "Space" || e.code === "Enter") {
        e.preventDefault();
        handlePageClick();
      }
    },
    [handlePageClick, isModalOpen, showSettings, mode]
  );

  /**
   * 处理设置按钮点击
   */
  const handleSettingsClick = useCallback(() => {
    startTransition(() => setShowSettings(true));
  }, []);

  /**
   * 处理设置面板关闭
   */
  const handleSettingsClose = useCallback(() => {
    setShowSettings(false);
    window.requestAnimationFrame(() => settingsButtonRef.current?.focus({ preventScroll: true }));
  }, []);

  /**
   * 处理版本号点击，显示公告弹窗
   */
  const handleVersionClick = useCallback(() => {
    startTransition(() => setShowAnnouncement(true));
  }, []);

  /**
   * 处理公告弹窗关闭
   */
  const handleAnnouncementClose = useCallback(() => {
    setShowAnnouncement(false);
  }, []);

  // 全局消息弹窗事件监听：自习模式下全量响应，非自习模式仅响应天气相关弹窗
  useEffect(() => {
    const onOpen = (e: Event) => {
      const detail = (e as CustomEvent<MessagePopupOpenDetail>).detail || {};
      const type: MessagePopupType = detail.type ?? "general";
      if (mode === "exam") return;
      if (mode !== "study" && type !== "weatherForecast" && type !== "weatherAlert") return;
      if (type === "error" && !study.errorPopupEnabled) return;
      wakeScreenSaver();
      const title = (detail.title as string) || "消息提醒";
      const message = (detail.message as React.ReactNode) || "";
      const accentColor = typeof detail.themeColor === "string" ? detail.themeColor : undefined;
      const id = (detail.id as string) || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      notify({
        id,
        variant: getPopupToastVariant(type),
        title,
        description: message,
        accentColor,
        duration: getPopupDuration(type),
        onDismiss: () => {
          popupTypeMapRef.current.delete(id);
        },
      });
      popupTypeMapRef.current.set(id, type);
    };
    const onClose = (e: Event) => {
      const detail = (e as CustomEvent).detail || {};
      const id = typeof detail.id === "string" ? detail.id : "";

      if (id) {
        dismiss(id);
        popupTypeMapRef.current.delete(id);
      } else {
        Array.from(popupTypeMapRef.current.keys()).forEach((popupId) => dismiss(popupId));
        popupTypeMapRef.current.clear();
      }
    };
    window.addEventListener("messagePopup:open", onOpen as EventListener);
    window.addEventListener("messagePopup:close", onClose as EventListener);
    return () => {
      window.removeEventListener("messagePopup:open", onOpen as EventListener);
      window.removeEventListener("messagePopup:close", onClose as EventListener);
    };
  }, [dismiss, mode, notify, wakeScreenSaver, study.errorPopupEnabled]);

  // 非自习模式下仅保留天气相关弹窗，避免其它业务弹窗打扰
  useEffect(() => {
    if (mode === "study") return;
    popupTypeMapRef.current.forEach((type, id) => {
      if (mode !== "exam" && (type === "weatherForecast" || type === "weatherAlert")) return;
      dismiss(id);
      popupTypeMapRef.current.delete(id);
    });
  }, [dismiss, mode]);

  useEffect(() => {
    const popupTypeMap = popupTypeMapRef.current;
    return () => {
      popupTypeMap.forEach((_type, id) => dismiss(id));
      popupTypeMap.clear();
    };
  }, [dismiss]);

  return (
    <OledProtectionProvider active={screenSaverVisible}>
      <div className={styles.clockPage}>
        <main
          ref={mainContentRef}
          className={styles.clockPageContent}
          data-background-type={displayMode === "study" ? undefined : displayBackground.type}
          data-background-mode={displayMode === "study" ? undefined : displayBackground.mode}
          inert={screenSaverVisible}
          aria-hidden={screenSaverVisible || undefined}
          onClick={handlePageClick}
          onKeyDown={handleKeyDown}
          style={displayMode === "study" ? undefined : displayBackgroundStyle}
          tabIndex={0}
          aria-label="时钟应用主界面"
        >
          {displayMode !== "study" && displayBackground.mode === "dynamic" ? (
            <DynamicBackgroundLayer background={displayBackground} mutedPreview={isPreviewing} />
          ) : null}
          <RouteSeo />
          <SeoContent />
          <div
            className={`${styles.timeDisplay} ${displayMode === "study" ? styles.studyTimeDisplay : ""}`}
            id={`${displayMode}-panel`}
            role={displayMode === "exam" ? "region" : "tabpanel"}
            data-appearance-content
            data-tour="clock-area"
          >
            <Suspense fallback={null}>
              <ModeComponent />
            </Suspense>
          </div>

          <div
            ref={hudContainerRef}
            onFocusCapture={() => {
              dispatch({ type: "SHOW_HUD" });
              clearHudHideTimeout();
            }}
            onBlurCapture={(e) => {
              const nextFocused = e.relatedTarget as Node | null;
              if (nextFocused && hudContainerRef.current?.contains(nextFocused)) {
                return;
              }
              if (isModalOpen) return;
              scheduleHudAutoHide();
            }}
            onPointerDownCapture={() => {
              dispatch({ type: "SHOW_HUD" });
              clearHudHideTimeout();
            }}
          >
            {displayMode !== "exam" && <HUD onModeChange={switchMode} />}
          </div>

          <div
            style={displayMode === "exam" ? { display: "none" } : undefined}
            className={styles.bottomChrome}
            aria-label="底栏工具与项目信息"
          >
            {/* 仅在时钟页面显示的左下角指引按钮 */}
            {mode === "clock" && (
              <div className={styles.bottomTools}>
                <IconButton
                  className={styles.tourButton}
                  onClick={() => {
                    startTour(true, {
                      onStart: () => {
                        dispatch({ type: "SHOW_HUD" });
                      },
                      switchMode,
                    });
                  }}
                  title="重播新手指引"
                  aria-label="重播新手指引"
                  icon="status.help"
                  size="sm"
                  variant="minimal"
                />
              </div>
            )}

            <AuthorInfo onVersionClick={handleVersionClick} />
          </div>

          {displayMode !== "exam" && (
            <SettingsButton
              ref={settingsButtonRef}
              onClick={handleSettingsClick}
              onIntent={preloadSettingsPanel}
              isVisible={!isModalOpen && !showSettings}
            />
          )}

          {/* 设置面板 */}
          {shouldMountSettings && (
            <Suspense fallback={null}>
              <SettingsPanel isOpen={showSettings} onClose={handleSettingsClose} />
            </Suspense>
          )}

          {isModalOpen && (
            <Suspense fallback={null}>
              <CountdownModal />
            </Suspense>
          )}

          {/* 公告弹窗 */}
          {shouldMountAnnouncement && (
            <Suspense fallback={null}>
              <AnnouncementModal
                isOpen={showAnnouncement}
                onClose={handleAnnouncementClose}
                initialTab="announcement"
              />
            </Suspense>
          )}
        </main>
        {screenSaverVisible ? (
          <OledScreenSaver
            brightnessPercent={oledProtection.brightnessPercent}
            onWake={wakeScreenSaver}
          />
        ) : null}
      </div>
    </OledProtectionProvider>
  );
}
