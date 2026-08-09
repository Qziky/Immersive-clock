import React, { useCallback, useEffect, useMemo, useRef, type CSSProperties } from "react";

import { useAppState } from "../../contexts/AppContext";
import { useComponentAppearance } from "../../contexts/AppearanceContext";
import { useAudio } from "../../hooks/useAudio";
import { useNoiseStream } from "../../hooks/useNoiseStream";
import { pushErrorCenterRecord } from "../../utils/errorCenter";

import { NoisePresentation, type NoisePresentationState } from "./NoisePresentation";

interface NoiseMonitorProps {
  onBreathingLightClick?: () => void;
  onStatusClick?: () => void;
}

const MIN_ALERT_INTERVAL = 200;
const MAX_ALERT_INTERVAL = 2000;

function persistenceLabel(enabled: boolean, available: boolean, pendingFrames: number): string {
  if (!enabled) return "不保存";
  if (!available) return "保存失败";
  return pendingFrames > 0 ? "写入中" : "已保存";
}

const NoiseMonitor: React.FC<NoiseMonitorProps> = ({ onBreathingLightClick, onStatusClick }) => {
  const {
    status,
    signalHealth,
    confidence,
    quietnessScore,
    estimatedDbA,
    primaryMetric,
    showRealtimeValue,
    scoreAlertThreshold,
    alertSoundEnabled,
    diagnostics,
    retry,
  } = useNoiseStream();
  const scoring = diagnostics.scoring;
  const persistence = diagnostics.persistence;
  const storageText = persistenceLabel(
    persistence.enabled,
    persistence.available,
    persistence.pendingFrames
  );
  const { study } = useAppState();
  const presentationState = useMemo<NoisePresentationState>(() => {
    if (status === "permission-denied" || status === "error" || status === "signal-unavailable") {
      return "error";
    }
    if (signalHealth === "signal-anomaly") {
      return "signal-anomaly";
    }
    if (status === "quiet" || status === "noisy") return status;
    return "initializing";
  }, [signalHealth, status]);
  const statusAppearance = useComponentAppearance("studyNoise", "status", {
    state: presentationState,
  });
  const subtextAppearance = useComponentAppearance("studyNoise", "subtext", {
    state: presentationState,
  });
  const indicatorAppearance = useComponentAppearance("studyNoise", "indicator", {
    kind: "icon",
    state: presentationState,
  });
  const indicatorStyle = {
    ...indicatorAppearance,
    "--appearance-indicator-color": indicatorAppearance.color,
  } as CSSProperties;

  const [playNoisyAlert] = useAudio("/ding-2.mp3");
  const playNoisyAlertRef = useRef(playNoisyAlert);
  const lastNoisyAlertPlayedAtRef = useRef(0);
  const lastIsNoisyRef = useRef(false);
  const hasShownPermissionErrorRef = useRef(false);

  useEffect(() => {
    playNoisyAlertRef.current = playNoisyAlert;
  }, [playNoisyAlert]);

  useEffect(() => {
    if (!alertSoundEnabled || status !== "noisy" || quietnessScore === null) {
      lastIsNoisyRef.current = false;
      return;
    }
    const now = Date.now();
    const deficit = Math.max(0, scoreAlertThreshold - quietnessScore);
    const dynamicInterval = Math.max(MIN_ALERT_INTERVAL, MAX_ALERT_INTERVAL - deficit * 80);
    const justBecameNoisy = !lastIsNoisyRef.current;
    if (
      justBecameNoisy ||
      !lastNoisyAlertPlayedAtRef.current ||
      now - lastNoisyAlertPlayedAtRef.current >= dynamicInterval
    ) {
      playNoisyAlertRef.current?.();
      lastNoisyAlertPlayedAtRef.current = now;
    }
    lastIsNoisyRef.current = true;
  }, [alertSoundEnabled, quietnessScore, scoreAlertThreshold, status]);

  const statusText = useMemo(() => {
    if (signalHealth === "signal-anomaly") return "麦克风异常";
    switch (status) {
      case "disabled":
        return "监测已关闭";
      case "electing":
        return "连接监测...";
      case "collecting":
        return "采集中";
      case "quiet":
        return "安静";
      case "noisy":
        return "吵闹";
      case "signal-unavailable":
        return "信号不可用";
      case "permission-denied":
      case "error":
        return "--";
      default:
        return "初始化中...";
    }
  }, [signalHealth, status]);

  const subtext = useMemo(() => {
    if (signalHealth === "signal-anomaly") return undefined;
    if (signalHealth === "below-range") return "低于量程";
    if (status === "collecting") {
      return `${Math.round(scoring.coverageRatio * 100)}%`;
    }
    if (status !== "quiet" && status !== "noisy") return undefined;
    if (!showRealtimeValue) return undefined;
    if (primaryMetric === "estimated-dba") {
      return estimatedDbA === null ? "需校准" : `${estimatedDbA.toFixed(0)} dB(A)`;
    }
    return quietnessScore === null ? undefined : `${quietnessScore.toFixed(0)} 分`;
  }, [
    estimatedDbA,
    primaryMetric,
    quietnessScore,
    scoring.coverageRatio,
    showRealtimeValue,
    signalHealth,
    status,
  ]);

  const openErrorPopup = useCallback(
    (title: string, message: string) => {
      pushErrorCenterRecord({ level: "error", source: "noise", title, message });
      if (!study.errorPopupEnabled) return;
      window.dispatchEvent(
        new CustomEvent("messagePopup:open", {
          detail: { type: "error", title, message },
        })
      );
    },
    [study.errorPopupEnabled]
  );

  useEffect(() => {
    if (status === "permission-denied" && !hasShownPermissionErrorRef.current) {
      hasShownPermissionErrorRef.current = true;
      openErrorPopup("麦克风权限不可用", "请允许当前应用使用麦克风后重试。");
    } else if (status !== "permission-denied" && status !== "error") {
      hasShownPermissionErrorRef.current = false;
    }
  }, [openErrorPopup, status]);

  const handleBreathingLightClick = useCallback(
    (event: React.MouseEvent) => {
      event.stopPropagation();
      onBreathingLightClick?.();
    },
    [onBreathingLightClick]
  );

  const handleStatusTextClick = useCallback(
    (event: React.MouseEvent) => {
      event.stopPropagation();
      if (status === "permission-denied" || status === "error" || status === "signal-unavailable") {
        hasShownPermissionErrorRef.current = false;
        retry();
        return;
      }
      if (status === "quiet" || status === "noisy") onStatusClick?.();
    },
    [onStatusClick, retry, status]
  );

  const tooltip = useMemo(() => {
    if (signalHealth === "signal-anomaly") {
      return status === "signal-unavailable"
        ? "检测到信号异常，点击重试"
        : "检测到信号异常，当前测量可信度较低";
    }
    if (status === "permission-denied" || status === "error" || status === "signal-unavailable") {
      return "点击重试";
    }
    if (quietnessScore !== null) {
      const quality = confidence === "low" ? "，测量置信度低" : "";
      return `当前环境安静评分 ${quietnessScore.toFixed(0)} 分${quality}；原始帧${storageText}`;
    }
    if (status === "collecting") {
      return `首次评分采集 ${Math.floor(scoring.collectedSeconds)}/${scoring.requiredSeconds} 秒，有效覆盖率 ${Math.round(scoring.coverageRatio * 100)}%；原始帧${storageText}`;
    }
    return statusText;
  }, [confidence, quietnessScore, scoring, signalHealth, status, statusText, storageText]);

  return (
    <NoisePresentation
      indicatorAttributes={{
        "aria-label": "查看噪音历史",
        "data-tour": "noise-history-trigger",
        onClick: handleBreathingLightClick,
        style: indicatorStyle,
        title: "查看噪音历史",
      }}
      rootAttributes={{ "data-tour": "noise-monitor" }}
      state={presentationState}
      statusAttributes={{ onClick: handleStatusTextClick, style: statusAppearance, title: tooltip }}
      statusText={statusText}
      subtext={subtext}
      subtextAttributes={{ "aria-live": "polite", style: subtextAppearance }}
    />
  );
};

export default NoiseMonitor;
