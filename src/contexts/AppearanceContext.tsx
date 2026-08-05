import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";

import type {
  AppearanceComponentId,
  AppearanceSceneId,
  AppearanceSettingsV2,
  AppearanceSlotKind,
  AppearanceStyle,
} from "../types/appearance";
import { loadBackgroundAsset } from "../utils/appearanceAssets";
import {
  appearanceStyleToCss,
  createDefaultAppearance,
  findAppearanceComponent,
  normalizeAppearance,
  normalizeAppearanceStyle,
  resolveAppearanceBackground,
  resolveAppearanceStyle,
} from "../utils/appearanceModel";
import { getAppSettings, replaceAppearanceSettings } from "../utils/appSettings";
import { SETTINGS_EVENTS, subscribeSettingsEvent } from "../utils/settingsEvents";

type ResetScope =
  | { type: "property"; path: readonly string[] }
  | { type: "component"; scene: AppearanceSceneId; componentId: AppearanceComponentId }
  | { type: "scene"; scene: AppearanceSceneId }
  | { type: "global" }
  | { type: "all" };

interface AppearanceContextValue {
  committedAppearance: AppearanceSettingsV2;
  draftAppearance: AppearanceSettingsV2 | null;
  activeAppearance: AppearanceSettingsV2;
  previewScene: AppearanceSceneId | null;
  isPreviewing: boolean;
  beginAppearancePreview: (scene?: AppearanceSceneId) => void;
  setPreviewScene: (scene: AppearanceSceneId | null) => void;
  updateAppearanceDraft: (path: readonly string[], value: unknown) => void;
  resetAppearance: (scope: ResetScope) => void;
  commitAppearanceDraft: () => void;
  cancelAppearancePreview: () => void;
  resolveStyle: (
    componentId: AppearanceComponentId,
    slot: string,
    kind?: AppearanceSlotKind,
    options?: { state?: string; instanceId?: string }
  ) => CSSProperties;
  getBackgroundImage: (scene: AppearanceSceneId) => string | undefined;
  resolveBackground: (scene: AppearanceSceneId) => AppearanceSettingsV2["global"]["background"];
}

const AppearanceContext = createContext<AppearanceContextValue | undefined>(undefined);

function cloneAppearance(value: AppearanceSettingsV2): AppearanceSettingsV2 {
  return typeof structuredClone === "function"
    ? structuredClone(value)
    : (JSON.parse(JSON.stringify(value)) as AppearanceSettingsV2);
}

function setAtPath(source: AppearanceSettingsV2, path: readonly string[], value: unknown) {
  const next = cloneAppearance(source) as unknown as Record<string, unknown>;
  let cursor = next;
  path.slice(0, -1).forEach((part) => {
    const existing = cursor[part];
    if (!existing || typeof existing !== "object") cursor[part] = {};
    cursor = cursor[part] as Record<string, unknown>;
  });
  const last = path[path.length - 1];
  if (!last) return source;
  if (value === undefined) delete cursor[last];
  else cursor[last] = value;
  return next as unknown as AppearanceSettingsV2;
}

const STYLE_PROPERTIES = new Set<keyof AppearanceStyle>([
  "color",
  "opacity",
  "font",
  "fontWeight",
  "fontStyle",
  "letterSpacing",
  "textShadow",
  "backgroundColor",
  "backgroundOpacity",
  "borderColor",
  "borderWidth",
  "borderRadius",
  "backdropBlur",
  "boxShadow",
  "filter",
]);

function isValidDraftValue(path: readonly string[], value: unknown): boolean {
  if (value === undefined) return true;
  const property = path[path.length - 1];
  if (!property) return false;
  if (STYLE_PROPERTIES.has(property as keyof AppearanceStyle)) {
    const normalized = normalizeAppearanceStyle({ [property]: value });
    return Object.prototype.hasOwnProperty.call(normalized, property);
  }
  if (path.includes("background")) {
    if (property === "type") {
      return ["inherit", "default", "builtin", "black", "dark", "color", "image"].includes(
        String(value)
      );
    }
    if (property === "colorAlpha") {
      return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1;
    }
  }
  return true;
}

function collectBackgroundAssetIds(appearance: AppearanceSettingsV2): string[] {
  return [
    appearance.global.background,
    ...Object.values(appearance.scenes).map((scene) => scene.background),
  ]
    .map((background) => background.assetId)
    .filter((id): id is string => Boolean(id));
}

export function AppearanceProvider({ children }: { children: ReactNode }) {
  const [committedAppearance, setCommittedAppearance] = useState<AppearanceSettingsV2>(() =>
    normalizeAppearance(getAppSettings().appearance)
  );
  const [draftAppearance, setDraftAppearance] = useState<AppearanceSettingsV2 | null>(null);
  const [previewScene, setPreviewScene] = useState<AppearanceSceneId | null>(null);
  const [backgroundImages, setBackgroundImages] = useState<Record<string, string>>({});
  const isPreviewing = draftAppearance !== null;
  const activeAppearance = draftAppearance ?? committedAppearance;

  useEffect(
    () =>
      subscribeSettingsEvent(SETTINGS_EVENTS.AppearanceResourcesMigrated, () => {
        setCommittedAppearance(normalizeAppearance(getAppSettings().appearance));
      }),
    []
  );

  useEffect(() => {
    let cancelled = false;
    const assetIds = collectBackgroundAssetIds(activeAppearance);
    void Promise.all(
      assetIds.map(async (assetId) => [assetId, await loadBackgroundAsset(assetId)] as const)
    ).then((entries) => {
      if (cancelled) return;
      setBackgroundImages(
        Object.fromEntries(
          entries
            .filter((entry) => Boolean(entry[1]?.dataUrl))
            .map(([id, asset]) => [id, asset?.dataUrl as string])
        )
      );
    });
    return () => {
      cancelled = true;
    };
  }, [activeAppearance]);

  const beginAppearancePreview = useCallback(
    (scene?: AppearanceSceneId) => {
      setDraftAppearance((current) => current ?? cloneAppearance(committedAppearance));
      if (scene) setPreviewScene(scene);
    },
    [committedAppearance]
  );

  const updateAppearanceDraft = useCallback(
    (path: readonly string[], value: unknown) => {
      if (!isValidDraftValue(path, value)) return;
      setDraftAppearance((current) => setAtPath(current ?? committedAppearance, path, value));
    },
    [committedAppearance]
  );

  const resetAppearance = useCallback(
    (scope: ResetScope) => {
      setDraftAppearance((current) => {
        const base = current ?? committedAppearance;
        switch (scope.type) {
          case "property":
            return setAtPath(base, scope.path, undefined);
          case "component":
            return setAtPath(
              base,
              ["scenes", scope.scene, "components", scope.componentId],
              undefined
            );
          case "scene":
            return setAtPath(
              base,
              ["scenes", scope.scene],
              createDefaultAppearance().scenes[scope.scene]
            );
          case "global":
            return setAtPath(base, ["global"], createDefaultAppearance().global);
          case "all":
            return createDefaultAppearance();
        }
      });
    },
    [committedAppearance]
  );

  const commitAppearanceDraft = useCallback(() => {
    if (!draftAppearance) return;
    const normalized = normalizeAppearance(draftAppearance);
    replaceAppearanceSettings(normalized);
    setCommittedAppearance(normalized);
    setDraftAppearance(null);
    setPreviewScene(null);
  }, [draftAppearance]);

  const cancelAppearancePreview = useCallback(() => {
    setDraftAppearance(null);
    setPreviewScene(null);
  }, []);

  const resolveStyle = useCallback(
    (
      componentId: AppearanceComponentId,
      slot: string,
      kind?: AppearanceSlotKind,
      options?: { state?: string; instanceId?: string }
    ) => {
      const definition = findAppearanceComponent(componentId);
      const slotKind = kind ?? definition.slots.find((item) => item.id === slot)?.kind ?? "text";
      return appearanceStyleToCss(
        resolveAppearanceStyle(
          activeAppearance,
          definition.scene,
          componentId,
          slot,
          slotKind,
          options
        )
      );
    },
    [activeAppearance]
  );

  const getBackgroundImage = useCallback(
    (scene: AppearanceSceneId) => {
      const background = resolveAppearanceBackground(activeAppearance, scene);
      if (background.type !== "image") return undefined;
      return background.assetId ? backgroundImages[background.assetId] : background.imageDataUrl;
    },
    [activeAppearance, backgroundImages]
  );

  const resolveBackground = useCallback(
    (scene: AppearanceSceneId) => resolveAppearanceBackground(activeAppearance, scene),
    [activeAppearance]
  );

  const value = useMemo<AppearanceContextValue>(
    () => ({
      committedAppearance,
      draftAppearance,
      activeAppearance,
      previewScene,
      isPreviewing,
      beginAppearancePreview,
      setPreviewScene,
      updateAppearanceDraft,
      resetAppearance,
      commitAppearanceDraft,
      cancelAppearancePreview,
      resolveStyle,
      getBackgroundImage,
      resolveBackground,
    }),
    [
      committedAppearance,
      draftAppearance,
      activeAppearance,
      previewScene,
      isPreviewing,
      beginAppearancePreview,
      updateAppearanceDraft,
      resetAppearance,
      commitAppearanceDraft,
      cancelAppearancePreview,
      resolveStyle,
      getBackgroundImage,
      resolveBackground,
    ]
  );

  return <AppearanceContext.Provider value={value}>{children}</AppearanceContext.Provider>;
}

export function useAppearance(): AppearanceContextValue {
  const context = useContext(AppearanceContext);
  if (!context) throw new Error("useAppearance must be used within AppearanceProvider");
  return context;
}

export function useComponentAppearance(
  componentId: AppearanceComponentId,
  slot: string,
  options?: { kind?: AppearanceSlotKind; state?: string; instanceId?: string }
): CSSProperties {
  const { resolveStyle } = useAppearance();
  return resolveStyle(componentId, slot, options?.kind, options);
}
