import type { HTMLAttributes, ImgHTMLAttributes } from "react";

import styles from "./Weather.module.css";
import { getWeatherIconUrl, simplifyWeatherText } from "./weatherDisplay";

interface WeatherPresentationProps {
  descriptionAttributes?: HTMLAttributes<HTMLDivElement>;
  iconAttributes?: ImgHTMLAttributes<HTMLImageElement>;
  iconCode?: string | null;
  temperatureAttributes?: HTMLAttributes<HTMLDivElement>;
  temperatureText: string;
  title?: string;
  weatherText: string;
}

function mergeClassNames(baseClassName: string, className?: string) {
  return [baseClassName, className].filter(Boolean).join(" ");
}

export function WeatherPresentation({
  descriptionAttributes,
  iconAttributes,
  iconCode,
  temperatureAttributes,
  temperatureText,
  title,
  weatherText,
}: WeatherPresentationProps) {
  const { className: temperatureClassName, ...temperatureProps } = temperatureAttributes ?? {};
  const { className: iconClassName, ...iconProps } = iconAttributes ?? {};
  const { className: descriptionClassName, ...descriptionProps } = descriptionAttributes ?? {};

  return (
    <div className={styles.weather} title={title}>
      <div
        {...temperatureProps}
        className={mergeClassNames(styles.temperature, temperatureClassName)}
      >
        {temperatureText}
      </div>
      <div className={styles.divider} />
      <div className={styles.icon}>
        {iconCode ? (
          <img
            {...iconProps}
            alt={weatherText}
            className={mergeClassNames(styles.weatherIcon, iconClassName)}
            decoding="async"
            loading="lazy"
            src={getWeatherIconUrl(iconCode)}
          />
        ) : null}
      </div>
      <div
        {...descriptionProps}
        className={mergeClassNames(styles.weatherText, descriptionClassName)}
      >
        {weatherText === "--" ? "--" : simplifyWeatherText(weatherText)}
      </div>
    </div>
  );
}
