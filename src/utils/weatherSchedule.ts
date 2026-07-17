export type WeatherScheduleProfile = "conservative" | "balanced" | "frequent" | "custom";

export interface WeatherScheduleIntervals {
  allForegroundMin: number;
  allBackgroundMin: number;
  minutelyDryMin: number;
  minutelyRainMin: number;
  minutelyBackgroundMin: number;
}

export interface WeatherSafetySettings {
  minRequestGapSec: number;
  maxRequestsPerHour: number;
}

export interface WeatherScheduleSettings {
  profile: WeatherScheduleProfile;
  custom: WeatherScheduleIntervals;
  safety: WeatherSafetySettings;
}

export interface EffectiveWeatherSchedule extends WeatherScheduleIntervals {
  safety: WeatherSafetySettings;
}

interface WeatherScheduleEnv {
  VITE_WEATHER_DEFAULT_PROFILE?: string;
  VITE_WEATHER_MAX_REQUESTS_PER_HOUR?: string;
  VITE_WEATHER_MIN_REQUEST_GAP_SEC?: string;
}

interface NormalizeWeatherScheduleOptions {
  env?: WeatherScheduleEnv;
  legacyIntervalMin?: unknown;
}

const DEFAULT_PROFILE: WeatherScheduleProfile = "balanced";

export const WEATHER_SCHEDULE_PRESETS: Record<
  Exclude<WeatherScheduleProfile, "custom">,
  WeatherScheduleIntervals
> = {
  conservative: {
    allForegroundMin: 15,
    allBackgroundMin: 30,
    minutelyDryMin: 10,
    minutelyRainMin: 5,
    minutelyBackgroundMin: 30,
  },
  balanced: {
    allForegroundMin: 5,
    allBackgroundMin: 15,
    minutelyDryMin: 5,
    minutelyRainMin: 2,
    minutelyBackgroundMin: 15,
  },
  frequent: {
    allForegroundMin: 2,
    allBackgroundMin: 10,
    minutelyDryMin: 2,
    minutelyRainMin: 1,
    minutelyBackgroundMin: 10,
  },
};

export const WEATHER_SCHEDULE_LIMITS = {
  intervalMin: { min: 1, max: 360 },
  minRequestGapSec: { min: 1, max: 60 },
  maxRequestsPerHour: { min: 10, max: 600 },
} as const;

const DEFAULT_SAFETY: WeatherSafetySettings = {
  minRequestGapSec: 2,
  maxRequestsPerHour: 120,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function parseFiniteNumber(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function clampInteger(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = parseFiniteNumber(value);
  if (parsed == null) return fallback;
  return Math.min(max, Math.max(min, Math.round(parsed)));
}

function normalizeProfile(value: unknown, fallback = DEFAULT_PROFILE): WeatherScheduleProfile {
  return value === "conservative" ||
    value === "balanced" ||
    value === "frequent" ||
    value === "custom"
    ? value
    : fallback;
}

function normalizeIntervals(
  value: unknown,
  fallback: WeatherScheduleIntervals
): WeatherScheduleIntervals {
  const source = isRecord(value) ? value : {};
  const limits = WEATHER_SCHEDULE_LIMITS.intervalMin;
  const allForegroundMin = clampInteger(
    source.allForegroundMin,
    fallback.allForegroundMin,
    limits.min,
    limits.max
  );
  const minutelyDryMin = clampInteger(
    source.minutelyDryMin,
    fallback.minutelyDryMin,
    limits.min,
    limits.max
  );
  const minutelyRainMin = Math.min(
    minutelyDryMin,
    clampInteger(source.minutelyRainMin, fallback.minutelyRainMin, limits.min, limits.max)
  );

  return {
    allForegroundMin,
    allBackgroundMin: Math.max(
      allForegroundMin,
      clampInteger(source.allBackgroundMin, fallback.allBackgroundMin, limits.min, limits.max)
    ),
    minutelyDryMin,
    minutelyRainMin,
    minutelyBackgroundMin: Math.max(
      minutelyDryMin,
      minutelyRainMin,
      clampInteger(
        source.minutelyBackgroundMin,
        fallback.minutelyBackgroundMin,
        limits.min,
        limits.max
      )
    ),
  };
}

function normalizeSafety(value: unknown, fallback: WeatherSafetySettings): WeatherSafetySettings {
  const source = isRecord(value) ? value : {};
  return {
    minRequestGapSec: clampInteger(
      source.minRequestGapSec,
      fallback.minRequestGapSec,
      WEATHER_SCHEDULE_LIMITS.minRequestGapSec.min,
      WEATHER_SCHEDULE_LIMITS.minRequestGapSec.max
    ),
    maxRequestsPerHour: clampInteger(
      source.maxRequestsPerHour,
      fallback.maxRequestsPerHour,
      WEATHER_SCHEDULE_LIMITS.maxRequestsPerHour.min,
      WEATHER_SCHEDULE_LIMITS.maxRequestsPerHour.max
    ),
  };
}

function getEnvironmentDefaults(env: WeatherScheduleEnv): {
  profile: WeatherScheduleProfile;
  safety: WeatherSafetySettings;
} {
  return {
    profile: normalizeProfile(env.VITE_WEATHER_DEFAULT_PROFILE, DEFAULT_PROFILE),
    safety: normalizeSafety(
      {
        maxRequestsPerHour: env.VITE_WEATHER_MAX_REQUESTS_PER_HOUR,
        minRequestGapSec: env.VITE_WEATHER_MIN_REQUEST_GAP_SEC,
      },
      DEFAULT_SAFETY
    ),
  };
}

export function createDefaultWeatherScheduleSettings(
  env: WeatherScheduleEnv = import.meta.env
): WeatherScheduleSettings {
  const defaults = getEnvironmentDefaults(env);
  return {
    profile: defaults.profile,
    custom: { ...WEATHER_SCHEDULE_PRESETS.balanced },
    safety: defaults.safety,
  };
}

export function normalizeWeatherScheduleSettings(
  value: unknown,
  options: NormalizeWeatherScheduleOptions = {}
): WeatherScheduleSettings {
  const defaults = createDefaultWeatherScheduleSettings(options.env ?? import.meta.env);
  const source = isRecord(value) ? value : {};
  const legacyInterval = parseFiniteNumber(options.legacyIntervalMin);

  if (!isRecord(value) && legacyInterval != null) {
    const normalizedLegacyInterval = clampInteger(
      legacyInterval,
      30,
      WEATHER_SCHEDULE_LIMITS.intervalMin.min,
      WEATHER_SCHEDULE_LIMITS.intervalMin.max
    );
    return {
      profile: "custom",
      custom: normalizeIntervals(
        {
          allForegroundMin: normalizedLegacyInterval,
          allBackgroundMin: Math.max(15, normalizedLegacyInterval),
          minutelyDryMin: normalizedLegacyInterval,
          minutelyRainMin: Math.min(5, normalizedLegacyInterval),
          minutelyBackgroundMin: Math.max(15, normalizedLegacyInterval),
        },
        WEATHER_SCHEDULE_PRESETS.balanced
      ),
      safety: defaults.safety,
    };
  }

  return {
    profile: normalizeProfile(source.profile, defaults.profile),
    custom: normalizeIntervals(source.custom, defaults.custom),
    safety: normalizeSafety(source.safety, defaults.safety),
  };
}

export function resolveEffectiveWeatherSchedule(
  settings: WeatherScheduleSettings
): EffectiveWeatherSchedule {
  const normalized = normalizeWeatherScheduleSettings(settings);
  const intervals =
    normalized.profile === "custom"
      ? normalized.custom
      : WEATHER_SCHEDULE_PRESETS[normalized.profile];
  return {
    ...intervals,
    safety: normalized.safety,
  };
}
