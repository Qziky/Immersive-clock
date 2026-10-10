import {
  useEffect,
  useLayoutEffect,
  useRef,
  useSyncExternalStore,
  type CSSProperties,
} from "react";

import { useAppState } from "../../contexts/AppContext";
import {
  getOledScreenReadout,
  subscribeOledScreenReadout,
} from "../../services/oledProtectionRuntime";
import { TimeStage, TimeStageValue } from "../../ui";

import styles from "./OledScreenSaver.module.css";
import {
  advanceOledScreenPosition,
  createRandomOledScreenPosition,
  OLED_SCREEN_SAFE_MARGIN,
  type OledScreenPosition,
} from "./screenSaverMotion";

interface OledScreenSaverProps {
  brightnessPercent: number;
  onWake: () => void;
}

const MODE_LABELS = {
  clock: "时钟",
  countdown: "倒计时",
  stopwatch: "秒表",
  study: "自习时间",
} as const;

const MAX_FRAME_INTERVAL_MS = 100;

export function OledScreenSaver({ brightnessPercent, onWake }: OledScreenSaverProps) {
  const readout = useSyncExternalStore(
    subscribeOledScreenReadout,
    getOledScreenReadout,
    getOledScreenReadout
  );
  const hasReadout = readout !== null;
  const { timeDisplay } = useAppState();
  const positionRef = useRef<OledScreenPosition | null>(null);
  const elementRef = useRef<HTMLDivElement | null>(null);
  const frameRef = useRef<number | null>(null);
  const previousActiveElementRef = useRef<HTMLElement | null>(null);
  const reducedMotionIntervalRef = useRef<number | null>(null);

  useLayoutEffect(() => {
    const element = elementRef.current;
    if (!element) return;

    previousActiveElementRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    element.focus({ preventScroll: true });
    const bounds = element.parentElement?.getBoundingClientRect();
    const width = bounds?.width ?? window.innerWidth;
    const height = bounds?.height ?? window.innerHeight;
    const rect = element.getBoundingClientRect();
    const position = createRandomOledScreenPosition(width, height, rect.width, rect.height);
    positionRef.current = position;
    element.style.transform = `translate3d(${position.x}px, ${position.y}px, 0)`;

    return () => {
      const previousActiveElement = previousActiveElementRef.current;
      if (previousActiveElement?.isConnected && !previousActiveElement.closest("[inert]")) {
        requestAnimationFrame(() => previousActiveElement.focus({ preventScroll: true }));
      }
    };
  }, [hasReadout]);

  useEffect(() => {
    const element = elementRef.current;
    if (!hasReadout || !element) return;

    let previousTime: number | null = null;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

    const placeRandomly = () => {
      const bounds = element.parentElement?.getBoundingClientRect();
      const width = bounds?.width ?? window.innerWidth;
      const height = bounds?.height ?? window.innerHeight;
      const rect = element.getBoundingClientRect();
      const position = createRandomOledScreenPosition(width, height, rect.width, rect.height);
      positionRef.current = position;
      element.style.transform = `translate3d(${position.x}px, ${position.y}px, 0)`;
    };

    const animate = (time: number) => {
      frameRef.current = null;
      if (document.visibilityState === "hidden") return;
      if (previousTime !== null && time - previousTime < 1000 / 30) {
        frameRef.current = requestAnimationFrame(animate);
        return;
      }

      const previous = positionRef.current;
      if (!previous) {
        placeRandomly();
      } else if (previousTime !== null) {
        const rect = element.getBoundingClientRect();
        const bounds = element.parentElement?.getBoundingClientRect();
        const width = bounds?.width ?? window.innerWidth;
        const height = bounds?.height ?? window.innerHeight;
        const maximumX = Math.max(0, width - rect.width - OLED_SCREEN_SAFE_MARGIN * 2);
        const maximumY = Math.max(0, height - rect.height - OLED_SCREEN_SAFE_MARGIN * 2);
        const next = advanceOledScreenPosition(
          {
            ...previous,
            x: previous.x - OLED_SCREEN_SAFE_MARGIN,
            y: previous.y - OLED_SCREEN_SAFE_MARGIN,
          },
          Math.min(MAX_FRAME_INTERVAL_MS, time - previousTime) / 1000,
          maximumX,
          maximumY
        );
        next.x += OLED_SCREEN_SAFE_MARGIN;
        next.y += OLED_SCREEN_SAFE_MARGIN;
        positionRef.current = next;
        element.style.transform = `translate3d(${next.x}px, ${next.y}px, 0)`;
      }

      previousTime = time;
      frameRef.current = requestAnimationFrame(animate);
    };

    const stopAnimation = () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
      previousTime = null;
    };
    const handleVisibility = () => {
      stopAnimation();
      if (reducedMotionIntervalRef.current !== null) {
        window.clearInterval(reducedMotionIntervalRef.current);
      }
      reducedMotionIntervalRef.current = null;
      if (document.visibilityState === "visible" && !reduceMotion.matches) {
        frameRef.current = requestAnimationFrame(animate);
      } else if (document.visibilityState === "visible" && reduceMotion.matches) {
        reducedMotionIntervalRef.current = window.setInterval(placeRandomly, 60_000);
      }
    };
    const handleResize = () => {
      if (document.visibilityState === "hidden") return;
      stopAnimation();
      placeRandomly();
      if (!reduceMotion.matches) {
        frameRef.current = requestAnimationFrame(animate);
      }
    };
    const handleMotionPreference = () => {
      stopAnimation();
      if (reduceMotion.matches) {
        if (reducedMotionIntervalRef.current !== null) {
          window.clearInterval(reducedMotionIntervalRef.current);
          reducedMotionIntervalRef.current = null;
        }
        if (document.visibilityState === "visible") {
          reducedMotionIntervalRef.current = window.setInterval(placeRandomly, 60_000);
        }
      } else {
        if (reducedMotionIntervalRef.current !== null) {
          window.clearInterval(reducedMotionIntervalRef.current);
        }
        reducedMotionIntervalRef.current = null;
        if (document.visibilityState === "visible") {
          frameRef.current = requestAnimationFrame(animate);
        }
      }
    };

    if (reduceMotion.matches && document.visibilityState === "visible") {
      reducedMotionIntervalRef.current = window.setInterval(placeRandomly, 60_000);
    } else if (document.visibilityState === "visible") {
      frameRef.current = requestAnimationFrame(animate);
    }
    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("resize", handleResize);
    window.addEventListener("orientationchange", handleResize);
    reduceMotion.addEventListener("change", handleMotionPreference);

    return () => {
      stopAnimation();
      if (reducedMotionIntervalRef.current !== null) {
        window.clearInterval(reducedMotionIntervalRef.current);
      }
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("orientationchange", handleResize);
      reduceMotion.removeEventListener("change", handleMotionPreference);
    };
  }, [hasReadout]);

  useEffect(() => {
    if (readout?.mode !== "countdown" || !readout.status) return;
    if (readout.status === "时间到") onWake();
  }, [onWake, readout?.mode, readout?.status]);

  if (!readout) return null;

  return (
    <div className={styles.screenSaver} data-testid="oled-screen-saver">
      <div
        ref={elementRef}
        className={styles.readout}
        role="region"
        aria-label={`${MODE_LABELS[readout.mode]}屏保时间：${readout.value}`}
        tabIndex={-1}
        style={
          {
            "--time-stage-oled-brightness": String(brightnessPercent / 100),
          } as CSSProperties
        }
      >
        <TimeStage variant="oled-protection" displayScale={timeDisplay.centralTimeScale}>
          <TimeStageValue aria-label={readout.value} data-testid="oled-screen-saver-time">
            {readout.value}
          </TimeStageValue>
          <span className={styles.modeLabel}>
            {MODE_LABELS[readout.mode]}
            {readout.status ? ` · ${readout.status}` : ""}
          </span>
        </TimeStage>
      </div>
    </div>
  );
}
