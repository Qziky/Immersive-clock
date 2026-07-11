import { useEffect, useRef, useState } from "react";

import { useAppState } from "../../contexts/AppContext";
import { useComponentAppearance } from "../../contexts/AppearanceContext";
import { useQuoteRotation } from "../../hooks/useQuoteRotation";
import { formatQuoteAttribution } from "../../services/quotes";

import styles from "./MotivationalQuote.module.css";

const TYPEWRITER_INTERVAL_MS = 120;

export function MotivationalQuote() {
  const { quoteChannels, quoteSettings } = useAppState();
  const { quote, isRefreshing, refresh } = useQuoteRotation(quoteChannels.channels, quoteSettings);
  const [displayText, setDisplayText] = useState(quote.text);
  const [isTyping, setIsTyping] = useState(false);
  const timerRef = useRef<number | null>(null);
  const textAppearance = useComponentAppearance("studyQuote", "text");
  const cursorAppearance = useComponentAppearance("studyQuote", "cursor");
  const attribution = formatQuoteAttribution(quote);

  useEffect(() => {
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }

    const reducedMotion =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reducedMotion) {
      setDisplayText(quote.text);
      setIsTyping(false);
      return undefined;
    }

    const characters = Array.from(quote.text);
    let index = 0;
    setDisplayText("");
    setIsTyping(true);
    timerRef.current = window.setInterval(() => {
      index += 1;
      setDisplayText(characters.slice(0, index).join(""));
      if (index >= characters.length) {
        if (timerRef.current !== null) window.clearInterval(timerRef.current);
        timerRef.current = null;
        setIsTyping(false);
      }
    }, TYPEWRITER_INTERVAL_MS);

    return () => {
      if (timerRef.current !== null) window.clearInterval(timerRef.current);
      timerRef.current = null;
    };
  }, [quote]);

  const announcedQuote = [quote.text, attribution].filter(Boolean).join("，来源：");

  return (
    <>
      <button
        type="button"
        className={styles.motivationalQuote}
        onClick={() => void refresh()}
        title={isRefreshing ? "正在刷新语录" : "点击刷新语录"}
        aria-label="刷新语录"
        aria-busy={isRefreshing}
      >
        <span aria-hidden="true">
          <span
            className={`${styles.quoteText} ${isTyping ? styles.typing : ""}`}
            style={textAppearance}
          >
            {isTyping ? displayText : quote.text}
            {isTyping && (
              <span className={styles.cursor} style={cursorAppearance}>
                |
              </span>
            )}
          </span>
          {!isTyping && attribution && (
            <span className={styles.quoteAttribution}>—— {attribution}</span>
          )}
        </span>
      </button>
      <span className={styles.screenReaderStatus} role="status" aria-live="polite">
        {announcedQuote}
      </span>
    </>
  );
}

export default MotivationalQuote;
