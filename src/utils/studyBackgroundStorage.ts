import { getAppSettings, updateAppSettings } from "./appSettings";

export type StudyBackgroundType =
  | "default"
  | "green"
  | "black"
  | "dark"
  | "system"
  | "color"
  | "image";

export interface StudyBackgroundSettings {
  type: StudyBackgroundType;
  color?: string;
  /** 颜色透明度（0-1，仅当type=color有效） */
  colorAlpha?: number;
  imageDataUrl?: string;
}

function normalizeBackground(settings: StudyBackgroundSettings): StudyBackgroundSettings {
  const type = settings.type === "system" ? "dark" : (settings.type ?? "default");
  const background: StudyBackgroundSettings = {
    type,
    color: undefined,
    colorAlpha: undefined,
    imageDataUrl: undefined,
  };

  if (type === "color" && settings.color && isValidHexColor(settings.color)) {
    background.color = settings.color;
    background.colorAlpha =
      typeof settings.colorAlpha === "number" ? Math.max(0, Math.min(1, settings.colorAlpha)) : 1;
  } else if (type === "image" && settings.imageDataUrl) {
    background.imageDataUrl = settings.imageDataUrl;
  }

  return background;
}

function isValidHexColor(hex: string): boolean {
  return /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(hex);
}

export function readStudyBackground(): StudyBackgroundSettings {
  const background = getAppSettings().study.background;
  return background.type === "system" ? { ...background, type: "dark" } : background;
}

export function readNormalBackground(): StudyBackgroundSettings {
  const background = getAppSettings().general.background;
  return background.type === "system" ? { ...background, type: "dark" } : background;
}

export function saveStudyBackground(settings: StudyBackgroundSettings): void {
  const newBackground = normalizeBackground(settings);

  updateAppSettings((current) => ({
    study: {
      ...current.study,
      background: newBackground,
    },
  }));
}

export function saveNormalBackground(settings: StudyBackgroundSettings): void {
  const newBackground = normalizeBackground(settings);

  updateAppSettings((current) => ({
    general: {
      ...current.general,
      background: newBackground,
    },
  }));
}

export function resetStudyBackground(): void {
  updateAppSettings((current) => ({
    study: {
      ...current.study,
      background: { type: "default" },
    },
  }));
}
