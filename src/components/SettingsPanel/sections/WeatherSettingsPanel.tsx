import React, { useCallback, useEffect, useMemo, useState } from "react";

import { useAppDispatch, useAppState } from "../../../contexts/AppContext";
import { useMinutelyWeatherSnapshot } from "../../../hooks/useMinutelyWeatherSnapshot";
import { useWeatherRuntimeSnapshot } from "../../../hooks/useWeatherRuntimeSnapshot";
import {
  acquireWeatherRuntime,
  refreshLocation,
  refreshWeather,
  searchWeatherCities,
  type WeatherRuntimeStatus,
} from "../../../services/weatherRuntime";
import type { WeatherCitySelection } from "../../../types/weather";
import {
  Button as FormButton,
  Dropdown,
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
  Tabs,
} from "../../../ui";
import { getAppSettings, updateGeneralSettings } from "../../../utils/appSettings";
import { broadcastSettingsEvent, SETTINGS_EVENTS } from "../../../utils/settingsEvents";

import { WeatherLivePanel } from "./WeatherLivePanel";
import styles from "./WeatherSettingsPanel.module.css";

export interface WeatherSettingsPanelProps {
  isActive?: boolean;
  onRegisterSave?: (fn: () => void) => void;
  section: WeatherSettingsSection;
}

export type WeatherSettingsSection = "weather" | "location";
type WeatherServiceTab = "alerts" | "refresh" | "live";
type LocationServiceTab = "locationSettings" | "locationStatus";
type WeatherContentSection = WeatherServiceTab | LocationServiceTab;

const WEATHER_SERVICE_TABS: Array<{ value: WeatherServiceTab; label: string }> = [
  { value: "alerts", label: "提醒" },
  { value: "refresh", label: "更新" },
  { value: "live", label: "数据" },
];

const STATUS_LABELS: Record<WeatherRuntimeStatus, string> = {
  error: "失败",
  idle: "等待更新",
  loading: "加载中",
  locating: "定位中",
  offline: "离线",
  rate_limited: "等待请求保护",
  ready: "已更新",
  refreshing: "更新中",
  stale: "使用过期数据",
};

function formatTime(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return "暂无";
  return new Date(value).toLocaleString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    month: "2-digit",
    day: "2-digit",
  });
}

function candidateValue(candidate: WeatherCitySelection, index: number): string {
  return `${candidate.locationKey}:${candidate.lon}:${candidate.lat}:${index}`;
}

const WeatherSettingsPanel: React.FC<WeatherSettingsPanelProps> = ({
  isActive = true,
  onRegisterSave,
  section,
}) => {
  const { study } = useAppState();
  const dispatch = useAppDispatch();
  const runtime = useWeatherRuntimeSnapshot();
  const minutelyWeather = useMinutelyWeatherSnapshot(section === "weather");
  const [activeWeatherTab, setActiveWeatherTab] = useState<WeatherServiceTab>("alerts");
  const [weatherAlertEnabled, setWeatherAlertEnabled] = useState(
    Boolean(study.weatherAlertEnabled)
  );
  const [airQualityAlertEnabled, setAirQualityAlertEnabled] = useState(
    Boolean(study.airQualityAlertEnabled)
  );
  const [sunriseSunsetAlertEnabled, setSunriseSunsetAlertEnabled] = useState(
    Boolean(study.sunriseSunsetAlertEnabled)
  );

  const initialWeatherSettings = getAppSettings().general.weather;
  const [locationMode, setLocationMode] = useState<"auto" | "manual">(
    initialWeatherSettings.locationMode
  );
  const [manualQuery, setManualQuery] = useState(initialWeatherSettings.manualLocation.query);
  const [selectedCity, setSelectedCity] = useState<WeatherCitySelection | null>(
    initialWeatherSettings.manualLocation.selected
  );
  const [cityCandidates, setCityCandidates] = useState<WeatherCitySelection[]>(() =>
    initialWeatherSettings.manualLocation.selected
      ? [initialWeatherSettings.manualLocation.selected]
      : []
  );
  const [selectedCandidateValue, setSelectedCandidateValue] = useState<string | undefined>(() =>
    initialWeatherSettings.manualLocation.selected
      ? candidateValue(initialWeatherSettings.manualLocation.selected, 0)
      : undefined
  );
  const [citySearchError, setCitySearchError] = useState<string | null>(null);
  const [isSearchingCities, setIsSearchingCities] = useState(false);

  useEffect(() => {
    if (!isActive) return undefined;
    return acquireWeatherRuntime();
  }, [isActive]);

  const isRefreshing =
    runtime.status === "locating" ||
    runtime.status === "loading" ||
    runtime.status === "refreshing";
  const isSectionHidden = (candidate: WeatherContentSection) =>
    section === "weather"
      ? candidate !== activeWeatherTab
      : candidate !== "locationSettings" && candidate !== "locationStatus";
  const location = runtime.location;

  const candidateOptions = useMemo(
    () =>
      cityCandidates.map((candidate, index) => ({
        description: [
          candidate.affiliation,
          `${candidate.lat.toFixed(4)}, ${candidate.lon.toFixed(4)}`,
        ]
          .filter(Boolean)
          .join(" · "),
        label: candidate.name,
        value: candidateValue(candidate, index),
      })),
    [cityCandidates]
  );

  const handleCitySearch = useCallback(async () => {
    const query = manualQuery.trim();
    if (!query) {
      setCitySearchError("请输入城市名称");
      return;
    }
    setIsSearchingCities(true);
    setCitySearchError(null);
    try {
      const candidates = await searchWeatherCities(query);
      setCityCandidates(candidates);
      setSelectedCity(null);
      setSelectedCandidateValue(undefined);
      if (candidates.length === 0) setCitySearchError("未找到匹配城市，请补充省份或地区名称");
    } catch (error: unknown) {
      setCityCandidates([]);
      setCitySearchError(error instanceof Error ? error.message : String(error));
    } finally {
      setIsSearchingCities(false);
    }
  }, [manualQuery]);

  const handleCandidateChange = (value: string | number | Array<string | number> | undefined) => {
    if (Array.isArray(value) || value == null) return;
    const normalized = String(value);
    const index = candidateOptions.findIndex((option) => option.value === normalized);
    const candidate = index >= 0 ? cityCandidates[index] : null;
    setSelectedCandidateValue(normalized);
    setSelectedCity(candidate);
    setCitySearchError(candidate ? null : "请选择有效城市");
  };

  useEffect(() => {
    onRegisterSave?.(() => {
      if (locationMode === "manual" && !selectedCity) {
        setCitySearchError("手动定位必须搜索并选择一个城市");
        throw new Error("手动定位必须搜索并选择一个城市");
      }
      dispatch({ type: "SET_WEATHER_ALERT_ENABLED", payload: weatherAlertEnabled });
      dispatch({ type: "SET_AIR_QUALITY_ALERT_ENABLED", payload: airQualityAlertEnabled });
      dispatch({ type: "SET_SUNRISE_SUNSET_ALERT_ENABLED", payload: sunriseSunsetAlertEnabled });
      const manualLocation = {
        query: manualQuery.trim(),
        selected:
          locationMode === "manual" ? selectedCity : initialWeatherSettings.manualLocation.selected,
      };
      updateGeneralSettings({ weather: { locationMode, manualLocation } });
      broadcastSettingsEvent(SETTINGS_EVENTS.WeatherSettingsUpdated, {
        locationMode,
        manualLocation,
      });
    });
  }, [
    airQualityAlertEnabled,
    dispatch,
    initialWeatherSettings.manualLocation.selected,
    locationMode,
    manualQuery,
    onRegisterSave,
    selectedCity,
    sunriseSunsetAlertEnabled,
    weatherAlertEnabled,
  ]);

  const sourceLabel = (() => {
    if (!location) return "--";
    if (location.source === "browser") return "高精度浏览器定位";
    if (location.source === "public_ip") return "公共 IP 降级定位";
    return "手动城市";
  })();
  const coordsText = location
    ? `${location.coords.lat.toFixed(4)}, ${location.coords.lon.toFixed(4)}`
    : "--";
  const accuracyText =
    location?.source === "browser" && location.coords.accuracy != null
      ? `约 ${Math.round(location.coords.accuracy)} 米`
      : "--";
  const diagnostics = runtime.cache.geolocation?.diagnostics;

  return (
    <div id="weather-panel">
      {section === "weather" ? (
        <Tabs<WeatherServiceTab>
          id="weather-settings-tabs"
          className={styles.sectionTabs}
          items={WEATHER_SERVICE_TABS.map((item) => ({
            ...item,
            ariaControls: `weather-settings-panel-${item.value}`,
            id: `weather-settings-tabs-tab-${item.value}`,
          }))}
          label="天气服务分类"
          scrollable
          value={activeWeatherTab}
          variant="underlined"
          onChange={setActiveWeatherTab}
        />
      ) : null}

      <div
        aria-labelledby={
          section === "weather" ? `weather-settings-tabs-tab-${activeWeatherTab}` : undefined
        }
        className={section === "location" ? styles.locationContent : undefined}
        id={
          section === "weather"
            ? `weather-settings-panel-${activeWeatherTab}`
            : "weather-location-content"
        }
        role={section === "weather" ? "tabpanel" : undefined}
        tabIndex={section === "weather" ? 0 : undefined}
      >
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
          title="天气更新"
          variant="plain"
          description="天气由系统根据前后台、降雨和失败状态自动更新。"
          hidden={isSectionHidden("refresh")}
        >
          <SettingGrid columns={3} className={styles.scheduleMetricsGrid}>
            <MetricCard
              label="上次更新"
              value={formatTime(runtime.lastSuccessAt)}
              meta={STATUS_LABELS[runtime.status]}
            />
            <MetricCard
              label="下次更新"
              value={formatTime(runtime.nextRefreshAt)}
              meta={runtime.error || "系统自适应调度"}
              tone={runtime.error ? "warning" : "neutral"}
            />
            <MetricCard
              label="本小时请求"
              value={String(runtime.requestsThisHour)}
              meta="内部请求保护已启用"
            />
          </SettingGrid>
          <InfoPanel tone="info">
            前台全量天气每 10 分钟、后台每 30 分钟；分钟降水会在临雨或降雨时自动加快。
          </InfoPanel>
          <FormButtonGroup align="left">
            <FormButton
              variant="secondary"
              icon="action.refresh"
              loading={isRefreshing}
              onClick={() => void refreshWeather({ force: true, reason: "manual" })}
            >
              刷新天气
            </FormButton>
          </FormButtonGroup>
        </FormSection>

        <FormSection
          title="定位设置"
          variant="plain"
          description="自动定位优先使用高精度浏览器坐标，失败时降级到公共 IP。"
          hidden={isSectionHidden("locationSettings")}
        >
          <FormRow gap="sm" align="center">
            <FormSegmented
              label="定位方式"
              value={locationMode}
              options={[
                { label: "自动定位", value: "auto" },
                { label: "手动城市", value: "manual" },
              ]}
              onChange={(value) => setLocationMode(value as "auto" | "manual")}
            />
          </FormRow>

          {locationMode === "auto" ? (
            <FormButtonGroup align="left">
              <FormButton
                variant="secondary"
                icon="action.refresh"
                loading={isRefreshing}
                onClick={() => void refreshLocation()}
              >
                刷新高精度定位
              </FormButton>
            </FormButtonGroup>
          ) : (
            <>
              <FormRow gap="sm" align="end" className={styles.citySearchRow}>
                <FormInput
                  label="城市名称"
                  value={manualQuery}
                  error={citySearchError || undefined}
                  placeholder="例如：杭州市"
                  onChange={(event) => {
                    setManualQuery(event.target.value);
                    setSelectedCity(null);
                    setSelectedCandidateValue(undefined);
                    setCitySearchError(null);
                  }}
                />
                <FormButton
                  variant="secondary"
                  icon="action.search"
                  loading={isSearchingCities}
                  onClick={() => void handleCitySearch()}
                >
                  搜索城市
                </FormButton>
              </FormRow>
              {candidateOptions.length > 0 ? (
                <Dropdown
                  label="搜索结果"
                  searchable
                  options={candidateOptions}
                  placeholder="请选择准确城市"
                  value={selectedCandidateValue}
                  onChange={handleCandidateChange}
                />
              ) : null}
              <InfoPanel tone="info">只有从小米城市搜索结果中选定城市后才能保存。</InfoPanel>
            </>
          )}
        </FormSection>

        <FormSection
          title="定位状态"
          variant="plain"
          description="查看当前天气城市、坐标来源和浏览器定位诊断。"
          hidden={isSectionHidden("locationStatus")}
        >
          <SettingGrid columns={3} className={styles.locationMetricsGrid}>
            <MetricCard
              icon="feature.location"
              label="当前城市"
              value={location?.city.name || "--"}
              meta={location?.city.affiliation || location?.city.locationKey || "尚未定位"}
            />
            <MetricCard label="当前坐标" value={coordsText} meta={`来源：${sourceLabel}`} />
            <MetricCard
              label="浏览器精度"
              value={accuracyText}
              meta={diagnostics?.errorMessage || `权限：${diagnostics?.permissionState || "--"}`}
              tone={diagnostics?.errorMessage ? "warning" : "neutral"}
            />
          </SettingGrid>
          {location?.source === "public_ip" ? (
            <InfoPanel tone="warning">高精度浏览器定位失败，当前使用公共 IP 城市级位置。</InfoPanel>
          ) : null}
        </FormSection>

        <WeatherLivePanel
          cache={runtime.cache}
          hidden={isSectionHidden("live")}
          isRefreshing={isRefreshing}
          minutelyWeather={minutelyWeather}
          refreshStatus={STATUS_LABELS[runtime.status]}
          onRefresh={() => void refreshWeather({ force: true, reason: "manual" })}
        />
      </div>
    </div>
  );
};

export default WeatherSettingsPanel;
