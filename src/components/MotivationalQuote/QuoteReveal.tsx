import { useEffect, useMemo, useState, type CSSProperties, type HTMLAttributes } from "react";

import { formatQuoteAttribution } from "../../services/quotes";
import type { Quote, QuoteAnimationMode, QuoteTypingSpeed } from "../../types/quote";
import type { PresentationAttributes } from "../PresentationContent";

import styles from "./MotivationalQuote.module.css";

const CROSSFADE_DURATION_MS = 240;
const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

interface TypingRhythm {
  cjk: number;
  latin: number;
  whitespace: number;
  commaPause: number;
  sentencePause: number;
  attributionPause: number;
  maximumDuration: number;
}

const TYPING_RHYTHMS: Record<QuoteTypingSpeed, TypingRhythm> = {
  slow: {
    cjk: 110,
    latin: 72,
    whitespace: 36,
    commaPause: 180,
    sentencePause: 360,
    attributionPause: 360,
    maximumDuration: 12_000,
  },
  normal: {
    cjk: 76,
    latin: 48,
    whitespace: 24,
    commaPause: 120,
    sentencePause: 240,
    attributionPause: 240,
    maximumDuration: 8_000,
  },
  fast: {
    cjk: 44,
    latin: 28,
    whitespace: 16,
    commaPause: 70,
    sentencePause: 140,
    attributionPause: 140,
    maximumDuration: 5_000,
  },
};

interface QuotePresentation {
  animationKey: string;
  attribution: string;
  contentKey: string;
  text: string;
}

interface TypewriterTimeline {
  attribution: string[];
  attributionThresholds: number[];
  duration: number;
  text: string[];
  textThresholds: number[];
}

interface TypewriterFrame {
  animationKey: string;
  attributionCount: number;
  isComplete: boolean;
  textCount: number;
}

interface QuoteContentProps {
  attribution: string;
  attributionRemainder?: string;
  attributionText?: string;
  cursorAttributes?: PresentationAttributes<HTMLAttributes<HTMLSpanElement>>;
  cursorStyle?: CSSProperties;
  cursorTarget?: "attribution" | "text";
  text: string;
  textAttributes?: PresentationAttributes<HTMLAttributes<HTMLSpanElement>>;
  textRemainder?: string;
  textStyle?: CSSProperties;
}

export interface QuoteRevealProps {
  animationMode: QuoteAnimationMode;
  className?: string;
  cursorAttributes?: PresentationAttributes<HTMLAttributes<HTMLSpanElement>>;
  cursorStyle?: CSSProperties;
  quote: Quote;
  replayKey?: number | string;
  staticCursorTarget?: "attribution" | "text";
  textAttributes?: PresentationAttributes<HTMLAttributes<HTMLSpanElement>>;
  textStyle?: CSSProperties;
  typingSpeed: QuoteTypingSpeed;
}

function splitGraphemes(value: string): string[] {
  const Segmenter = (
    Intl as unknown as {
      Segmenter?: new (
        locales?: string | string[],
        options?: { granularity: "grapheme" }
      ) => { segment: (input: string) => Iterable<{ segment: string }> };
    }
  ).Segmenter;
  if (typeof Segmenter === "function") {
    const segmenter = new Segmenter(undefined, { granularity: "grapheme" });
    return Array.from(segmenter.segment(value), ({ segment }) => segment);
  }
  return Array.from(value);
}

function hashString(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function intervalJitter(seed: string, phase: string, index: number): number {
  const normalized = hashString(`${seed}:${phase}:${index}`) / 0xffffffff;
  return 0.88 + normalized * 0.24;
}

function baseInterval(grapheme: string, rhythm: TypingRhythm): number {
  if (/\s/u.test(grapheme)) return rhythm.whitespace;
  if (/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u.test(grapheme)) {
    return rhythm.cjk;
  }
  return rhythm.latin;
}

function punctuationPause(grapheme: string, rhythm: TypingRhythm): number {
  if (/[.!?。！？…]/u.test(grapheme)) return rhythm.sentencePause;
  if (/[,，、;；:：]/u.test(grapheme)) return rhythm.commaPause;
  return 0;
}

function appendThresholds(
  graphemes: readonly string[],
  rhythm: TypingRhythm,
  seed: string,
  phase: string,
  initialElapsed: number
): { elapsed: number; thresholds: number[] } {
  let elapsed = initialElapsed;
  const thresholds = graphemes.map((grapheme, index) => {
    elapsed += baseInterval(grapheme, rhythm) * intervalJitter(seed, phase, index);
    const threshold = elapsed;
    if (index < graphemes.length - 1) elapsed += punctuationPause(grapheme, rhythm);
    return threshold;
  });
  return { elapsed, thresholds };
}

function createTypewriterTimeline(
  text: string,
  attribution: string,
  speed: QuoteTypingSpeed,
  seed: string
): TypewriterTimeline {
  const rhythm = TYPING_RHYTHMS[speed];
  const textGraphemes = splitGraphemes(text);
  const attributionGraphemes = splitGraphemes(attribution);
  const textResult = appendThresholds(textGraphemes, rhythm, seed, "text", 0);
  const trailingTextPause =
    textGraphemes.length > 0 && attributionGraphemes.length > 0
      ? punctuationPause(textGraphemes[textGraphemes.length - 1], rhythm)
      : 0;
  const attributionStart =
    textResult.elapsed +
    trailingTextPause +
    (textGraphemes.length > 0 && attributionGraphemes.length > 0 ? rhythm.attributionPause : 0);
  const attributionResult = appendThresholds(
    attributionGraphemes,
    rhythm,
    seed,
    "attribution",
    attributionStart
  );
  const unscaledDuration = attributionResult.elapsed;
  const scale =
    unscaledDuration > rhythm.maximumDuration ? rhythm.maximumDuration / unscaledDuration : 1;

  return {
    attribution: attributionGraphemes,
    attributionThresholds: attributionResult.thresholds.map((threshold) => threshold * scale),
    duration: unscaledDuration * scale,
    text: textGraphemes,
    textThresholds: textResult.thresholds.map((threshold) => threshold * scale),
  };
}

function revealedCount(thresholds: readonly number[], elapsed: number): number {
  let start = 0;
  let end = thresholds.length;
  while (start < end) {
    const middle = Math.floor((start + end) / 2);
    if (thresholds[middle] <= elapsed) start = middle + 1;
    else end = middle;
  }
  return start;
}

function usePrefersReducedMotion(): boolean {
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
    return window.matchMedia(REDUCED_MOTION_QUERY).matches;
  });

  useEffect(() => {
    if (typeof window.matchMedia !== "function") return undefined;
    const mediaQuery = window.matchMedia(REDUCED_MOTION_QUERY);
    const updatePreference = (event: MediaQueryListEvent | MediaQueryList) => {
      setPrefersReducedMotion(event.matches);
    };

    updatePreference(mediaQuery);
    if (typeof mediaQuery.addEventListener === "function") {
      mediaQuery.addEventListener("change", updatePreference);
      return () => mediaQuery.removeEventListener("change", updatePreference);
    }

    mediaQuery.addListener(updatePreference);
    return () => mediaQuery.removeListener(updatePreference);
  }, []);

  return prefersReducedMotion;
}

function QuoteContent({
  attribution,
  attributionRemainder = "",
  attributionText = attribution,
  cursorAttributes,
  cursorStyle,
  cursorTarget,
  text,
  textAttributes,
  textRemainder = "",
  textStyle,
}: QuoteContentProps) {
  const {
    className: cursorClassName,
    style: cursorAttributeStyle,
    ...cursorProps
  } = cursorAttributes ?? {};
  const {
    className: textClassName,
    style: textAttributeStyle,
    ...textProps
  } = textAttributes ?? {};
  const resolvedCursorStyle = { ...cursorStyle, ...cursorAttributeStyle };
  const resolvedTextStyle = { ...textStyle, ...textAttributeStyle };

  return (
    <span className={styles.quoteContent}>
      <span
        {...textProps}
        className={[styles.quoteText, textClassName].filter(Boolean).join(" ")}
        style={resolvedTextStyle}
      >
        <span data-quote-visible-text="true">{text}</span>
        {cursorTarget === "text" && (
          <span
            {...cursorProps}
            className={[styles.cursor, cursorClassName].filter(Boolean).join(" ")}
            style={resolvedCursorStyle}
          >
            |
          </span>
        )}
        {textRemainder && (
          <span className={styles.unrevealed} data-quote-unrevealed-text="true">
            {textRemainder}
          </span>
        )}
      </span>
      {attribution && (
        <span className={styles.quoteAttribution}>
          <span data-quote-visible-attribution="true">{attributionText}</span>
          {cursorTarget === "attribution" && (
            <span
              {...cursorProps}
              className={[styles.cursor, cursorClassName].filter(Boolean).join(" ")}
              style={resolvedCursorStyle}
            >
              |
            </span>
          )}
          {attributionRemainder && (
            <span className={styles.unrevealed} data-quote-unrevealed-attribution="true">
              {attributionRemainder}
            </span>
          )}
        </span>
      )}
    </span>
  );
}

function LayoutCopy({
  presentation,
  textStyle,
}: {
  presentation: QuotePresentation;
  textStyle?: CSSProperties;
}) {
  return (
    <span className={styles.layoutCopy} data-quote-layout-copy="true">
      <QuoteContent
        attribution={presentation.attribution}
        text={presentation.text}
        textStyle={textStyle}
      />
    </span>
  );
}

function StaticReveal({
  cursorAttributes,
  cursorStyle,
  cursorTarget,
  presentation,
  textAttributes,
  textStyle,
}: {
  cursorAttributes?: PresentationAttributes<HTMLAttributes<HTMLSpanElement>>;
  cursorStyle?: CSSProperties;
  cursorTarget?: "attribution" | "text";
  presentation: QuotePresentation;
  textAttributes?: PresentationAttributes<HTMLAttributes<HTMLSpanElement>>;
  textStyle?: CSSProperties;
}) {
  return (
    <span
      className={styles.quoteLayer}
      data-quote-layer="current"
      data-quote-reveal-layer="current"
    >
      <QuoteContent
        attribution={presentation.attribution}
        cursorAttributes={cursorAttributes}
        cursorStyle={cursorStyle}
        cursorTarget={cursorTarget}
        text={presentation.text}
        textAttributes={textAttributes}
        textStyle={textStyle}
      />
    </span>
  );
}

function TypewriterReveal({
  cursorAttributes,
  cursorStyle,
  presentation,
  quoteId,
  textAttributes,
  textStyle,
  typingSpeed,
}: {
  cursorAttributes?: PresentationAttributes<HTMLAttributes<HTMLSpanElement>>;
  cursorStyle?: CSSProperties;
  presentation: QuotePresentation;
  quoteId: string;
  textAttributes?: PresentationAttributes<HTMLAttributes<HTMLSpanElement>>;
  textStyle?: CSSProperties;
  typingSpeed: QuoteTypingSpeed;
}) {
  const [animationSeed] = useState(quoteId);
  const timeline = useMemo(
    () =>
      createTypewriterTimeline(
        presentation.text,
        presentation.attribution,
        typingSpeed,
        animationSeed
      ),
    [animationSeed, presentation.attribution, presentation.text, typingSpeed]
  );
  const [frame, setFrame] = useState<TypewriterFrame>(() => ({
    animationKey: presentation.animationKey,
    attributionCount: 0,
    isComplete: timeline.duration === 0,
    textCount: 0,
  }));

  useEffect(() => {
    const animationKey = presentation.animationKey;
    const initialFrame: TypewriterFrame = {
      animationKey,
      attributionCount: 0,
      isComplete: timeline.duration === 0,
      textCount: 0,
    };
    setFrame(initialFrame);
    if (timeline.duration === 0) return undefined;

    const startedAt = performance.now();
    let animationFrame = 0;
    let lastTextCount = 0;
    let lastAttributionCount = 0;

    const update = (timestamp: number) => {
      const elapsed = Math.max(0, timestamp - startedAt);
      const textCount = revealedCount(timeline.textThresholds, elapsed);
      const attributionCount = revealedCount(timeline.attributionThresholds, elapsed);
      const isComplete = elapsed >= timeline.duration;

      if (textCount !== lastTextCount || attributionCount !== lastAttributionCount || isComplete) {
        lastTextCount = textCount;
        lastAttributionCount = attributionCount;
        setFrame({ animationKey, attributionCount, isComplete, textCount });
      }

      if (!isComplete) animationFrame = window.requestAnimationFrame(update);
    };

    animationFrame = window.requestAnimationFrame(update);
    return () => window.cancelAnimationFrame(animationFrame);
  }, [presentation.animationKey, timeline]);

  const activeFrame =
    frame.animationKey === presentation.animationKey
      ? frame
      : {
          animationKey: presentation.animationKey,
          attributionCount: 0,
          isComplete: false,
          textCount: 0,
        };
  const visibleText = timeline.text.slice(0, activeFrame.textCount).join("");
  const visibleAttribution = timeline.attribution.slice(0, activeFrame.attributionCount).join("");
  const remainingText = timeline.text.slice(activeFrame.textCount).join("");
  const remainingAttribution = timeline.attribution.slice(activeFrame.attributionCount).join("");
  const cursorTarget = activeFrame.isComplete
    ? undefined
    : activeFrame.attributionCount > 0
      ? "attribution"
      : "text";

  return (
    <>
      <LayoutCopy presentation={presentation} textStyle={textStyle} />
      <span
        className={styles.quoteLayer}
        data-quote-layer="current"
        data-quote-reveal-layer="current"
        data-typing-complete={activeFrame.isComplete}
      >
        <QuoteContent
          attribution={presentation.attribution}
          attributionRemainder={remainingAttribution}
          attributionText={visibleAttribution}
          cursorAttributes={cursorAttributes}
          cursorStyle={cursorStyle}
          cursorTarget={cursorTarget}
          text={visibleText}
          textAttributes={textAttributes}
          textRemainder={remainingText}
          textStyle={textStyle}
        />
      </span>
    </>
  );
}

interface CrossfadeState {
  animationKey: string;
  isTransitioning: boolean;
  layers: QuotePresentation[];
}

function CrossfadeReveal({
  presentation,
  textAttributes,
  textStyle,
}: {
  presentation: QuotePresentation;
  textAttributes?: PresentationAttributes<HTMLAttributes<HTMLSpanElement>>;
  textStyle?: CSSProperties;
}) {
  const [state, setState] = useState<CrossfadeState>(() => ({
    animationKey: presentation.animationKey,
    isTransitioning: true,
    layers: [presentation],
  }));

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setState((current) => {
        if (current.animationKey !== presentation.animationKey) return current;
        return {
          animationKey: current.animationKey,
          isTransitioning: false,
          layers: [presentation],
        };
      });
    }, CROSSFADE_DURATION_MS);

    setState((current) => {
      if (current.animationKey === presentation.animationKey) return current;
      const previous = current.layers[current.layers.length - 1];
      return {
        animationKey: presentation.animationKey,
        isTransitioning: true,
        layers:
          previous.contentKey === presentation.contentKey
            ? [presentation]
            : [previous, presentation],
      };
    });

    return () => window.clearTimeout(timer);
  }, [presentation]);

  return (
    <>
      <LayoutCopy presentation={presentation} textStyle={textStyle} />
      {state.layers.map((layer, index) => {
        const isIncoming = index === state.layers.length - 1;
        const transitionClass = state.isTransitioning
          ? isIncoming
            ? styles.fadeIn
            : styles.fadeOut
          : "";
        const layerClassName = [
          styles.quoteLayer,
          isIncoming ? "" : styles.previousLayer,
          transitionClass,
        ]
          .filter(Boolean)
          .join(" ");
        return (
          <span
            className={layerClassName}
            data-quote-layer={isIncoming ? "current" : "previous"}
            data-quote-reveal-layer={isIncoming ? "current" : "previous"}
            key={layer.animationKey}
          >
            <QuoteContent
              attribution={layer.attribution}
              text={layer.text}
              textAttributes={isIncoming ? textAttributes : undefined}
              textStyle={textStyle}
            />
          </span>
        );
      })}
    </>
  );
}

export function QuoteReveal({
  animationMode = "typewriter",
  className,
  cursorAttributes,
  cursorStyle,
  quote,
  replayKey = 0,
  staticCursorTarget,
  textAttributes,
  textStyle,
  typingSpeed = "normal",
}: QuoteRevealProps) {
  const attributionText = formatQuoteAttribution(quote);
  const attribution = attributionText ? `—— ${attributionText}` : "";
  const contentKey = JSON.stringify([quote.text, attribution]);
  const animationKey = `${contentKey}:${animationMode}:${typingSpeed}:${String(replayKey)}`;
  const presentation = useMemo<QuotePresentation>(
    () => ({ animationKey, attribution, contentKey, text: quote.text }),
    [animationKey, attribution, contentKey, quote.text]
  );
  const prefersReducedMotion = usePrefersReducedMotion();
  const [reducedContentKey, setReducedContentKey] = useState<string | null>(() =>
    prefersReducedMotion ? contentKey : null
  );
  useEffect(() => {
    if (prefersReducedMotion) setReducedContentKey(contentKey);
  }, [contentKey, prefersReducedMotion]);
  const skipMotion = prefersReducedMotion || reducedContentKey === presentation.contentKey;
  const rootClassName = [styles.quoteReveal, className].filter(Boolean).join(" ");

  return (
    <span
      aria-hidden="true"
      className={rootClassName}
      data-animation-mode={skipMotion ? "none" : animationMode}
      data-quote-animation={skipMotion ? "none" : animationMode}
      data-quote-reveal="true"
    >
      {skipMotion || animationMode === "none" ? (
        <StaticReveal
          cursorAttributes={cursorAttributes}
          cursorStyle={cursorStyle}
          cursorTarget={staticCursorTarget}
          presentation={presentation}
          textAttributes={textAttributes}
          textStyle={textStyle}
        />
      ) : animationMode === "crossfade" ? (
        <CrossfadeReveal
          presentation={presentation}
          textAttributes={textAttributes}
          textStyle={textStyle}
        />
      ) : (
        <TypewriterReveal
          cursorAttributes={cursorAttributes}
          cursorStyle={cursorStyle}
          key={presentation.contentKey}
          presentation={presentation}
          quoteId={quote.id}
          textAttributes={textAttributes}
          textStyle={textStyle}
          typingSpeed={typingSpeed}
        />
      )}
    </span>
  );
}
