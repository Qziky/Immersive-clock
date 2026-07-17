import { type CSSProperties, useEffect, useId, useMemo, useRef, useState } from "react";

import styles from "./Chart.module.css";

export type ChartTone = "accent" | "info" | "warning" | "danger" | "neutral";
export type ChartSize = "compact" | "default";
export type ChartCurve = "linear" | "smooth";

export interface ChartPoint {
  x: number;
  y: number;
}

export interface ChartTick {
  value: number;
  label: string;
}

export interface ChartThreshold {
  value: number;
  label?: string;
  tone?: Exclude<ChartTone, "neutral">;
}

export interface ChartLineSeries {
  id: string;
  label: string;
  data: readonly (ChartPoint | null)[];
  tone?: ChartTone;
  curve?: ChartCurve;
  area?: boolean;
  opacity?: number;
  strokeWidth?: number;
  colorAbove?: {
    value: number;
    tone: Exclude<ChartTone, "neutral">;
  };
}

export interface ChartBarSeries {
  id: string;
  label: string;
  data: readonly ChartPoint[];
  tone?: ChartTone;
  yDomain?: readonly [number, number];
  opacity?: number;
  width?: number;
  maxHeightRatio?: number;
}

export interface ChartLegendItem {
  id: string;
  label: string;
  tone?: ChartTone;
  kind?: "line" | "bar";
}

export interface ChartLegendProps {
  items: readonly ChartLegendItem[];
  className?: string;
}

export interface LineChartProps {
  ariaLabel: string;
  description?: string;
  series: readonly ChartLineSeries[];
  xDomain: readonly [number, number];
  yDomain: readonly [number, number];
  xTicks?: readonly ChartTick[];
  yTicks?: readonly ChartTick[];
  thresholds?: readonly ChartThreshold[];
  bars?: readonly ChartBarSeries[];
  size?: ChartSize;
  showLegend?: boolean;
  emptyMessage?: string;
  className?: string;
}

interface ScaledPoint {
  x: number;
  y: number;
}

const CHART_HEIGHT_BY_SIZE: Record<ChartSize, number> = {
  compact: 118,
  default: 184,
};

const FALLBACK_WIDTH = 640;
const MIN_CHART_WIDTH = 240;

const TONE_COLOR: Record<ChartTone, string> = {
  accent: "var(--ui-color-accent)",
  info: "var(--ui-color-info)",
  warning: "var(--ui-color-warning)",
  danger: "var(--ui-color-danger)",
  neutral: "var(--ui-color-text-muted)",
};

function joinClassNames(...values: Array<string | undefined>) {
  return values.filter(Boolean).join(" ");
}

function scaleValue(
  value: number,
  domain: readonly [number, number],
  rangeStart: number,
  rangeEnd: number
) {
  const [domainStart, domainEnd] = domain;
  const span = Math.max(Number.EPSILON, domainEnd - domainStart);
  return rangeStart + ((value - domainStart) / span) * (rangeEnd - rangeStart);
}

function splitSegments(data: readonly (ChartPoint | null)[]) {
  const segments: ChartPoint[][] = [];
  let current: ChartPoint[] = [];

  for (const point of data) {
    if (point && Number.isFinite(point.x) && Number.isFinite(point.y)) {
      current.push(point);
      continue;
    }

    if (current.length > 0) {
      segments.push(current);
      current = [];
    }
  }

  if (current.length > 0) {
    segments.push(current);
  }

  return segments;
}

function createLinearPath(points: readonly ScaledPoint[]) {
  return points.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`).join(" ");
}

function createSmoothPath(points: readonly ScaledPoint[]) {
  if (points.length < 3) {
    return createLinearPath(points);
  }

  let path = `M ${points[0].x} ${points[0].y}`;
  for (let index = 0; index < points.length - 1; index += 1) {
    const previous = points[Math.max(0, index - 1)];
    const current = points[index];
    const next = points[index + 1];
    const following = points[Math.min(points.length - 1, index + 2)];
    const firstControlX = current.x + (next.x - previous.x) / 6;
    const firstControlY = current.y + (next.y - previous.y) / 6;
    const secondControlX = next.x - (following.x - current.x) / 6;
    const secondControlY = next.y - (following.y - current.y) / 6;

    path += ` C ${firstControlX} ${firstControlY}, ${secondControlX} ${secondControlY}, ${next.x} ${next.y}`;
  }

  return path;
}

function ChartLegend({ items, className }: ChartLegendProps) {
  return (
    <div className={joinClassNames(styles.legend, className)} aria-label="图表图例">
      {items.map((item) => {
        const color = TONE_COLOR[item.tone ?? "accent"];
        const itemStyle = { "--chart-legend-color": color } as CSSProperties;

        return (
          <span className={styles.legendItem} style={itemStyle} key={item.id}>
            <i
              className={joinClassNames(
                styles.legendMark,
                item.kind === "bar" ? styles.legendMarkBar : styles.legendMarkLine
              )}
              aria-hidden="true"
            />
            {item.label}
          </span>
        );
      })}
    </div>
  );
}

function LineChart({
  ariaLabel,
  description,
  series,
  xDomain,
  yDomain,
  xTicks = [],
  yTicks = [],
  thresholds = [],
  bars = [],
  size = "default",
  showLegend = false,
  emptyMessage = "暂无图表数据",
  className,
}: LineChartProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(FALLBACK_WIDTH);
  const reactId = useId();
  const idPrefix = useMemo(() => `ui-chart-${reactId.replace(/:/g, "")}`, [reactId]);
  const height = CHART_HEIGHT_BY_SIZE[size];
  const margin = {
    top: showLegend ? 38 : 18,
    right: 16,
    bottom: xTicks.length > 0 ? 30 : 18,
    left: yTicks.length > 0 ? 42 : 16,
  };
  const plotBottom = height - margin.bottom;
  const plotRight = width - margin.right;
  const plotWidth = Math.max(1, plotRight - margin.left);
  const plotHeight = Math.max(1, plotBottom - margin.top);

  useEffect(() => {
    const element = rootRef.current;
    if (!element) return;

    const measure = () => {
      const nextWidth = Math.max(MIN_CHART_WIDTH, Math.round(element.clientWidth));
      setWidth((currentWidth) => (currentWidth === nextWidth ? currentWidth : nextWidth));
    };

    measure();
    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", measure);
      return () => window.removeEventListener("resize", measure);
    }

    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const scaleX = (value: number) => scaleValue(value, xDomain, margin.left, plotRight);
  const scaleY = (value: number) => scaleValue(value, yDomain, plotBottom, margin.top);
  const linePaths = series.map((lineSeries) => {
    const segments = splitSegments(lineSeries.data).map((segment) =>
      segment.map((point) => ({ x: scaleX(point.x), y: scaleY(point.y) }))
    );
    const createPath = lineSeries.curve === "linear" ? createLinearPath : createSmoothPath;
    return {
      ...lineSeries,
      segments,
      paths: segments.map(createPath),
    };
  });
  const hasData =
    linePaths.some((lineSeries) => lineSeries.segments.some((segment) => segment.length > 0)) ||
    bars.some((barSeries) => barSeries.data.length > 0);
  const legendItems = [
    ...series.map((lineSeries) => ({
      id: lineSeries.id,
      label: lineSeries.label,
      tone: lineSeries.tone,
      kind: "line" as const,
    })),
    ...bars.map((barSeries) => ({
      id: barSeries.id,
      label: barSeries.label,
      tone: barSeries.tone,
      kind: "bar" as const,
    })),
  ];

  return (
    <div
      ref={rootRef}
      className={joinClassNames(styles.chart, styles[size], className)}
      data-ui-chart
    >
      {showLegend && hasData && (
        <ChartLegend className={styles.legendOverlay} items={legendItems} />
      )}
      {!hasData ? (
        <div className={styles.empty} role="status">
          {emptyMessage}
        </div>
      ) : (
        <svg
          className={styles.svg}
          viewBox={`0 0 ${width} ${height}`}
          width={width}
          height={height}
          role="img"
          aria-label={ariaLabel}
          aria-describedby={`${idPrefix}-description`}
        >
          <title id={`${idPrefix}-title`}>{ariaLabel}</title>
          <desc id={`${idPrefix}-description`}>{description ?? ariaLabel}</desc>
          <defs>
            <clipPath id={`${idPrefix}-plot-clip`}>
              <rect x={margin.left} y={margin.top} width={plotWidth} height={plotHeight} />
            </clipPath>
            {linePaths.map((lineSeries) => {
              const baseColor = TONE_COLOR[lineSeries.tone ?? "accent"];
              const split = lineSeries.colorAbove;
              const splitOffset = split
                ? Math.max(0, Math.min(1, (scaleY(split.value) - margin.top) / plotHeight))
                : 0;

              return (
                <g key={`defs-${lineSeries.id}`}>
                  <linearGradient
                    id={`${idPrefix}-${lineSeries.id}-area`}
                    x1="0"
                    y1={margin.top}
                    x2="0"
                    y2={plotBottom}
                    gradientUnits="userSpaceOnUse"
                  >
                    <stop offset="0%" stopColor={baseColor} stopOpacity="0.24" />
                    <stop offset="70%" stopColor={baseColor} stopOpacity="0.07" />
                    <stop offset="100%" stopColor={baseColor} stopOpacity="0" />
                  </linearGradient>
                  {split && (
                    <linearGradient
                      id={`${idPrefix}-${lineSeries.id}-stroke`}
                      x1="0"
                      y1={margin.top}
                      x2="0"
                      y2={plotBottom}
                      gradientUnits="userSpaceOnUse"
                    >
                      <stop offset="0%" stopColor={TONE_COLOR[split.tone]} />
                      <stop offset={`${splitOffset * 100}%`} stopColor={TONE_COLOR[split.tone]} />
                      <stop offset={`${splitOffset * 100}%`} stopColor={baseColor} />
                      <stop offset="100%" stopColor={baseColor} />
                    </linearGradient>
                  )}
                </g>
              );
            })}
          </defs>

          <g aria-hidden="true">
            {yTicks.map((tick) => (
              <g key={`y-${tick.value}-${tick.label}`}>
                <line
                  className={styles.gridLine}
                  x1={margin.left}
                  x2={plotRight}
                  y1={scaleY(tick.value)}
                  y2={scaleY(tick.value)}
                />
                <text
                  className={styles.axisLabel}
                  x={margin.left - 9}
                  y={scaleY(tick.value)}
                  dy="0.32em"
                  textAnchor="end"
                >
                  {tick.label}
                </text>
              </g>
            ))}
            {xTicks.map((tick, index) => (
              <text
                className={styles.axisLabel}
                key={`x-${tick.value}-${tick.label}`}
                x={scaleX(tick.value)}
                y={height - 10}
                textAnchor={index === 0 ? "start" : index === xTicks.length - 1 ? "end" : "middle"}
              >
                {tick.label}
              </text>
            ))}
          </g>

          <g clipPath={`url(#${idPrefix}-plot-clip)`}>
            {thresholds.map((threshold) => (
              <line
                className={styles.thresholdLine}
                data-chart-threshold={threshold.value}
                key={`threshold-${threshold.value}`}
                x1={margin.left}
                x2={plotRight}
                y1={scaleY(threshold.value)}
                y2={scaleY(threshold.value)}
                style={{ color: TONE_COLOR[threshold.tone ?? "danger"] }}
              />
            ))}

            {bars.flatMap((barSeries) => {
              const barDomain = barSeries.yDomain ?? yDomain;
              const barBottom = scaleValue(0, barDomain, plotBottom, margin.top);
              const maxHeight = plotHeight * (barSeries.maxHeightRatio ?? 1);
              return barSeries.data.map((point) => {
                const pointY = scaleValue(point.y, barDomain, plotBottom, margin.top);
                const barHeight = Math.min(maxHeight, Math.max(1, barBottom - pointY));

                return (
                  <rect
                    data-chart-bar-series={barSeries.id}
                    key={`${barSeries.id}-${point.x}`}
                    x={scaleX(point.x) - (barSeries.width ?? 3) / 2}
                    y={barBottom - barHeight}
                    width={barSeries.width ?? 3}
                    height={barHeight}
                    rx="1"
                    fill={TONE_COLOR[barSeries.tone ?? "danger"]}
                    opacity={barSeries.opacity ?? 0.42}
                  />
                );
              });
            })}

            {linePaths.flatMap((lineSeries) => {
              const baseColor = TONE_COLOR[lineSeries.tone ?? "accent"];
              const stroke = lineSeries.colorAbove
                ? `url(#${idPrefix}-${lineSeries.id}-stroke)`
                : baseColor;

              return lineSeries.paths.flatMap((path, segmentIndex) => {
                const segment = lineSeries.segments[segmentIndex];
                const areaPath =
                  lineSeries.area && segment.length > 1
                    ? `${path} L ${
                        segment[segment.length - 1].x
                      } ${plotBottom} L ${segment[0].x} ${plotBottom} Z`
                    : null;

                return [
                  areaPath ? (
                    <path
                      className={styles.area}
                      d={areaPath}
                      fill={`url(#${idPrefix}-${lineSeries.id}-area)`}
                      key={`${lineSeries.id}-area-${segmentIndex}`}
                    />
                  ) : null,
                  segment.length === 1 ? (
                    <circle
                      className={styles.point}
                      data-chart-series={lineSeries.id}
                      key={`${lineSeries.id}-point-${segmentIndex}`}
                      cx={segment[0].x}
                      cy={segment[0].y}
                      r="2.5"
                      fill={baseColor}
                      opacity={lineSeries.opacity ?? 1}
                    />
                  ) : (
                    <g key={`${lineSeries.id}-segment-${segmentIndex}`}>
                      <path
                        className={styles.lineHalo}
                        d={path}
                        stroke={stroke}
                        opacity={(lineSeries.opacity ?? 1) * 0.06}
                      />
                      <path
                        className={styles.line}
                        data-chart-series={lineSeries.id}
                        d={path}
                        stroke={stroke}
                        strokeWidth={lineSeries.strokeWidth ?? 2.25}
                        opacity={lineSeries.opacity ?? 1}
                      />
                    </g>
                  ),
                ];
              });
            })}
          </g>

          {thresholds.map((threshold) =>
            threshold.label ? (
              <text
                className={styles.thresholdLabel}
                key={`threshold-label-${threshold.value}`}
                x={plotRight - 5}
                y={scaleY(threshold.value) - 7}
                textAnchor="end"
                style={{ color: TONE_COLOR[threshold.tone ?? "danger"] }}
              >
                {threshold.label}
              </text>
            ) : null
          )}
        </svg>
      )}
    </div>
  );
}

export { ChartLegend, LineChart };
