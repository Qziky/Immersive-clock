import React from "react";

import { useComponentAppearance } from "../../contexts/AppearanceContext";
import { useWeatherRuntimeSnapshot } from "../../hooks/useWeatherRuntimeSnapshot";
import { createWeatherLocationKey } from "../../utils/weatherStorage";

import styles from "./Weather.module.css";
import { resolveWeatherIconCode } from "./weatherDisplay";
import { WeatherPresentation } from "./WeatherPresentation";

const Weather: React.FC = () => {
  const temperatureAppearance = useComponentAppearance("studyWeather", "temperature");
  const descriptionAppearance = useComponentAppearance("studyWeather", "description");
  const iconAppearance = useComponentAppearance("studyWeather", "icon");
  const runtime = useWeatherRuntimeSnapshot();
  const location = runtime.location;
  const cacheKey = location
    ? createWeatherLocationKey(location.coords.lat, location.coords.lon)
    : null;
  const current =
    cacheKey && runtime.cache.details?.location === cacheKey
      ? runtime.cache.now?.data.now
      : runtime.cache.version !== 2
        ? runtime.cache.now?.data.now
        : null;

  if (
    !current &&
    (runtime.status === "idle" || runtime.status === "locating" || runtime.status === "loading")
  ) {
    return (
      <div className={styles.weather} aria-label="天气">
        <div className={styles.loading}>
          <div className={styles.loadingDot} />
        </div>
      </div>
    );
  }

  const text = current?.text || "--";
  const temperature = current?.temp || "";
  return (
    <WeatherPresentation
      descriptionAttributes={{ style: descriptionAppearance }}
      iconAttributes={{ style: iconAppearance }}
      iconCode={current ? resolveWeatherIconCode(text) : null}
      temperatureAttributes={{ style: temperatureAppearance }}
      temperatureText={temperature ? `${temperature}°` : "--"}
      title={current ? `${text} ${temperature}°C` : runtime.error || "--"}
      weatherText={text}
    />
  );
};

export default Weather;
