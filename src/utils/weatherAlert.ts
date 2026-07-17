/**
 * 天气预警工具函数（函数级注释）
 * - 提供按气象站分组并选取“最新”预警的能力
 * - 构造预警签名以实现本地去重（优先使用 id，其次组合键）
 * - 站点归一化：使用 senderName，缺失时用坐标兜底键
 */
import type { WeatherAlertResponse } from "../types/weather";

import { readStationAlertRecord, writeStationAlertRecord } from "./weatherStorage";

type AlertItem = NonNullable<WeatherAlertResponse["alerts"]>[number];

const ALERT_SUMMARY_MAX_LENGTH = 24;

function parseTime(ts?: string | null): number {
  if (!ts) return 0;
  const t = Date.parse(ts);
  return Number.isFinite(t) ? t : 0;
}

function normalizeAlertText(value?: string | null): string {
  return (value || "")
    .replace(/\s+/g, "")
    .replace(/[。；;！!？?]+$/g, "")
    .trim();
}

function normalizeRange(value: string): string {
  return value.replace(/\s+/g, "").replace(/[~至到-]/g, "～");
}

function parseDurationHours(value: string): number | null {
  const hours = normalizeRange(value).split("～").map(Number).filter(Number.isFinite);
  return hours.length > 0 ? Math.max(...hours) : null;
}

function resolveTimezoneOffsetMinutes(timestamp: string, timestampMs: number): number {
  if (/Z$/i.test(timestamp)) return 0;
  const offset = /([+-])(\d{2}):?(\d{2})$/.exec(timestamp);
  if (offset) {
    const minutes = Number(offset[2]) * 60 + Number(offset[3]);
    return offset[1] === "-" ? -minutes : minutes;
  }
  return -new Date(timestampMs).getTimezoneOffset();
}

function getZonedDateParts(timestampMs: number, offsetMinutes: number) {
  const date = new Date(timestampMs + offsetMinutes * 60 * 1000);
  return {
    day: date.getUTCDate(),
    hours: date.getUTCHours(),
    minutes: date.getUTCMinutes(),
    month: date.getUTCMonth() + 1,
    year: date.getUTCFullYear(),
  };
}

function formatRelativeForecastEnd(alert: AlertItem, durationText: string): string {
  const anchorText = alert.issuedTime || alert.effectiveTime;
  if (!anchorText) return "";
  const anchorMs = parseTime(anchorText);
  const durationHours = parseDurationHours(durationText);
  if (!anchorMs || durationHours == null) return "";

  const offsetMinutes = resolveTimezoneOffsetMinutes(anchorText, anchorMs);
  const anchor = getZonedDateParts(anchorMs, offsetMinutes);
  const end = getZonedDateParts(anchorMs + durationHours * 60 * 60 * 1000, offsetMinutes);
  const time = `${String(end.hours).padStart(2, "0")}:${String(end.minutes).padStart(2, "0")}`;
  const sameDay = anchor.year === end.year && anchor.month === end.month && anchor.day === end.day;
  return sameDay ? `至${time}` : `至${end.month}月${end.day}日${time}`;
}

function formatDaypartForecastEnd(alert: AlertItem, detail: string): string {
  const periodEnd =
    /(?:到|至)(今天|今日|明天|次日|后天)(凌晨|早晨|上午|中午|下午|傍晚|夜间|白天|晚上)/.exec(
      detail
    );
  const anchorText = alert.issuedTime || alert.effectiveTime;
  if (!periodEnd || !anchorText) return "";

  const anchorMs = parseTime(anchorText);
  if (!anchorMs) return "";
  const offsetMinutes = resolveTimezoneOffsetMinutes(anchorText, anchorMs);
  const anchor = getZonedDateParts(anchorMs, offsetMinutes);
  const dayOffset =
    periodEnd[1] === "明天" || periodEnd[1] === "次日" ? 1 : periodEnd[1] === "后天" ? 2 : 0;
  const targetDate = new Date(Date.UTC(anchor.year, anchor.month - 1, anchor.day + dayOffset));
  const targetMonth = targetDate.getUTCMonth() + 1;
  const targetDay = targetDate.getUTCDate();
  const monthLabel = targetMonth === anchor.month ? "" : `${targetMonth}月`;
  return `至${monthLabel}${targetDay}日${periodEnd[2]}`;
}

function formatNamedDurationForecastEnd(alert: AlertItem, detail: string): string {
  const duration = /未来([一二两三四五六七八九十]+)(天|日|周)/.exec(detail);
  const anchorText = alert.issuedTime || alert.effectiveTime;
  if (!duration || !anchorText) return "";

  const numberMap: Record<string, number> = {
    一: 1,
    二: 2,
    两: 2,
    三: 3,
    四: 4,
    五: 5,
    六: 6,
    七: 7,
    八: 8,
    九: 9,
    十: 10,
  };
  const amount = numberMap[duration[1]];
  const anchorMs = parseTime(anchorText);
  if (!amount || !anchorMs) return "";

  const offsetMinutes = resolveTimezoneOffsetMinutes(anchorText, anchorMs);
  const anchor = getZonedDateParts(anchorMs, offsetMinutes);
  const days = duration[2] === "周" ? amount * 7 : amount;
  const targetDate = new Date(Date.UTC(anchor.year, anchor.month - 1, anchor.day + days));
  const targetMonth = targetDate.getUTCMonth() + 1;
  const targetDay = targetDate.getUTCDate();
  const monthLabel = targetMonth === anchor.month ? "" : `${targetMonth}月`;
  return `至${monthLabel}${targetDay}日`;
}

function extractAbsoluteForecastEnd(detail: string): string {
  const datedRange =
    /(?:\d{1,2}月)?\d{1,2}日(?:\d{1,2}时(?:\d{1,2}分)?)?\s*(?:到|至|[～~-])\s*(?:(\d{1,2})月)?(\d{1,2})日(?:(\d{1,2})时(?:\d{1,2}分)?)?/.exec(
      detail
    );
  if (datedRange) {
    return `至${datedRange[1] ? `${datedRange[1]}月` : ""}${datedRange[2]}日${datedRange[3] ? `${datedRange[3]}时` : ""}`;
  }
  const hourlyRange = /\d{1,2}时(?:到|至|[～~-])(\d{1,2})时/.exec(detail);
  return hourlyRange ? `至${hourlyRange[1]}时` : "";
}

function truncateAlertSummary(value: string): string {
  const normalized = normalizeAlertText(value);
  if (normalized.length <= ALERT_SUMMARY_MAX_LENGTH) return normalized;
  return `${normalized.slice(0, ALERT_SUMMARY_MAX_LENGTH - 1)}…`;
}

function stripIssuePrefix(value: string): string {
  const marker = /发布[^：:。]{0,30}预警(?:信号)?[：:]/.exec(value);
  return marker?.index != null ? value.slice(marker.index + marker[0].length) : value;
}

interface SevereRainSummary {
  amount: string;
  area: string;
  event: string;
  isLowerBound: boolean;
  maxAmount: number;
  rank: number;
}

function extractSevereRainSummary(detail: string): SevereRainSummary | null {
  const severityRank: Record<string, number> = {
    特大暴雨: 5,
    大暴雨: 4,
    暴雨: 3,
    大雨到暴雨: 2,
    大到暴雨: 2,
  };
  const pattern =
    /(?:(局地|局部|个别地方|部分地方))?(?:有|出现)?\s*(特大暴雨|大暴雨|大雨到暴雨|大到暴雨|暴雨)\s*[（(]\s*(?:雨量|个别点)?\s*(\d+(?:\.\d+)?(?:\s*[～~至到-]\s*\d+(?:\.\d+)?)?)\s*毫米\s*(以上)?\s*[）)]/g;
  let best: SevereRainSummary | null = null;

  for (const match of detail.matchAll(pattern)) {
    const amount = normalizeRange(match[3]);
    const maxAmount = parseDurationHours(amount) ?? 0;
    const candidate: SevereRainSummary = {
      amount,
      area: match[1] || "",
      event: match[2],
      isLowerBound: Boolean(match[4]),
      maxAmount,
      rank: severityRank[match[2]] ?? 0,
    };
    if (
      !best ||
      candidate.rank > best.rank ||
      (candidate.rank === best.rank && candidate.maxAmount > best.maxAmount)
    ) {
      best = candidate;
    }
  }
  return best;
}

interface VisibilitySummary {
  distance: string;
  isUpperBound: boolean;
  meters: number;
  unit: string;
}

function extractVisibilitySummary(detail: string): VisibilitySummary | null {
  const pattern =
    /能见度(?:将)?(降至|低于|不足|小于)?\s*(\d+(?:\.\d+)?)\s*(千米|公里|米)\s*(以下)?/g;
  let best: VisibilitySummary | null = null;
  for (const match of detail.matchAll(pattern)) {
    const meters = Number(match[2]) * (match[3] === "米" ? 1 : 1000);
    const candidate: VisibilitySummary = {
      distance: match[2],
      isUpperBound: Boolean(match[1] || match[4]),
      meters,
      unit: match[3],
    };
    if (!best || candidate.meters < best.meters) best = candidate;
  }
  return best;
}

interface WindSummary {
  isLowerBound: boolean;
  level: string;
  maxLevel: number;
}

function extractWindSummary(detail: string): WindSummary | null {
  const candidates: WindSummary[] = [];
  const patterns = [
    /(?:阵风|平均风力|风力)(?:将|可)?(?:达到|达|超过|超)?\s*(\d+(?:\s*[～~至到-]\s*\d+)?)\s*级\s*(以上)?/g,
    /(\d+(?:\s*[～~至到-]\s*\d+)?)\s*级(?:雷暴大风|阵性大风|大风)/g,
  ];
  for (const pattern of patterns) {
    for (const match of detail.matchAll(pattern)) {
      candidates.push({
        isLowerBound: Boolean(match[2]),
        level: normalizeRange(match[1]),
        maxLevel: parseDurationHours(match[1]) ?? 0,
      });
    }
  }
  if (/雷暴大风/.test(detail)) {
    for (const match of detail.matchAll(/个别点\s*(\d+(?:\s*[～~至到-]\s*\d+)?)\s*级/g)) {
      candidates.push({
        isLowerBound: false,
        level: normalizeRange(match[1]),
        maxLevel: parseDurationHours(match[1]) ?? 0,
      });
    }
  }
  return candidates.sort((left, right) => right.maxLevel - left.maxLevel)[0] ?? null;
}

/**
 * 提炼顶部轮播使用的预警摘要。
 * 优先保留影响时段与量级阈值，其次使用简短风险描述或第一条防范建议。
 */
export function summarizeWeatherAlert(alert: AlertItem): string {
  const detail = normalizeAlertText(alert.description);
  const relativeHours =
    /未来\s*(\d+(?:\s*[～~至到-]\s*\d+)?)\s*小时/.exec(detail) ??
    /(?:预计)?(\d+(?:\s*[～~至到-]\s*\d+)?)\s*小时内/.exec(detail);
  const severeRain = extractSevereRainSummary(detail);
  const forecastRainfall =
    /(?:降雨量|雨量)(?:将|可)?(?:达到|达|超过|超)\s*(\d+(?:\.\d+)?(?:\s*[～~至到-]\s*\d+(?:\.\d+)?)?)\s*毫米\s*(以上)?/.exec(
      detail
    );
  const observedRainfall =
    /(?:降雨量|雨量)(?:已经|已)?(?:达到|达)\s*(\d+(?:\.\d+)?(?:\s*[～~至到-]\s*\d+(?:\.\d+)?)?)\s*毫米\s*(以上)?/.exec(
      detail
    );
  const windowPrecipitation =
    /(\d+(?:\s*[～~至到-]\s*\d+)?)\s*小时内[^。；]{0,30}?(\d+(?:\.\d+)?(?:\s*[～~至到-]\s*\d+(?:\.\d+)?)?)\s*毫米\s*(以上)?(?:降水|降雨)/.exec(
      detail
    );
  const rainRate =
    /(\d+(?:\.\d+)?(?:\s*[～~至到-]\s*\d+(?:\.\d+)?)?)\s*毫米\s*\/\s*小时\s*(以上)?/.exec(detail);
  const shortPrecipitationPeak =
    /个别点\s*(\d+(?:\.\d+)?(?:\s*[～~至到-]\s*\d+(?:\.\d+)?)?)\s*毫米\s*(以上)?/.exec(detail);
  const relativeEnd = relativeHours ? formatRelativeForecastEnd(alert, relativeHours[1]) : "";
  const absoluteEnd = extractAbsoluteForecastEnd(detail);
  const daypartEnd = formatDaypartForecastEnd(alert, detail);
  const namedDurationEnd = formatNamedDurationForecastEnd(alert, detail);
  const forecastEnd = relativeEnd || absoluteEnd || daypartEnd || namedDurationEnd;

  if (severeRain) {
    return `${forecastEnd}${severeRain.area}${severeRain.event}${severeRain.isLowerBound ? "≥" : ""}${severeRain.amount}毫米`;
  }
  if (windowPrecipitation) {
    const end = formatRelativeForecastEnd(alert, windowPrecipitation[1]);
    return `${end}降水${windowPrecipitation[3] ? "≥" : ""}${normalizeRange(windowPrecipitation[2])}毫米`;
  }
  if (observedRainfall) {
    const amount = `${observedRainfall[2] ? "≥" : ""}${normalizeRange(observedRainfall[1])}毫米`;
    const stillRaining = /降雨[^。；]{0,20}持续|降雨仍将持续/.test(detail);
    if (forecastEnd && stillRaining) return `${forecastEnd}降雨持续，累计${amount}`;
    return `累计降雨${amount}${stillRaining ? "，仍在持续" : ""}`;
  }
  if (shortPrecipitationPeak && /短时强降水/.test(detail)) {
    return `${forecastEnd}短时强降水${shortPrecipitationPeak[2] ? "≥" : ""}${normalizeRange(shortPrecipitationPeak[1])}毫米`;
  }
  if (relativeHours && forecastRainfall) {
    return `${relativeEnd}降雨${forecastRainfall[2] ? "≥" : ""}${normalizeRange(forecastRainfall[1])}毫米`;
  }
  if (rainRate) {
    return `${forecastEnd}雨强${rainRate[2] ? "≥" : ""}${normalizeRange(rainRate[1])}毫米/小时`;
  }
  if (forecastRainfall) {
    return `${forecastEnd}雨量${forecastRainfall[2] ? "≥" : ""}${normalizeRange(forecastRainfall[1])}毫米`;
  }
  if (relativeEnd && /降雨仍将持续|降雨将持续|降雨持续/.test(detail)) {
    return `${relativeEnd}降雨持续${/强对流/.test(detail) ? "，伴强对流" : ""}`;
  }

  const temperature =
    /(最高|最低)?气温(?:将|可)?(?:升至|降至|达到|达|超过|低于)?\s*(-?\d+(?:\.\d+)?)\s*(?:℃|°C)\s*(以上|以下)?/i.exec(
      detail
    );
  if (temperature) {
    const label = temperature[1] ? `${temperature[1]}气温` : "气温";
    const threshold = temperature[3] === "以上" ? "≥" : temperature[3] === "以下" ? "≤" : "";
    return `${forecastEnd}${label}${threshold}${temperature[2]}℃`;
  }

  const visibility = extractVisibilitySummary(detail);
  if (visibility) {
    return `${forecastEnd}能见度${visibility.isUpperBound ? "<" : ""}${visibility.distance}${visibility.unit}`;
  }

  const wind = extractWindSummary(detail);
  if (wind) {
    return `${forecastEnd}阵风${wind.isLowerBound ? "≥" : ""}${wind.level}级`;
  }

  if (/森林草原?火险|森林（草原）火险/.test(detail)) {
    const level = /(高或极高|极高|高)森林草原火险(?:气象)?等级/.exec(detail)?.[1];
    return `${forecastEnd}森林草原火险${level ? `等级${level}` : "风险高"}`;
  }

  if (/地质灾害/.test(detail)) {
    const risk =
      /地质灾害[^。；]{0,30}风险(高|较高|有一定风险)/.exec(detail)?.[1] ??
      /发生[^。；]{0,30}地质灾害[^。；]{0,20}风险(高|较高)/.exec(detail)?.[1];
    return `${forecastEnd}地质灾害风险${risk || "需防范"}`;
  }

  if (/干旱/.test(detail)) {
    const droughtLevel = /(特旱|重旱)/.exec(detail)?.[1];
    return `${forecastEnd}${droughtLevel ? `${droughtLevel}，` : ""}干旱${/加剧/.test(detail) ? "将加剧" : "持续"}`;
  }

  if (/雷电/.test(detail)) {
    const companions = [
      /短时强降水/.test(detail) ? "短时强降水" : "",
      /大风/.test(detail) ? "大风" : "",
      /冰雹/.test(detail) ? "冰雹" : "",
    ].filter(Boolean);
    if (forecastEnd || companions.length > 0) {
      return `${forecastEnd}雷电${companions.length > 0 ? `伴${companions.slice(0, 2).join("、")}` : ""}`;
    }
  }

  const conciseDetail = stripIssuePrefix(detail)
    .split(/[。；;！!？?]/)
    .map((part) => normalizeAlertText(part))
    .find(
      (part) =>
        part.length > 0 &&
        part.length <= ALERT_SUMMARY_MAX_LENGTH &&
        /暴雨|降水|雷电|冰雹|大风|高温|低温|寒潮|大雾|道路结冰|沙尘|台风|洪水|地质灾害/.test(part)
    );
  if (conciseDetail) {
    const prevention = /^请注意防范(.+)$/.exec(conciseDetail);
    return prevention ? `${prevention[1]}，注意防范` : conciseDetail;
  }

  const defense = alert.defenses
    ?.map((item) => normalizeAlertText(item.text))
    .find(
      (text) =>
        Boolean(text) &&
        !/^\d+[．.、]/.test(text) &&
        text !== "小心驾驶，减速慢行" &&
        text.length <= ALERT_SUMMARY_MAX_LENGTH
    );
  if (defense) return truncateAlertSummary(defense);

  const eventName = normalizeAlertText(alert.eventType?.name);
  return eventName ? `${eventName}影响持续，注意防范` : "请注意防范";
}

/**
 * 归一化站点键（函数级注释）
 * - 优先使用 senderName 去除首尾空格
 * - 缺失时使用坐标兜底键 "unknown:<lon>,<lat>"
 */
export function normalizeStationKey(
  senderName?: string,
  coords?: { lat: number; lon: number } | null
): string {
  const name = (senderName || "").trim();
  if (name) return name;
  if (coords) {
    return `unknown:${coords.lon.toFixed(2)},${coords.lat.toFixed(2)}`;
  }
  return "unknown";
}

/**
 * 构造预警签名（函数级注释）
 * - 优先使用唯一 id
 * - 无 id 时使用 eventType.code + headline + time 组合
 */
export function buildAlertSignature(alert: AlertItem): string {
  const id = (alert.id || "").trim();
  if (id) return `id:${id}`;
  const code = (alert.eventType?.code || "").trim();
  const headline = (alert.headline || "").trim();
  const time =
    (alert.issuedTime && alert.issuedTime.trim()) ||
    (alert.effectiveTime && alert.effectiveTime.trim()) ||
    (alert.expireTime && alert.expireTime.trim()) ||
    "";
  return `sig:${code}|${headline}|${time}`;
}

/**
 * 按站点选取最新预警（函数级注释）
 * - 对输入 alerts 按 senderName 分组
 * - 依据 issuedTime（其次 effectiveTime、expireTime）挑选每组时间最大的那一条
 */
export function selectLatestAlertsPerStation(
  alerts: AlertItem[]
): Array<{ stationKey: string; alert: AlertItem; timeMs: number }> {
  const resultMap = new Map<string, { alert: AlertItem; timeMs: number }>();
  for (const a of alerts) {
    const stationKey = normalizeStationKey(a.senderName);
    const timeMs =
      parseTime(a.issuedTime) || parseTime(a.effectiveTime) || parseTime(a.expireTime) || 0;
    const existing = resultMap.get(stationKey);
    if (!existing || timeMs >= existing.timeMs) {
      resultMap.set(stationKey, { alert: a, timeMs });
    }
  }
  return Array.from(resultMap.entries()).map(([stationKey, v]) => ({
    stationKey,
    alert: v.alert,
    timeMs: v.timeMs,
  }));
}

/**
 * 读取站点最近弹窗记录（函数级注释）
 * - 键：weather-cache.alerts.<stationKey>
 * - 返回包含签名与时间戳；TTL 12 小时，过期视作无记录
 */
export function readStationRecord(stationKey: string): { sig?: string; ts?: number } | null {
  const record = readStationAlertRecord(stationKey);
  if (record) {
    return { sig: record.sig, ts: record.ts };
  }
  return null;
}

/**
 * 写入站点最近弹窗记录（函数级注释）
 * - 保存签名与当前时间戳
 */
export function writeStationRecord(stationKey: string, sig: string): void {
  writeStationAlertRecord(stationKey, sig);
}
