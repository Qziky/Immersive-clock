import React, { lazy, Suspense, useEffect, useState } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";

import styles from "./App.module.css";
import { Confetti } from "./components/Confetti/Confetti";
import { useKeepAwakeRuntime } from "./hooks/useKeepAwakeRuntime";
import { ClockPage } from "./pages/ClockPage/ClockPage";
import { useFeedback } from "./ui";
import { shouldShowAnnouncement } from "./utils/announcementStorage";
import { getAppSettings } from "./utils/appSettings";
import { applySearchIndexingPolicy, isDeveloperPagePath } from "./utils/developerPages";
import { hasSeenTour } from "./utils/tour";

const AnnouncementModal = lazy(() => import("./components/AnnouncementModal"));
const DesignSystemPage = lazy(() =>
  import("./pages/DesignSystem").then((module) => ({ default: module.DesignSystemPage }))
);
const AudioDebugPage = lazy(() =>
  import("./pages/Debug/AudioDebugPage").then((module) => ({ default: module.AudioDebugPage }))
);

const KEEP_AWAKE_WARNING_ID = "keep-awake-runtime-warning";

export function KeepAwakeRuntimeNotice() {
  const { dismiss, notify } = useFeedback();
  const runtime = useKeepAwakeRuntime();

  useEffect(() => {
    if (
      runtime.preferenceEnabled &&
      (runtime.status === "unsupported" || runtime.status === "error")
    ) {
      notify({
        id: KEEP_AWAKE_WARNING_ID,
        variant: "warning",
        title: "屏幕常亮暂不可用",
        description: runtime.message ?? "设置已保留，将在应用再次进入前台时重试。",
      });
      return;
    }

    if (runtime.status === "active" || runtime.status === "disabled") {
      dismiss(KEEP_AWAKE_WARNING_ID);
    }
  }, [dismiss, notify, runtime.message, runtime.preferenceEnabled, runtime.status]);

  return null;
}

/**
 * 主应用组件
 * 设置路由并渲染主要的时钟页面
 * 包含首次访问时的进入动画和公告弹窗
 */
export function App() {
  const location = useLocation();
  const isDeveloperPageRoute = isDeveloperPagePath(location.pathname);
  const developerModeEnabled = getAppSettings().general.developerModeEnabled;
  const [showEnterAnimation, setShowEnterAnimation] = useState(false);
  const [showAnnouncement, setShowAnnouncement] = useState(false);
  const [announcementWasRequested, setAnnouncementWasRequested] = useState(false);
  const [showTourConfetti, setShowTourConfetti] = useState(false);
  const shouldMountAnnouncement = showAnnouncement || announcementWasRequested;

  /**
   * 设置进入动画和公告弹窗
   * 在组件首次挂载时触发
   */
  useEffect(() => {
    if (isDeveloperPageRoute) {
      setShowEnterAnimation(false);
      setShowAnnouncement(false);
      setShowTourConfetti(false);
      return undefined;
    }

    // 直接触发进入动画
    setShowEnterAnimation(true);

    // 动画完成后隐藏
    const timer = setTimeout(() => {
      setShowEnterAnimation(false);
    }, 1000); // 1秒动画时长
    let announcementTimer: number | null = null;
    let pendingTourEndListener: (() => void) | null = null;

    // 检查是否需要显示公告
    const checkAnnouncement = () => {
      if (shouldShowAnnouncement()) {
        // 如果用户未看过指引，则等待指引结束
        if (!hasSeenTour()) {
          const onTourEnd = () => {
            setShowAnnouncement(true);
            window.removeEventListener("tour:end", onTourEnd);
            pendingTourEndListener = null;
          };
          pendingTourEndListener = onTourEnd;
          window.addEventListener("tour:end", onTourEnd);
          return;
        }

        // 延迟显示公告，等待进入动画完成
        announcementTimer = window.setTimeout(() => {
          setShowAnnouncement(true);
        }, 1200); // 在进入动画完成后200ms显示
      }
    };

    checkAnnouncement();

    // 监听指引开始事件，强制关闭公告
    const onTourStart = () => {
      setShowAnnouncement(false);
    };
    window.addEventListener("tour:start", onTourStart);

    const onTourCompleted = () => {
      setShowTourConfetti(true);
      setTimeout(() => {
        setShowTourConfetti(false);
      }, 2600);
    };
    window.addEventListener("tour:completed", onTourCompleted);

    return () => {
      clearTimeout(timer);
      if (announcementTimer !== null) window.clearTimeout(announcementTimer);
      if (pendingTourEndListener) {
        window.removeEventListener("tour:end", pendingTourEndListener);
      }
      window.removeEventListener("tour:start", onTourStart);
      window.removeEventListener("tour:completed", onTourCompleted);
    };
  }, [isDeveloperPageRoute]);

  useEffect(() => applySearchIndexingPolicy(location.pathname), [location.pathname]);

  useEffect(() => {
    if (showAnnouncement) setAnnouncementWasRequested(true);
  }, [showAnnouncement]);

  return (
    <div
      className={`${styles.app} ${showEnterAnimation ? styles.enterAnimation : ""}`}
      data-ui-root
    >
      <Routes>
        <Route path="/" element={<ClockPage />} />
        <Route path="/clock" element={<ClockPage />} />
        <Route path="/countdown" element={<ClockPage />} />
        <Route path="/stopwatch" element={<ClockPage />} />
        <Route path="/study" element={<ClockPage />} />
        <Route
          path="/design-system"
          element={
            developerModeEnabled ? (
              <Suspense
                fallback={
                  <div className={styles.routeLoading} role="status">
                    正在加载组件规范…
                  </div>
                }
              >
                <DesignSystemPage />
              </Suspense>
            ) : (
              <Navigate to="/" replace />
            )
          }
        />
        <Route
          path="/debug/audio"
          element={
            developerModeEnabled ? (
              <Suspense
                fallback={
                  <div className={styles.routeLoading} role="status">
                    正在加载音频诊断…
                  </div>
                }
              >
                <AudioDebugPage />
              </Suspense>
            ) : (
              <Navigate to="/" replace />
            )
          }
        />
        <Route path="*" element={<ClockPage />} />
      </Routes>

      {!isDeveloperPageRoute && showTourConfetti && <Confetti />}

      {/* 公告弹窗 */}
      {!isDeveloperPageRoute && shouldMountAnnouncement && (
        <Suspense fallback={null}>
          <AnnouncementModal
            isOpen={showAnnouncement}
            onClose={() => setShowAnnouncement(false)}
            initialTab="announcement"
          />
        </Suspense>
      )}
    </div>
  );
}
