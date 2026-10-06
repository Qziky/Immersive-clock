import { useEffect, useRef, useState } from "react";

import {
  readDynamicAudioFrame,
  subscribeDynamicAudio,
} from "../../services/dynamicBackgroundAudio";
import type { AppearanceBackground, DynamicBackgroundSettings } from "../../types/appearance";
import { Button, InfoPanel } from "../../ui";
import { loadVideoBackgroundAsset } from "../../utils/appearanceAssets";

import styles from "./DynamicBackgroundLayer.module.css";

interface DynamicBackgroundLayerProps {
  background: AppearanceBackground;
  mutedPreview?: boolean;
}

const MAX_CANVAS_DPR = 1.5;
const PARTICLE_DRIFT_MULTIPLIER = 6;

interface ParticlePoint {
  angle: number;
  depth: number;
  phase: number;
  speed: number;
  x: number;
  y: number;
}

function resizeCanvas(canvas: HTMLCanvasElement): CanvasRenderingContext2D | null {
  const bounds = canvas.getBoundingClientRect();
  const ratio = Math.min(window.devicePixelRatio || 1, MAX_CANVAS_DPR);
  const width = Math.max(1, Math.round(bounds.width * ratio));
  const height = Math.max(1, Math.round(bounds.height * ratio));
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  const context = canvas.getContext("2d");
  context?.setTransform(ratio, 0, 0, ratio, 0, 0);
  return context;
}

function createParticleRenderer(
  background: Extract<DynamicBackgroundSettings, { type: "particles" }>
) {
  let points: ParticlePoint[] = [];
  let currentSize = "";

  return (context: CanvasRenderingContext2D, width: number, height: number, time: number): void => {
    if (width <= 0 || height <= 0) return;

    const area = width * height;
    const areaScale = Math.min(2.25, Math.max(0.2, area / (1440 * 900)));
    const isNetwork = background.preset === "links";
    const count = Math.round(
      (isNetwork ? 39 + background.density * 122 : 110 + background.density * 275) * areaScale
    );
    const size = `${Math.round(width)}:${Math.round(height)}:${count}`;

    if (size !== currentSize) {
      currentSize = size;
      let seed = 0x4f1bbc;
      const random = () => {
        seed = (Math.imul(1664525, seed) + 1013904223) >>> 0;
        return seed / 0x100000000;
      };
      points = Array.from({ length: count }, () => ({
        x: random(),
        y: random(),
        depth: random(),
        phase: random() * Math.PI * 2,
        angle: random() * Math.PI * 2,
        speed: 0.65 + random() * 1.65,
      }));
    }

    const elapsed = time / 1000;
    const edgeFadeDistance = Math.max(12, Math.min(32, Math.min(width, height) * 0.045));
    const positions = points.map((point) => {
      const drift = elapsed * background.speed * point.speed * PARTICLE_DRIFT_MULTIPLIER;
      const x = (((point.x * width + Math.cos(point.angle) * drift) % width) + width) % width;
      const y =
        (((point.y * height + Math.sin(point.angle) * drift * 0.62) % height) + height) % height;
      const distanceToEdge = Math.min(x, y, width - x, height - y);
      const edgeProgress = Math.max(0, Math.min(1, distanceToEdge / edgeFadeDistance));
      const edgeFade = edgeProgress * edgeProgress * (3 - 2 * edgeProgress);
      const centerX = (x - width / 2) / (width * 0.48);
      const centerY = (y - height / 2) / (height * 0.32);
      const centerFade = 0.34 + 0.66 * Math.min(1, (centerX * centerX + centerY * centerY) / 0.8);
      const flicker = isNetwork ? 1 : 0.8 + Math.sin(elapsed * 0.55 + point.phase) * 0.2;
      const opacity = (0.58 + point.depth * 0.38) * edgeFade * centerFade * flicker;
      const radius =
        (isNetwork ? 1 + point.depth * 0.55 : 0.45 + point.depth * 1.35) * background.size;
      return { x, y, depth: point.depth, opacity, radius };
    });

    context.globalAlpha = 1;
    if (isNetwork) {
      const limit = Math.min(190, Math.max(65, Math.sqrt(area / count) * 1.45));
      context.strokeStyle = background.color;
      context.lineWidth = 1;
      for (let first = 0; first < positions.length; first += 1) {
        const start = positions[first];
        for (let second = first + 1; second < positions.length; second += 1) {
          const end = positions[second];
          const distance = Math.hypot(start.x - end.x, start.y - end.y);
          if (distance >= limit) continue;
          const proximity = 1 - distance / limit;
          context.globalAlpha = proximity * proximity * 0.56 * Math.min(start.opacity, end.opacity);
          context.beginPath();
          context.moveTo(start.x, start.y);
          context.lineTo(end.x, end.y);
          context.stroke();
        }
      }
    }

    positions.forEach(({ x, y, depth, opacity, radius }) => {
      if (!isNetwork && depth > 0.9) {
        const glowRadius = radius * 3.4;
        const glow = context.createRadialGradient(x, y, 0, x, y, glowRadius);
        glow.addColorStop(0, `${background.color}bb`);
        glow.addColorStop(0.5, `${background.color}44`);
        glow.addColorStop(1, `${background.color}00`);
        context.globalAlpha = opacity * 0.58;
        context.fillStyle = glow;
        context.beginPath();
        context.arc(x, y, glowRadius, 0, Math.PI * 2);
        context.fill();
      }

      context.globalAlpha = opacity * (isNetwork ? 0.82 + depth * 0.18 : 0.78 + depth * 0.22);
      context.fillStyle = background.color;
      context.beginPath();
      context.arc(x, y, radius, 0, Math.PI * 2);
      context.fill();
    });
    context.globalAlpha = 1;
  };
}

function drawMusic(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  background: Extract<DynamicBackgroundSettings, { type: "music" }>,
  frequencyData: Uint8Array<ArrayBuffer>,
  waveformData: Uint8Array<ArrayBuffer>,
  listening: boolean
): void {
  if (!listening) return;
  const bandWidth = Math.min(width, Math.max(Math.min(width, 190), Math.min(width * 0.38, 600)));
  const bandLeft = (width - bandWidth) / 2;
  const bottomInset = Math.max(24, Math.min(52, height * 0.055));
  const baseline = height - bottomInset;

  if (background.visualization === "waveform") {
    const maxAmplitude = Math.min(26, height * 0.03);
    const waveCenter = baseline - maxAmplitude;
    const step = Math.max(1, Math.floor(waveformData.length / Math.max(1, bandWidth / 2)));
    const gradient = context.createLinearGradient(bandLeft, 0, bandLeft + bandWidth, 0);
    gradient.addColorStop(0, `${background.color}00`);
    gradient.addColorStop(0.14, `${background.color}88`);
    gradient.addColorStop(0.86, `${background.color}88`);
    gradient.addColorStop(1, `${background.color}00`);
    context.save();
    context.strokeStyle = gradient;
    context.globalAlpha = 0.58;
    context.lineWidth = 1.35;
    context.lineCap = "round";
    context.lineJoin = "round";
    context.beginPath();
    for (let index = 0; index < waveformData.length; index += step) {
      const x = bandLeft + (index / (waveformData.length - 1)) * bandWidth;
      const sample = (waveformData[index] - 128) / 128;
      const amplitude = Math.max(
        -maxAmplitude,
        Math.min(maxAmplitude, sample * background.sensitivity * maxAmplitude)
      );
      const y = waveCenter - amplitude;
      if (index === 0) context.moveTo(x, y);
      else context.lineTo(x, y);
    }
    context.stroke();
    context.restore();
    return;
  }

  const maxBarHeight = Math.min(72, height * 0.09);
  const targetBarCount = Math.min(36, Math.max(16, Math.floor(bandWidth / 10)));
  const barCount = targetBarCount % 2 === 0 ? targetBarCount + 1 : targetBarCount;
  const centerBarIndex = Math.floor(barCount / 2);
  const sideBarCount = centerBarIndex;
  const slotWidth = bandWidth / barCount;
  const barWidth = Math.min(8, slotWidth * 0.48);
  context.fillStyle = background.color;
  context.save();
  for (let distanceFromCenter = 0; distanceFromCenter <= sideBarCount; distanceFromCenter += 1) {
    const sampleIndex = Math.floor(
      (distanceFromCenter / Math.max(1, sideBarCount)) * (frequencyData.length - 1)
    );
    const sample = frequencyData[sampleIndex] / 255;
    const barHeight = Math.min(maxBarHeight, sample * background.sensitivity * maxBarHeight);
    if (barHeight < 1) continue;
    const edgeFade = Math.min(1, (sideBarCount - distanceFromCenter) / 5);
    const positions =
      distanceFromCenter === 0
        ? [centerBarIndex]
        : [centerBarIndex - distanceFromCenter, centerBarIndex + distanceFromCenter];
    positions.forEach((index) => {
      const x = bandLeft + index * slotWidth + (slotWidth - barWidth) / 2;
      context.globalAlpha = 0.42 * edgeFade;
      context.beginPath();
      context.roundRect(x, baseline - barHeight, barWidth, barHeight, barWidth / 2);
      context.fill();
    });
  }
  context.restore();
}

export function DynamicBackgroundLayer({
  background,
  mutedPreview = false,
}: DynamicBackgroundLayerProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [videoSource, setVideoSource] = useState("");
  const [videoError, setVideoError] = useState("");
  const [soundActivated, setSoundActivated] = useState(false);
  const [reloadVersion, setReloadVersion] = useState(0);
  const [reducedMotion, setReducedMotion] = useState(() =>
    typeof window.matchMedia === "function"
      ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
      : false
  );
  const dynamic = background.dynamic;
  const videoAssetId = dynamic?.type === "video" ? dynamic.assetId : undefined;
  const videoUrl = dynamic?.type === "video" ? dynamic.url : undefined;
  const videoType = dynamic?.type === "video";

  useEffect(() => {
    setVideoError("");
    setSoundActivated(false);
    if (background.mode !== "dynamic" || !videoType) {
      setVideoSource("");
      return;
    }
    if (videoUrl) {
      setVideoSource(videoUrl);
      return;
    }
    if (!videoAssetId) {
      setVideoSource("");
      setVideoError("视频资源不可用，请重新选择文件");
      return;
    }
    let active = true;
    let objectUrl = "";
    setVideoSource("");
    void loadVideoBackgroundAsset(videoAssetId)
      .then((asset) => {
        if (!active) return;
        if (!asset) throw new Error("视频资源已丢失，请重新选择文件");
        objectUrl = URL.createObjectURL(asset.blob);
        setVideoSource(objectUrl);
      })
      .catch((error: unknown) => {
        if (active) setVideoError(error instanceof Error ? error.message : "视频加载失败");
      });
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [background.mode, videoType, videoAssetId, videoUrl, reloadVersion]);

  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReducedMotion(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const syncPlayback = () => {
      if (reducedMotion || document.visibilityState === "hidden") video.pause();
      else if (videoSource) void video.play().catch(() => undefined);
    };
    syncPlayback();
    document.addEventListener("visibilitychange", syncPlayback);
    return () => document.removeEventListener("visibilitychange", syncPlayback);
  }, [reducedMotion, videoSource, videoError]);

  useEffect(() => {
    if (!canvasRef.current || background.mode !== "dynamic" || !dynamic) return;
    const canvas = canvasRef.current;
    const frequencyData = new Uint8Array(new ArrayBuffer(256));
    const waveformData = new Uint8Array(new ArrayBuffer(512));
    let animationId = 0;
    let lastFrameTime = -Infinity;
    let lastSize = "";
    const drawParticles = dynamic.type === "particles" ? createParticleRenderer(dynamic) : null;
    const reducedMotion =
      typeof window.matchMedia === "function"
        ? window.matchMedia("(prefers-reduced-motion: reduce)")
        : null;
    const draw = (time: number) => {
      animationId = 0;
      if (document.visibilityState === "hidden") {
        return;
      }
      if (!reducedMotion?.matches && time - lastFrameTime < 1000 / 30) {
        animationId = window.requestAnimationFrame(draw);
        return;
      }
      lastFrameTime = time;
      const rect = canvas.getBoundingClientRect();
      const sizeKey = `${Math.round(rect.width)}:${Math.round(rect.height)}`;
      if (sizeKey !== lastSize) {
        lastSize = sizeKey;
        resizeCanvas(canvas);
      }
      const context = canvas.getContext("2d");
      if (context) {
        const ratio = Math.min(window.devicePixelRatio || 1, MAX_CANVAS_DPR);
        const width = rect.width;
        const height = rect.height;
        context.setTransform(ratio, 0, 0, ratio, 0, 0);
        context.clearRect(0, 0, width, height);
        const animate = !reducedMotion?.matches;
        if (drawParticles) drawParticles(context, width, height, animate ? time : 0);
        if (dynamic.type === "music") {
          const listening = readDynamicAudioFrame(frequencyData, waveformData);
          drawMusic(context, width, height, dynamic, frequencyData, waveformData, listening);
        }
      }
      if (reducedMotion?.matches) return;
      animationId = window.requestAnimationFrame(draw);
    };
    const resize = () => {
      lastSize = "";
      lastFrameTime = -Infinity;
      if (animationId) window.cancelAnimationFrame(animationId);
      animationId = window.requestAnimationFrame(draw);
    };
    const resizeObserver =
      typeof ResizeObserver === "undefined" ? null : new ResizeObserver(resize);
    const visibilityChange = () => {
      if (document.visibilityState === "hidden") {
        window.cancelAnimationFrame(animationId);
        animationId = 0;
      } else if (!animationId) {
        animationId = window.requestAnimationFrame(draw);
      }
    };
    const motionChange = () => resize();
    resizeObserver?.observe(canvas);
    animationId = window.requestAnimationFrame(draw);
    window.addEventListener("resize", resize);
    document.addEventListener("visibilitychange", visibilityChange);
    reducedMotion?.addEventListener("change", motionChange);
    const unsubscribeAudio = subscribeDynamicAudio(() => {
      if (dynamic.type === "music" && reducedMotion?.matches) resize();
    });
    return () => {
      window.cancelAnimationFrame(animationId);
      window.removeEventListener("resize", resize);
      document.removeEventListener("visibilitychange", visibilityChange);
      reducedMotion?.removeEventListener("change", motionChange);
      resizeObserver?.disconnect();
      unsubscribeAudio();
    };
  }, [background.mode, dynamic]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !videoSource) return;
    video.muted =
      mutedPreview || !soundActivated || dynamic?.type !== "video" || !dynamic.soundEnabled;
    if (dynamic?.type === "video") video.volume = dynamic.volume;
    if (!video.muted && !reducedMotion && document.visibilityState !== "hidden") {
      void video.play().catch(() => setVideoError("无法播放视频原声"));
    }
  }, [dynamic, mutedPreview, soundActivated, videoSource, reducedMotion]);

  if (background.mode !== "dynamic" || !dynamic) return null;
  const video = dynamic.type === "video" ? dynamic : null;
  const darkness = video ? video.darkness : dynamic.darkness;
  const showVideoSoundButton = Boolean(video && video.soundEnabled && !mutedPreview && videoSource);

  return (
    <div className={styles.layer} data-testid="dynamic-background-layer">
      {dynamic.type === "video" && videoSource && !videoError ? (
        <video
          ref={videoRef}
          className={styles.video}
          src={videoSource}
          autoPlay={!reducedMotion && document.visibilityState !== "hidden"}
          loop
          muted={!soundActivated || mutedPreview || !dynamic.soundEnabled}
          playsInline
          preload="metadata"
          onError={() => setVideoError("视频加载失败，请重试或选择其他视频")}
          style={{ objectFit: dynamic.fit }}
          aria-hidden="true"
        />
      ) : null}
      <canvas ref={canvasRef} className={styles.canvas} aria-hidden="true" />
      <div
        className={styles.darkness}
        style={{ backgroundColor: `rgba(0, 0, 0, ${darkness})` }}
        aria-hidden="true"
      />
      {videoError ? (
        <InfoPanel className={styles.message} tone="warning" role="status">
          <span>{videoError}</span>
          {video?.assetId || video?.url ? (
            <Button
              variant="secondary"
              size="sm"
              onClick={(event) => {
                event.stopPropagation();
                setReloadVersion((value) => value + 1);
              }}
            >
              重试
            </Button>
          ) : null}
        </InfoPanel>
      ) : null}
      {showVideoSoundButton ? (
        <Button
          className={styles.soundButton}
          variant="overlay"
          size="sm"
          onClick={(event) => {
            event.stopPropagation();
            setSoundActivated((value) => !value);
          }}
        >
          {soundActivated ? "关闭视频声音" : "开启视频声音"}
        </Button>
      ) : null}
    </div>
  );
}
