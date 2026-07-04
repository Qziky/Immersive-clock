import {
  BellRing as BellRingIcon,
  CalendarDays as CalendarDaysIcon,
  CloudRain as CloudRainIcon,
  CloudSun as CloudSunIcon,
  Droplets as DropletsIcon,
  Gauge as GaugeIcon,
  MapPin as MapPinIcon,
  RefreshCw as RefreshIcon,
  Sunrise as SunriseReminderIcon,
  Thermometer as ThermometerIcon,
  Wind as WindReminderIcon,
} from "lucide-react";
import React, { useCallback, useEffect, useState } from "react";

import { useAppDispatch, useAppState } from "../../../contexts/AppContext";
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
import { getWeatherCache } from "../../../utils/weatherStorage";

export interface WeatherSettingsPanelProps {
  onRegisterSave?: (fn: () => void) => void;
  section?: WeatherSettingsSection;
}

export type WeatherSettingsSection = "alerts" | "location" | "live";

function formatDateHM(iso?: string): string {
  if (!iso) return "--";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${y}-${m}-${dd} ${hh}:${mm}`;
}

function formatSunHM(iso?: string): string {
  if (!iso) return "--";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

const WindIcon: React.FC<{ size?: number; angle?: number; className?: string }> = ({
  size = 20,
  angle = 0,
  className,
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <g transform={`rotate(${angle + 180} 12 12)`}>
      <path d="M12 19V5" />
      <path d="M5 12l7 7 7-7" />
    </g>
  </svg>
);

/**
 * 天气设置分段组件
 * - 展示当前天气信息与定位来源
 * - 手动刷新天气数据
 */
const WeatherSettingsPanel: React.FC<WeatherSettingsPanelProps> = ({ onRegisterSave, section }) => {
  const { study } = useAppState();
  const dispatch = useAppDispatch();
  const [cache, setCache] = useState(() => getWeatherCache());
  const [_weatherRefreshStatus, setWeatherRefreshStatus] = useState<string>("");
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [weatherAlertEnabled, setWeatherAlertEnabled] = useState<boolean>(
    !!study.weatherAlertEnabled
  );
  const [minutelyPrecipEnabled, setMinutelyPrecipEnabled] = useState<boolean>(
    !!study.minutelyPrecipEnabled
  );
  const [airQualityAlertEnabled, setAirQualityAlertEnabled] = useState<boolean>(
    !!study.airQualityAlertEnabled
  );
  const [sunriseSunsetAlertEnabled, setSunriseSunsetAlertEnabled] = useState<boolean>(
    !!study.sunriseSunsetAlertEnabled
  );

  const initialWeatherSettings = getAppSettings().general.weather;
  const [autoRefreshIntervalMin, setAutoRefreshIntervalMin] = useState<number>(() => {
    const v = Number(initialWeatherSettings.autoRefreshIntervalMin);
    return Number.isFinite(v) ? v : 30;
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

  const refreshDisplayData = useCallback(() => {
    setCache(getWeatherCache());
  }, []);

  /**
   * 刷新天气数据（不强制更新地理位置缓存）
   */
  const handleRefreshWeather = useCallback(() => {
    const weatherRefreshEvent = new CustomEvent("weatherRefresh", {
      detail: { showErrorPopup: true },
    });
    window.dispatchEvent(weatherRefreshEvent);
    setWeatherRefreshStatus("刷新中");
    setIsRefreshing(true);
  }, []);

  const handleRefreshLocationAuto = useCallback(() => {
    const weatherRefreshEvent = new CustomEvent("weatherLocationRefresh", {
      detail: { preferredLocationMode: "auto", showErrorPopup: true },
    });
    window.dispatchEvent(weatherRefreshEvent);
    setWeatherRefreshStatus("刷新中");
    setIsRefreshing(true);
  }, []);

  useEffect(() => {
    const onDone = (e: Event) => {
      const detail = (e as CustomEvent).detail || {};
      const status = detail.status || "";
      setWeatherRefreshStatus(status);
      setIsRefreshing(false);
      refreshDisplayData();
    };
    window.addEventListener("weatherRefreshDone", onDone as EventListener);
    window.addEventListener("weatherLocationRefreshDone", onDone as EventListener);
    return () => {
      window.removeEventListener("weatherRefreshDone", onDone as EventListener);
      window.removeEventListener("weatherLocationRefreshDone", onDone as EventListener);
    };
  }, [refreshDisplayData]);

  // 注册保存：将天气提醒开关持久化
  useEffect(() => {
    onRegisterSave?.(() => {
      dispatch({ type: "SET_WEATHER_ALERT_ENABLED", payload: weatherAlertEnabled });
      dispatch({ type: "SET_MINUTELY_PRECIP_ENABLED", payload: minutelyPrecipEnabled });
      dispatch({ type: "SET_AIR_QUALITY_ALERT_ENABLED", payload: airQualityAlertEnabled });
      dispatch({ type: "SET_SUNRISE_SUNSET_ALERT_ENABLED", payload: sunriseSunsetAlertEnabled });

      const roundedInterval = Math.round(Number(autoRefreshIntervalMin));
      const intervalOptions = [15, 30, 60];
      const normalizedInterval = intervalOptions.includes(roundedInterval) ? roundedInterval : 30;

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

      updateGeneralSettings({
        weather: {
          autoRefreshIntervalMin: normalizedInterval,
          locationMode,
          manualLocation,
        },
      });

      broadcastSettingsEvent(SETTINGS_EVENTS.WeatherSettingsUpdated, {
        autoRefreshIntervalMin: normalizedInterval,
        locationMode,
        manualLocation,
      });
    });
  }, [
    onRegisterSave,
    dispatch,
    weatherAlertEnabled,
    minutelyPrecipEnabled,
    airQualityAlertEnabled,
    sunriseSunsetAlertEnabled,
    autoRefreshIntervalMin,
    locationMode,
    manualType,
    manualCityName,
    manualLat,
    manualLon,
  ]);

  const now = cache.now?.data.now;
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
  const airQualityIndex = cache.airQuality?.data?.indexes?.[0];
  const humidity = now?.humidity ? Number.parseFloat(String(now.humidity)) : NaN;
  const pressure = now?.pressure ? Number.parseFloat(String(now.pressure)) : NaN;
  const dailyForecast = cache.daily3d?.data?.daily ?? [];
  const sunriseText = cache.astronomySun?.data?.sunrise
    ? formatSunHM(cache.astronomySun.data.sunrise)
    : "--:--";
  const sunsetText = cache.astronomySun?.data?.sunset
    ? formatSunHM(cache.astronomySun.data.sunset)
    : "--:--";
  const isSectionHidden = (candidate: WeatherSettingsSection) =>
    section ? section !== candidate : undefined;

  return (
    <div id="weather-panel" role="tabpanel" aria-labelledby="weather">
      <FormSection
        title="基本设置"
        description="控制天气相关提醒是否在触发时弹出。"
        hidden={isSectionHidden("alerts")}
      >
        <SettingGrid columns={2}>
          <SettingItem
            title="天气预警弹窗"
            description="恶劣天气预警时显示弹窗。"
            icon={<BellRingIcon size={18} />}
            tone="accent"
            control={
              <FormSwitch
                checked={weatherAlertEnabled}
                onCheckedChange={setWeatherAlertEnabled}
                aria-label="天气预警弹窗"
              />
            }
          />
          <SettingItem
            title="分钟级降水提醒"
            description="短时降水临近时显示提醒。"
            icon={<CloudRainIcon size={18} />}
            tone="info"
            control={
              <FormSwitch
                checked={minutelyPrecipEnabled}
                onCheckedChange={setMinutelyPrecipEnabled}
                aria-label="分钟级降水提醒"
              />
            }
          />
          <SettingItem
            title="空气污染提醒"
            description="空气质量较差时显示提醒。"
            icon={<WindReminderIcon size={18} />}
            tone="warning"
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
            icon={<SunriseReminderIcon size={18} />}
            tone="success"
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

      <FormSection title="刷新设置" hidden={isSectionHidden("location")}>
        <FormRow gap="sm" align="center">
          <FormSegmented
            label="自动刷新间隔"
            value={String(Math.round(autoRefreshIntervalMin))}
            options={[
              { label: "15分钟", value: "15" },
              { label: "30分钟", value: "30" },
              { label: "1小时", value: "60" },
            ]}
            onChange={(v) => setAutoRefreshIntervalMin(Number(v))}
          />
        </FormRow>
      </FormSection>

      <FormSection title="地理位置" hidden={isSectionHidden("location")}>
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
              icon={<RefreshIcon size={16} />}
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

        <SettingGrid columns={3}>
          <MetricCard
            icon={<MapPinIcon size={16} />}
            label="当前坐标"
            value={coordsText}
            meta={`来源：${sourceLabel}`}
            tone="accent"
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

      <FormSection
        title="实时天气"
        description={`观测时间：${now?.obsTime ? formatDateHM(now.obsTime) : "--"}；状态：${now?.text || "--"}`}
        hidden={isSectionHidden("live")}
      >
        <FormButtonGroup align="left">
          <FormButton
            variant="secondary"
            onClick={handleRefreshWeather}
            icon={<RefreshIcon size={16} />}
            loading={isRefreshing}
          >
            刷新数据
          </FormButton>
        </FormButtonGroup>

        <SettingGrid columns={3}>
          <MetricCard
            icon={<ThermometerIcon size={16} />}
            label="气温"
            value={`${now?.temp || "--"}°`}
            meta={`体感 ${now?.feelsLike || "--"}°`}
            tone="info"
          />
          <MetricCard
            icon={<WindIcon size={16} angle={Number(now?.wind360) || 0} />}
            label="风况"
            value={`${now?.windDir || "--"} ${now?.windScale ? `${now.windScale}级` : ""}`}
            meta={now?.windSpeed ? `${now.windSpeed} km/h` : "暂无风速"}
          />
          <MetricCard
            icon={<CloudSunIcon size={16} />}
            label="空气质量"
            value={
              typeof airQualityIndex?.aqi === "number" ? `AQI ${airQualityIndex.aqi}` : "AQI --"
            }
            meta={airQualityIndex?.category || "暂无空气质量"}
            tone={typeof airQualityIndex?.aqi === "number" ? "warning" : "neutral"}
          />
          <MetricCard
            icon={<DropletsIcon size={16} />}
            label="湿度"
            value={Number.isFinite(humidity) ? `${Math.round(humidity)}%` : "--"}
            meta="相对湿度"
            tone="accent"
          />
          <MetricCard
            icon={<GaugeIcon size={16} />}
            label="气压"
            value={Number.isFinite(pressure) ? `${Math.round(pressure)}` : "--"}
            meta="hPa"
          />
          <MetricCard
            icon={<CalendarDaysIcon size={16} />}
            label="日出 / 日落"
            value={`${sunriseText} / ${sunsetText}`}
            meta="本地天文时间"
            tone="success"
          />
        </SettingGrid>

        <InfoPanel tone="neutral" title="未来三日">
          {dailyForecast.length > 0
            ? dailyForecast
                .slice(0, 3)
                .map((day) => `${day.textDay} ${day.tempMin}°~${day.tempMax}°`)
                .join(" ｜ ")
            : "暂无预报数据"}
        </InfoPanel>

        <InfoPanel tone="neutral">
          数据更新于：
          {cache.now?.updatedAt ? new Date(cache.now.updatedAt).toLocaleTimeString() : "--"}
        </InfoPanel>
      </FormSection>
    </div>
  );
};

export default WeatherSettingsPanel;
