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
  const [displayAttribution, setDisplayAttribution] = useState("");
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
      setDisplayAttribution(attribution ? `—— ${attribution}` : "");
      setIsTyping(false);
      return undefined;
    }

    const textCharacters = Array.from(quote.text);
    const attributionCharacters = Array.from(attribution ? `—— ${attribution}` : "");
    const totalCharacters = textCharacters.length + attributionCharacters.length;
    let index = 0;
    setDisplayText("");
    setDisplayAttribution("");
    setIsTyping(totalCharacters > 0);
    if (totalCharacters === 0) return undefined;

    timerRef.current = window.setInterval(() => {
      index += 1;
      setDisplayText(textCharacters.slice(0, index).join(""));
      setDisplayAttribution(
        attributionCharacters.slice(0, Math.max(0, index - textCharacters.length)).join("")
      );
      if (index >= totalCharacters) {
        if (timerRef.current !== null) window.clearInterval(timerRef.current);
        timerRef.current = null;
        setIsTyping(false);
      }
    }, TYPEWRITER_INTERVAL_MS);

    return () => {
      if (timerRef.current !== null) window.clearInterval(timerRef.current);
      timerRef.current = null;
    };
  }, [attribution, quote]);

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
            {isTyping && !displayAttribution && (
              <span className={styles.cursor} style={cursorAppearance}>
                |
              </span>
            )}
          </span>
          {(displayAttribution || (!isTyping && attribution)) && (
            <span className={styles.quoteAttribution}>
              {isTyping ? displayAttribution : `—— ${attribution}`}
              {isTyping && displayAttribution && (
                <span className={styles.cursor} style={cursorAppearance}>
                  |
                </span>
              )}
            </span>
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
