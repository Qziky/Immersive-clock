export interface Coords {
  lat: number;
  lon: number;
  accuracy?: number;
}

export interface WeatherCitySelection {
  affiliation?: string;
  lat: number;
  locationKey: string;
  lon: number;
  name: string;
}

export type WeatherLocationSource = "browser" | "public_ip" | "manual_city";

export interface WeatherLocation {
  city: WeatherCitySelection;
  coords: Coords;
  mode: "auto" | "manual";
  resolvedAt: number;
  source: WeatherLocationSource;
}

export type GeolocationPermissionState =
  | "granted"
  | "denied"
  | "prompt"
  | "unsupported"
  | "unknown";

export interface GeolocationDiagnostics {
  isSupported: boolean;
  isSecureContext: boolean;
  permissionState: GeolocationPermissionState;
  usedHighAccuracy: boolean;
  timeoutMs: number;
  maximumAgeMs: number;
  attemptedAt: number;
  errorCode?: number;
  errorMessage?: string;
}

export interface GeolocationResult {
  coords: Coords | null;
  diagnostics: GeolocationDiagnostics;
}

export interface XiaomiCityLocation {
  affiliation?: string;
  key?: string;
  latitude?: string;
  locationKey?: string;
  longitude?: string;
  name?: string;
  status?: number;
  timeZoneShift?: number;
}

export interface XiaomiValueUnit {
  value?: string | number;
  unit?: string;
}

export interface XiaomiRangeValue {
  from?: string | number;
  to?: string | number;
  unit?: string;
}

export interface XiaomiBrand {
  brandId?: string;
  logo?: string;
  names?: {
    en_US?: string;
    zh_CN?: string;
    zh_TW?: string;
  };
  url?: string;
}

export interface XiaomiBrandInfo {
  brands?: XiaomiBrand[];
}

export interface XiaomiSeries<TValue> {
  brandInfo?: XiaomiBrandInfo;
  pubTime?: number | string;
  status?: number;
  unit?: string;
  value?: TValue[];
}

export interface XiaomiAirQuality {
  aqi?: string | number;
  brandInfo?: XiaomiBrandInfo;
  co?: string | number;
  coDesc?: string;
  no2?: string | number;
  no2Desc?: string;
  o3?: string | number;
  o3Desc?: string;
  pm10?: string | number;
  pm10Desc?: string;
  pm25?: string | number;
  pm25Desc?: string;
  primary?: string;
  pubTime?: number | string;
  so2?: string | number;
  so2Desc?: string;
  src?: string;
  status?: number;
  suggest?: string;
}

export interface XiaomiCurrentWeather {
  aqi?: XiaomiAirQuality;
  feelsLike?: XiaomiValueUnit;
  humidity?: XiaomiValueUnit;
  pressure?: XiaomiValueUnit;
  pubTime?: number | string;
  temperature?: XiaomiValueUnit;
  uvIndex?: string | number;
  visibility?: XiaomiValueUnit;
  weather?: string | number;
  wind?: {
    direction?: XiaomiValueUnit;
    speed?: XiaomiValueUnit;
  };
}

export interface XiaomiMinutelyPrecipitation {
  description?: string;
  firstRainOrSnow?: boolean;
  fxTime?: Array<number | string>;
  headDescription?: string;
  headIconType?: string;
  interval?: number;
  isFirstRainOrSnow?: boolean;
  isModify?: boolean;
  isModifyInHour?: boolean;
  isRadarHideToast?: boolean;
  isRainOrSnow?: number;
  isShow?: boolean;
  isSnowTemp?: boolean;
  kmNum?: number;
  modifyInHour?: boolean;
  probability?: Array<string | number>;
  pubTime?: number | string;
  rainRemainingMinutes?: number;
  shortDescription?: string;
  status?: number;
  subtitle?: string;
  value?: Array<
    | string
    | number
    | { value?: string | number; precip?: string | number; fxTime?: number | string }
  >;
  weather?: string | number;
}

export interface XiaomiEmbeddedMinutely {
  new?: string;
  precipitation?: XiaomiMinutelyPrecipitation;
  probability?: {
    maxProbability?: string;
    probabilityDesc?: string;
    probabilityDescV2?: string;
  };
  status?: number;
}

export interface XiaomiWeatherAlert {
  alertId?: string;
  defense?: Array<{
    defenseIcon?: string;
    defenseText?: string;
  }>;
  detail?: string;
  images?:
    | string[]
    | {
        icon?: string;
        notice?: string;
      };
  level?: string;
  locationKey?: string;
  pubTime?: number | string;
  title?: string;
  type?: string;
}

export interface XiaomiWeatherAllResponse {
  alerts?: XiaomiWeatherAlert[];
  aqi?: XiaomiAirQuality;
  brandInfo?: XiaomiBrandInfo;
  chs?: Array<{ type?: string }>;
  current?: XiaomiCurrentWeather;
  forecastDaily?: {
    aqi?: XiaomiSeries<string | number>;
    moonPhase?: unknown;
    precipitationProbability?: XiaomiSeries<string | number>;
    pubTime?: number | string;
    status?: number;
    sunRiseSet?: XiaomiSeries<XiaomiRangeValue>;
    temperature?: XiaomiSeries<XiaomiRangeValue>;
    weather?: XiaomiSeries<XiaomiRangeValue>;
    wind?: {
      direction?: XiaomiSeries<XiaomiRangeValue>;
      speed?: XiaomiSeries<XiaomiRangeValue>;
      status?: number;
    };
  };
  forecastHourly?: {
    aqi?: XiaomiSeries<string | number>;
    desc?: string;
    status?: number;
    temperature?: XiaomiSeries<string | number | XiaomiValueUnit>;
    weather?: XiaomiSeries<string | number>;
    wind?: {
      value?: Array<{
        datetime?: number | string;
        direction?: string | number | XiaomiValueUnit;
        speed?: string | number | XiaomiValueUnit;
      }>;
      status?: number;
      pubTime?: number | string;
    };
  };
  indices?: {
    indices?: Array<{ type?: string; value?: string | number }>;
    pubTime?: number | string;
    status?: number;
  };
  minutely?: XiaomiEmbeddedMinutely;
  preHour?: Array<XiaomiCurrentWeather>;
  sourceMaps?: Record<string, unknown>;
  status?: number;
  typhoon?: unknown[];
  updateTime?: number | string;
  url?: {
    caiyun?: string;
    weathercn?: string;
  };
  yesterday?: {
    aqi?: string | number;
    date?: number | string;
    sunRise?: number | string;
    sunSet?: number | string;
    tempMax?: string | number;
    tempMin?: string | number;
    weatherEnd?: string | number;
    weatherStart?: string | number;
    windDircEnd?: string | number;
    windDircStart?: string | number;
    windSpeedEnd?: string | number;
    windSpeedStart?: string | number;
    status?: number;
  };
  error?: string;
}

export interface XiaomiMinutelyResponse {
  new?: string;
  status?: number;
  precipitation?: XiaomiMinutelyPrecipitation;
  error?: string;
}

export interface WeatherScalarDetail {
  unit?: string;
  value?: string;
}

export interface WeatherCurrentDetail {
  feelsLike?: WeatherScalarDetail;
  humidity?: WeatherScalarDetail;
  observationTime?: string;
  pressure?: WeatherScalarDetail;
  temperature?: WeatherScalarDetail;
  uvIndex?: string;
  visibility?: WeatherScalarDetail;
  weatherCode?: string;
  weatherText?: string;
  windDirection?: WeatherScalarDetail;
  windDirectionText?: string;
  windSpeed?: WeatherScalarDetail;
}

export interface WeatherIndexDetail {
  type?: string;
  value?: string;
}

export interface WeatherHourlyDetail {
  aqi?: string;
  forecastTime?: string;
  temperature?: WeatherScalarDetail;
  weatherCode?: string;
  weatherText?: string;
  windDirection?: WeatherScalarDetail;
  windDirectionText?: string;
  windSpeed?: WeatherScalarDetail;
}

export interface WeatherDailyDetail {
  aqi?: string;
  date?: string;
  precipitationProbability?: string;
  sunrise?: string;
  sunset?: string;
  temperatureMax?: WeatherScalarDetail;
  temperatureMin?: WeatherScalarDetail;
  weatherCodeDay?: string;
  weatherCodeNight?: string;
  weatherTextDay?: string;
  weatherTextNight?: string;
  windDirectionDay?: WeatherScalarDetail;
  windDirectionDayText?: string;
  windDirectionNight?: WeatherScalarDetail;
  windDirectionNightText?: string;
  windSpeedDay?: WeatherScalarDetail;
  windSpeedNight?: WeatherScalarDetail;
}

export interface WeatherAirPollutantDetail {
  code: "pm25" | "pm10" | "so2" | "no2" | "o3" | "co";
  description?: string;
  unit: string;
  value?: string;
}

export interface WeatherAirQualityDetail {
  aqi?: string;
  category?: string;
  pollutants: WeatherAirPollutantDetail[];
  primary?: string;
  publishedAt?: string;
  source?: string;
  suggestion?: string;
}

export interface WeatherYesterdayDetail {
  aqi?: string;
  date?: string;
  sunrise?: string;
  sunset?: string;
  temperatureMax?: WeatherScalarDetail;
  temperatureMin?: WeatherScalarDetail;
  weatherCodeEnd?: string;
  weatherCodeStart?: string;
  weatherTextEnd?: string;
  weatherTextStart?: string;
  windDirectionEnd?: WeatherScalarDetail;
  windDirectionEndText?: string;
  windDirectionStart?: WeatherScalarDetail;
  windDirectionStartText?: string;
  windSpeedEnd?: WeatherScalarDetail;
  windSpeedStart?: WeatherScalarDetail;
}

export interface WeatherAlertDetail {
  defenses: Array<{ icon?: string; text?: string }>;
  detail?: string;
  id?: string;
  images?: string[];
  level?: string;
  locationKey?: string;
  publishedAt?: string;
  title?: string;
  type?: string;
}

export interface WeatherTechnicalDetails {
  channels: Array<{ type?: string }>;
  sourceMaps?: Record<string, unknown>;
  statuses: Record<string, number | string | undefined>;
  units: Record<string, string | undefined>;
  urls: Record<string, string | undefined>;
}

export interface WeatherDetailsResponse {
  airQuality?: WeatherAirQualityDetail;
  alerts: WeatherAlertDetail[];
  brands: XiaomiBrand[];
  code?: string;
  current?: WeatherCurrentDetail;
  daily: WeatherDailyDetail[];
  embeddedMinutely?: XiaomiEmbeddedMinutely;
  error?: string;
  hourly: WeatherHourlyDetail[];
  indices: WeatherIndexDetail[];
  previousHours: WeatherCurrentDetail[];
  raw: XiaomiWeatherAllResponse;
  technical: WeatherTechnicalDetails;
  typhoons: unknown[];
  updateTime?: string;
  yesterday?: WeatherYesterdayDetail;
}

export interface WeatherNow {
  code?: string;
  now?: {
    obsTime?: string;
    text?: string;
    temp?: string;
    feelsLike?: string;
    wind360?: string;
    windDir?: string;
    windScale?: string;
    windSpeed?: string;
    humidity?: string;
    pressure?: string;
    precip?: string;
    uvIndex?: string;
    vis?: string;
    cloud?: string;
    dew?: string;
    icon?: string;
  };
  refer?: {
    sources?: string[];
    license?: string[];
  };
  error?: string;
}

export interface WeatherDaily3dResponse {
  code?: string;
  updateTime?: string;
  daily?: Array<{
    fxDate?: string;
    sunrise?: string;
    sunset?: string;
    moonrise?: string;
    moonset?: string;
    moonPhase?: string;
    tempMax?: string;
    tempMin?: string;
    iconDay?: string;
    textDay?: string;
    iconNight?: string;
    textNight?: string;
    humidity?: string;
    precip?: string;
    pressure?: string;
    vis?: string;
    uvIndex?: string;
  }>;
  refer?: {
    sources?: string[];
    license?: string[];
  };
  error?: string;
}

export interface AstronomySunResponse {
  code?: string;
  sunrise?: string;
  sunset?: string;
  refer?: {
    sources?: string[];
    license?: string[];
  };
  error?: string;
}

export interface AirQualityCurrentResponse {
  metadata?: {
    tag?: string;
    sources?: string[];
  };
  indexes?: Array<{
    code?: string;
    name?: string;
    aqi?: number;
    level?: string;
    category?: string;
    primaryPollutant?: { code?: string };
  }>;
  pollutants?: Array<{
    code?: string;
    concentration?: { value?: number; unit?: string };
  }>;
  error?: string;
}

export interface WeatherAlertResponse {
  metadata?: {
    tag?: string;
    zeroResult?: boolean;
  };
  alerts?: Array<{
    id?: string;
    senderName?: string;
    issuedTime?: string;
    eventType?: { name?: string; code?: string };
    severity?: string | null;
    color?: { code?: string };
    effectiveTime?: string;
    expireTime?: string;
    headline?: string;
    description?: string;
    defenses?: Array<{ icon?: string; text?: string }>;
    images?: string[];
  }>;
  error?: string;
}

export interface MinutelyPrecipResponse {
  code?: string;
  updateTime?: string;
  summary?: string;
  minutely?: Array<{ fxTime?: string; precip?: string; type?: string }>;
  provider?: {
    description?: string;
    flags: Record<string, boolean | number | string | undefined>;
    headDescription?: string;
    headIconType?: string;
    interval?: number;
    maxProbability?: string;
    probability?: Array<string | number>;
    probabilityDescription?: string;
    probabilityDescriptionV2?: string;
    rainRemainingMinutes?: number;
    raw: XiaomiMinutelyResponse;
    shortDescription?: string;
    subtitle?: string;
    weatherCode?: string;
  };
  error?: string;
}

export interface WeatherHourly72hResponse {
  code?: string;
  updateTime?: string;
  hourly?: Array<{
    fxTime?: string;
    temp?: string;
    icon?: string;
    text?: string;
    pop?: string;
    precip?: string;
  }>;
  refer?: {
    sources?: string[];
    license?: string[];
  };
  error?: string;
}
