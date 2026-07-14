import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type RefObject,
} from "react";

import { useAppearance } from "../../../contexts/AppearanceContext";
import pageStyles from "../../../pages/ClockPage/ClockPage.module.css";
import type {
  AppearanceComponentDefinition,
  AppearanceComponentId,
  AppearanceSlotKind,
} from "../../../types/appearance";
import type { Quote } from "../../../types/quote";
import {
  APPEARANCE_COMPONENTS,
  appearanceBackgroundToCss,
  appearanceStyleToCss,
  resolveAppearanceBackground,
  resolveAppearanceEditorStyle,
} from "../../../utils/appearanceModel";
import { ClockPresentation } from "../../Clock/ClockPresentation";
import { CountdownPresentation } from "../../Countdown/CountdownPresentation";
import { MotivationalQuotePresentation } from "../../MotivationalQuote/MotivationalQuotePresentation";
import {
  NoisePresentation,
  type NoisePresentationState,
} from "../../NoiseMonitor/NoisePresentation";
import { StopwatchPresentation } from "../../Stopwatch/StopwatchPresentation";
import studyStyles from "../../Study/Study.module.css";
import { StudyCenterPresentation } from "../../Study/StudyCenterPresentation";
import { StudyCountdownCarouselPresentation } from "../../Study/StudyCountdownCarouselPresentation";
import { StudyCountdownItemPresentation } from "../../Study/StudyCountdownItemPresentation";
import { StudyTimePresentation } from "../../Study/StudyTimePresentation";
import { StudyTopDockPresentation } from "../../Study/StudyTopDockPresentation";
import { getDayGreeting } from "../../StudyStatus/dayGreeting";
import { StudyStatusPresentation } from "../../StudyStatus/StudyStatusPresentation";
import { resolveWeatherIconCode } from "../../Weather/weatherDisplay";
import { WeatherPresentation } from "../../Weather/WeatherPresentation";

import styles from "./AppearanceSettingsPanel.module.css";

interface AppearancePreviewProps {
  componentId?: AppearanceComponentId;
  hoveredSlot?: string | null;
  instanceId?: string;
  instanceLabel?: string;
  overview?: boolean;
  selectedSlot?: string;
  stateId?: string;
}

interface PreviewStageMetrics {
  height: number;
  left: number;
  scale: number;
  top: number;
  width: number;
}

export interface PreviewCropBounds {
  height: number;
  left: number;
  top: number;
  width: number;
}

interface PreviewFramingOptions {
  minHeight?: number;
  verticalPadding?: number;
}

interface PreviewTargetOptions {
  state?: string;
}

interface PreviewTargetAttributes {
  [key: `data-${string}`]: boolean | number | string | undefined;
  className: string;
  "data-preview-highlighted"?: true;
  style: CSSProperties;
}

interface PreviewHighlightFrame {
  height: number;
  left: number;
  top: number;
  width: number;
}

type TargetRenderer = (
  componentId: AppearanceComponentId,
  slotId: string,
  kind: AppearanceSlotKind,
  className?: string,
  options?: PreviewTargetOptions
) => PreviewTargetAttributes;

const DEFAULT_STAGE_METRICS: PreviewStageMetrics = {
  height: 720,
  left: 0,
  scale: 0.25,
  top: 0,
  width: 1280,
};

const MAX_PREVIEW_SCALE = 12;
const MIN_PREVIEW_CANVAS_HEIGHT = 56;
const PREVIEW_CANVAS_BORDER_ALLOWANCE = 2;
const PREVIEW_CANVAS_PADDING = 14;
const PREVIEW_HIGHLIGHT_PADDING = 5;
const PREVIEW_HIGHLIGHT_SAFE_MARGIN = 6;
const TOP_DOCK_PREVIEW_FRAMING: PreviewFramingOptions = {
  minHeight: 0,
  verticalPadding:
    PREVIEW_HIGHLIGHT_PADDING + PREVIEW_HIGHLIGHT_SAFE_MARGIN + PREVIEW_CANVAS_BORDER_ALLOWANCE,
};
const PREVIEW_WEATHER_TEXT = "晴朗";
const PREVIEW_WEATHER_ICON = resolveWeatherIconCode(PREVIEW_WEATHER_TEXT, 12);
const PREVIEW_DAY_GREETING = getDayGreeting(new Date(2026, 0, 1, 12));
const PREVIEW_QUOTE: Quote = {
  author: "语录预览",
  fetchedAt: 0,
  id: "appearance-preview",
  language: "zh",
  providerId: "local",
  text: "专注当下，让时间沉淀答案。",
};

interface NoisePreviewContent {
  state: NoisePresentationState;
  statusText: string;
  subtext?: string;
}

function resolveNoisePreviewContent(stateId?: string): NoisePreviewContent {
  switch (stateId) {
    case "noisy":
      return { state: "noisy", statusText: "吵闹", subtext: "68 dB" };
    case "error":
      return { state: "error", statusText: "--" };
    case "calibrating":
      return { state: "initializing", statusText: "初始化中..." };
    case "quiet":
    default:
      return { state: "quiet", statusText: "安静", subtext: "42 dB" };
  }
}

function getPreviewTargetClientBounds(target: HTMLElement) {
  const elements = [target, ...Array.from(target.querySelectorAll("*"))];
  let bottom = Number.NEGATIVE_INFINITY;
  let left = Number.POSITIVE_INFINITY;
  let right = Number.NEGATIVE_INFINITY;
  let top = Number.POSITIVE_INFINITY;

  elements.forEach((element) => {
    const bounds = element.getBoundingClientRect();
    if (bounds.width <= 0 || bounds.height <= 0) return;
    bottom = Math.max(bottom, bounds.bottom);
    left = Math.min(left, bounds.left);
    right = Math.max(right, bounds.right);
    top = Math.min(top, bounds.top);
  });

  if (![bottom, left, right, top].every(Number.isFinite)) return undefined;
  return {
    height: bottom - top,
    left,
    top,
    width: right - left,
  };
}

export function calculatePreviewStageMetrics(
  canvasWidth: number,
  canvasHeight: number,
  viewportWidth: number,
  viewportHeight: number,
  cropBounds?: PreviewCropBounds,
  framing?: PreviewFramingOptions
): PreviewStageMetrics {
  const width = Math.max(320, viewportWidth);
  const height = Math.max(1, viewportHeight);
  const crop =
    cropBounds && cropBounds.width > 0 && cropBounds.height > 0
      ? cropBounds
      : { height, left: 0, top: 0, width };
  const horizontalPadding = Math.min(PREVIEW_CANVAS_PADDING, canvasWidth / 4);
  const verticalPadding = Math.min(
    framing?.verticalPadding ?? PREVIEW_CANVAS_PADDING,
    canvasHeight / 4
  );
  const availableWidth = Math.max(1, canvasWidth - horizontalPadding * 2);
  const availableHeight = Math.max(1, canvasHeight - verticalPadding * 2);
  const scale = Math.min(
    MAX_PREVIEW_SCALE,
    availableWidth / crop.width,
    availableHeight / crop.height
  );

  return {
    height,
    left: (canvasWidth - crop.width * scale) / 2 - crop.left * scale,
    scale,
    top: (canvasHeight - crop.height * scale) / 2 - crop.top * scale,
    width,
  };
}

export function calculatePreviewCanvasHeight(
  canvasWidth: number,
  viewportWidth: number,
  cropBounds?: PreviewCropBounds,
  framing?: PreviewFramingOptions
) {
  const maxHeight = viewportWidth <= 720 ? 180 : 220;
  if (!cropBounds || cropBounds.width <= 0 || cropBounds.height <= 0) return maxHeight;
  const availableWidth = Math.max(1, canvasWidth - PREVIEW_CANVAS_PADDING * 2);
  const scale = Math.min(MAX_PREVIEW_SCALE, availableWidth / cropBounds.width);
  const minHeight = framing?.minHeight ?? MIN_PREVIEW_CANVAS_HEIGHT;
  const verticalPadding = framing?.verticalPadding ?? PREVIEW_CANVAS_PADDING;
  return Math.round(
    Math.min(maxHeight, Math.max(minHeight, cropBounds.height * scale + verticalPadding * 2))
  );
}

function usePreviewStageMetrics(componentId: AppearanceComponentId) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const [canvasHeight, setCanvasHeight] = useState<number>();
  const [metrics, setMetrics] = useState<PreviewStageMetrics>(DEFAULT_STAGE_METRICS);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;

    let observer: ResizeObserver | null = null;
    const observedElements = new WeakSet<Element>();
    const observeElement = (element: Element | null) => {
      if (!observer || !element || observedElements.has(element)) return;
      observer.observe(element);
      observedElements.add(element);
    };
    const observePreviewTree = () => {
      const stage = canvas.querySelector<HTMLElement>("[data-preview-stage]");
      const cropTarget = canvas.querySelector<HTMLElement>("[data-preview-crop-target]");
      observeElement(canvas);
      observeElement(stage);
      observeElement(cropTarget);
      cropTarget?.querySelectorAll("*").forEach(observeElement);
    };

    const measure = () => {
      observePreviewTree();
      const bounds = canvas.getBoundingClientRect();
      if (bounds.width <= 0 || bounds.height <= 0) return;
      const stage = canvas.querySelector<HTMLElement>("[data-preview-stage]");
      const cropTarget = canvas.querySelector<HTMLElement>("[data-preview-crop-target]");
      const stageBounds = stage?.getBoundingClientRect();
      const targetBounds = cropTarget ? getPreviewTargetClientBounds(cropTarget) : undefined;
      const renderedScale =
        stageBounds && stage?.offsetWidth ? stageBounds.width / stage.offsetWidth : 1;
      const cropBounds =
        stageBounds && targetBounds
          ? {
              height: targetBounds.height / renderedScale,
              left: (targetBounds.left - stageBounds.left) / renderedScale,
              top: (targetBounds.top - stageBounds.top) / renderedScale,
              width: targetBounds.width / renderedScale,
            }
          : undefined;
      const framing = componentId === "studyTopDock" ? TOP_DOCK_PREVIEW_FRAMING : undefined;
      const nextCanvasHeight = calculatePreviewCanvasHeight(
        bounds.width,
        window.innerWidth,
        cropBounds,
        framing
      );
      const nextMetrics = calculatePreviewStageMetrics(
        bounds.width,
        nextCanvasHeight,
        window.innerWidth,
        window.innerHeight,
        cropBounds,
        framing
      );
      setCanvasHeight(nextCanvasHeight);
      setMetrics(nextMetrics);
    };

    observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    const mutationObserver =
      typeof MutationObserver === "undefined"
        ? null
        : new MutationObserver(() => {
            observePreviewTree();
            measure();
          });
    observePreviewTree();
    measure();
    mutationObserver?.observe(canvas, { childList: true, subtree: true });
    window.addEventListener("resize", measure);
    return () => {
      observer?.disconnect();
      mutationObserver?.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [componentId]);

  return { canvasHeight, canvasRef, metrics };
}

function usePreviewHighlightFrames(
  canvasRef: RefObject<HTMLDivElement | null>,
  highlightKey: string,
  layoutRevision: string
) {
  const [frames, setFrames] = useState<PreviewHighlightFrame[]>([]);

  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;

    const measure = () => {
      const canvasBounds = canvas.getBoundingClientRect();
      if (canvas.clientWidth <= 0 || canvas.clientHeight <= 0) {
        setFrames([]);
        return;
      }

      const originLeft = canvasBounds.left + canvas.clientLeft;
      const originTop = canvasBounds.top + canvas.clientTop;
      const nextFrames = Array.from(
        canvas.querySelectorAll<HTMLElement>('[data-preview-highlighted="true"]')
      )
        .map((target) => {
          const bounds = target.getBoundingClientRect();
          const left = Math.max(
            PREVIEW_HIGHLIGHT_SAFE_MARGIN,
            bounds.left - originLeft - PREVIEW_HIGHLIGHT_PADDING
          );
          const top = Math.max(
            PREVIEW_HIGHLIGHT_SAFE_MARGIN,
            bounds.top - originTop - PREVIEW_HIGHLIGHT_PADDING
          );
          const right = Math.min(
            canvas.clientWidth - PREVIEW_HIGHLIGHT_SAFE_MARGIN,
            bounds.right - originLeft + PREVIEW_HIGHLIGHT_PADDING
          );
          const bottom = Math.min(
            canvas.clientHeight - PREVIEW_HIGHLIGHT_SAFE_MARGIN,
            bounds.bottom - originTop + PREVIEW_HIGHLIGHT_PADDING
          );
          return {
            height: bottom - top,
            left,
            top,
            width: right - left,
          };
        })
        .filter((frame) => frame.width > 0 && frame.height > 0);

      setFrames((currentFrames) => {
        const unchanged =
          currentFrames.length === nextFrames.length &&
          currentFrames.every((frame, index) => {
            const nextFrame = nextFrames[index];
            return (
              Math.abs(frame.height - nextFrame.height) < 0.25 &&
              Math.abs(frame.left - nextFrame.left) < 0.25 &&
              Math.abs(frame.top - nextFrame.top) < 0.25 &&
              Math.abs(frame.width - nextFrame.width) < 0.25
            );
          });
        return unchanged ? currentFrames : nextFrames;
      });
    };

    const targets = canvas.querySelectorAll<HTMLElement>('[data-preview-highlighted="true"]');
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    observer?.observe(canvas);
    targets.forEach((target) => observer?.observe(target));
    window.addEventListener("resize", measure);
    measure();

    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [canvasRef, highlightKey, layoutRevision]);

  return frames;
}

export function AppearancePreview({
  componentId = "clock",
  hoveredSlot,
  instanceId,
  instanceLabel,
  overview = false,
  selectedSlot,
  stateId,
}: AppearancePreviewProps) {
  const { activeAppearance, getBackgroundImage } = useAppearance();
  const definition =
    APPEARANCE_COMPONENTS.find((item) => item.id === componentId) ?? APPEARANCE_COMPONENTS[0];
  const highlightedSlot = hoveredSlot ?? selectedSlot;
  const activeState = definition.states?.find((item) => item.id === stateId);
  const highlightedSlots = activeState?.slotIds ?? (highlightedSlot ? [highlightedSlot] : []);
  const isPreviewFrameHighlighted =
    definition.id === "stopwatch" && highlightedSlots.includes("__container");
  const background = resolveAppearanceBackground(activeAppearance, definition.scene);
  const backgroundStyle = appearanceBackgroundToCss(
    background,
    getBackgroundImage(definition.scene)
  );
  const { canvasHeight, canvasRef, metrics } = usePreviewStageMetrics(definition.id);
  const highlightFrames = usePreviewHighlightFrames(
    canvasRef,
    `${definition.id}:${highlightedSlots.join(",")}`,
    `${canvasHeight ?? "auto"}:${metrics.left}:${metrics.top}:${metrics.scale}`
  );

  const target: TargetRenderer = (targetComponentId, slotId, kind, className, options) => {
    const isEditedComponent = targetComponentId === definition.id;
    const state =
      isEditedComponent && activeState?.slotIds.includes(slotId) ? activeState.id : options?.state;
    const isHighlighted =
      isEditedComponent &&
      highlightedSlots.includes(slotId) &&
      !(isPreviewFrameHighlighted && slotId === "__container");
    const style = appearanceStyleToCss(
      resolveAppearanceEditorStyle(
        activeAppearance,
        APPEARANCE_COMPONENTS.find((item) => item.id === targetComponentId)?.scene ??
          definition.scene,
        targetComponentId,
        slotId,
        kind,
        {
          instanceId: targetComponentId === "studyCountdown" && instanceId ? instanceId : undefined,
          state,
        }
      )
    );

    return {
      className: className ?? "",
      "data-preview-highlighted": isHighlighted || undefined,
      style,
    };
  };

  const stageStyle: CSSProperties = {
    ...backgroundStyle,
    height: `${metrics.height}px`,
    left: `${metrics.left}px`,
    top: `${metrics.top}px`,
    transform: `scale(${metrics.scale})`,
    width: `${metrics.width}px`,
  };
  const isStudyScene = definition.scene === "study";
  const stageClassName = [
    styles.previewStage,
    isStudyScene ? studyStyles.container : pageStyles.clockPage,
  ].join(" ");

  return (
    <figure className={styles.appearancePreview} aria-label={`${definition.label}外观预览`}>
      <div
        className={[
          styles.previewCanvas,
          isPreviewFrameHighlighted ? styles.previewCanvasActive : "",
        ]
          .filter(Boolean)
          .join(" ")}
        data-preview-frame-highlighted={isPreviewFrameHighlighted || undefined}
        ref={canvasRef}
        style={canvasHeight ? { height: `${canvasHeight}px` } : undefined}
      >
        <div
          aria-hidden="true"
          className={stageClassName}
          data-background-type={background.type}
          data-preview-stage={definition.scene}
          style={stageStyle}
        >
          {isStudyScene ? (
            <StudyPreviewScene
              definition={definition}
              instanceLabel={instanceLabel}
              stateId={activeState?.id}
              target={target}
            />
          ) : (
            <div className={pageStyles.timeDisplay}>
              <TimePreviewScene
                definition={definition}
                highlightedSlot={highlightedSlot}
                overview={overview}
                stateId={activeState?.id}
                target={target}
              />
            </div>
          )}
        </div>
        {highlightFrames.map((frame, index) => (
          <span
            key={`${definition.id}:${highlightedSlots.join(",")}:${index}`}
            aria-hidden="true"
            className={styles.previewHighlightFrame}
            data-preview-highlight-frame="true"
            style={frame}
          />
        ))}
      </div>
    </figure>
  );
}

interface TimePreviewSceneProps {
  definition: AppearanceComponentDefinition;
  highlightedSlot?: string;
  overview: boolean;
  stateId?: string;
  target: TargetRenderer;
}

function TimePreviewScene({
  definition,
  highlightedSlot,
  overview,
  stateId,
  target,
}: TimePreviewSceneProps) {
  if (overview || definition.id === "clock") {
    return (
      <ClockPresentation
        contentAttributes={{
          className: styles.previewContentGroup,
          "data-preview-crop-target": true,
        }}
        dateAttributes={target("clock", "date", "text")}
        dateText="2026年7月13日星期一"
        rootAttributes={{ "data-preview-component": "clock" }}
        timeAttributes={target("clock", "time", "numeric")}
        timeText="12:45:09"
      />
    );
  }

  if (definition.id === "countdown") {
    const showPlaceholder = highlightedSlot === "placeholder";
    const showFinished = stateId === "finished" || highlightedSlot === "finishedMessage";
    const isWarning = stateId === "warning";
    const time = showFinished ? "00:00:00" : isWarning ? "00:00:08" : "00:25:00";
    return (
      <CountdownPresentation
        contentAttributes={{
          className: styles.previewContentGroup,
          "data-preview-crop-target": true,
        }}
        finished={showFinished}
        finishedMessageAttributes={target("countdown", "finishedMessage", "text")}
        placeholderAttributes={target("countdown", "placeholder", "numeric")}
        rootAttributes={{ "data-preview-component": "countdown" }}
        showPlaceholder={showPlaceholder}
        timeAttributes={target("countdown", "time", "numeric")}
        timeText={time}
        warning={isWarning}
      />
    );
  }

  const isRunning = stateId === "running";

  return (
    <StopwatchPresentation
      active={isRunning}
      contentAttributes={{
        className: styles.previewContentGroup,
        "data-preview-crop-target": true,
      }}
      milestoneAttributes={target("stopwatch", "milestone", "text")}
      rootAttributes={{
        ...target("stopwatch", "__container", "surface"),
        "data-preview-component": "stopwatch",
      }}
      showMilestone
      showPausedStatus={!isRunning}
      showPlaceholder={false}
      statusAttributes={target("stopwatch", "status", "text")}
      timeAttributes={target("stopwatch", "time", "numeric")}
      timeText="01:23:45"
    />
  );
}

interface StudyPreviewSceneProps {
  definition: AppearanceComponentDefinition;
  instanceLabel?: string;
  stateId?: string;
  target: TargetRenderer;
}

function StudyPreviewScene({ definition, instanceLabel, stateId, target }: StudyPreviewSceneProps) {
  if (definition.id === "studyTime" || definition.id === "studyQuote") {
    return <StudyCenterPreview componentId={definition.id} target={target} />;
  }
  return (
    <StudyTopDockPreview
      componentId={definition.id}
      instanceLabel={instanceLabel}
      stateId={stateId}
      target={target}
    />
  );
}

function StudyCenterPreview({
  componentId,
  target,
}: {
  componentId: "studyQuote" | "studyTime";
  target: TargetRenderer;
}) {
  const contentAttributes = {
    className: styles.previewContentGroup,
    "data-preview-crop-target": true,
  } as const;

  return (
    <StudyCenterPresentation
      quoteContent={
        componentId === "studyQuote" ? (
          <MotivationalQuotePresentation
            animationMode="none"
            buttonAttributes={{ "data-preview-crop-target": true, tabIndex: -1 }}
            cursorAttributes={target("studyQuote", "cursor", "text")}
            includeScreenReaderStatus={false}
            quote={PREVIEW_QUOTE}
            staticCursorTarget="text"
            textAttributes={target("studyQuote", "text", "text")}
            typingSpeed="normal"
          />
        ) : undefined
      }
      rootAttributes={{ "data-preview-component": "study-center" }}
      timeContent={
        componentId === "studyTime" ? (
          <StudyTimePresentation
            contentAttributes={contentAttributes}
            dateAttributes={target("studyTime", "date", "text")}
            dateText="2026年7月13日星期一"
            primaryAttributes={target("studyTime", "primary", "numeric")}
            primaryText="12:45"
            secondsAttributes={target("studyTime", "seconds", "numeric")}
            secondsText=":09"
          />
        ) : undefined
      }
    />
  );
}

function StudyTopDockPreview({
  componentId,
  instanceLabel,
  stateId,
  target,
}: {
  componentId: AppearanceComponentId;
  instanceLabel?: string;
  stateId?: string;
  target: TargetRenderer;
}) {
  const noiseContent = resolveNoisePreviewContent(stateId);
  const indicatorAttributes = target("studyNoise", "indicator", "icon", undefined, {
    state: stateId ?? "quiet",
  });
  const indicatorColor = (indicatorAttributes.style as CSSProperties | undefined)?.color;
  const indicatorStyle = {
    ...indicatorAttributes.style,
    "--appearance-indicator-color": indicatorColor,
  } as CSSProperties;
  const regionClassName = (regionId: AppearanceComponentId, className: string) =>
    [
      className,
      componentId !== "studyTopDock" && componentId !== regionId ? styles.previewContextHidden : "",
    ]
      .filter(Boolean)
      .join(" ");

  return (
    <StudyTopDockPresentation
      countdownContent={
        <StudyCountdownCarouselPresentation>
          <StudyCountdownItemPresentation
            daysAttributes={target("studyCountdown", "digit", "numeric")}
            daysText="328"
            eventLabel={instanceLabel || "高考"}
            labelAttributes={target("studyCountdown", "label", "text")}
            rootAttributes={target("studyCountdown", "__container", "surface")}
            unitAttributes={target("studyCountdown", "unit", "text")}
          />
        </StudyCountdownCarouselPresentation>
      }
      countdownDockAttributes={{
        className: regionClassName("studyCountdown", ""),
        "data-preview-crop-target": componentId === "studyCountdown" || undefined,
      }}
      noiseContent={
        <NoisePresentation
          indicatorAttributes={{
            ...indicatorAttributes,
            "aria-label": [noiseContent.statusText, noiseContent.subtext]
              .filter(Boolean)
              .join("，"),
            style: indicatorStyle,
            tabIndex: -1,
          }}
          state={noiseContent.state}
          statusAttributes={target("studyNoise", "status", "text", undefined, {
            state: stateId ?? "quiet",
          })}
          statusText={noiseContent.statusText}
          subtext={noiseContent.subtext}
          subtextAttributes={target("studyNoise", "subtext", "text", undefined, {
            state: stateId ?? "quiet",
          })}
        />
      }
      noiseDockAttributes={{
        className: regionClassName("studyNoise", ""),
        "data-preview-crop-target": componentId === "studyNoise" || undefined,
      }}
      rootAttributes={{
        ...target("studyTopDock", "__container", "surface"),
        "data-preview-component": "study-top-dock",
        "data-preview-crop-target": componentId === "studyTopDock" || undefined,
      }}
      statusContent={
        <StudyStatusPresentation
          fillAttributes={target("studyStatus", "fill", "surface")}
          labelAttributes={target("studyStatus", "label", "text")}
          progress={50}
          progressAttributes={target("studyStatus", "progress", "numeric")}
          progressText="50%"
          remainingTimeText="还剩 12 小时"
          rootAttributes={{
            ...target("studyStatus", "__container", "surface"),
            "aria-label": "今日进度",
            "aria-valuemax": 100,
            "aria-valuemin": 0,
            "aria-valuenow": 50,
            "aria-valuetext": `${PREVIEW_DAY_GREETING.ariaText}，还剩 12 小时`,
            role: "progressbar",
          }}
          stageText={PREVIEW_DAY_GREETING.text}
          statusText="今日进度"
        />
      }
      statusDockAttributes={{
        className: regionClassName("studyStatus", ""),
        "data-preview-crop-target": componentId === "studyStatus" || undefined,
      }}
      weatherContent={
        <WeatherPresentation
          descriptionAttributes={target("studyWeather", "description", "text")}
          iconAttributes={target("studyWeather", "icon", "icon")}
          iconCode={PREVIEW_WEATHER_ICON}
          temperatureAttributes={target("studyWeather", "temperature", "numeric")}
          temperatureText="26°"
          weatherText={PREVIEW_WEATHER_TEXT}
        />
      }
      weatherDockAttributes={{
        className: regionClassName("studyWeather", ""),
        "data-preview-crop-target": componentId === "studyWeather" || undefined,
      }}
    />
  );
}
