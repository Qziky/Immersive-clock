import type { AppearanceBundleV2 } from "../types/appearance";

import { appearanceAssetDb, db } from "./db";
import type { ImportedFontMeta } from "./studyFontStorage";

export interface AppearanceAsset {
  id: string;
  kind: "background";
  name: string;
  mimeType: string;
  dataUrl: string;
}

export async function saveBackgroundAsset(file: File): Promise<AppearanceAsset> {
  if (!file.type.startsWith("image/")) throw new Error("请选择有效的图片文件");
  if (file.size > 20 * 1024 * 1024) throw new Error("背景图片不能超过 20MB");
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error("读取背景图片失败"));
    reader.readAsDataURL(file);
  });
  const asset: AppearanceAsset = {
    id: `background_${Date.now()}_${crypto.randomUUID?.() ?? Math.random().toString(36).slice(2)}`,
    kind: "background",
    name: file.name,
    mimeType: file.type,
    dataUrl,
  };
  await appearanceAssetDb.set(asset.id, asset);
  return asset;
}

export async function saveLegacyBackgroundAsset(
  dataUrl: string,
  name = "迁移背景图片"
): Promise<AppearanceAsset> {
  const mimeType = /^data:([^;,]+)/.exec(dataUrl)?.[1] ?? "image/*";
  const asset: AppearanceAsset = {
    id: `background_migrated_${Date.now()}_${Math.random().toString(36).slice(2)}`,
    kind: "background",
    name,
    mimeType,
    dataUrl,
  };
  await appearanceAssetDb.set(asset.id, asset);
  return asset;
}

export function loadBackgroundAsset(id: string): Promise<AppearanceAsset | undefined> {
  return appearanceAssetDb.get<AppearanceAsset>(id);
}

export async function exportAppearanceAssets(): Promise<AppearanceBundleV2["assets"]> {
  const [backgrounds, fonts] = await Promise.all([
    appearanceAssetDb.getAll<AppearanceAsset>(),
    db.getAll<ImportedFontMeta>(),
  ]);
  return [
    ...backgrounds.map((asset) => ({
      id: asset.id,
      kind: "background" as const,
      name: asset.name,
      mimeType: asset.mimeType,
      dataUrl: asset.dataUrl,
    })),
    ...fonts.map((font) => ({
      id: font.id,
      kind: "font" as const,
      name: font.family,
      mimeType: `font/${font.format}`,
      dataUrl: font.dataUrl,
      family: font.family,
      format: font.format,
    })),
  ];
}

export async function importAppearanceAssets(assets: AppearanceBundleV2["assets"]): Promise<void> {
  await Promise.all(
    assets.map((asset) => {
      if (!asset.id || !asset.dataUrl.startsWith("data:")) {
        throw new Error("设置包包含无效资源");
      }
      if (asset.kind === "background") {
        return appearanceAssetDb.set<AppearanceAsset>(asset.id, {
          id: asset.id,
          kind: "background",
          name: asset.name,
          mimeType: asset.mimeType,
          dataUrl: asset.dataUrl,
        });
      }
      if (!asset.family || !asset.format) throw new Error("设置包包含无效字体资源");
      return db.set<ImportedFontMeta>(asset.id, {
        id: asset.id,
        family: asset.family,
        dataUrl: asset.dataUrl,
        format: asset.format,
      });
    })
  );
}

export async function clearAppearanceAssets(): Promise<void> {
  await Promise.all([appearanceAssetDb.clear(), db.clear()]);
}
