import type { AppMode } from "./index";

export type AppearanceSceneId = AppMode;

export type AppearanceComponentId =
  | "clock"
  | "countdown"
  | "stopwatch"
  | "studyTime"
  | "studyQuote"
  | "studyTopDock"
  | "studyWeather"
  | "studyNoise"
  | "studyStatus"
  | "studyCountdown";

export type FontSource = "builtin" | "imported" | "system" | "legacy";

export interface FontReference {
  id: string;
  family: string;
  source: FontSource;
}

export interface ShadowStyle {
  color?: string;
  blur?: number;
  offsetX?: number;
  offsetY?: number;
}

export interface AppearanceStyle {
  color?: string;
  opacity?: number;
  font?: FontReference;
  fontWeight?: number;
  fontStyle?: "normal" | "italic";
  letterSpacing?: number;
  textShadow?: ShadowStyle;
  backgroundColor?: string;
  backgroundOpacity?: number;
  borderColor?: string;
  borderWidth?: number;
  borderRadius?: number;
  backdropBlur?: number;
  boxShadow?: ShadowStyle;
  filter?: "none" | "grayscale" | "sepia";
}

export interface ComponentAppearance {
  container?: AppearanceStyle;
  slots?: Record<string, AppearanceStyle>;
  states?: Record<string, AppearanceStyle>;
}

export type AppearanceBackgroundType = "default" | "black" | "dark" | "color" | "image";

export interface AppearanceBackground {
  type: AppearanceBackgroundType;
  color?: string;
  colorAlpha?: number;
  assetId?: string;
  imageFileName?: string;
  /** v1 migration bridge. Cleared after the image is moved to IndexedDB. */
  imageDataUrl?: string;
}

export interface SceneAppearance {
  background: AppearanceBackground;
  components: Partial<Record<AppearanceComponentId, ComponentAppearance>>;
}

export interface GlobalAppearance {
  numeric?: AppearanceStyle;
  text?: AppearanceStyle;
}

export interface AppearanceSettingsV2 {
  global: GlobalAppearance;
  scenes: Record<AppearanceSceneId, SceneAppearance>;
  instances: {
    studyCountdown: Record<string, ComponentAppearance>;
  };
}

export type AppearanceSlotKind = "numeric" | "text" | "icon" | "surface";

export interface AppearanceSlotDefinition {
  id: string;
  label: string;
  kind: AppearanceSlotKind;
  defaultStyle?: AppearanceStyle;
}

export interface AppearanceComponentDefinition {
  id: AppearanceComponentId;
  scene: AppearanceSceneId;
  label: string;
  description: string;
  slots: AppearanceSlotDefinition[];
  states?: Array<{ id: string; label: string; defaultStyle?: AppearanceStyle }>;
  supportsSurface?: boolean;
  defaultContainerStyle?: AppearanceStyle;
}

export interface AppearanceBundleV2 {
  format: "immersive-clock-settings";
  version: 2;
  settings: unknown;
  assets: Array<{
    id: string;
    kind: "background" | "font";
    name: string;
    mimeType: string;
    dataUrl: string;
    family?: string;
    format?: "truetype" | "opentype" | "woff" | "woff2";
  }>;
}
