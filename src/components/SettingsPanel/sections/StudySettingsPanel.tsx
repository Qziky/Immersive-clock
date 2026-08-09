import React, { useCallback, useEffect, useMemo, useState } from "react";

import {
  DEFAULT_NOISE_REPORT_RETENTION_DAYS,
  MAX_NOISE_REPORT_AUTO_CLOSE_MINUTES,
  MIN_NOISE_REPORT_AUTO_CLOSE_MINUTES,
} from "../../../constants/noiseReport";
import { useAppState } from "../../../contexts/AppContext";
import { useNoiseStream } from "../../../hooks/useNoiseStream";
import {
  listNoiseInputDevices,
  requestNoiseInputDeviceAccess,
  subscribeNoiseInputDeviceChanges,
  type NoiseInputDevice,
} from "../../../services/noise/noiseInputDeviceService";
import {
  Button,
  Dropdown,
  FormSection,
  InfoPanel,
  Inline,
  Input,
  RadioGroup,
  Slider,
  SettingGrid,
  SettingItem,
  StatusPill,
  Switch,
  Tabs,
  useFeedback,
} from "../../../ui";
import { pushErrorCenterRecord } from "../../../utils/errorCenter";
import {
  getNoiseControlSettings,
  saveNoiseControlSettings,
  type NoiseControlSettings,
} from "../../../utils/noiseControlSettings";
import {
  getNoiseReportSettings,
  saveNoiseReportSettings,
} from "../../../utils/noiseReportSettings";
import { NoiseStatsSummary } from "../../NoiseSettings/NoiseStatsSummary";
import { RealTimeNoiseChart } from "../../NoiseSettings/RealTimeNoiseChart";

import styles from "./StudySettingsPanel.module.css";

export interface StudySettingsPanelProps {
  isActive?: boolean;
  onRegisterSave?: (fn: () => void) => void;
}

type NoiseSettingsTab = "control" | "calibration" | "reports" | "live";

const NOISE_SETTINGS_TABS: Array<{ value: NoiseSettingsTab; label: string }> = [
  { value: "control", label: "控制" },
  { value: "calibration", label: "校准" },
  { value: "reports", label: "报告" },
  { value: "live", label: "监测" },
];

const METRIC_OPTIONS = [
  { value: "quietness-score", label: "环境安静评分" },
  { value: "estimated-dba", label: "估算 dB(A)" },
] satisfies Array<{
  value: NoiseControlSettings["primaryMetric"];
  label: string;
}>;

const SYSTEM_DEFAULT_DEVICE_VALUE = "__immersive_clock_system_default__";

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

export const StudySettingsPanel: React.FC<StudySettingsPanelProps> = ({
  isActive = true,
  onRegisterSave,
}) => {
  const { study } = useAppState();
  const { confirm } = useFeedback();
  const noiseStream = useNoiseStream(isActive);
  const initialControl = getNoiseControlSettings();
  const initialReport = getNoiseReportSettings();
  const [activeTab, setActiveTab] = useState<NoiseSettingsTab>("control");
  const [draft, setDraft] = useState<NoiseControlSettings>(initialControl);
  const [autoPopupReport, setAutoPopupReport] = useState(initialReport.autoPopup);
  const [reportAutoCloseMinutes, setReportAutoCloseMinutes] = useState(
    initialReport.autoCloseMinutes
  );
  const [referenceDbA, setReferenceDbA] = useState("60");
  const [inputDevices, setInputDevices] = useState<NoiseInputDevice[]>([]);
  const [inputDeviceError, setInputDeviceError] = useState<string | null>(null);
  const [inputDevicesLoading, setInputDevicesLoading] = useState(true);

  const openMessage = useCallback(
    (type: "general" | "error", title: string, message: string) => {
      if (type === "error") {
        pushErrorCenterRecord({ level: "error", source: "noise", title, message });
        if (!study.errorPopupEnabled) return;
      }
      window.dispatchEvent(
        new CustomEvent("messagePopup:open", { detail: { type, title, message } })
      );
    },
    [study.errorPopupEnabled]
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
    if (!isActive) return undefined;
    void refreshInputDevices();
    return subscribeNoiseInputDeviceChanges(() => void refreshInputDevices());
  }, [isActive, refreshInputDevices]);

  useEffect(() => {
    onRegisterSave?.(() => {
      saveNoiseControlSettings(draft);
      saveNoiseReportSettings({
        autoPopup: autoPopupReport,
        autoCloseMinutes: reportAutoCloseMinutes,
      });
    });
  }, [autoPopupReport, draft, onRegisterSave, reportAutoCloseMinutes]);

  const updateDraft = <TKey extends keyof NoiseControlSettings>(
    key: TKey,
    value: NoiseControlSettings[TKey]
  ) => setDraft((current) => ({ ...current, [key]: value }));

  const inputDeviceOptions = useMemo(() => {
    const options = [{ value: SYSTEM_DEFAULT_DEVICE_VALUE, label: "系统默认" }];
    const preferred = draft.preferredInputDevice;
    if (preferred && !inputDevices.some((device) => device.deviceId === preferred.deviceId)) {
      options.push({
        value: preferred.deviceId,
        label: `${preferred.label}（当前不可用）`,
      });
    }
    inputDevices.forEach((device) => {
      options.push({ value: device.deviceId, label: device.label });
    });
    return options;
  }, [draft.preferredInputDevice, inputDevices]);

  const handleInputDeviceChange = (deviceId: string) => {
    if (deviceId === SYSTEM_DEFAULT_DEVICE_VALUE) {
      updateDraft("preferredInputDevice", null);
      return;
    }
    const device = inputDevices.find((candidate) => candidate.deviceId === deviceId);
    if (device) {
      updateDraft("preferredInputDevice", {
        deviceId: device.deviceId,
        label: device.label,
      });
    }
  };

  const handleCalibrate = useCallback(async () => {
    const value = Number(referenceDbA);
    if (!Number.isFinite(value) || value < 30 || value > 120) {
      openMessage("error", "校准值无效", "参考声级必须在 30–120 dB(A) 之间。");
      return;
    }
    const accepted = await confirm({
      title: "开始外部参考校准",
      description: "将声级计放在麦克风旁并保持参考声场稳定，采集过程持续 10 秒。",
      confirmLabel: "开始校准",
    });
    if (!accepted) return;
    try {
      await noiseStream.calibrate(value);
      openMessage("general", "校准完成", "当前设备现可显示估算 dB(A)。");
    } catch (error) {
      openMessage("error", "校准失败", error instanceof Error ? error.message : "未知错误");
    }
  }, [confirm, noiseStream, openMessage, referenceDbA]);

  const handleClearCalibration = useCallback(async () => {
    const accepted = await confirm({
      title: "清除 dB(A) 校准",
      description: "环境安静评分不受影响；清除后将不再显示估算 dB(A)。",
      confirmLabel: "清除校准",
      variant: "danger",
    });
    if (!accepted) return;
    try {
      await noiseStream.clearCalibration();
    } catch (error) {
      openMessage("error", "清除失败", error instanceof Error ? error.message : "未知错误");
    }
  }, [confirm, noiseStream, openMessage]);

  const calibrationTone = noiseStream.calibrationAvailable ? "success" : "warning";
  const calibrationText =
    noiseStream.calibration.status === "collecting"
      ? `校准中 ${noiseStream.calibration.progress}%`
      : noiseStream.calibrationAvailable
        ? "已校准"
        : "未校准";

  return (
    <div id="study-panel">
      <Tabs<NoiseSettingsTab>
        id="noise-settings-tabs"
        className={styles.sectionTabs}
        items={NOISE_SETTINGS_TABS.map((item) => ({
          ...item,
          ariaControls: `noise-settings-panel-${item.value}`,
          id: `noise-settings-tabs-tab-${item.value}`,
        }))}
        label="噪音设置分类"
        value={activeTab}
        variant="underlined"
        onChange={setActiveTab}
      />

      <div
        aria-labelledby={`noise-settings-tabs-tab-${activeTab}`}
        id={`noise-settings-panel-${activeTab}`}
        role="tabpanel"
        tabIndex={0}
      >
        <FormSection title="噪音控制" variant="plain" hidden={activeTab !== "control"}>
          <SettingGrid columns={2} className={styles.noiseSettingsGrid}>
            <SettingItem
              className={styles.inputDeviceItem}
              icon="feature.microphone"
              title="输入麦克风"
              description={
                draft.preferredInputDevice &&
                !inputDevices.some(
                  (device) => device.deviceId === draft.preferredInputDevice?.deviceId
                )
                  ? "所选设备当前不可用，采集时将使用系统默认。"
                  : "选择环境监测与校准使用的音频输入设备。"
              }
            >
              <Inline className={styles.inputDeviceControls} align="end">
                <div className={styles.inputDeviceSelect}>
                  <Dropdown
                    label="麦克风设备"
                    hint={
                      inputDevices.length > 0 ? `${inputDevices.length} 个设备可用` : "等待授权"
                    }
                    error={inputDeviceError ?? undefined}
                    options={inputDeviceOptions}
                    value={draft.preferredInputDevice?.deviceId ?? SYSTEM_DEFAULT_DEVICE_VALUE}
                    onChange={(value) => {
                      if (typeof value === "string") handleInputDeviceChange(value);
                    }}
                  />
                </div>
                <Button
                  className={styles.inputDeviceRefresh}
                  icon="action.refresh"
                  loading={inputDevicesLoading}
                  size="sm"
                  variant="secondary"
                  aria-label="授权并刷新麦克风设备"
                  onClick={() => void refreshInputDevices(true)}
                >
                  授权并刷新
                </Button>
              </Inline>
            </SettingItem>
            <SettingItem
              icon="feature.microphone"
              title="启用环境监测"
              description="关闭后释放麦克风，并停止实时评分与新历史写入。"
              control={
                <Switch
                  checked={draft.monitoringEnabled}
                  onCheckedChange={(value) => updateDraft("monitoringEnabled", value)}
                  aria-label="启用环境监测"
                />
              }
            />
            <SettingItem
              icon="feature.noiseHistory"
              title="保存监测数据"
              description="保存 100 ms 特征帧与评分结果；关闭后仍可实时评分，但无法重算历史。"
              control={
                <Switch
                  checked={draft.historyEnabled}
                  onCheckedChange={(value) => updateDraft("historyEnabled", value)}
                  aria-label="保存监测数据"
                />
              }
            />
            <SettingItem
              icon="feature.studyMetrics"
              title="显示实时数值"
              control={
                <Switch
                  checked={draft.showRealtimeValue}
                  onCheckedChange={(value) => updateDraft("showRealtimeValue", value)}
                  aria-label="显示实时数值"
                />
              }
            />
            <SettingItem
              icon="feature.notification"
              title="低于提醒分数播放提示音"
              control={
                <Switch
                  checked={draft.alertSoundEnabled}
                  onCheckedChange={(value) => updateDraft("alertSoundEnabled", value)}
                  aria-label="低于提醒分数播放提示音"
                />
              }
            />
            <SettingItem icon="feature.studyThreshold" title="提醒分数">
              <Slider
                value={draft.scoreAlertThreshold}
                min={40}
                max={90}
                step={1}
                onChange={(value) => updateDraft("scoreAlertThreshold", value)}
                formatValue={(value) => `${value.toFixed(0)}分`}
                showRange
                rangeLabels={["宽松", "严格"]}
              />
            </SettingItem>
            <SettingItem icon="feature.studyMetrics" title="实时主指标">
              <RadioGroup
                name="noise-primary-metric"
                ariaLabel="实时主指标"
                value={draft.primaryMetric}
                options={METRIC_OPTIONS}
                onChange={(value) => updateDraft("primaryMetric", value)}
              />
            </SettingItem>
          </SettingGrid>
        </FormSection>

        <FormSection
          data-tour="noise-calibration"
          title="校准与修正"
          variant="plain"
          hidden={activeTab !== "calibration"}
        >
          <SettingItem
            icon="feature.microphone"
            title="外部参考声级"
            description="输入旁置声级计的读数；校准仅对当前输入设备和处理配置有效。"
            tone={calibrationTone}
            control={
              <StatusPill data-tour="noise-calibration-status" tone={calibrationTone}>
                {calibrationText}
              </StatusPill>
            }
          >
            <Input
              label="参考读数 dB(A)"
              type="number"
              min={30}
              max={120}
              step={0.1}
              value={referenceDbA}
              onChange={(event) => setReferenceDbA(event.target.value)}
            />
          </SettingItem>
          <Inline align="left">
            <Button
              data-tour="noise-calibrate-button"
              variant="secondary"
              icon="action.calibrateMicrophone"
              disabled={noiseStream.calibration.status === "collecting"}
              onClick={handleCalibrate}
            >
              {noiseStream.calibrationAvailable ? "重新校准" : "开始校准"}
            </Button>
            <Button
              variant="danger"
              icon="action.clearCalibration"
              disabled={!noiseStream.calibrationAvailable}
              onClick={handleClearCalibration}
            >
              清除校准
            </Button>
          </Inline>
          <InfoPanel tone="warning" title="测量边界">
            浏览器获得的是经过设备、驱动或系统处理后的 PCM。估算 dB(A)
            不是认证声级计读数，音频处理未确认关闭、信号异常或参考声场不稳定时会拒绝校准。
          </InfoPanel>
        </FormSection>

        <FormSection title="噪音报告" variant="plain" hidden={activeTab !== "reports"}>
          <SettingGrid columns={2} className={styles.noiseSettingsGrid}>
            <SettingItem
              icon="feature.noiseReport"
              title="自动弹出报告"
              control={
                <Switch
                  checked={autoPopupReport}
                  onCheckedChange={setAutoPopupReport}
                  aria-label="自动弹出报告"
                />
              }
            />
            <SettingItem
              disabled={!autoPopupReport}
              icon="feature.time"
              title="自动关闭时长"
              description="仅影响课时结束前自动弹出的报告；历史记录详情会保持打开。"
            >
              <Slider
                aria-label="报告自动关闭时长"
                disabled={!autoPopupReport}
                value={reportAutoCloseMinutes}
                min={MIN_NOISE_REPORT_AUTO_CLOSE_MINUTES}
                max={MAX_NOISE_REPORT_AUTO_CLOSE_MINUTES}
                step={1}
                onChange={(value) => setReportAutoCloseMinutes(Math.round(value))}
                formatValue={(value) => `${Math.round(value)} 分钟`}
                showRange
                rangeLabels={[
                  `${MIN_NOISE_REPORT_AUTO_CLOSE_MINUTES} 分钟`,
                  `${MAX_NOISE_REPORT_AUTO_CLOSE_MINUTES} 分钟`,
                ]}
              />
            </SettingItem>
            <SettingItem
              icon="feature.noiseHistory"
              title="数据保留期"
              description="原始特征帧与派生评分统一保留，过期后一起清理。"
              control={
                <StatusPill tone="neutral">{DEFAULT_NOISE_REPORT_RETENTION_DAYS} 天</StatusPill>
              }
            />
          </SettingGrid>
          <InfoPanel tone="neutral">
            原始帧仅保存在当前设备，可用于重新计算未来版本的评分；常规备份不包含原始帧。
          </InfoPanel>
        </FormSection>

        <div className={styles.monitoringSections} hidden={activeTab !== "live"}>
          <FormSection title="实时监控" variant="plain">
            <RealTimeNoiseChart enabled={isActive} />
          </FormSection>
          <FormSection title="统计数据" variant="plain">
            <NoiseStatsSummary enabled={isActive} />
          </FormSection>
        </div>
      </div>
    </div>
  );
};

export default StudySettingsPanel;
