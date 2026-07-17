import { useMemo, useState, type ReactNode } from "react";

import type { MinutelyWeatherSnapshot } from "../../../services/minutelyWeatherRuntime";
import { adaptMinutely } from "../../../services/weatherService";
import type {
  WeatherCurrentDetail,
  WeatherDetailsResponse,
  WeatherScalarDetail,
} from "../../../types/weather";
import { Button, FormSection, InfoPanel, LineChart, StatusPill, Tabs } from "../../../ui";
import { createWeatherLocationKey, type WeatherCache } from "../../../utils/weatherStorage";

import styles from "./WeatherLivePanel.module.css";

type WeatherLiveTab = "overview" | "minutely" | "hourly" | "daily" | "air" | "alerts" | "api";

interface WeatherLivePanelProps {
  cache: WeatherCache;
  hidden?: boolean;
  isRefreshing: boolean;
  minutelyWeather: MinutelyWeatherSnapshot;
  onRefresh: () => void;
  refreshStatus: string;
}

interface DataItem {
  label: ReactNode;
  value: ReactNode;
}

const TAB_ITEMS: Array<{ label: string; value: WeatherLiveTab }> = [
  { label: "概览", value: "overview" },
  { label: "分钟", value: "minutely" },
  { label: "逐时", value: "hourly" },
  { label: "逐日", value: "daily" },
  { label: "空气", value: "air" },
  { label: "预警", value: "alerts" },
  { label: "接口", value: "api" },
];

const INDEX_LABELS: Record<string, string> = {
  carWash: "洗车指数",
  feelsLike: "体感指数",
  humidity: "湿度指数",
  pressure: "气压指数",
  sports: "运动指数",
  uvIndex: "紫外线指数",
};

const POLLUTANT_LABELS: Record<string, string> = {
  co: "CO",
  no2: "NO₂",
  o3: "O₃",
  pm10: "PM10",
  pm25: "PM2.5",
  so2: "SO₂",
};

const FLAG_LABELS: Record<string, string> = {
  firstRainOrSnow: "首次雨雪",
  isFirstRainOrSnow: "首次雨雪标志",
  isModify: "预报已修正",
  isModifyInHour: "小时内修正",
  isRadarHideToast: "隐藏雷达提示",
  isRainOrSnow: "雨雪状态",
  isShow: "供应商建议显示",
  isSnowTemp: "雪温标志",
  interval: "时间间隔",
  kmNum: "距离",
  modifyInHour: "小时内修改",
  precipitationStatus: "降水状态",
  rainRemainingMinutes: "剩余降水时间",
  responseStatus: "响应状态",
  version: "接口版本",
};

function hasValue(value: unknown): boolean {
  return (
    value !== undefined && value !== null && !(typeof value === "string" && value.trim() === "")
  );
}

function displayValue(value: unknown): string {
  if (!hasValue(value)) return "暂无";
  if (typeof value === "boolean") return value ? "是" : "否";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function displayScalar(value?: WeatherScalarDetail): string {
  if (!hasValue(value?.value)) return "暂无";
  return `${value?.value}${value?.unit || ""}`;
}

function formatDateTime(value?: string | number | null): string {
  if (!hasValue(value)) return "暂无";
  const date = new Date(value as string | number);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString([], {
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
    minute: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function formatTime(value?: string | number | null): string {
  if (!hasValue(value)) return "暂无";
  const date = new Date(value as string | number);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleTimeString([], {
    hour: "2-digit",
    hour12: false,
    minute: "2-digit",
  });
}

function displayWind(
  direction?: WeatherScalarDetail,
  directionText?: string,
  speed?: WeatherScalarDetail
): string {
  const directionValue = hasValue(direction?.value)
    ? `${direction?.value}${direction?.unit || ""}`
    : "";
  const directionDisplay = [directionText, directionValue].filter(Boolean).join(" · ");
  const speedDisplay = displayScalar(speed);
  if (!directionDisplay && speedDisplay === "暂无") return "暂无";
  return [directionDisplay || "暂无风向", speedDisplay].join(" / ");
}

function legacyCurrent(cache: WeatherCache): WeatherCurrentDetail | undefined {
  const now = cache.now?.data.now;
  if (!now) return undefined;
  return {
    feelsLike: { unit: "℃", value: now.feelsLike },
    humidity: { unit: "%", value: now.humidity },
    observationTime: now.obsTime,
    pressure: { unit: "hPa", value: now.pressure },
    temperature: { unit: "℃", value: now.temp },
    uvIndex: now.uvIndex,
    visibility: { unit: "km", value: now.vis },
    weatherText: now.text,
    windDirection: { unit: "°", value: now.wind360 },
    windDirectionText: now.windDir,
    windSpeed: { unit: "km/h", value: now.windSpeed },
  };
}

function KeyValueGrid({ items }: { items: DataItem[] }) {
  return (
    <dl className={styles.dataGrid}>
      {items.map((item, index) => (
        <div className={styles.dataItem} key={`${String(item.label)}-${index}`}>
          <dt>{item.label}</dt>
          <dd>{hasValue(item.value) ? item.value : "暂无"}</dd>
        </div>
      ))}
    </dl>
  );
}

function DataSection({ children, title }: { children: ReactNode; title: string }) {
  return (
    <section className={styles.dataSection}>
      <h4>{title}</h4>
      {children}
    </section>
  );
}

function EmptyData({ children = "暂无数据" }: { children?: ReactNode }) {
  return <InfoPanel tone="neutral">{children}</InfoPanel>;
}

function TableFrame({
  children,
  label,
  compact = false,
}: {
  children: ReactNode;
  label: string;
  compact?: boolean;
}) {
  return (
    <div
      aria-label={label}
      className={`${styles.tableFrame} ${compact ? styles.tableFrameCompact : ""}`}
      role="region"
      tabIndex={0}
    >
      {children}
    </div>
  );
}

function jsonRows(value: unknown, prefix = ""): Array<[string, string]> {
  if (value == null || typeof value !== "object") {
    return [[prefix || "value", displayValue(value)]];
  }
  if (Array.isArray(value)) {
    if (value.length === 0) return [[prefix || "value", "[]"]];
    return value.flatMap((item, index) => jsonRows(item, `${prefix}[${index}]`));
  }
  const entries = Object.entries(value as Record<string, unknown>);
  if (entries.length === 0) return [[prefix || "value", "{}"]];
  return entries.flatMap(([key, item]) => jsonRows(item, prefix ? `${prefix}.${key}` : key));
}

function currentItems(current?: WeatherCurrentDetail): DataItem[] {
  return [
    { label: "天气", value: displayValue(current?.weatherText) },
    { label: "天气代码", value: displayValue(current?.weatherCode) },
    { label: "气温", value: displayScalar(current?.temperature) },
    { label: "体感温度", value: displayScalar(current?.feelsLike) },
    { label: "相对湿度", value: displayScalar(current?.humidity) },
    { label: "气压", value: displayScalar(current?.pressure) },
    { label: "紫外线指数", value: displayValue(current?.uvIndex) },
    { label: "能见度", value: displayScalar(current?.visibility) },
    {
      label: "风向",
      value: displayWind(current?.windDirection, current?.windDirectionText, undefined),
    },
    { label: "风速", value: displayScalar(current?.windSpeed) },
    { label: "观测时间", value: formatDateTime(current?.observationTime) },
  ];
}

function OverviewPanel({
  cache,
  current,
  details,
}: {
  cache: WeatherCache;
  current?: WeatherCurrentDetail;
  details: WeatherDetailsResponse | null;
}) {
  const fixedIndexTypes = ["uvIndex", "humidity", "feelsLike", "pressure", "carWash", "sports"];
  const indexMap = new Map((details?.indices || []).map((item) => [item.type || "", item.value]));
  const extraIndices = (details?.indices || []).filter(
    (item) => item.type && !fixedIndexTypes.includes(item.type)
  );

  return (
    <>
      <DataSection title="当前观测">
        <KeyValueGrid items={currentItems(current)} />
      </DataSection>

      <DataSection title="生活指数">
        <KeyValueGrid
          items={[
            ...fixedIndexTypes.map((type) => ({
              label: INDEX_LABELS[type] || type,
              value: displayValue(indexMap.get(type)),
            })),
            ...extraIndices.map((item) => ({
              label: INDEX_LABELS[item.type || ""] || item.type || "未知指数",
              value: displayValue(item.value),
            })),
          ]}
        />
      </DataSection>

      <DataSection title="前一小时">
        {details?.previousHours.length ? (
          <TableFrame compact label="前一小时天气数据">
            <table className={styles.dataTable}>
              <thead>
                <tr>
                  <th>时间</th>
                  <th>天气</th>
                  <th>气温</th>
                  <th>体感</th>
                  <th>湿度</th>
                  <th>气压</th>
                  <th>紫外线</th>
                  <th>能见度</th>
                  <th>风况</th>
                </tr>
              </thead>
              <tbody>
                {details.previousHours.map((hour, index) => (
                  <tr key={`${hour.observationTime || "previous"}-${index}`}>
                    <td>{formatDateTime(hour.observationTime)}</td>
                    <td>{displayValue(hour.weatherText)}</td>
                    <td>{displayScalar(hour.temperature)}</td>
                    <td>{displayScalar(hour.feelsLike)}</td>
                    <td>{displayScalar(hour.humidity)}</td>
                    <td>{displayScalar(hour.pressure)}</td>
                    <td>{displayValue(hour.uvIndex)}</td>
                    <td>{displayScalar(hour.visibility)}</td>
                    <td>
                      {displayWind(hour.windDirection, hour.windDirectionText, hour.windSpeed)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableFrame>
        ) : (
          <EmptyData />
        )}
      </DataSection>

      <DataSection title="位置与更新时间">
        <KeyValueGrid
          items={[
            { label: "城市", value: displayValue(cache.location?.city) },
            { label: "地址", value: displayValue(cache.location?.address) },
            {
              label: "坐标",
              value: cache.coords
                ? `${cache.coords.lat.toFixed(4)}, ${cache.coords.lon.toFixed(4)}`
                : "暂无",
            },
            { label: "接口更新时间", value: formatDateTime(details?.updateTime) },
            { label: "本地缓存时间", value: formatDateTime(cache.details?.updatedAt) },
          ]}
        />
      </DataSection>
    </>
  );
}

function MinutelyPanel({
  details,
  minutelyWeather,
}: {
  details: WeatherDetailsResponse | null;
  minutelyWeather: MinutelyWeatherSnapshot;
}) {
  const embedded = useMemo(() => (details ? adaptMinutely(details.raw) : null), [details]);
  const useFreshRuntime = minutelyWeather.freshness === "fresh" && minutelyWeather.cache != null;
  const selected = useFreshRuntime ? minutelyWeather.cache : embedded;
  const provider = selected?.provider;
  const points = (selected?.minutely || [])
    .map((item, index) => {
      const precip = Number(item.precip);
      return Number.isFinite(precip) ? { x: index, y: precip } : null;
    })
    .filter((point): point is { x: number; y: number } => point != null);
  const maxPrecip = Math.max(1, ...points.map((point) => point.y));
  const lastPoint = Math.max(1, (selected?.minutely?.length || 1) - 1);
  const middlePoint = Math.round(lastPoint / 2);

  return (
    <>
      <DataSection title="降水摘要">
        <KeyValueGrid
          items={[
            {
              label: "数据状态",
              value: useFreshRuntime
                ? "分钟接口"
                : details?.embeddedMinutely
                  ? "全量接口回退"
                  : "暂无",
            },
            { label: "主标题", value: displayValue(provider?.headDescription) },
            { label: "短描述", value: displayValue(provider?.shortDescription) },
            { label: "副标题", value: displayValue(provider?.subtitle) },
            {
              label: "完整描述",
              value: displayValue(provider?.description || selected?.summary),
            },
            { label: "天气代码", value: displayValue(provider?.weatherCode) },
            { label: "图标类型", value: displayValue(provider?.headIconType) },
            { label: "发布时间", value: formatDateTime(selected?.updateTime) },
            {
              label: "概率数组",
              value: provider?.probability?.length
                ? provider.probability.map(displayValue).join(" / ")
                : "暂无",
            },
            { label: "最高概率", value: displayValue(provider?.maxProbability) },
            { label: "概率描述", value: displayValue(provider?.probabilityDescription) },
            {
              label: "概率描述 V2",
              value: displayValue(provider?.probabilityDescriptionV2),
            },
            {
              label: "响应代码",
              value: displayValue(selected && "code" in selected ? selected.code : undefined),
            },
            {
              label: "运行时状态",
              value: `${minutelyWeather.status} / ${minutelyWeather.freshness}`,
            },
            { label: "运行时错误", value: displayValue(minutelyWeather.error) },
          ]}
        />
      </DataSection>

      <DataSection title="运行时统计">
        <KeyValueGrid
          items={[
            {
              label: "当前状态",
              value: minutelyWeather.stats?.isRainingNow
                ? `正在${minutelyWeather.stats.intensityLabel}`
                : minutelyWeather.stats?.hasRain
                  ? "预计有降水"
                  : minutelyWeather.stats
                    ? "暂无降水"
                    : "暂无",
            },
            {
              label: "降水概率",
              value: minutelyWeather.stats ? `${minutelyWeather.stats.probability}%` : "暂无",
            },
            {
              label: "预计累计",
              value: minutelyWeather.stats
                ? `${minutelyWeather.stats.expectedAmountMm.toFixed(1)} mm`
                : "暂无",
            },
            {
              label: "开始时间",
              value: formatDateTime(minutelyWeather.stats?.rainStartAt),
            },
            {
              label: "结束时间",
              value: formatDateTime(minutelyWeather.stats?.rainEndAt),
            },
            {
              label: "持续时间",
              value:
                minutelyWeather.stats?.durationMinutes == null
                  ? "暂无"
                  : `${minutelyWeather.stats.durationMinutes} 分钟`,
            },
            {
              label: "剩余时间",
              value:
                minutelyWeather.stats?.remainingMinutes == null
                  ? "暂无"
                  : `${minutelyWeather.stats.remainingMinutes} 分钟`,
            },
            {
              label: "拉取时间",
              value: formatDateTime(minutelyWeather.fetchedAt),
            },
          ]}
        />
      </DataSection>

      <DataSection title="降水曲线">
        <LineChart
          ariaLabel="未来两小时分钟降水强度"
          description="按接口返回顺序展示全部分钟降水样本。"
          series={[
            {
              area: true,
              curve: "linear",
              data: points,
              id: "minutely-precipitation",
              label: "降水",
              tone: "info",
            },
          ]}
          size="compact"
          xDomain={[0, lastPoint]}
          xTicks={[
            { label: formatTime(selected?.minutely?.[0]?.fxTime), value: 0 },
            {
              label: formatTime(selected?.minutely?.[middlePoint]?.fxTime),
              value: middlePoint,
            },
            {
              label: formatTime(selected?.minutely?.[lastPoint]?.fxTime),
              value: lastPoint,
            },
          ]}
          yDomain={[0, maxPrecip]}
          yTicks={[
            { label: "0", value: 0 },
            { label: maxPrecip.toFixed(1), value: maxPrecip },
          ]}
        />
      </DataSection>

      <DataSection title="分钟样本">
        {selected?.minutely?.length ? (
          <TableFrame compact label="全部分钟降水样本">
            <table className={styles.dataTable}>
              <thead>
                <tr>
                  <th>#</th>
                  <th>预报时间</th>
                  <th>降水量</th>
                  <th>类型</th>
                </tr>
              </thead>
              <tbody>
                {selected.minutely.map((item, index) => (
                  <tr key={`${item.fxTime || "minute"}-${index}`}>
                    <td>{index + 1}</td>
                    <td>{formatDateTime(item.fxTime)}</td>
                    <td>{hasValue(item.precip) ? `${item.precip} mm` : "暂无"}</td>
                    <td>{displayValue(item.type)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableFrame>
        ) : (
          <EmptyData />
        )}
      </DataSection>

      <DataSection title="供应商状态">
        <KeyValueGrid
          items={Object.keys(FLAG_LABELS).map((key) => {
            const value =
              key === "interval"
                ? provider?.interval
                : key === "rainRemainingMinutes"
                  ? provider?.rainRemainingMinutes
                  : provider?.flags[key];
            return {
              label: FLAG_LABELS[key],
              value: displayValue(value),
            };
          })}
        />
      </DataSection>
    </>
  );
}

function HourlyPanel({ details }: { details: WeatherDetailsResponse | null }) {
  return (
    <DataSection title={`逐时预报 · ${details?.hourly.length || 0} 条`}>
      {details?.hourly.length ? (
        <TableFrame label="全部逐时天气预报">
          <table className={styles.dataTable}>
            <thead>
              <tr>
                <th>时间</th>
                <th>天气</th>
                <th>代码</th>
                <th>气温</th>
                <th>AQI</th>
                <th>风向</th>
                <th>风速</th>
              </tr>
            </thead>
            <tbody>
              {details.hourly.map((hour, index) => (
                <tr key={`${hour.forecastTime || "hour"}-${index}`}>
                  <td>{formatDateTime(hour.forecastTime)}</td>
                  <td>{displayValue(hour.weatherText)}</td>
                  <td>{displayValue(hour.weatherCode)}</td>
                  <td>{displayScalar(hour.temperature)}</td>
                  <td>{displayValue(hour.aqi)}</td>
                  <td>{displayWind(hour.windDirection, hour.windDirectionText, undefined)}</td>
                  <td>{displayScalar(hour.windSpeed)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableFrame>
      ) : (
        <EmptyData />
      )}
    </DataSection>
  );
}

function DailyPanel({ details }: { details: WeatherDetailsResponse | null }) {
  const yesterday = details?.yesterday;
  return (
    <>
      <DataSection title="昨日对照">
        <KeyValueGrid
          items={[
            { label: "日期", value: displayValue(yesterday?.date) },
            {
              label: "天气",
              value: `${displayValue(yesterday?.weatherTextStart)} → ${displayValue(
                yesterday?.weatherTextEnd
              )}`,
            },
            {
              label: "天气代码",
              value: `${displayValue(yesterday?.weatherCodeStart)} → ${displayValue(
                yesterday?.weatherCodeEnd
              )}`,
            },
            {
              label: "最低 / 最高",
              value: `${displayScalar(yesterday?.temperatureMin)} / ${displayScalar(
                yesterday?.temperatureMax
              )}`,
            },
            { label: "AQI", value: displayValue(yesterday?.aqi) },
            {
              label: "日出 / 日落",
              value: `${formatTime(yesterday?.sunrise)} / ${formatTime(yesterday?.sunset)}`,
            },
            {
              label: "起始风况",
              value: displayWind(
                yesterday?.windDirectionStart,
                yesterday?.windDirectionStartText,
                yesterday?.windSpeedStart
              ),
            },
            {
              label: "结束风况",
              value: displayWind(
                yesterday?.windDirectionEnd,
                yesterday?.windDirectionEndText,
                yesterday?.windSpeedEnd
              ),
            },
          ]}
        />
      </DataSection>

      <DataSection title={`逐日预报 · ${details?.daily.length || 0} 天`}>
        {details?.daily.length ? (
          <TableFrame label="全部逐日天气预报">
            <table className={styles.dataTable}>
              <thead>
                <tr>
                  <th>日期</th>
                  <th>白天天气</th>
                  <th>夜间天气</th>
                  <th>最低 / 最高</th>
                  <th>降水概率</th>
                  <th>AQI</th>
                  <th>日出 / 日落</th>
                  <th>白天风况</th>
                  <th>夜间风况</th>
                </tr>
              </thead>
              <tbody>
                {details.daily.map((day, index) => (
                  <tr key={`${day.date || "day"}-${index}`}>
                    <td>{displayValue(day.date)}</td>
                    <td>
                      {displayValue(day.weatherTextDay)} ({displayValue(day.weatherCodeDay)})
                    </td>
                    <td>
                      {displayValue(day.weatherTextNight)} ({displayValue(day.weatherCodeNight)})
                    </td>
                    <td>
                      {displayScalar(day.temperatureMin)} / {displayScalar(day.temperatureMax)}
                    </td>
                    <td>
                      {hasValue(day.precipitationProbability)
                        ? `${day.precipitationProbability}%`
                        : "暂无"}
                    </td>
                    <td>{displayValue(day.aqi)}</td>
                    <td>
                      {formatTime(day.sunrise)} / {formatTime(day.sunset)}
                    </td>
                    <td>
                      {displayWind(
                        day.windDirectionDay,
                        day.windDirectionDayText,
                        day.windSpeedDay
                      )}
                    </td>
                    <td>
                      {displayWind(
                        day.windDirectionNight,
                        day.windDirectionNightText,
                        day.windSpeedNight
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableFrame>
        ) : (
          <EmptyData />
        )}
      </DataSection>
    </>
  );
}

function AirPanel({
  cache,
  details,
}: {
  cache: WeatherCache;
  details: WeatherDetailsResponse | null;
}) {
  const air = details?.airQuality;
  const legacyIndex = cache.airQuality?.data.indexes?.[0];
  return (
    <>
      <DataSection title="空气质量">
        <KeyValueGrid
          items={[
            { label: "AQI", value: displayValue(air?.aqi ?? legacyIndex?.aqi) },
            { label: "等级", value: displayValue(air?.category ?? legacyIndex?.category) },
            { label: "首要污染物", value: displayValue(air?.primary) },
            { label: "监测来源", value: displayValue(air?.source) },
            { label: "发布时间", value: formatDateTime(air?.publishedAt) },
            { label: "健康建议", value: displayValue(air?.suggestion) },
          ]}
        />
      </DataSection>

      <DataSection title="污染物">
        <TableFrame compact label="全部空气污染物">
          <table className={styles.dataTable}>
            <thead>
              <tr>
                <th>污染物</th>
                <th>浓度</th>
                <th>说明</th>
              </tr>
            </thead>
            <tbody>
              {(
                air?.pollutants || [
                  { code: "pm25", unit: "μg/m3" },
                  { code: "pm10", unit: "μg/m3" },
                  { code: "so2", unit: "μg/m3" },
                  { code: "no2", unit: "μg/m3" },
                  { code: "o3", unit: "μg/m3" },
                  { code: "co", unit: "mg/m3" },
                ]
              ).map((pollutant) => (
                <tr key={pollutant.code}>
                  <td>{POLLUTANT_LABELS[pollutant.code] || pollutant.code}</td>
                  <td>
                    {hasValue(pollutant.value) ? `${pollutant.value} ${pollutant.unit}` : "暂无"}
                  </td>
                  <td className={styles.longCell}>{displayValue(pollutant.description)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableFrame>
      </DataSection>
    </>
  );
}

function AlertsPanel({ details }: { details: WeatherDetailsResponse | null }) {
  return (
    <>
      <DataSection title={`天气预警 · ${details?.alerts.length || 0} 条`}>
        {details?.alerts.length ? (
          <div className={styles.alertList}>
            {details.alerts.map((alert, index) => (
              <article className={styles.alertItem} key={alert.id || `${alert.title}-${index}`}>
                <header>
                  <strong>{displayValue(alert.title)}</strong>
                  <StatusPill tone="warning">{displayValue(alert.level || alert.type)}</StatusPill>
                </header>
                <KeyValueGrid
                  items={[
                    { label: "预警 ID", value: displayValue(alert.id) },
                    { label: "类型", value: displayValue(alert.type) },
                    { label: "等级", value: displayValue(alert.level) },
                    { label: "站点", value: displayValue(alert.locationKey) },
                    { label: "发布时间", value: formatDateTime(alert.publishedAt) },
                    { label: "详情", value: displayValue(alert.detail) },
                    {
                      label: "图片",
                      value: alert.images?.length ? alert.images.join(" / ") : "暂无",
                    },
                  ]}
                />
                <div className={styles.defenseList}>
                  <span>防御建议</span>
                  {alert.defenses.length ? (
                    <ul>
                      {alert.defenses.map((defense, defenseIndex) => (
                        <li key={`${defense.text || "defense"}-${defenseIndex}`}>
                          {displayValue(defense.text)}
                          {hasValue(defense.icon) ? ` (${defense.icon})` : ""}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p>暂无</p>
                  )}
                </div>
              </article>
            ))}
          </div>
        ) : (
          <EmptyData>当前没有天气预警</EmptyData>
        )}
      </DataSection>

      <DataSection title={`台风信息 · ${details?.typhoons.length || 0} 条`}>
        {details?.typhoons.length ? (
          <div className={styles.rawList}>
            {details.typhoons.map((typhoon, index) => (
              <pre key={index}>{JSON.stringify(typhoon, null, 2)}</pre>
            ))}
          </div>
        ) : (
          <EmptyData>当前没有台风信息</EmptyData>
        )}
      </DataSection>
    </>
  );
}

function TechnicalTable({ label, rows }: { label: string; rows: Array<[string, unknown]> }) {
  return (
    <TableFrame compact label={label}>
      <table className={styles.dataTable}>
        <thead>
          <tr>
            <th>字段</th>
            <th>值</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([key, value], index) => (
            <tr key={`${key}-${index}`}>
              <td>
                <code>{key}</code>
              </td>
              <td className={styles.longCell}>{displayValue(value)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </TableFrame>
  );
}

function ApiPanel({
  details,
  minutelyWeather,
}: {
  details: WeatherDetailsResponse | null;
  minutelyWeather: MinutelyWeatherSnapshot;
}) {
  const rawMinutely = minutelyWeather.cache?.provider?.raw;
  const statusRows: Array<[string, unknown]> = details
    ? Object.entries(details.technical.statuses)
    : [["response", undefined]];
  const unitRows: Array<[string, unknown]> = details
    ? Object.entries(details.technical.units)
    : [["response", undefined]];
  const sourceRows: Array<[string, unknown]> = details?.technical.sourceMaps
    ? jsonRows(details.technical.sourceMaps)
    : [["sourceMaps", "暂无"]];

  return (
    <>
      <DataSection title="接口状态">
        <TechnicalTable label="天气接口状态字段" rows={statusRows} />
      </DataSection>
      <DataSection title="接口单位">
        <TechnicalTable label="天气接口单位字段" rows={unitRows} />
      </DataSection>
      <DataSection title="数据品牌">
        <TableFrame compact label="天气数据品牌">
          <table className={styles.dataTable}>
            <thead>
              <tr>
                <th>ID</th>
                <th>名称</th>
                <th>Logo</th>
                <th>URL</th>
              </tr>
            </thead>
            <tbody>
              {(details?.brands.length ? details.brands : [{}]).map((brand, index) => (
                <tr key={`${brand.brandId || "brand"}-${index}`}>
                  <td>{displayValue(brand.brandId)}</td>
                  <td>{displayValue(brand.names?.zh_CN)}</td>
                  <td className={styles.longCell}>{displayValue(brand.logo)}</td>
                  <td className={styles.longCell}>{displayValue(brand.url)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableFrame>
      </DataSection>
      <DataSection title="渠道与链接">
        <KeyValueGrid
          items={[
            {
              label: "渠道",
              value: details?.technical.channels.length
                ? details.technical.channels.map((item) => displayValue(item.type)).join(" / ")
                : "暂无",
            },
            {
              label: "weathercn URL",
              value: displayValue(details?.technical.urls.weathercn),
            },
            { label: "彩云 URL", value: displayValue(details?.technical.urls.caiyun) },
          ]}
        />
      </DataSection>
      <DataSection title="来源映射">
        <TechnicalTable label="天气数据来源映射" rows={sourceRows} />
      </DataSection>
      <DataSection title="/weather/all 原始响应">
        <pre className={styles.rawJson} tabIndex={0}>
          {details ? JSON.stringify(details.raw, null, 2) : "暂无"}
        </pre>
      </DataSection>
      <DataSection title="分钟接口原始响应">
        <pre className={styles.rawJson} tabIndex={0}>
          {rawMinutely ? JSON.stringify(rawMinutely, null, 2) : "暂无"}
        </pre>
      </DataSection>
    </>
  );
}

export function WeatherLivePanel({
  cache,
  hidden,
  isRefreshing,
  minutelyWeather,
  onRefresh,
  refreshStatus,
}: WeatherLivePanelProps) {
  const [activeTab, setActiveTab] = useState<WeatherLiveTab>("overview");
  const currentLocation = cache.coords
    ? createWeatherLocationKey(cache.coords.lat, cache.coords.lon)
    : null;
  const details =
    cache.details && currentLocation && cache.details.location === currentLocation
      ? cache.details.data
      : null;
  const hasDetailsForAnotherLocation =
    cache.details != null &&
    (currentLocation == null || cache.details.location !== currentLocation);
  const current =
    details?.current || (hasDetailsForAnotherLocation ? undefined : legacyCurrent(cache));
  const panelId = `weather-live-panel-${activeTab}`;
  const statusTone =
    refreshStatus === "失败" ? "danger" : refreshStatus === "成功" ? "success" : "neutral";

  return (
    <FormSection
      action={
        <Button
          icon="action.refresh"
          loading={isRefreshing}
          size="sm"
          variant="secondary"
          onClick={onRefresh}
        >
          刷新数据
        </Button>
      }
      className={styles.root}
      hidden={hidden}
      title="天气数据"
      variant="plain"
    >
      <div className={styles.summaryBar}>
        <span>{cache.location?.city || "未知位置"}</span>
        <span>{current?.weatherText || "暂无天气"}</span>
        <span>{formatDateTime(current?.observationTime)}</span>
        <StatusPill tone={statusTone}>{refreshStatus || "缓存数据"}</StatusPill>
      </div>

      <Tabs<WeatherLiveTab>
        id="weather-live-tabs"
        className={styles.tabs}
        items={TAB_ITEMS.map((item) => ({
          ...item,
          ariaControls: `weather-live-panel-${item.value}`,
          id: `weather-live-tabs-tab-${item.value}`,
        }))}
        label="天气数据分类"
        scrollable
        size="sm"
        value={activeTab}
        variant="underlined"
        onChange={setActiveTab}
      />

      <div
        aria-labelledby={`weather-live-tabs-tab-${activeTab}`}
        className={styles.tabPanel}
        id={panelId}
        role="tabpanel"
        tabIndex={0}
      >
        {activeTab === "overview" && (
          <OverviewPanel cache={cache} current={current} details={details} />
        )}
        {activeTab === "minutely" && (
          <MinutelyPanel details={details} minutelyWeather={minutelyWeather} />
        )}
        {activeTab === "hourly" && <HourlyPanel details={details} />}
        {activeTab === "daily" && <DailyPanel details={details} />}
        {activeTab === "air" && <AirPanel cache={cache} details={details} />}
        {activeTab === "alerts" && <AlertsPanel details={details} />}
        {activeTab === "api" && <ApiPanel details={details} minutelyWeather={minutelyWeather} />}
      </div>
    </FormSection>
  );
}
