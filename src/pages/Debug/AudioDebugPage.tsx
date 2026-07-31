import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useNoiseStream } from "../../hooks/useNoiseStream";
import {
  listNoiseInputDevices,
  requestNoiseInputDeviceAccess,
  subscribeNoiseInputDeviceChanges,
  type NoiseInputDevice,
} from "../../services/noise/noiseInputDeviceService";
import { acquireNoiseDebugSession } from "../../services/noise/noiseStreamService";
import type {
  NoiseConfidence,
  NoiseFeatureSample,
  NoiseMonitoringRole,
  NoiseMonitoringStatus,
  NoiseSignalHealth,
} from "../../types/noise";
import {
  AppIcon,
  Button,
  Dropdown,
  Grid,
  InfoPanel,
  Input,
  LineChart,
  MetricCard,
  Progress,
  StatusPill,
  Switch,
  type AppIconName,
  type ChartLineSeries,
  type ChartTone,
  type UiTone,
  useFeedback,
} from "../../ui";
import {
  getNoiseControlSettings,
  saveNoiseControlSettings,
} from "../../utils/noiseControlSettings";

import styles from "./AudioDebugPage.module.css";

const FEATURE_HISTORY_LIMIT = 300;
const EVENT_HISTORY_LIMIT = 40;
const CHART_WINDOW_MS = 30_000;
const SYSTEM_DEFAULT_DEVICE_VALUE = "__immersive_clock_system_default__";
const DBFS_CHART_DOMAIN = [-120, 0] as const;
const DBFS_CHART_TICKS = [-120, -90, -60, -30, 0].map((value) => ({
  value,
  label: value === -120 ? "≤-120" : String(value),
}));

interface AudioChartSeriesDefinition {
  id: string;
  label: string;
  tone: ChartTone;
  select: (sample: NoiseFeatureSample) => number;
  opacity?: number;
  strokeWidth: number;
}

const AUDIO_CHART_SERIES = [
  {
    id: "a-weighted-dbfs",
    label: "A 加权",
    tone: "accent",
    select: (sample) => sample.aWeightedDbfs,
    opacity: 1,
    strokeWidth: 2.4,
  },
  {
    id: "raw-rms-dbfs",
    label: "原始 RMS",
    tone: "info",
    select: (sample) => sample.rmsDbfs,
    opacity: 0.92,
    strokeWidth: 1.8,
  },
  {
    id: "sample-p01-dbfs",
    label: "1% 谷值",
    tone: "success",
    select: (sample) => sample.sampleP01Dbfs,
    opacity: 0.72,
    strokeWidth: 1.3,
  },
] as const satisfies readonly AudioChartSeriesDefinition[];

type AudioChartSeriesId = (typeof AUDIO_CHART_SERIES)[number]["id"];

const DEFAULT_AUDIO_CHART_VISIBILITY: Record<AudioChartSeriesId, boolean> = {
  "a-weighted-dbfs": true,
  "raw-rms-dbfs": true,
  "sample-p01-dbfs": true,
};

const ROLE_LABELS: Record<NoiseMonitoringRole, string> = {
  leader: "Leader",
  follower: "Follower",
  none: "未参与",
};

const STATUS_LABELS: Record<NoiseMonitoringStatus, string> = {
  disabled: "已停止",
  electing: "正在选举",
  initializing: "正在初始化",
  collecting: "正在收集 60 秒评分窗口",
  quiet: "安静",
  noisy: "吵闹",
  "signal-unavailable": "信号不可用",
  "permission-denied": "权限被拒绝",
  error: "采集错误",
};

const HEALTH_LABELS: Record<NoiseSignalHealth, string> = {
  "warming-up": "预热中",
  healthy: "健康",
  "below-range": "低于量程",
  "signal-anomaly": "信号异常",
  "track-muted": "轨道静音",
  "track-ended": "轨道结束",
  "audio-context-suspended": "音频上下文挂起",
  "insufficient-coverage": "覆盖率不足",
};

const CONFIDENCE_LABELS: Record<NoiseConfidence, string> = {
  high: "高置信度",
  medium: "中置信度",
  low: "低置信度",
  none: "无置信度",
};

interface DiagnosticEvent {
  id: number;
  at: number;
  role: NoiseMonitoringRole;
  status: NoiseMonitoringStatus;
  health: NoiseSignalHealth;
  confidence: NoiseConfidence;
}

interface ProcessingSettings {
  autoGainControl: boolean | null;
  echoCancellation: boolean | null;
  noiseSuppression: boolean | null;
}

interface AudioFlowStage {
  id: string;
  icon: AppIconName;
  label: string;
  summary: string;
}

function formatDbfs(value: number | null | undefined): string {
  return typeof value === "number" && Number.isFinite(value) ? `${value.toFixed(1)} dBFS` : "—";
}

function formatPercent(value: number | null | undefined, digits = 2): string {
  return typeof value === "number" && Number.isFinite(value)
    ? `${(value * 100).toFixed(digits)}%`
    : "—";
}

function formatBoolean(value: boolean | null | undefined): string {
  if (value === true) return "开启";
  if (value === false) return "关闭";
  return "未报告";
}

function parseProcessingSettings(signature: string | undefined): ProcessingSettings {
  if (!signature) {
    return { autoGainControl: null, echoCancellation: null, noiseSuppression: null };
  }
  try {
    const parsed = JSON.parse(signature) as Partial<ProcessingSettings>;
    return {
      autoGainControl: typeof parsed.autoGainControl === "boolean" ? parsed.autoGainControl : null,
      echoCancellation:
        typeof parsed.echoCancellation === "boolean" ? parsed.echoCancellation : null,
      noiseSuppression:
        typeof parsed.noiseSuppression === "boolean" ? parsed.noiseSuppression : null,
    };
  } catch {
    return { autoGainControl: null, echoCancellation: null, noiseSuppression: null };
  }
}

function roleTone(role: NoiseMonitoringRole): UiTone {
  return role === "leader" ? "accent" : role === "follower" ? "info" : "neutral";
}

function statusTone(status: NoiseMonitoringStatus): UiTone {
  if (status === "quiet") return "success";
  if (status === "noisy" || status === "permission-denied" || status === "error") return "danger";
  if (status === "signal-unavailable") return "warning";
  return status === "disabled" ? "neutral" : "info";
}

function healthTone(health: NoiseSignalHealth): UiTone {
  if (health === "healthy") return "success";
  if (
    health === "track-ended" ||
    health === "track-muted" ||
    health === "audio-context-suspended"
  ) {
    return "danger";
  }
  if (
    health === "below-range" ||
    health === "signal-anomaly" ||
    health === "insufficient-coverage"
  ) {
    return "warning";
  }
  return "info";
}

function confidenceTone(confidence: NoiseConfidence): UiTone {
  if (confidence === "high") return "success";
  if (confidence === "medium") return "info";
  if (confidence === "low") return "warning";
  return "neutral";
}

function clampChartDbfs(value: number): number {
  return Math.max(-120, Math.min(0, value));
}

function formatInputDeviceError(error: unknown): string {
  const name =
    error && typeof error === "object" && "name" in error
      ? String((error as { name?: unknown }).name)
      : "";
  if (name === "NotAllowedError" || name === "SecurityError") {
    return "麦克风权限被拒绝，请在浏览器或系统设置中允许访问。";
  }
  return error instanceof Error ? error.message : "无法读取麦克风设备。";
}

export function AudioDebugPage() {
  const { confirm, notify } = useFeedback();
  const noise = useNoiseStream();
  const [temporaryCaptureActive, setTemporaryCaptureActive] = useState(false);
  const [referenceDbA, setReferenceDbA] = useState("60");
  const [calibrationError, setCalibrationError] = useState<string | null>(null);
  const [calibrationSubmitting, setCalibrationSubmitting] = useState(false);
  const [featureHistory, setFeatureHistory] = useState<NoiseFeatureSample[]>([]);
  const [chartVisibility, setChartVisibility] = useState(DEFAULT_AUDIO_CHART_VISIBILITY);
  const [events, setEvents] = useState<DiagnosticEvent[]>([]);
  const [preferredInputDevice, setPreferredInputDevice] = useState(
    () => getNoiseControlSettings().preferredInputDevice
  );
  const [inputDevices, setInputDevices] = useState<NoiseInputDevice[]>([]);
  const [inputDeviceError, setInputDeviceError] = useState<string | null>(null);
  const [inputDevicesLoading, setInputDevicesLoading] = useState(true);
  const lastFeatureKeyRef = useRef("");
  const lastEventKeyRef = useRef("");
  const nextEventIdRef = useRef(0);

  const feature = noise.diagnostics.latestFeature;
  const track = noise.diagnostics.track;
  const processing = useMemo(
    () => parseProcessingSettings(track?.processingSignature),
    [track?.processingSignature]
  );

  const refreshInputDevices = useCallback(async (requestAccess = false) => {
    setInputDevicesLoading(true);
    setInputDeviceError(null);
    try {
      const devices = requestAccess
        ? await requestNoiseInputDeviceAccess()
        : await listNoiseInputDevices();
      setInputDevices(devices);
    } catch (error) {
      setInputDeviceError(formatInputDeviceError(error));
    } finally {
      setInputDevicesLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshInputDevices();
    return subscribeNoiseInputDeviceChanges(() => void refreshInputDevices());
  }, [refreshInputDevices]);

  useEffect(() => {
    if (!temporaryCaptureActive) return undefined;
    return acquireNoiseDebugSession();
  }, [temporaryCaptureActive]);

  useEffect(() => {
    if (!noise.captureSessionId) {
      lastFeatureKeyRef.current = "";
      setFeatureHistory([]);
      return;
    }
    if (!feature) return;
    const featureKey = `${noise.captureSessionId}:${feature.frameSequence}`;
    if (lastFeatureKeyRef.current === featureKey) return;
    lastFeatureKeyRef.current = featureKey;
    setFeatureHistory((current) => {
      const next = [...current, feature];
      return next.length > FEATURE_HISTORY_LIMIT
        ? next.slice(next.length - FEATURE_HISTORY_LIMIT)
        : next;
    });
  }, [feature, noise.captureSessionId]);

  useEffect(() => {
    const eventKey = [noise.role, noise.status, noise.signalHealth, noise.confidence].join(":");
    if (lastEventKeyRef.current === eventKey) return;
    lastEventKeyRef.current = eventKey;
    nextEventIdRef.current += 1;
    const nextEvent: DiagnosticEvent = {
      id: nextEventIdRef.current,
      at: Date.now(),
      role: noise.role,
      status: noise.status,
      health: noise.signalHealth,
      confidence: noise.confidence,
    };
    setEvents((current) => [...current, nextEvent].slice(-EVENT_HISTORY_LIMIT));
  }, [noise.confidence, noise.role, noise.signalHealth, noise.status]);

  const chart = useMemo(() => {
    const latestTime = featureHistory[featureHistory.length - 1]?.t ?? Date.now();
    const makeData = (select: (sample: NoiseFeatureSample) => number) =>
      featureHistory.map((sample) => ({ x: sample.t, y: clampChartDbfs(select(sample)) }));
    return {
      xDomain: [latestTime - CHART_WINDOW_MS, latestTime] as const,
      series: AUDIO_CHART_SERIES.filter((definition) => chartVisibility[definition.id]).map(
        (definition) => ({
          id: definition.id,
          label: `${definition.label} dBFS`,
          data: makeData(definition.select),
          tone: definition.tone,
          curve: "linear",
          opacity: definition.opacity,
          strokeWidth: definition.strokeWidth,
        })
      ) satisfies ChartLineSeries[],
    };
  }, [chartVisibility, featureHistory]);

  const inputDeviceOptions = useMemo(() => {
    const options = [{ value: SYSTEM_DEFAULT_DEVICE_VALUE, label: "系统默认" }];
    if (
      preferredInputDevice &&
      !inputDevices.some((device) => device.deviceId === preferredInputDevice.deviceId)
    ) {
      options.push({
        value: preferredInputDevice.deviceId,
        label: `${preferredInputDevice.label}（当前不可用）`,
      });
    }
    inputDevices.forEach((device) => {
      options.push({ value: device.deviceId, label: device.label });
    });
    return options;
  }, [inputDevices, preferredInputDevice]);

  const handleInputDeviceChange = (deviceId: string) => {
    const nextPreference =
      deviceId === SYSTEM_DEFAULT_DEVICE_VALUE
        ? null
        : (inputDevices.find((device) => device.deviceId === deviceId) ?? null);
    if (deviceId !== SYSTEM_DEFAULT_DEVICE_VALUE && !nextPreference) return;
    setPreferredInputDevice(nextPreference);
    saveNoiseControlSettings({ preferredInputDevice: nextPreference });
  };

  const handleCalibrate = async () => {
    const value = Number(referenceDbA);
    if (!Number.isFinite(value) || value < 30 || value > 120) {
      setCalibrationError("参考声级必须在 30–120 dB(A) 之间。");
      return;
    }
    const accepted = await confirm({
      title: "开始外部参考校准",
      description: "将声级计放在麦克风旁并保持参考声场稳定，采集过程持续 10 秒。",
      confirmLabel: "开始校准",
    });
    if (!accepted) return;
    setCalibrationError(null);
    setCalibrationSubmitting(true);
    try {
      await noise.calibrate(value);
      notify({
        variant: "success",
        title: "校准完成",
        description: "当前设备现可显示估算 dB(A)。",
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "未知错误";
      setCalibrationError(message);
      notify({ variant: "danger", title: "校准失败", description: message });
    } finally {
      setCalibrationSubmitting(false);
    }
  };

  const handleClearCalibration = async () => {
    const accepted = await confirm({
      title: "清除 dB(A) 校准",
      description: "环境安静评分不受影响；清除后将不再显示估算 dB(A)。",
      confirmLabel: "清除校准",
      variant: "danger",
    });
    if (!accepted) return;
    setCalibrationSubmitting(true);
    try {
      await noise.clearCalibration();
      setCalibrationError(null);
      notify({ variant: "success", title: "校准已清除" });
    } catch (error) {
      const message = error instanceof Error ? error.message : "未知错误";
      setCalibrationError(message);
      notify({ variant: "danger", title: "清除失败", description: message });
    } finally {
      setCalibrationSubmitting(false);
    }
  };

  const copyDiagnostics = async () => {
    const payload = {
      schemaVersion: 1,
      exportedAt: new Date().toISOString(),
      pcmIncluded: false,
      temporaryCaptureActive,
      monitoring: {
        role: noise.role,
        status: noise.status,
        signalHealth: noise.signalHealth,
        confidence: noise.confidence,
        leaderEpoch: noise.leaderEpoch,
        captureSessionId: noise.captureSessionId,
        quietnessScore: noise.quietnessScore,
        estimatedDbA: noise.estimatedDbA,
        persistence: noise.diagnostics.persistence,
      },
      track,
      latestFeature: feature,
      recentFeatures: featureHistory,
      events,
    };
    try {
      await navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
      notify({ variant: "success", title: "诊断快照已复制" });
    } catch {
      notify({ variant: "danger", title: "无法写入剪贴板" });
    }
  };

  const featureSampleCount = track?.frameSamples ?? null;
  const featureSampleRate = track?.sampleRate ?? null;
  const frameDurationMs =
    featureSampleCount !== null && featureSampleRate !== null
      ? (featureSampleCount / featureSampleRate) * 1000
      : null;
  const sampleCursor =
    feature && featureSampleCount !== null ? feature.startSample + featureSampleCount : null;
  const persistence = noise.diagnostics.persistence;
  const scoring = noise.diagnostics.scoring;
  const canStartTemporary = noise.status === "disabled" && !temporaryCaptureActive;
  const calibrationBusy = calibrationSubmitting || noise.calibration.status === "collecting";
  const calibrationBlockedReason =
    noise.status === "disabled"
      ? "请先开始临时采集"
      : !track
        ? "等待采集设备就绪"
        : !track.processingDisabled
          ? "系统音频处理未确认关闭"
          : null;
  const calibrationStatusLabel =
    noise.calibration.status === "collecting"
      ? `校准中 ${Math.round(noise.calibration.progress)}%`
      : noise.calibration.status === "error"
        ? "校准异常"
        : noise.calibrationAvailable
          ? "已校准"
          : "未校准";
  const calibrationTone: UiTone =
    noise.calibration.status === "error"
      ? "danger"
      : noise.calibrationAvailable
        ? "success"
        : calibrationBlockedReason
          ? "warning"
          : "info";
  const persistenceLabel = persistence.enabled
    ? persistence.available
      ? "保存正常"
      : "保存不可用"
    : "保存关闭";
  const scoreSummary =
    noise.status === "quiet" || noise.status === "noisy"
      ? STATUS_LABELS[noise.status]
      : `采集进度 ${Math.round(scoring.progress)}%`;
  const flowStages = [
    {
      id: "input",
      icon: "feature.microphone",
      label: "输入设备",
      summary: track ? `${track.sampleRate.toLocaleString()} Hz` : "等待设备",
    },
    {
      id: "session",
      icon: "feature.sync",
      label: "采集会话",
      summary: ROLE_LABELS[noise.role],
    },
    {
      id: "features",
      icon: "feature.audio",
      label: "特征提取",
      summary: feature ? `帧 ${feature.frameSequence}` : "等待帧",
    },
    {
      id: "health",
      icon: "feature.diagnostics",
      label: "信号诊断",
      summary: `${HEALTH_LABELS[noise.signalHealth]} · ${CONFIDENCE_LABELS[noise.confidence]}`,
    },
    {
      id: "score",
      icon: "feature.noiseReport",
      label: "评分与校准",
      summary: scoreSummary,
    },
    {
      id: "output",
      icon: "feature.storage",
      label: "分发与持久化",
      summary: `${persistenceLabel} · ${ROLE_LABELS[noise.role]}`,
    },
  ] satisfies AudioFlowStage[];

  return (
    <main className={styles.page} data-audio-debug-page>
      <header className={styles.header}>
        <div className={styles.headerInner}>
          <div className={styles.titleGroup}>
            <span className={styles.eyebrow}>
              <AppIcon name="feature.diagnostics" size="sm" />
              DEBUG / AUDIO
            </span>
            <h1>音频采集诊断</h1>
            <div className={styles.statusRow} aria-live="polite">
              <StatusPill tone={roleTone(noise.role)}>{ROLE_LABELS[noise.role]}</StatusPill>
              <StatusPill tone={statusTone(noise.status)}>{STATUS_LABELS[noise.status]}</StatusPill>
              <StatusPill tone={healthTone(noise.signalHealth)}>
                {HEALTH_LABELS[noise.signalHealth]}
              </StatusPill>
              <StatusPill tone={confidenceTone(noise.confidence)}>
                {CONFIDENCE_LABELS[noise.confidence]}
              </StatusPill>
            </div>
          </div>

          <div className={styles.actions}>
            {temporaryCaptureActive ? (
              <Button
                icon="action.pause"
                variant="danger"
                onClick={() => setTemporaryCaptureActive(false)}
              >
                停止临时采集
              </Button>
            ) : canStartTemporary ? (
              <Button
                icon="action.play"
                variant="primary"
                onClick={() => setTemporaryCaptureActive(true)}
              >
                开始临时采集
              </Button>
            ) : null}
            {noise.status !== "disabled" ? (
              <Button icon="action.restart" onClick={noise.retry}>
                重启采集
              </Button>
            ) : null}
            <Button icon="action.copy" variant="ghost" onClick={() => void copyDiagnostics()}>
              复制诊断快照
            </Button>
          </div>
        </div>
      </header>

      <div className={styles.content}>
        <section
          className={styles.flowOverview}
          data-flow-overview
          aria-labelledby="audio-flow-heading"
        >
          <div className={styles.flowOverviewHeading}>
            <span>PIPELINE</span>
            <h2 id="audio-flow-heading">数据处理流程</h2>
          </div>
          <ol className={styles.flowTrack} aria-label="音频数据处理流程">
            {flowStages.map((stage, index) => (
              <li key={stage.id} data-flow-stage={stage.id}>
                <span className={styles.flowMarker} aria-hidden="true">
                  <AppIcon name={stage.icon} size="sm" />
                </span>
                <span className={styles.flowText}>
                  <span className={styles.flowIndex}>{String(index + 1).padStart(2, "0")}</span>
                  <strong>{stage.label}</strong>
                  <span>{stage.summary}</span>
                </span>
              </li>
            ))}
          </ol>
        </section>

        <section
          className={styles.stage}
          data-flow-section="input"
          aria-labelledby="input-device-heading"
        >
          <div className={styles.stageHeading}>
            <span className={styles.stageIndex}>01</span>
            <span className={styles.stageIcon} aria-hidden="true">
              <AppIcon name="feature.microphone" />
            </span>
            <h2 id="input-device-heading">输入设备</h2>
          </div>
          <div className={styles.stageContent}>
            <div className={styles.inputDeviceControls}>
              <div className={styles.inputDeviceSelect}>
                <Dropdown
                  error={inputDeviceError ?? undefined}
                  hint={
                    inputDevicesLoading
                      ? "正在读取设备"
                      : inputDevices.length > 0
                        ? `${inputDevices.length} 个设备可用`
                        : "授权后可显示设备"
                  }
                  label="麦克风设备"
                  options={inputDeviceOptions}
                  prefixIcon="feature.microphone"
                  value={preferredInputDevice?.deviceId ?? SYSTEM_DEFAULT_DEVICE_VALUE}
                  width="100%"
                  onChange={(value) => {
                    if (typeof value === "string") handleInputDeviceChange(value);
                  }}
                />
              </div>
              <Button
                aria-label="授权并刷新麦克风设备"
                icon="action.refresh"
                loading={inputDevicesLoading}
                size="sm"
                variant="secondary"
                onClick={() => void refreshInputDevices(true)}
              >
                授权并刷新
              </Button>
            </div>

            <dl className={`${styles.detailList} ${styles.inputDetails}`}>
              <div>
                <dt>设备键</dt>
                <dd className={styles.codeValue}>{track?.deviceKey ?? "—"}</dd>
              </div>
              <div>
                <dt>设备键稳定性</dt>
                <dd>{track ? (track.persistentDeviceKey ? "持久" : "本次会话") : "—"}</dd>
              </div>
              <div>
                <dt>采样率</dt>
                <dd>{track ? `${track.sampleRate.toLocaleString()} Hz` : "—"}</dd>
              </div>
              <div>
                <dt>输入设置采样率</dt>
                <dd>
                  {track?.inputSettingsSampleRate
                    ? `${track.inputSettingsSampleRate.toLocaleString()} Hz`
                    : "—"}
                </dd>
              </div>
              <div>
                <dt>声道数</dt>
                <dd>{track?.channelCount ?? "—"}</dd>
              </div>
              <div>
                <dt>声道混合</dt>
                <dd>{track?.channelMixMode === "arithmetic-mean" ? "算术平均" : "—"}</dd>
              </div>
              <div>
                <dt>回声消除</dt>
                <dd>{formatBoolean(processing.echoCancellation)}</dd>
              </div>
              <div>
                <dt>噪声抑制</dt>
                <dd>{formatBoolean(processing.noiseSuppression)}</dd>
              </div>
              <div>
                <dt>自动增益</dt>
                <dd>{formatBoolean(processing.autoGainControl)}</dd>
              </div>
              <div>
                <dt>关闭处理已确认</dt>
                <dd>{track ? (track.processingDisabled ? "是" : "否") : "—"}</dd>
              </div>
            </dl>
          </div>
        </section>

        <section
          className={styles.stage}
          data-flow-section="session"
          aria-labelledby="capture-session-heading"
        >
          <div className={styles.stageHeading}>
            <span className={styles.stageIndex}>02</span>
            <span className={styles.stageIcon} aria-hidden="true">
              <AppIcon name="feature.sync" />
            </span>
            <h2 id="capture-session-heading">采集会话</h2>
          </div>
          <div className={styles.stageContent}>
            <div className={styles.sessionStatus}>
              <StatusPill tone={roleTone(noise.role)}>{ROLE_LABELS[noise.role]}</StatusPill>
              <StatusPill tone={statusTone(noise.status)}>{STATUS_LABELS[noise.status]}</StatusPill>
            </div>
            <Grid minColumnWidth={300} gap="lg">
              <dl className={styles.detailList}>
                <div>
                  <dt>采集会话</dt>
                  <dd className={styles.codeValue}>{noise.captureSessionId ?? "—"}</dd>
                </div>
                <div>
                  <dt>Leader epoch</dt>
                  <dd className={styles.codeValue}>{noise.leaderEpoch ?? "—"}</dd>
                </div>
                <div>
                  <dt>帧序号</dt>
                  <dd>{feature?.frameSequence ?? "—"}</dd>
                </div>
                <div>
                  <dt>起始样本</dt>
                  <dd>{feature?.startSample.toLocaleString() ?? "—"}</dd>
                </div>
                <div>
                  <dt>样本游标</dt>
                  <dd>{sampleCursor?.toLocaleString() ?? "—"}</dd>
                </div>
              </dl>
              <dl className={styles.detailList}>
                <div>
                  <dt>帧样本数</dt>
                  <dd>{featureSampleCount?.toLocaleString() ?? "—"}</dd>
                </div>
                <div>
                  <dt>帧时长</dt>
                  <dd>{frameDurationMs === null ? "—" : `${frameDurationMs.toFixed(1)} ms`}</dd>
                </div>
                <div>
                  <dt>特征协议</dt>
                  <dd>spectral-features-v1</dd>
                </div>
                <div>
                  <dt>PCM 跨 Worklet</dt>
                  <dd>否</dd>
                </div>
                <div>
                  <dt>临时采集历史</dt>
                  <dd>{temporaryCaptureActive ? "禁用" : "遵循设置"}</dd>
                </div>
              </dl>
            </Grid>
          </div>
        </section>

        <section
          className={styles.stage}
          data-flow-section="features"
          aria-labelledby="feature-extraction-heading"
        >
          <div className={styles.stageHeading}>
            <span className={styles.stageIndex}>03</span>
            <span className={styles.stageIcon} aria-hidden="true">
              <AppIcon name="feature.audio" />
            </span>
            <h2 id="feature-extraction-heading">特征提取</h2>
            <span className={styles.frameCounter}>
              {feature ? `帧 ${feature.frameSequence}` : "等待特征帧"}
            </span>
          </div>
          <div className={styles.stageContent}>
            <Grid minColumnWidth={170} gap="sm" className={styles.metricGrid}>
              <MetricCard
                icon="feature.audio"
                label="A 加权电平"
                value={formatDbfs(feature?.aWeightedDbfs)}
                meta="100 ms 特征帧"
                tone="accent"
              />
              <MetricCard
                icon="feature.noise"
                label="原始 RMS"
                value={formatDbfs(feature?.rmsDbfs)}
                meta="未映射为真实声压级"
                tone="info"
              />
              <MetricCard
                label="1% 谷值"
                value={formatDbfs(feature?.sampleP01Dbfs)}
                meta="100 ms 内绝对振幅 P1"
                tone="info"
              />
              <MetricCard
                label="近零样本"
                value={formatPercent(feature?.zeroRatio)}
                meta="连续异常会降低有效覆盖"
                tone={feature && feature.zeroRatio >= 0.95 ? "danger" : "neutral"}
              />
              <MetricCard
                label="削波样本"
                value={formatPercent(feature?.clippedRatio, 3)}
                meta="校准上限 0.100%"
                tone={feature && feature.clippedRatio > 0.001 ? "danger" : "neutral"}
              />
            </Grid>

            <div className={styles.chartTool}>
              <div className={styles.chartSeriesControls} role="group" aria-label="曲线显示">
                {AUDIO_CHART_SERIES.map((definition) => (
                  <span
                    className={styles.chartSeriesControl}
                    data-tone={definition.tone}
                    data-visible={chartVisibility[definition.id]}
                    key={definition.id}
                  >
                    <span className={styles.chartSeriesSwatch} aria-hidden="true" />
                    <Switch
                      aria-label={`${definition.label}曲线`}
                      checked={chartVisibility[definition.id]}
                      label={definition.label}
                      onCheckedChange={(checked) =>
                        setChartVisibility((current) => ({
                          ...current,
                          [definition.id]: checked,
                        }))
                      }
                    />
                  </span>
                ))}
              </div>
              <LineChart
                ariaLabel="最近三十秒音频数字电平"
                description="A 加权、原始 RMS 与 P1 谷值 dBFS 特征，不包含 PCM。"
                size="default"
                series={chart.series}
                xDomain={chart.xDomain}
                yDomain={DBFS_CHART_DOMAIN}
                yTicks={DBFS_CHART_TICKS}
                emptyMessage={
                  chart.series.length === 0 ? "全部曲线已隐藏" : "等待 AudioWorklet 特征帧"
                }
              />
            </div>
          </div>
        </section>

        <section
          className={styles.stage}
          data-flow-section="health"
          aria-labelledby="signal-health-heading"
        >
          <div className={styles.stageHeading}>
            <span className={styles.stageIndex}>04</span>
            <span className={styles.stageIcon} aria-hidden="true">
              <AppIcon name="feature.diagnostics" />
            </span>
            <h2 id="signal-health-heading">信号诊断</h2>
          </div>
          <div className={styles.stageContent}>
            <Grid minColumnWidth={170} gap="sm" className={styles.metricGrid}>
              <MetricCard
                icon="feature.diagnostics"
                label="信号健康"
                value={HEALTH_LABELS[noise.signalHealth]}
                meta={STATUS_LABELS[noise.status]}
                tone={healthTone(noise.signalHealth)}
              />
              <MetricCard
                label="置信度"
                value={CONFIDENCE_LABELS[noise.confidence]}
                meta="评分可信程度"
                tone={confidenceTone(noise.confidence)}
              />
              <MetricCard
                label="有效秒"
                value={`${scoring.validSecondCount} / ${scoring.requiredSeconds}`}
                meta={`已收集 ${scoring.collectedSeconds} 秒`}
                tone={scoring.validSecondCount >= scoring.requiredSeconds ? "success" : "info"}
              />
              <MetricCard
                label="覆盖率"
                value={`${Math.round(scoring.coverageRatio * 100)}%`}
                meta="有效特征覆盖"
                tone={scoring.coverageRatio >= 0.8 ? "success" : "warning"}
              />
            </Grid>
            <div className={styles.progressBlock}>
              <div>
                <span>60 秒收集进度</span>
                <strong>{Math.round(scoring.progress)}%</strong>
              </div>
              <Progress label="60 秒信号收集进度" max={100} value={Math.round(scoring.progress)} />
            </div>
          </div>
        </section>

        <section
          className={styles.stage}
          data-flow-section="score"
          aria-labelledby="score-calibration-heading"
        >
          <div className={styles.stageHeading}>
            <span className={styles.stageIndex}>05</span>
            <span className={styles.stageIcon} aria-hidden="true">
              <AppIcon name="feature.noiseReport" />
            </span>
            <h2 id="score-calibration-heading">评分与校准</h2>
          </div>
          <div className={styles.stageContent}>
            <Grid minColumnWidth={170} gap="sm" className={styles.metricGrid}>
              <MetricCard
                icon="feature.noiseReport"
                label="环境安静评分"
                value={noise.quietnessScore === null ? "—" : noise.quietnessScore.toFixed(1)}
                meta={noise.quietnessScore === null ? "等待完整 60 秒窗口" : scoreSummary}
                tone={
                  noise.quietnessScore === null
                    ? "neutral"
                    : noise.quietnessScore < noise.scoreAlertThreshold
                      ? "danger"
                      : "success"
                }
              />
              <MetricCard
                label="活动度"
                value={
                  noise.latestSlice
                    ? `${Math.round(noise.latestSlice.detail.activityMean * 100)}%`
                    : "—"
                }
                meta="60 秒窗口均值"
                tone="info"
              />
              <MetricCard
                label="估算 dB(A)"
                value={noise.estimatedDbA === null ? "—" : noise.estimatedDbA.toFixed(1)}
                meta={noise.calibrationAvailable ? "使用当前校准画像" : "未校准"}
                tone={noise.calibrationAvailable ? "accent" : "neutral"}
              />
              <MetricCard
                label="校准画像"
                value={noise.calibrationAvailable ? "有效" : "无"}
                meta={
                  noise.calibration.status === "collecting"
                    ? `采集中 ${Math.round(noise.calibration.progress)}%`
                    : noise.calibration.status === "error"
                      ? "校准异常"
                      : "只读状态"
                }
                tone={noise.calibrationAvailable ? "success" : "neutral"}
              />
            </Grid>
            <InfoPanel
              className={styles.calibrationPanel}
              tone={calibrationTone}
              title="外部参考校准"
            >
              <div className={styles.calibrationStatusRow}>
                <StatusPill tone={calibrationTone}>{calibrationStatusLabel}</StatusPill>
                <span>
                  {calibrationBlockedReason ??
                    (track && !track.persistentDeviceKey
                      ? "设备标识仅本次会话，校准不会跨会话保留"
                      : "校准仅绑定当前设备、采样率和处理配置")}
                </span>
              </div>
              <div className={styles.calibrationControlRow}>
                <Input
                  error={calibrationError ?? noise.calibration.error ?? undefined}
                  hint="旁置声级计读数"
                  label="参考声级"
                  max={120}
                  min={30}
                  step={0.1}
                  suffix="dB(A)"
                  type="number"
                  value={referenceDbA}
                  onChange={(event) => {
                    setReferenceDbA(event.target.value);
                    setCalibrationError(null);
                  }}
                />
                <div className={styles.calibrationActions}>
                  <Button
                    icon="action.calibrateMicrophone"
                    loading={calibrationBusy}
                    size="sm"
                    variant="secondary"
                    disabled={Boolean(calibrationBlockedReason) || calibrationBusy}
                    onClick={() => void handleCalibrate()}
                  >
                    {noise.calibrationAvailable ? "重新校准" : "开始校准"}
                  </Button>
                  <Button
                    icon="action.clearCalibration"
                    size="sm"
                    variant="danger"
                    disabled={!noise.calibrationAvailable || calibrationBusy}
                    onClick={() => void handleClearCalibration()}
                  >
                    清除校准
                  </Button>
                </div>
              </div>
              {noise.calibration.status === "collecting" && (
                <div className={styles.calibrationProgress}>
                  <span>保持声级计与麦克风旁置，维持稳定声场</span>
                  <Progress
                    label="外部参考校准进度"
                    max={100}
                    value={Math.round(noise.calibration.progress)}
                  />
                </div>
              )}
              <p className={styles.calibrationNote}>
                校准持续 10 秒，只生成估算 dB(A) 偏移，不改变环境安静评分。
              </p>
            </InfoPanel>
          </div>
        </section>

        <section
          className={styles.stage}
          data-flow-section="output"
          aria-labelledby="distribution-storage-heading"
        >
          <div className={styles.stageHeading}>
            <span className={styles.stageIndex}>06</span>
            <span className={styles.stageIcon} aria-hidden="true">
              <AppIcon name="feature.storage" />
            </span>
            <h2 id="distribution-storage-heading">分发与持久化</h2>
          </div>
          <div className={styles.stageContent}>
            <Grid columns={2} gap="sm" className={styles.outputBranches}>
              <InfoPanel tone="info" title="跨标签快照">
                <dl className={styles.branchList}>
                  <div>
                    <dt>当前角色</dt>
                    <dd>{ROLE_LABELS[noise.role]}</dd>
                  </div>
                  <div>
                    <dt>分发内容</dt>
                    <dd>特征快照</dd>
                  </div>
                  <div>
                    <dt>PCM</dt>
                    <dd>不分发</dd>
                  </div>
                  <div>
                    <dt>页面事件</dt>
                    <dd>仅内存</dd>
                  </div>
                </dl>
              </InfoPanel>
              <InfoPanel tone={persistence.available ? "success" : "warning"} title="IndexedDB">
                <dl className={styles.branchList}>
                  <div>
                    <dt>保存状态</dt>
                    <dd>{persistenceLabel}</dd>
                  </div>
                  <div>
                    <dt>待写帧数</dt>
                    <dd>{persistence.pendingFrames}</dd>
                  </div>
                  <div>
                    <dt>数据协议</dt>
                    <dd>100 ms / spectral-features-v1</dd>
                  </div>
                  <div>
                    <dt>临时采集</dt>
                    <dd>{temporaryCaptureActive ? "不写历史" : "遵循设置"}</dd>
                  </div>
                </dl>
                {persistence.error && (
                  <p className={styles.persistenceError}>{persistence.error}</p>
                )}
              </InfoPanel>
            </Grid>
          </div>
        </section>

        <section
          className={styles.traceSection}
          data-flow-trace
          aria-labelledby="event-log-heading"
        >
          <div className={styles.traceHeading}>
            <div>
              <AppIcon name="feature.noiseHistory" />
              <h2 id="event-log-heading">运行轨迹</h2>
            </div>
            <Button
              icon="action.delete"
              size="sm"
              variant="minimal"
              disabled={events.length === 0}
              onClick={() => setEvents([])}
            >
              清空
            </Button>
          </div>

          <ol className={styles.eventLog} aria-live="polite">
            {events.length === 0 ? (
              <li className={styles.emptyEvent}>暂无运行轨迹</li>
            ) : (
              events
                .slice()
                .reverse()
                .map((event) => (
                  <li key={event.id}>
                    <time dateTime={new Date(event.at).toISOString()}>
                      {new Date(event.at).toLocaleTimeString([], { hour12: false })}
                    </time>
                    <StatusPill tone={roleTone(event.role)}>{ROLE_LABELS[event.role]}</StatusPill>
                    <span>{STATUS_LABELS[event.status]}</span>
                    <span className={styles.eventHealth}>{HEALTH_LABELS[event.health]}</span>
                    <span className={styles.eventConfidence}>
                      {CONFIDENCE_LABELS[event.confidence]}
                    </span>
                  </li>
                ))
            )}
          </ol>
        </section>
      </div>
    </main>
  );
}
