import type { ButtonHTMLAttributes, CSSProperties, HTMLAttributes } from "react";

import { formatQuoteAttribution } from "../../services/quotes";
import type { Quote, QuoteAnimationMode, QuoteTypingSpeed } from "../../types/quote";
import { classNames } from "../../ui/utils/classNames";
import type { PresentationAttributes } from "../PresentationContent";

import styles from "./MotivationalQuote.module.css";
import { QuoteReveal } from "./QuoteReveal";

interface MotivationalQuotePresentationProps {
  animationMode: QuoteAnimationMode;
  buttonAttributes?: PresentationAttributes<ButtonHTMLAttributes<HTMLButtonElement>>;
  cursorAttributes?: PresentationAttributes<HTMLAttributes<HTMLSpanElement>>;
  cursorStyle?: CSSProperties;
  includeScreenReaderStatus?: boolean;
  quote: Quote;
  replayKey?: number | string;
  staticCursorTarget?: "attribution" | "text";
  textAttributes?: PresentationAttributes<HTMLAttributes<HTMLSpanElement>>;
  textStyle?: CSSProperties;
  typewriterBackspaceEnabled?: boolean;
  typingSpeed: QuoteTypingSpeed;
}

export function MotivationalQuotePresentation({
  animationMode,
  buttonAttributes,
  cursorAttributes,
  cursorStyle,
  includeScreenReaderStatus = true,
  quote,
  replayKey,
  staticCursorTarget,
  textAttributes,
  textStyle,
  typewriterBackspaceEnabled = true,
  typingSpeed,
}: MotivationalQuotePresentationProps) {
  const { className: buttonClassName, ...buttonProps } = buttonAttributes ?? {};
  const attribution = formatQuoteAttribution(quote);
  const announcedQuote = [quote.text, attribution].filter(Boolean).join("，来源：");

  return (
    <>
      <button
        {...buttonProps}
        className={classNames(styles.motivationalQuote, buttonClassName)}
        type="button"
      >
        <QuoteReveal
          animationMode={animationMode}
          cursorAttributes={cursorAttributes}
          cursorStyle={cursorStyle}
          quote={quote}
          replayKey={replayKey}
          staticCursorTarget={staticCursorTarget}
          textAttributes={textAttributes}
          textStyle={textStyle}
          typewriterBackspaceEnabled={typewriterBackspaceEnabled}
          typingSpeed={typingSpeed}
        />
      </button>
      {includeScreenReaderStatus ? (
        <span className={styles.screenReaderStatus} role="status" aria-live="polite">
          {announcedQuote}
        </span>
      ) : null}
    </>
  );
}
