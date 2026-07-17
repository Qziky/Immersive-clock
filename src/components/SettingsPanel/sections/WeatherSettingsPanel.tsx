import React, { useCallback, useEffect, useRef, useState } from "react";

import { useAppDispatch, useAppState } from "../../../contexts/AppContext";
import { useMinutelyWeatherSnapshot } from "../../../hooks/useMinutelyWeatherSnapshot";
import { useWeatherCoordinatorSnapshot } from "../../../hooks/useWeatherCoordinatorSnapshot";
import {
  requestWeatherRefresh,
  type WeatherCoordinatorStatus,
} from "../../../services/weatherCoordinator";
import {
  Button as FormButton,
  FormSection,
  InfoPanel,
  Inline as FormButtonGroup,
  Inline as FormRow,
  Input as FormInput,
  MetricCard,
  RadioGroup as FormSegmented,
  SettingGrid,
  SettingItem,
  Switch as FormSwitch,
} from "../../../ui";
import { getAppSettings, updateGeneralSettings } from "../../../utils/appSettings";
import { broadcastSettingsEvent, SETTINGS_EVENTS } from "../../../utils/settingsEvents";
import {
  createDefaultWeatherScheduleSettings,
  normalizeWeatherScheduleSettings,
  resolveEffectiveWeatherSchedule,
  WEATHER_SCHEDULE_LIMITS,
  type WeatherSafetySettings,
  type WeatherScheduleIntervals,
  type WeatherScheduleProfile,
} from "../../../utils/weatherSchedule";
import { createWeatherLocationKey, getWeatherCache } from "../../../utils/weatherStorage";

import { WeatherLivePanel } from "./WeatherLivePanel";
import styles from "./WeatherSettingsPanel.module.css";

export interface WeatherSettingsPanelProps {
  onRegisterSave?: (fn: () => void) => void;
  section: WeatherSettingsSection;
}

export type WeatherSettingsSection = "weather" | "location";
type WeatherContentSection = "alerts" | "refresh" | "location" | "live";

function formatTime(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return "暂无";
  return new Date(value).toLocaleString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    month: "2-digit",
    day: "2-digit",
  });
}

const COORDINATOR_STATUS_LABELS: Record<WeatherCoordinatorStatus, string> = {
  cooldown: "冷却中",
  error: "失败",
  "error-with-cache": "失败，使用缓存",
  idle: "等待调度",
  offline: "离线",
  "rate-limited": "等待请求保护",
  ready: "成功",
  refreshing: "刷新中",
};

function getCoordinatorStatusLabel(status: WeatherCoordinatorStatus): string {
  return COORDINATOR_STATUS_LABELS[status];
}

/**
 * 天气设置分段组件
 * - 展示当前天气信息与定位来源
 * - 手动刷新天气数据
 */
const WeatherSettingsPanel: React.FC<WeatherSettingsPanelProps> = ({ onRegisterSave, section }) => {
  const { study } = useAppState();
  const dispatch = useAppDispatch();
  const coordinator = useWeatherCoordinatorSnapshot();
  const minutelyWeather = useMinutelyWeatherSnapshot(section === "weather");
  const [cache, setCache] = useState(() => getWeatherCache());
  const [weatherRefreshStatus, setWeatherRefreshStatus] = useState<string>("");
  const [advancedSafetyOpen, setAdvancedSafetyOpen] = useState(false);
  const safetySettingsRef = useRef<HTMLDivElement>(null);
  const [weatherAlertEnabled, setWeatherAlertEnabled] = useState<boolean>(
    !!study.weatherAlertEnabled
  );
  const [airQualityAlertEnabled, setAirQualityAlertEnabled] = useState<boolean>(
    !!study.airQualityAlertEnabled
  );
  const [sunriseSunsetAlertEnabled, setSunriseSunsetAlertEnabled] = useState<boolean>(
    !!study.sunriseSunsetAlertEnabled
  );

  const initialWeatherSettings = getAppSettings().general.weather;
  const [scheduleProfile, setScheduleProfile] = useState<WeatherScheduleProfile>(
    initialWeatherSettings.schedule.profile
  );
  const [customSchedule, setCustomSchedule] = useState<WeatherScheduleIntervals>({
    ...initialWeatherSettings.schedule.custom,
  });
  const [safetySettings, setSafetySettings] = useState<WeatherSafetySettings>({
    ...initialWeatherSettings.schedule.safety,
  });
  const [locationMode, setLocationMode] = useState<"auto" | "manual">(
    initialWeatherSettings.locationMode === "manual" ? "manual" : "auto"
  );
  const [manualType, setManualType] = useState<"city" | "coords">(
    initialWeatherSettings.manualLocation?.type === "coords" ? "coords" : "city"
  );
  const [manualCityName, setManualCityName] = useState<string>(() => {
    return String(initialWeatherSettings.manualLocation?.cityName || "");
  });
  const [manualLat, setManualLat] = useState<string>(() => {
    const v = initialWeatherSettings.manualLocation?.lat;
    return typeof v === "number" && Number.isFinite(v) ? String(v) : "";
  });
  const [manualLon, setManualLon] = useState<string>(() => {
    const v = initialWeatherSettings.manualLocation?.lon;
    return typeof v === "number" && Number.isFinite(v) ? String(v) : "";
  });

  useEffect(() => {
    if (!advancedSafetyOpen) return;
    safetySettingsRef.current?.scrollIntoView?.({ block: "nearest", inline: "nearest" });
  }, [advancedSafetyOpen]);

  const refreshDisplayData = useCallback(() => {
    setCache(getWeatherCache());
  }, []);

  /**
   * 刷新天气数据（不强制更新地理位置缓存）
   */
  const handleRefreshWeather = useCallback(() => {
    if (coordinator.status === "refreshing") return;
    setWeatherRefreshStatus("刷新中");
    void requestWeatherRefresh({ force: true, reason: "manual", target: "all" })
      .then((next) => {
        refreshDisplayData();
        setWeatherRefreshStatus(getCoordinatorStatusLabel(next.status));
      })
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : String(error);
        setWeatherRefreshStatus("失败");
        window.dispatchEvent(
          new CustomEvent("messagePopup:open", {
            detail: {
              message,
              title: "天气获取失败",
              type: "error",
            },
          })
        );
      });
  }, [coordinator.status, refreshDisplayData]);

  const handleRefreshLocationAuto = useCallback(() => {
    const weatherRefreshEvent = new CustomEvent("weatherLocationRefresh", {
      detail: { preferredLocationMode: "auto", showErrorPopup: true },
    });
    window.dispatchEvent(weatherRefreshEvent);
    setWeatherRefreshStatus("刷新中");
  }, []);

  useEffect(() => {
    const onDone = (e: Event) => {
      const detail = (e as CustomEvent).detail || {};
      const status = detail.status || "";
      setWeatherRefreshStatus(status);
      refreshDisplayData();
    };
    window.addEventListener("weatherRefreshDone", onDone as EventListener);
    window.addEventListener("weatherLocationRefreshDone", onDone as EventListener);
    return () => {
      window.removeEventListener("weatherRefreshDone", onDone as EventListener);
      window.removeEventListener("weatherLocationRefreshDone", onDone as EventListener);
    };
  }, [refreshDisplayData]);

  const currentLocationKey = cache.coords
    ? createWeatherLocationKey(cache.coords.lat, cache.coords.lon)
    : null;
  const hasMatchingDetails =
    currentLocationKey != null && cache.details?.location === currentLocationKey;

  useEffect(() => {
    if (section !== "weather" || hasMatchingDetails || weatherRefreshStatus) return;
    handleRefreshWeather();
  }, [handleRefreshWeather, hasMatchingDetails, section, weatherRefreshStatus]);

  // 注册保存：将天气提醒开关持久化
  useEffect(() => {
    onRegisterSave?.(() => {
      dispatch({ type: "SET_WEATHER_ALERT_ENABLED", payload: weatherAlertEnabled });
      dispatch({ type: "SET_AIR_QUALITY_ALERT_ENABLED", payload: airQualityAlertEnabled });
      dispatch({ type: "SET_SUNRISE_SUNSET_ALERT_ENABLED", payload: sunriseSunsetAlertEnabled });

      const manualLocation =
        manualType === "coords"
          ? {
              type: "coords" as const,
              lat: Number.isFinite(Number.parseFloat(manualLat))
                ? Number.parseFloat(manualLat)
                : undefined,
              lon: Number.isFinite(Number.parseFloat(manualLon))
                ? Number.parseFloat(manualLon)
                : undefined,
            }
          : {
              type: "city" as const,
              cityName: String(manualCityName || "").trim(),
            };
      const normalizedSchedule = normalizeWeatherScheduleSettings({
        profile: scheduleProfile,
        custom: customSchedule,
        safety: safetySettings,
      });

      updateGeneralSettings({
        weather: {
          locationMode,
          manualLocation,
          schedule: normalizedSchedule,
        },
      });

      broadcastSettingsEvent(SETTINGS_EVENTS.WeatherSettingsUpdated, {
        locationMode,
        manualLocation,
        schedule: normalizedSchedule,
      });
    });
  }, [
    onRegisterSave,
    dispatch,
    weatherAlertEnabled,
    airQualityAlertEnabled,
    sunriseSunsetAlertEnabled,
    scheduleProfile,
    customSchedule,
    safetySettings,
    locationMode,
    manualType,
    manualCityName,
    manualLat,
    manualLon,
  ]);

  const geoDiag = cache.geolocation?.diagnostics;
  const geoHint = (() => {
    const msg = String(geoDiag?.errorMessage || "").toLowerCase();
    if (geoDiag?.errorCode === 2 && msg.includes("network service")) {
      return "提示：Electron/Chromium 可能在调用网络定位服务时失败（常见于 googleapis 不可用）。建议开启 Windows 位置服务（设置→隐私和安全→位置），并在支持定位的浏览器环境中刷新天气。";
    }
    return null;
  })();
  const sourceLabel = (() => {
    const source = cache.coords?.source;
    if (!source) return "--";
    if (source === "geolocation") return "浏览器定位";
    if (source === "amap_ip") return "高德IP定位";
    if (source === "ip") return "公共IP定位";
    if (source === "manual_city") return "手动城市";
    if (source === "manual_coords") return "手动经纬度";
    return source;
  })();
  const coordsText = cache.coords
    ? `${cache.coords.lat.toFixed(4)}, ${cache.coords.lon.toFixed(4)}`
    : "--";
  const isSectionHidden = (candidate: WeatherContentSection) =>
    section === "location" ? candidate !== "location" : candidate === "location";
  const effectiveSchedule = resolveEffectiveWeatherSchedule({
    profile: scheduleProfile,
    custom: customSchedule,
    safety: safetySettings,
  });
  const isRefreshing = coordinator.status === "refreshing";
  const displayedRefreshStatus =
    weatherRefreshStatus || getCoordinatorStatusLabel(coordinator.status);

  const updateCustomSchedule = (key: keyof WeatherScheduleIntervals, value: string) => {
    setCustomSchedule((current) => ({
      ...current,
      [key]: Number(value),
    }));
  };

  const updateSafety = (key: keyof WeatherSafetySettings, value: string) => {
    setSafetySettings((current) => ({
      ...current,
      [key]: Number(value),
    }));
  };

  return (
    <div id="weather-panel">
      <FormSection
        title="提醒开关"
        variant="plain"
        description="控制天气相关提醒是否在触发时弹出。"
        hidden={isSectionHidden("alerts")}
      >
        <SettingGrid columns={2} className={styles.alertSettingsGrid}>
          <SettingItem
            title="天气预警弹窗"
            description="恶劣天气预警时显示弹窗。"
            icon="feature.weatherAlerts"
            control={
              <FormSwitch
                checked={weatherAlertEnabled}
                onCheckedChange={setWeatherAlertEnabled}
                aria-label="天气预警弹窗"
              />
            }
          />
          <SettingItem
            title="空气污染提醒"
            description="空气质量较差时显示提醒。"
            icon="weather.airQuality"
            control={
              <FormSwitch
                checked={airQualityAlertEnabled}
                onCheckedChange={setAirQualityAlertEnabled}
                aria-label="空气污染提醒"
              />
            }
          />
          <SettingItem
            title="日出日落提醒"
            description="接近日出或日落时显示提醒。"
            icon="weather.sunrise"
            control={
              <FormSwitch
                checked={sunriseSunsetAlertEnabled}
                onCheckedChange={setSunriseSunsetAlertEnabled}
                aria-label="日出日落提醒"
              />
            }
          />
        </SettingGrid>
      </FormSection>

      <FormSection
        title="天气调度"
        variant="plain"
        description="设置本设备的天气更新频率和请求保护。"
        hidden={isSectionHidden("refresh")}
      >
        <FormSegmented<WeatherScheduleProfile>
          label="刷新档位"
          value={scheduleProfile}
          options={[
            { label: "保守", value: "conservative" },
            { label: "均衡", value: "balanced" },
            { label: "高频", value: "frequent" },
            { label: "自定义", value: "custom" },
          ]}
          onChange={setScheduleProfile}
        />

        <SettingGrid columns={3} className={styles.scheduleMetricsGrid}>
          <MetricCard
            label="上次更新"
            value={formatTime(coordinator.lastSuccessAt)}
            meta={getCoordinatorStatusLabel(coordinator.status)}
          />
          <MetricCard
            label="下次执行"
            value={formatTime(coordinator.nextRefreshAt)}
            meta={coordinator.error || "按当前档位调度"}
            tone={coordinator.error ? "warning" : "neutral"}
          />
          <MetricCard
            label="本小时请求"
            value={`${coordinator.requestsThisHour} / ${safetySettings.maxRequestsPerHour}`}
            meta={`请求间隔至少 ${safetySettings.minRequestGapSec} 秒`}
          />
        </SettingGrid>

        <InfoPanel tone="info">
          前台全量 {effectiveSchedule.allForegroundMin} 分钟，后台全量{" "}
          {effectiveSchedule.allBackgroundMin} 分钟；无雨分钟 {effectiveSchedule.minutelyDryMin}{" "}
          分钟，临雨或降雨 {effectiveSchedule.minutelyRainMin} 分钟。
        </InfoPanel>

        {scheduleProfile === "custom" ? (
          <div className={styles.scheduleInputGrid}>
            <FormInput
              label="前台全量"
              type="number"
              min={WEATHER_SCHEDULE_LIMITS.intervalMin.min}
              max={WEATHER_SCHEDULE_LIMITS.intervalMin.max}
              suffix="分钟"
              value={customSchedule.allForegroundMin}
              onChange={(event) => updateCustomSchedule("allForegroundMin", event.target.value)}
            />
            <FormInput
              label="后台全量"
              type="number"
              min={WEATHER_SCHEDULE_LIMITS.intervalMin.min}
              max={WEATHER_SCHEDULE_LIMITS.intervalMin.max}
              suffix="分钟"
              value={customSchedule.allBackgroundMin}
              onChange={(event) => updateCustomSchedule("allBackgroundMin", event.target.value)}
            />
            <FormInput
              label="分钟无雨"
              type="number"
              min={WEATHER_SCHEDULE_LIMITS.intervalMin.min}
              max={WEATHER_SCHEDULE_LIMITS.intervalMin.max}
              suffix="分钟"
              value={customSchedule.minutelyDryMin}
              onChange={(event) => updateCustomSchedule("minutelyDryMin", event.target.value)}
            />
            <FormInput
              label="分钟临雨/降雨"
              type="number"
              min={WEATHER_SCHEDULE_LIMITS.intervalMin.min}
              max={WEATHER_SCHEDULE_LIMITS.intervalMin.max}
              suffix="分钟"
              value={customSchedule.minutelyRainMin}
              onChange={(event) => updateCustomSchedule("minutelyRainMin", event.target.value)}
            />
            <FormInput
              label="分钟后台"
              type="number"
              min={WEATHER_SCHEDULE_LIMITS.intervalMin.min}
              max={WEATHER_SCHEDULE_LIMITS.intervalMin.max}
              suffix="分钟"
              value={customSchedule.minutelyBackgroundMin}
              onChange={(event) =>
                updateCustomSchedule("minutelyBackgroundMin", event.target.value)
              }
            />
          </div>
        ) : null}

        <FormButton
          variant="ghost"
          size="sm"
          icon={advancedSafetyOpen ? "action.collapse" : "action.expand"}
          aria-expanded={advancedSafetyOpen}
          aria-controls="weather-request-safety"
          onClick={() => setAdvancedSafetyOpen((current) => !current)}
        >
          请求保护
        </FormButton>
        <div
          ref={safetySettingsRef}
          id="weather-request-safety"
          className={styles.safetySettings}
          hidden={!advancedSafetyOpen}
        >
          <FormInput
            label="最小请求间隔"
            type="number"
            min={WEATHER_SCHEDULE_LIMITS.minRequestGapSec.min}
            max={WEATHER_SCHEDULE_LIMITS.minRequestGapSec.max}
            suffix="秒"
            value={safetySettings.minRequestGapSec}
            onChange={(event) => updateSafety("minRequestGapSec", event.target.value)}
          />
          <FormInput
            label="每小时请求上限"
            type="number"
            min={WEATHER_SCHEDULE_LIMITS.maxRequestsPerHour.min}
            max={WEATHER_SCHEDULE_LIMITS.maxRequestsPerHour.max}
            suffix="次"
            value={safetySettings.maxRequestsPerHour}
            onChange={(event) => updateSafety("maxRequestsPerHour", event.target.value)}
          />
          <FormButton
            variant="secondary"
            size="sm"
            onClick={() => {
              setSafetySettings({ ...createDefaultWeatherScheduleSettings().safety });
            }}
          >
            恢复默认值
          </FormButton>
        </div>
      </FormSection>

      <FormSection title="地理位置" variant="plain" hidden={isSectionHidden("location")}>
        <FormRow gap="sm" align="center">
          <FormSegmented
            label="定位方式"
            value={locationMode}
            options={[
              { label: "自动定位", value: "auto" },
              { label: "手动设置", value: "manual" },
            ]}
            onChange={(v) => setLocationMode(v as "auto" | "manual")}
          />
        </FormRow>

        {locationMode === "auto" ? (
          <FormButtonGroup align="left">
            <FormButton
              variant="secondary"
              onClick={handleRefreshLocationAuto}
              icon="action.refresh"
              loading={isRefreshing}
            >
              刷新定位
            </FormButton>
          </FormButtonGroup>
        ) : null}

        {locationMode === "manual" ? (
          <>
            <FormRow gap="sm" align="center">
              <FormSegmented
                label="手动类型"
                value={manualType}
                options={[
                  { label: "城市名称", value: "city" },
                  { label: "经纬度", value: "coords" },
                ]}
                onChange={(v) => setManualType(v as "city" | "coords")}
              />
            </FormRow>
            {manualType === "city" ? (
              <FormInput
                label="城市名称"
                value={manualCityName}
                onChange={(e) => setManualCityName(e.target.value)}
                placeholder="例如：北京"
              />
            ) : (
              <FormRow gap="sm" align="center">
                <FormInput
                  label="纬度"
                  value={manualLat}
                  onChange={(e) => setManualLat(e.target.value)}
                  placeholder="例如：39.90"
                  variant="number"
                />
                <FormInput
                  label="经度"
                  value={manualLon}
                  onChange={(e) => setManualLon(e.target.value)}
                  placeholder="例如：116.40"
                  variant="number"
                />
              </FormRow>
            )}
            <InfoPanel tone="info">保存后生效；手动定位优先级高于自动定位。</InfoPanel>
          </>
        ) : null}

        <SettingGrid columns={3} className={styles.locationMetricsGrid}>
          <MetricCard
            icon="feature.location"
            label="当前坐标"
            value={coordsText}
            meta={`来源：${sourceLabel}`}
          />
          <MetricCard label="地址" value={cache.location?.address || "--"} meta="定位解析结果" />
          <MetricCard
            label="定位诊断"
            value={geoDiag ? geoDiag.permissionState : "--"}
            meta={geoDiag?.errorMessage || "暂无异常"}
            tone={geoDiag?.errorMessage ? "warning" : "neutral"}
          />
        </SettingGrid>
        {geoHint ? <InfoPanel tone="warning">{geoHint}</InfoPanel> : null}
      </FormSection>

      <WeatherLivePanel
        cache={cache}
        hidden={isSectionHidden("live")}
        isRefreshing={isRefreshing}
        minutelyWeather={minutelyWeather}
        refreshStatus={displayedRefreshStatus}
        onRefresh={handleRefreshWeather}
      />
    </div>
  );
};

export default WeatherSettingsPanel;
