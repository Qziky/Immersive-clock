import { useCallback, useEffect, useRef, useState } from "react";

import { DEFAULT_FALLBACK_QUOTE, isQuoteAbortError, quoteService } from "../services/quotes";
import type { Quote, QuoteChannel, QuoteSettingsState } from "../types/quote";
import { logger } from "../utils/logger";

export interface UseQuoteRotationResult {
  quote: Quote;
  isRefreshing: boolean;
  refresh: () => Promise<void>;
}

interface ActiveRequest {
  controller: AbortController;
  sequence: number;
}

export function useQuoteRotation(
  channels: readonly QuoteChannel[],
  settings: QuoteSettingsState
): UseQuoteRotationResult {
  const [quote, setQuote] = useState<Quote>(DEFAULT_FALLBACK_QUOTE);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const quoteRef = useRef(quote);
  const requestSequenceRef = useRef(0);
  const activeControllerRef = useRef<AbortController | null>(null);
  const initialRemoteReplacementPendingRef = useRef(true);

  const commitQuote = useCallback((nextQuote: Quote) => {
    quoteRef.current = nextQuote;
    quoteService.markQuoteDisplayed(nextQuote);
    setQuote(nextQuote);
  }, []);

  const beginRequest = useCallback((): ActiveRequest => {
    activeControllerRef.current?.abort();
    const controller = new AbortController();
    activeControllerRef.current = controller;
    requestSequenceRef.current += 1;
    return { controller, sequence: requestSequenceRef.current };
  }, []);

  const isCurrentRequest = useCallback(
    (request: ActiveRequest) =>
      request.sequence === requestSequenceRef.current && !request.controller.signal.aborted,
    []
  );

  const runAutomatic = useCallback(() => {
    const request = beginRequest();
    setIsRefreshing(false);
    const result = quoteService.startAutomaticQuote({
      channels,
      currentQuoteId: quoteRef.current.id,
      signal: request.controller.signal,
    });
    const replaceInitialFallback =
      initialRemoteReplacementPendingRef.current &&
      result.immediateWasFallback &&
      result.refresh !== null;

    if (isCurrentRequest(request)) commitQuote(result.immediate);
    if (!result.refresh) return;

    void result.refresh
      .then((freshQuote) => {
        if (
          freshQuote &&
          replaceInitialFallback &&
          result.immediateWasFallback &&
          isCurrentRequest(request)
        ) {
          initialRemoteReplacementPendingRef.current = false;
          commitQuote(freshQuote);
        }
      })
      .catch((error) => {
        if (!isQuoteAbortError(error)) {
          logger.warn("在线语录后台更新失败，已保留当前内容:", error);
        }
      });
  }, [beginRequest, channels, commitQuote, isCurrentRequest]);

  const refresh = useCallback(async () => {
    const request = beginRequest();
    setIsRefreshing(true);
    try {
      const result = await quoteService.getManualQuoteResolution({
        channels,
        currentQuoteId: quoteRef.current.id,
        signal: request.controller.signal,
      });
      if (!isCurrentRequest(request)) return;
      if (!result.isFallback || quoteRef.current.id === DEFAULT_FALLBACK_QUOTE.id) {
        if (!result.isFallback) initialRemoteReplacementPendingRef.current = false;
        commitQuote(result.quote);
      }
    } catch (error) {
      if (!isQuoteAbortError(error)) {
        logger.warn("手动刷新语录失败，已保留当前内容:", error);
      }
    } finally {
      if (isCurrentRequest(request)) setIsRefreshing(false);
    }
  }, [beginRequest, channels, commitQuote, isCurrentRequest]);

  useEffect(() => {
    const timer = window.setTimeout(runAutomatic, 0);
    return () => {
      window.clearTimeout(timer);
      activeControllerRef.current?.abort();
    };
  }, [runAutomatic]);

  useEffect(() => {
    if (!settings.autoRefreshEnabled) return undefined;
    const intervalMs = Math.max(30, Math.min(1800, settings.autoRefreshIntervalSec)) * 1000;
    const timer = window.setInterval(runAutomatic, intervalMs);
    return () => window.clearInterval(timer);
  }, [runAutomatic, settings.autoRefreshEnabled, settings.autoRefreshIntervalSec]);

  return { quote, isRefreshing, refresh };
}
