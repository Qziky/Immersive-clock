export interface Coords {
  lat: number;
  lon: number;
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

export interface AddressInfo {
  address?: string;
  source?: string;
  raw?: unknown;
  error?: string;
}

export interface CityLookupResponse {
  code?: string;
  location?: Array<{
    name?: string;
    id?: string;
    lat?: string;
    lon?: string;
    adm2?: string;
    adm1?: string;
    country?: string;
    tz?: string;
    type?: string;
    rank?: string;
    locationKey?: string;
  }>;
  error?: string;
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

export interface XiaomiWeatherAllResponse {
  status?: number;
  updateTime?: number | string;
  current?: {
    feelsLike?: XiaomiValueUnit;
    humidity?: XiaomiValueUnit;
    pressure?: XiaomiValueUnit;
    temperature?: XiaomiValueUnit;
    visibility?: XiaomiValueUnit;
    weather?: string | number;
    pubTime?: number | string;
    wind?: {
      direction?: XiaomiValueUnit;
      speed?: XiaomiValueUnit;
    };
    uvIndex?: string | number;
  };
  forecastDaily?: {
    precipitationProbability?: { value?: Array<string | number>; status?: number; pubTime?: number | string };
    temperature?: { value?: XiaomiRangeValue[]; status?: number; pubTime?: number | string };
    weather?: { value?: XiaomiRangeValue[]; status?: number; pubTime?: number | string };
    sunRiseSet?: { value?: XiaomiRangeValue[]; status?: number; pubTime?: number | string };
    aqi?: { value?: XiaomiRangeValue[]; status?: number; pubTime?: number | string };
    wind?: { value?: Array<{ direction?: XiaomiRangeValue; speed?: XiaomiRangeValue }>; status?: number; pubTime?: number | string };
  };
  forecastHourly?: {
    temperature?: { value?: XiaomiValueUnit[]; status?: number; pubTime?: number | string };
    weather?: { value?: Array<string | number>; status?: number; pubTime?: number | string };
    aqi?: { value?: Array<string | number>; status?: number; pubTime?: number | string };
    wind?: { value?: Array<{ direction?: XiaomiValueUnit; speed?: XiaomiValueUnit }>; status?: number; pubTime?: number | string };
  };
  minutely?: {
    description?: string;
    pubTime?: number | string;
    value?: Array<string | number>;
    rainRemainingMinutes?: number;
    status?: number;
  };
  precipitation?: {
    description?: string;
    pubTime?: number | string;
    value?: Array<string | number>;
    rainRemainingMinutes?: number;
    status?: number;
  };
  aqi?: {
    aqi?: string | number;
    pm25?: string | number;
    pm10?: string | number;
    so2?: string | number;
    no2?: string | number;
    o3?: string | number;
    co?: string | number;
    primary?: string;
    src?: string;
    pubTime?: number | string;
    status?: number;
    brandInfo?: unknown;
  };
  alerts?: Array<{
    locationKey?: string;
    alertId?: string;
    pubTime?: number | string;
    title?: string;
    type?: string;
    level?: string;
    detail?: string;
    images?: string[];
  }>;
  brandInfo?: unknown;
  error?: string;
}

export interface XiaomiMinutelyResponse {
  status?: number;
  precipitation?: {
    description?: string;
    pubTime?: number | string;
    value?: Array<string | number>;
    rainRemainingMinutes?: number;
  };
  error?: string;
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
  }>;
  error?: string;
}

export interface MinutelyPrecipResponse {
  code?: string;
  updateTime?: string;
  summary?: string;
  minutely?: Array<{ fxTime?: string; precip?: string; type?: string }>;
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
