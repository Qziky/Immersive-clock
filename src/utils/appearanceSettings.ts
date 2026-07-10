import type { AppearanceBundleV2, AppearanceSceneId } from "../types/appearance";

import {
  exportAppearanceAssets,
  importAppearanceAssets,
  saveLegacyBackgroundAsset,
} from "./appearanceAssets";
import { normalizeAppearance } from "./appearanceModel";
import { APP_SETTINGS_KEY, getAppSettings, replaceAppearanceSettings } from "./appSettings";
import { ensureInjectedFonts } from "./studyFontStorage";

export async function migrateAppearanceAssets(): Promise<void> {
  const settings = getAppSettings();
  const appearance = structuredClone(settings.appearance);
  let changed = false;
  const globalBackground = appearance.global.background;
  if (
    globalBackground.type === "image" &&
    globalBackground.imageDataUrl &&
    !globalBackground.assetId
  ) {
    const asset = await saveLegacyBackgroundAsset(
      globalBackground.imageDataUrl,
      globalBackground.imageFileName ?? "global-background"
    );
    appearance.global.background = {
      type: "image",
      assetId: asset.id,
      imageFileName: asset.name,
    };
    changed = true;
  }
  for (const sceneId of Object.keys(appearance.scenes) as AppearanceSceneId[]) {
    const background = appearance.scenes[sceneId].background;
    if (background.type !== "image" || !background.imageDataUrl || background.assetId) continue;
    const asset = await saveLegacyBackgroundAsset(
      background.imageDataUrl,
      background.imageFileName ?? `${sceneId}-background`
    );
    appearance.scenes[sceneId].background = {
      type: "image",
      assetId: asset.id,
      imageFileName: asset.name,
    };
    changed = true;
  }
  if (changed) replaceAppearanceSettings(appearance);
}

export async function initializeAppearanceResources(): Promise<void> {
  await migrateAppearanceAssets();
  await ensureInjectedFonts();
}

export async function exportSettingsBundle(): Promise<AppearanceBundleV2> {
  const [settings, assets] = await Promise.all([getAppSettings(), exportAppearanceAssets()]);
  return {
    format: "immersive-clock-settings",
    version: 2,
    settings,
    assets,
  };
}

export async function importSettingsBundle(value: unknown): Promise<void> {
  if (!value || typeof value !== "object") throw new Error("无效的设置文件格式");
  const candidate = value as Partial<AppearanceBundleV2> & Record<string, unknown>;
  if (candidate.format === "immersive-clock-settings") {
    if (candidate.version !== 2 || !candidate.settings || !Array.isArray(candidate.assets)) {
      throw new Error("不支持的设置包版本");
    }
    const rawSettings = candidate.settings as Record<string, unknown>;
    if (typeof rawSettings.version === "number" && rawSettings.version > 2) {
      throw new Error("设置包由更高版本应用生成");
    }
    await importAppearanceAssets(candidate.assets);
    localStorage.setItem(
      APP_SETTINGS_KEY,
      JSON.stringify({
        ...rawSettings,
        version: 2,
        appearance: normalizeAppearance(rawSettings.appearance),
      })
    );
    return;
  }

  // Backward-compatible import for the previous plain AppSettings export.
  localStorage.setItem(APP_SETTINGS_KEY, JSON.stringify(candidate));
}
