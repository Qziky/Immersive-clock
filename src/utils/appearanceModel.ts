import type { CSSProperties } from "react";

import type {
  AppearanceBackground,
  AppearanceComponentDefinition,
  AppearanceComponentId,
  AppearanceSceneId,
  AppearanceSettingsV2,
  AppearanceSlotKind,
  AppearanceStyle,
  ComponentAppearance,
  FontReference,
  GlobalAppearance,
  ShadowStyle,
} from "../types/appearance";

const HEX_COLOR_PATTERN = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;

const NUMERIC_FONT: FontReference = {
  id: "Roboto Mono",
  family: '"Roboto Mono", monospace',
  source: "builtin",
};
const TEXT_FONT: FontReference = {
  id: "Inter",
  family: '"Inter", sans-serif',
  source: "builtin",
};

const PRIMARY_NUMERIC: AppearanceStyle = {
  color: "#ffffff",
  opacity: 1,
  font: NUMERIC_FONT,
  fontWeight: 700,
  letterSpacing: 0,
};
const PRIMARY_TEXT: AppearanceStyle = {
  color: "#f8f7f0",
  opacity: 0.96,
  font: TEXT_FONT,
  fontWeight: 600,
  letterSpacing: 0,
};
const TERTIARY_TEXT: AppearanceStyle = {
  color: "#e8e9e0",
  opacity: 0.54,
  font: TEXT_FONT,
  fontWeight: 500,
  letterSpacing: 0,
};

export const APPEARANCE_COMPONENTS: readonly AppearanceComponentDefinition[] = [
  {
    id: "clock",
    scene: "clock",
    label: "时钟",
    description: "主时间与日期",
    slots: [
      { id: "time", label: "主时间", kind: "numeric", defaultStyle: PRIMARY_NUMERIC },
      {
        id: "date",
        label: "日期",
        kind: "text",
        defaultStyle: {
          color: "#bbbbbb",
          opacity: 0.8,
          font: TEXT_FONT,
          fontWeight: 400,
          letterSpacing: 0,
        },
      },
    ],
  },
  {
    id: "countdown",
    scene: "countdown",
    label: "倒计时",
    description: "时间、状态和结束提示",
    slots: [
      { id: "time", label: "时间", kind: "numeric", defaultStyle: PRIMARY_NUMERIC },
      {
        id: "placeholder",
        label: "占位时间",
        kind: "numeric",
        defaultStyle: { ...PRIMARY_NUMERIC, opacity: 0.6 },
      },
      {
        id: "finishedMessage",
        label: "结束提示",
        kind: "text",
        defaultStyle: {
          color: "#cf6679",
          opacity: 1,
          font: TEXT_FONT,
          fontWeight: 600,
        },
      },
    ],
    states: [
      {
        id: "warning",
        label: "警告状态",
        slotIds: ["time"],
        defaultStyle: { color: "#cf6679" },
      },
      {
        id: "finished",
        label: "结束状态",
        slotIds: ["time", "finishedMessage"],
        defaultStyle: { color: "#cf6679" },
      },
    ],
  },
  {
    id: "stopwatch",
    scene: "stopwatch",
    label: "秒表",
    description: "时间、暂停提示和里程碑",
    slots: [
      { id: "time", label: "主时间", kind: "numeric", defaultStyle: PRIMARY_NUMERIC },
      {
        id: "status",
        label: "暂停提示",
        kind: "text",
        defaultStyle: {
          color: "#2fecc6",
          opacity: 0.8,
          font: TEXT_FONT,
          fontWeight: 400,
        },
      },
      {
        id: "milestone",
        label: "里程碑",
        kind: "text",
        defaultStyle: {
          color: "#2fecc6",
          opacity: 1,
          font: TEXT_FONT,
          fontWeight: 500,
        },
      },
    ],
    states: [
      {
        id: "running",
        label: "运行状态",
        slotIds: ["time"],
        defaultStyle: { color: "#ffffff" },
      },
      { id: "paused", label: "暂停状态", slotIds: ["time", "status"] },
    ],
    supportsSurface: true,
    containerLabel: "秒表整体",
  },
  {
    id: "studyTime",
    scene: "study",
    label: "中央时间",
    description: "小时分钟、秒钟与日期",
    slots: [
      { id: "primary", label: "小时与分钟", kind: "numeric", defaultStyle: PRIMARY_NUMERIC },
      { id: "seconds", label: "秒钟", kind: "numeric", defaultStyle: PRIMARY_NUMERIC },
      {
        id: "date",
        label: "日期",
        kind: "text",
        defaultStyle: {
          color: "#e8e9e0",
          opacity: 0.72,
          font: TEXT_FONT,
          fontWeight: 400,
          letterSpacing: 0,
        },
      },
    ],
  },
  {
    id: "studyQuote",
    scene: "study",
    label: "励志语录",
    description: "语录文字与输入光标",
    slots: [
      {
        id: "text",
        label: "语录文字",
        kind: "text",
        defaultStyle: {
          color: "#e8e9e0",
          opacity: 0.54,
          font: TEXT_FONT,
          fontWeight: 400,
          letterSpacing: 0,
        },
      },
      {
        id: "cursor",
        label: "光标",
        kind: "text",
        defaultStyle: { color: "#ffffff", opacity: 1, font: TEXT_FONT, fontWeight: 400 },
      },
    ],
  },
  {
    id: "studyTopDock",
    scene: "study",
    label: "顶部信息栏",
    description: "顶栏背景、边框与阴影",
    slots: [],
    supportsSurface: true,
    containerLabel: "信息栏整体",
    defaultContainerStyle: {
      backgroundColor: "#111317",
      backgroundOpacity: 0.46,
      borderColor: "#eaecf0",
      borderWidth: 1,
      borderRadius: 8,
      backdropBlur: 20,
    },
  },
  {
    id: "studyWeather",
    scene: "study",
    label: "天气",
    description: "温度、描述与图标",
    slots: [
      {
        id: "temperature",
        label: "温度",
        kind: "numeric",
        defaultStyle: { ...PRIMARY_NUMERIC, color: "#f8f7f0", opacity: 0.96, fontWeight: 600 },
      },
      { id: "description", label: "天气描述", kind: "text", defaultStyle: TERTIARY_TEXT },
      { id: "icon", label: "天气图标", kind: "icon", defaultStyle: { opacity: 0.82 } },
    ],
  },
  {
    id: "studyNoise",
    scene: "study",
    label: "噪音监测",
    description: "状态、辅助文字与指示灯",
    slots: [
      { id: "status", label: "状态文字", kind: "text", defaultStyle: PRIMARY_TEXT },
      { id: "subtext", label: "辅助文字", kind: "text", defaultStyle: TERTIARY_TEXT },
      {
        id: "indicator",
        label: "指示灯",
        kind: "icon",
        defaultStyle: { color: "#7fd8bd", opacity: 1 },
      },
    ],
    states: [
      {
        id: "quiet",
        label: "安静",
        slotIds: ["status", "subtext", "indicator"],
        defaultStyle: { color: "#7fd8bd", opacity: 1 },
      },
      {
        id: "noisy",
        label: "嘈杂",
        slotIds: ["status", "subtext", "indicator"],
        defaultStyle: { color: "#ff7a88", opacity: 1 },
      },
      {
        id: "error",
        label: "错误",
        slotIds: ["status", "subtext", "indicator"],
        defaultStyle: { color: "#ff9b9b", opacity: 0.76 },
      },
      {
        id: "calibrating",
        label: "校准中",
        slotIds: ["status", "subtext", "indicator"],
        defaultStyle: { color: "#f2c46d", opacity: 1 },
      },
    ],
  },
  {
    id: "studyStatus",
    scene: "study",
    label: "顶部进度与信息",
    description: "状态文字、提示信息、进度数字与进度表面",
    slots: [
      { id: "label", label: "状态文字", kind: "text", defaultStyle: PRIMARY_TEXT },
      {
        id: "progress",
        label: "进度数字",
        kind: "numeric",
        defaultStyle: {
          color: "#e8e9e0",
          opacity: 0.54,
          font: NUMERIC_FONT,
          fontWeight: 500,
        },
      },
      {
        id: "fill",
        label: "进度填充",
        kind: "surface",
        defaultStyle: { backgroundColor: "#2fecc6", backgroundOpacity: 0.2 },
      },
    ],
    supportsSurface: true,
    containerLabel: "顶部进度与信息整体",
    defaultContainerStyle: {
      backgroundColor: "#e8e9e0",
      backgroundOpacity: 0.045,
      borderColor: "#e8e9e0",
      borderWidth: 1,
      borderRadius: 4,
    },
  },
  {
    id: "studyCountdown",
    scene: "study",
    label: "事件倒计时",
    description: "事件名称、数字与单位",
    slots: [
      { id: "label", label: "事件名称", kind: "text", defaultStyle: PRIMARY_TEXT },
      {
        id: "digit",
        label: "天数",
        kind: "numeric",
        defaultStyle: {
          color: "#2fecc6",
          opacity: 1,
          font: NUMERIC_FONT,
          fontWeight: 700,
          textShadow: { color: "#2fecc6", blur: 18, offsetX: 0, offsetY: 0 },
        },
      },
      { id: "unit", label: "单位", kind: "text", defaultStyle: PRIMARY_TEXT },
    ],
    supportsSurface: true,
    containerLabel: "倒计时卡片",
  },
] as const;

export function createDefaultAppearance(): AppearanceSettingsV2 {
  const scene = (): AppearanceSettingsV2["scenes"][AppearanceSceneId] => ({
    background: { type: "inherit" },
    components: {},
  });
  return {
    global: { background: { type: "default" } },
    scenes: {
      clock: scene(),
      countdown: scene(),
      stopwatch: scene(),
      study: scene(),
    },
    instances: { studyCountdown: {} },
  };
}

function finiteNumber(value: unknown, min: number, max: number): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  return Math.max(min, Math.min(max, value));
}

function normalizeColor(value: unknown): string | undefined {
  return typeof value === "string" && HEX_COLOR_PATTERN.test(value.trim())
    ? value.trim()
    : undefined;
}

function normalizeFont(value: unknown): FontReference | undefined {
  if (!value || typeof value !== "object") return undefined;
  const candidate = value as Partial<FontReference>;
  if (
    typeof candidate.id !== "string" ||
    !candidate.id.trim() ||
    typeof candidate.family !== "string" ||
    !candidate.family.trim() ||
    !["builtin", "imported", "system", "legacy"].includes(candidate.source ?? "")
  ) {
    return undefined;
  }
  return {
    id: candidate.id.trim().slice(0, 128),
    family: candidate.family.trim().slice(0, 128),
    source: candidate.source as FontReference["source"],
  };
}

function normalizeShadow(value: unknown): ShadowStyle | undefined {
  if (!value || typeof value !== "object") return undefined;
  const candidate = value as Partial<ShadowStyle>;
  const next: ShadowStyle = {};
  const color = normalizeColor(candidate.color);
  const blur = finiteNumber(candidate.blur, 0, 64);
  const offsetX = finiteNumber(candidate.offsetX, -32, 32);
  const offsetY = finiteNumber(candidate.offsetY, -32, 32);
  if (color) next.color = color;
  if (blur !== undefined) next.blur = blur;
  if (offsetX !== undefined) next.offsetX = offsetX;
  if (offsetY !== undefined) next.offsetY = offsetY;
  return Object.keys(next).length > 0 ? next : undefined;
}

export function normalizeAppearanceStyle(value: unknown): AppearanceStyle {
  if (!value || typeof value !== "object") return {};
  const candidate = value as Partial<AppearanceStyle>;
  const next: AppearanceStyle = {};
  const colors: Array<keyof Pick<AppearanceStyle, "color" | "backgroundColor" | "borderColor">> = [
    "color",
    "backgroundColor",
    "borderColor",
  ];
  colors.forEach((key) => {
    const color = normalizeColor(candidate[key]);
    if (color) next[key] = color;
  });
  const ranges: Array<[keyof AppearanceStyle, number, number]> = [
    ["opacity", 0, 1],
    ["backgroundOpacity", 0, 1],
    ["fontWeight", 100, 900],
    ["letterSpacing", 0, 12],
    ["borderWidth", 0, 8],
    ["borderRadius", 0, 32],
    ["backdropBlur", 0, 40],
  ];
  ranges.forEach(([key, min, max]) => {
    const normalized = finiteNumber(candidate[key], min, max);
    if (normalized !== undefined) {
      (next as Record<string, unknown>)[key] = normalized;
    }
  });
  const font = normalizeFont(candidate.font);
  if (font) next.font = font;
  if (candidate.fontStyle === "normal" || candidate.fontStyle === "italic") {
    next.fontStyle = candidate.fontStyle;
  }
  if (["none", "grayscale", "sepia"].includes(candidate.filter ?? "")) {
    next.filter = candidate.filter;
  }
  const textShadow = normalizeShadow(candidate.textShadow);
  const boxShadow = normalizeShadow(candidate.boxShadow);
  if (textShadow) next.textShadow = textShadow;
  if (boxShadow) next.boxShadow = boxShadow;
  return next;
}

function normalizeComponent(value: unknown): ComponentAppearance {
  if (!value || typeof value !== "object") return {};
  const candidate = value as ComponentAppearance;
  const mapStyles = (record: unknown): Record<string, AppearanceStyle> | undefined => {
    if (!record || typeof record !== "object") return undefined;
    const entries = Object.entries(record as Record<string, unknown>)
      .map(([key, style]) => [key.slice(0, 80), normalizeAppearanceStyle(style)] as const)
      .filter(([, style]) => Object.keys(style).length > 0);
    return entries.length > 0 ? Object.fromEntries(entries) : undefined;
  };
  const container = normalizeAppearanceStyle(candidate.container);
  const slots = mapStyles(candidate.slots);
  const states = mapStyles(candidate.states);
  return {
    ...(Object.keys(container).length > 0 ? { container } : {}),
    ...(slots ? { slots } : {}),
    ...(states ? { states } : {}),
  };
}

function normalizeComponentForDefinition(
  componentId: AppearanceComponentId,
  value: unknown
): ComponentAppearance {
  const normalized = normalizeComponent(value);
  if (componentId !== "studyTopDock") return normalized;

  const legacySurface = normalized.slots?.surface;
  if (!legacySurface) return normalized;

  const remainingSlots = Object.fromEntries(
    Object.entries(normalized.slots ?? {}).filter(([slotId]) => slotId !== "surface")
  );
  return {
    ...normalized,
    container: { ...normalized.container, ...legacySurface },
    ...(Object.keys(remainingSlots).length > 0 ? { slots: remainingSlots } : { slots: undefined }),
  };
}

export function normalizeAppearanceBackground(
  value: unknown,
  options: { allowInherit?: boolean; legacyDefaultAsInherit?: boolean } = {}
): AppearanceBackground {
  const fallback = options.allowInherit ? "inherit" : "default";
  if (!value || typeof value !== "object") return { type: fallback };
  const candidate = value as Partial<AppearanceBackground>;
  const rawType = (value as { type?: string }).type;
  const type = rawType === "system" ? "dark" : rawType;
  if (type === "inherit") {
    return { type: options.allowInherit ? "inherit" : "default" };
  }
  if (type === "default" && options.legacyDefaultAsInherit) {
    return { type: "inherit" };
  }
  if (!type || !["default", "builtin", "black", "dark", "color", "image"].includes(type)) {
    return { type: fallback };
  }
  if (type === "color") {
    const color = normalizeColor(candidate.color);
    return color
      ? { type, color, colorAlpha: finiteNumber(candidate.colorAlpha, 0, 1) ?? 1 }
      : { type: fallback };
  }
  if (type === "image") {
    const assetId = typeof candidate.assetId === "string" ? candidate.assetId.slice(0, 128) : "";
    const imageDataUrl =
      typeof candidate.imageDataUrl === "string" && candidate.imageDataUrl.startsWith("data:image/")
        ? candidate.imageDataUrl
        : undefined;
    return assetId || imageDataUrl
      ? {
          type,
          ...(assetId ? { assetId } : {}),
          ...(imageDataUrl ? { imageDataUrl } : {}),
          ...(typeof candidate.imageFileName === "string"
            ? { imageFileName: candidate.imageFileName.slice(0, 200) }
            : {}),
        }
      : { type: fallback };
  }
  return { type: type as AppearanceBackground["type"] };
}

export function normalizeAppearance(value: unknown): AppearanceSettingsV2 {
  const defaults = createDefaultAppearance();
  if (!value || typeof value !== "object") return defaults;
  const candidate = value as Partial<AppearanceSettingsV2>;
  const global: Partial<GlobalAppearance> =
    candidate.global && typeof candidate.global === "object" ? candidate.global : {};
  const scenes = { ...defaults.scenes };
  (Object.keys(scenes) as AppearanceSceneId[]).forEach((sceneId) => {
    const rawScene = candidate.scenes?.[sceneId];
    if (!rawScene || typeof rawScene !== "object") return;
    const components: Partial<Record<AppearanceComponentId, ComponentAppearance>> = {};
    Object.entries(rawScene.components ?? {}).forEach(([id, component]) => {
      if (APPEARANCE_COMPONENTS.some((definition) => definition.id === id)) {
        components[id as AppearanceComponentId] = normalizeComponentForDefinition(
          id as AppearanceComponentId,
          component
        );
      }
    });
    scenes[sceneId] = {
      background: normalizeAppearanceBackground(rawScene.background, {
        allowInherit: true,
        legacyDefaultAsInherit: true,
      }),
      components,
    };
  });
  const instances: Record<string, ComponentAppearance> = {};
  Object.entries(candidate.instances?.studyCountdown ?? {}).forEach(([id, component]) => {
    if (id.trim()) instances[id.slice(0, 128)] = normalizeComponent(component);
  });
  return {
    global: {
      background: normalizeAppearanceBackground(global.background),
      numeric: normalizeAppearanceStyle(global.numeric),
      text: normalizeAppearanceStyle(global.text),
    },
    scenes,
    instances: { studyCountdown: instances },
  };
}

export function fontFamilyReference(family: string | undefined): FontReference | undefined {
  if (!family?.trim()) return undefined;
  const normalized = family.trim();
  return { id: normalized, family: normalized, source: "legacy" };
}

export interface LegacyAppearanceSource {
  general?: { background?: unknown };
  study?: {
    background?: unknown;
    style?: {
      digitColor?: string;
      digitOpacity?: number;
      numericFontFamily?: string;
      textFontFamily?: string;
      timeColor?: string;
      dateColor?: string;
    };
    countdownItems?: Array<{
      id?: string;
      bgColor?: string;
      bgOpacity?: number;
      textColor?: string;
      textOpacity?: number;
      digitColor?: string;
      digitOpacity?: number;
    }>;
  };
  appearance?: unknown;
}

export function migrateV1Appearance(source: LegacyAppearanceSource): AppearanceSettingsV2 {
  if (source.appearance) return normalizeAppearance(source.appearance);
  const next = createDefaultAppearance();
  const normalBackground = normalizeAppearanceBackground(source.general?.background);
  (["clock", "countdown", "stopwatch"] as AppearanceSceneId[]).forEach((scene) => {
    next.scenes[scene].background = normalBackground;
  });
  next.scenes.study.background = normalizeAppearanceBackground(source.study?.background);

  const legacyStyle = source.study?.style;
  if (legacyStyle) {
    next.global.numeric = {
      ...(fontFamilyReference(legacyStyle.numericFontFamily)
        ? { font: fontFamilyReference(legacyStyle.numericFontFamily) }
        : {}),
    };
    next.global.text = {
      ...(fontFamilyReference(legacyStyle.textFontFamily)
        ? { font: fontFamilyReference(legacyStyle.textFontFamily) }
        : {}),
    };
    next.scenes.study.components.studyTime = {
      slots: {
        primary: normalizeAppearanceStyle({ color: legacyStyle.timeColor }),
        seconds: normalizeAppearanceStyle({ color: legacyStyle.timeColor }),
        date: normalizeAppearanceStyle({ color: legacyStyle.dateColor }),
      },
    };
    next.scenes.study.components.studyCountdown = {
      slots: {
        digit: normalizeAppearanceStyle({
          color: legacyStyle.digitColor,
          opacity: legacyStyle.digitOpacity,
        }),
      },
    };
  }

  source.study?.countdownItems?.forEach((item) => {
    if (!item.id) return;
    next.instances.studyCountdown[item.id] = {
      container: normalizeAppearanceStyle({
        backgroundColor: item.bgColor,
        backgroundOpacity: item.bgOpacity,
      }),
      slots: {
        label: normalizeAppearanceStyle({ color: item.textColor, opacity: item.textOpacity }),
        digit: normalizeAppearanceStyle({ color: item.digitColor, opacity: item.digitOpacity }),
      },
    };
  });
  return normalizeAppearance(next);
}

export function resolveAppearanceStyle(
  appearance: AppearanceSettingsV2,
  scene: AppearanceSceneId,
  componentId: AppearanceComponentId,
  slot: string,
  kind: AppearanceSlotKind,
  options?: { state?: string; instanceId?: string }
): AppearanceStyle {
  const component = appearance.scenes[scene].components[componentId];
  const instance =
    componentId === "studyCountdown" && options?.instanceId
      ? appearance.instances.studyCountdown[options.instanceId]
      : undefined;
  const global =
    kind === "numeric"
      ? appearance.global.numeric
      : kind === "text"
        ? appearance.global.text
        : undefined;
  const isSurface = kind === "surface" || slot === "surface";
  return {
    ...global,
    ...(isSurface ? component?.container : undefined),
    ...component?.slots?.[slot],
    ...(options?.state ? component?.states?.[options.state] : undefined),
    ...(isSurface ? instance?.container : undefined),
    ...instance?.slots?.[slot],
    ...(options?.state ? instance?.states?.[options.state] : undefined),
  };
}

export function resolveAppearanceBackground(
  appearance: AppearanceSettingsV2,
  scene: AppearanceSceneId
): AppearanceBackground {
  const sceneBackground = appearance.scenes[scene].background;
  const effective =
    sceneBackground.type === "inherit" ? appearance.global.background : sceneBackground;
  return effective.type === "builtin" ? { type: "default" } : effective;
}

/** Resolve the value shown by the editor without persisting CSS-module defaults as overrides. */
export function resolveAppearanceEditorStyle(
  appearance: AppearanceSettingsV2,
  scene: AppearanceSceneId,
  componentId: AppearanceComponentId,
  slot: string,
  kind: AppearanceSlotKind,
  options?: { state?: string; instanceId?: string }
): AppearanceStyle {
  const definition = APPEARANCE_COMPONENTS.find((item) => item.id === componentId);
  const builtInSlot =
    kind === "surface" && slot === "__container"
      ? definition?.defaultContainerStyle
      : definition?.slots.find((item) => item.id === slot)?.defaultStyle;
  const builtInState = options?.state
    ? definition?.states?.find((item) => item.id === options.state)?.defaultStyle
    : undefined;
  return {
    ...builtInSlot,
    ...builtInState,
    ...resolveAppearanceStyle(appearance, scene, componentId, slot, kind, options),
  };
}

function colorWithAlpha(color: string | undefined, alpha: number | undefined): string | undefined {
  if (!color) return undefined;
  if (alpha === undefined || alpha >= 1) return color;
  const hex = color.slice(1);
  const expanded =
    hex.length === 3
      ? hex
          .split("")
          .map((char) => char + char)
          .join("")
      : hex.slice(0, 6);
  const value = Number.parseInt(expanded, 16);
  return `rgba(${(value >> 16) & 255}, ${(value >> 8) & 255}, ${value & 255}, ${alpha})`;
}

function shadowToCss(shadow: ShadowStyle | undefined): string | undefined {
  if (!shadow?.color) return undefined;
  return `${shadow.offsetX ?? 0}px ${shadow.offsetY ?? 0}px ${shadow.blur ?? 0}px ${shadow.color}`;
}

export function appearanceStyleToCss(style: AppearanceStyle): CSSProperties {
  return {
    color: style.color,
    opacity: style.opacity,
    fontFamily: style.font?.family,
    fontWeight: style.fontWeight,
    fontStyle: style.fontStyle,
    letterSpacing: style.letterSpacing === undefined ? undefined : `${style.letterSpacing}px`,
    textShadow: shadowToCss(style.textShadow),
    backgroundColor: colorWithAlpha(style.backgroundColor, style.backgroundOpacity),
    borderColor: style.borderColor,
    borderStyle: style.borderWidth === undefined ? undefined : "solid",
    borderWidth: style.borderWidth,
    borderRadius: style.borderRadius,
    backdropFilter: style.backdropBlur === undefined ? undefined : `blur(${style.backdropBlur}px)`,
    boxShadow: shadowToCss(style.boxShadow),
    filter:
      style.filter === "grayscale"
        ? "grayscale(1)"
        : style.filter === "sepia"
          ? "sepia(1)"
          : style.filter === "none"
            ? "none"
            : undefined,
  };
}

export function appearanceBackgroundToCss(
  background: AppearanceBackground,
  imageDataUrl?: string
): CSSProperties {
  if (background.type === "image" && imageDataUrl) {
    return {
      backgroundImage: `url(${imageDataUrl})`,
      backgroundPosition: "center",
      backgroundRepeat: "no-repeat",
      backgroundSize: "cover",
    };
  }
  if (background.type === "color" && background.color) {
    return {
      backgroundImage: "none",
      backgroundColor: colorWithAlpha(background.color, background.colorAlpha),
    };
  }
  return {};
}

export function findAppearanceComponent(
  componentId: AppearanceComponentId
): AppearanceComponentDefinition {
  const definition = APPEARANCE_COMPONENTS.find((item) => item.id === componentId);
  if (!definition) throw new Error(`Unknown appearance component: ${componentId}`);
  return definition;
}
