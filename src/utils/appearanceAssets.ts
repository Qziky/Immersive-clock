import type { AppearanceBundleV2 } from "../types/appearance";

import { appearanceAssetDb, appearanceAssetMetadataDb, db } from "./db";

type FontFormat = "truetype" | "opentype" | "woff" | "woff2";

interface StoredFontAsset {
  id: string;
  family: string;
  dataUrl: string;
  format: FontFormat;
  contentHash?: string;
}

export interface AppearanceAsset {
  id: string;
  kind: "background";
  name: string;
  mimeType: string;
  dataUrl: string;
  contentHash?: string;
}

export interface AppearanceBackgroundMetadata {
  id: string;
  kind: "background";
  name: string;
  mimeType: string;
  contentHash?: string;
}

export interface AppearanceFontMetadata {
  id: string;
  kind: "font";
  name: string;
  mimeType: string;
  family: string;
  format: FontFormat;
  contentHash?: string;
}

export type AppearanceAssetMetadata = AppearanceBackgroundMetadata | AppearanceFontMetadata;

export interface AppearanceAssetCatalog {
  backgrounds: AppearanceBackgroundMetadata[];
  fonts: AppearanceFontMetadata[];
}

export const APPEARANCE_ASSETS_CHANGED_EVENT = "appearance-assets-changed";

let appearanceAssetsRevision = 0;
const appearanceAssetsListeners = new Set<(revision: number) => void>();

export function getAppearanceAssetsRevision(): number {
  return appearanceAssetsRevision;
}

export function notifyAppearanceAssetsChanged(): number {
  appearanceAssetsRevision += 1;
  for (const listener of appearanceAssetsListeners) {
    try {
      listener(appearanceAssetsRevision);
    } catch {
      // A catalog observer must not interrupt the storage mutation that triggered it.
    }
  }
  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent(APPEARANCE_ASSETS_CHANGED_EVENT, {
        detail: { revision: appearanceAssetsRevision },
      })
    );
  }
  return appearanceAssetsRevision;
}

export function subscribeAppearanceAssetsChanged(listener: (revision: number) => void): () => void {
  appearanceAssetsListeners.add(listener);
  return () => appearanceAssetsListeners.delete(listener);
}

function toBackgroundMetadata(asset: AppearanceAsset): AppearanceBackgroundMetadata {
  return {
    id: asset.id,
    kind: "background",
    name: asset.name,
    mimeType: asset.mimeType,
    ...(asset.contentHash ? { contentHash: asset.contentHash } : {}),
  };
}

function toFontMetadata(font: StoredFontAsset): AppearanceFontMetadata {
  return {
    id: font.id,
    kind: "font",
    name: font.family,
    mimeType: `font/${font.format}`,
    family: font.family,
    format: font.format,
    ...(font.contentHash ? { contentHash: font.contentHash } : {}),
  };
}

function isAppearanceAssetMetadata(value: unknown): value is AppearanceAssetMetadata {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<AppearanceAssetMetadata>;
  if (
    typeof candidate.id !== "string" ||
    typeof candidate.name !== "string" ||
    typeof candidate.mimeType !== "string" ||
    (candidate.contentHash !== undefined && typeof candidate.contentHash !== "string")
  ) {
    return false;
  }
  if (candidate.kind === "background") return true;
  return (
    candidate.kind === "font" &&
    typeof candidate.family === "string" &&
    (candidate.format === "truetype" ||
      candidate.format === "opentype" ||
      candidate.format === "woff" ||
      candidate.format === "woff2")
  );
}

export async function hashAppearanceAssetContent(dataUrl: string): Promise<string> {
  const separator = dataUrl.indexOf(",");
  const content = separator >= 0 ? dataUrl.slice(separator + 1) : dataUrl;
  if (typeof crypto !== "undefined" && crypto.subtle) {
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(content));
    return Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, "0")).join(
      ""
    );
  }
  let first = 0x811c9dc5;
  let second = 0x9e3779b9;
  for (let index = 0; index < content.length; index += 1) {
    const code = content.charCodeAt(index);
    first = Math.imul(first ^ code, 0x01000193);
    second = Math.imul(second ^ code, 0x85ebca6b);
  }
  return `fallback-${content.length}-${(first >>> 0).toString(16)}-${(second >>> 0).toString(16)}`;
}

async function findDuplicateBackground(
  dataUrl: string,
  contentHash: string
): Promise<AppearanceAsset | undefined> {
  const catalog = await loadAppearanceAssetCatalog();
  for (const metadata of catalog.backgrounds) {
    if (
      metadata.contentHash &&
      metadata.contentHash !== contentHash &&
      !metadata.contentHash.startsWith("fast-")
    ) {
      continue;
    }
    const asset = await appearanceAssetDb.get<AppearanceAsset>(metadata.id);
    if (!asset) continue;
    if (asset.dataUrl !== dataUrl) continue;
    const withHash = asset.contentHash === contentHash ? asset : { ...asset, contentHash };
    if (asset.contentHash !== contentHash) {
      await Promise.all([
        appearanceAssetDb.set(asset.id, withHash),
        appearanceAssetMetadataDb.set(asset.id, toBackgroundMetadata(withHash)),
      ]);
    }
    return withHash;
  }
  return undefined;
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
  const contentHash = await hashAppearanceAssetContent(dataUrl);
  const existing = await findDuplicateBackground(dataUrl, contentHash);
  if (existing) return existing;
  const asset: AppearanceAsset = {
    id: `background_${Date.now()}_${crypto.randomUUID?.() ?? Math.random().toString(36).slice(2)}`,
    kind: "background",
    name: file.name,
    mimeType: file.type,
    dataUrl,
    contentHash,
  };
  await Promise.all([
    appearanceAssetDb.set(asset.id, asset),
    appearanceAssetMetadataDb.set(asset.id, toBackgroundMetadata(asset)),
  ]);
  notifyAppearanceAssetsChanged();
  return asset;
}

export async function saveLegacyBackgroundAsset(
  dataUrl: string,
  name = "迁移背景图片"
): Promise<AppearanceAsset> {
  const mimeType = /^data:([^;,]+)/.exec(dataUrl)?.[1] ?? "image/*";
  const contentHash = await hashAppearanceAssetContent(dataUrl);
  const existing = await findDuplicateBackground(dataUrl, contentHash);
  if (existing) return existing;
  const asset: AppearanceAsset = {
    id: `background_migrated_${Date.now()}_${Math.random().toString(36).slice(2)}`,
    kind: "background",
    name,
    mimeType,
    dataUrl,
    contentHash,
  };
  await Promise.all([
    appearanceAssetDb.set(asset.id, asset),
    appearanceAssetMetadataDb.set(asset.id, toBackgroundMetadata(asset)),
  ]);
  notifyAppearanceAssetsChanged();
  return asset;
}

export function loadBackgroundAsset(id: string): Promise<AppearanceAsset | undefined> {
  return appearanceAssetDb.get<AppearanceAsset>(id);
}

export function loadBackgroundAssets(): Promise<AppearanceAsset[]> {
  return appearanceAssetDb.getAll<AppearanceAsset>();
}

export async function loadAppearanceAssetCatalog(): Promise<AppearanceAssetCatalog> {
  const [storedMetadata, backgroundKeys, fontKeys] = await Promise.all([
    appearanceAssetMetadataDb.getAll<unknown>(),
    appearanceAssetDb.getAllKeys(),
    db.getAllKeys(),
  ]);
  const activeKinds = new Map<string, AppearanceAssetMetadata["kind"]>();
  backgroundKeys.forEach((key) => {
    if (typeof key === "string") activeKinds.set(key, "background");
  });
  fontKeys.forEach((key) => {
    if (typeof key === "string") activeKinds.set(key, "font");
  });

  const currentMetadata = storedMetadata.filter(
    (value): value is AppearanceAssetMetadata =>
      isAppearanceAssetMetadata(value) && activeKinds.get(value.id) === value.kind
  );
  const currentIds = new Set(currentMetadata.map((metadata) => metadata.id));
  const missingEntries = [...activeKinds].filter(([id]) => !currentIds.has(id));
  const recoveredMetadata = (
    await Promise.all(
      missingEntries.map(async ([id, kind]) => {
        if (kind === "background") {
          const asset = await appearanceAssetDb.get<AppearanceAsset>(id);
          return asset ? toBackgroundMetadata(asset) : null;
        }
        const font = await db.get<StoredFontAsset>(id);
        return font ? toFontMetadata(font) : null;
      })
    )
  ).filter((metadata): metadata is AppearanceAssetMetadata => metadata !== null);

  const staleIds = storedMetadata
    .filter(isAppearanceAssetMetadata)
    .filter((metadata) => activeKinds.get(metadata.id) !== metadata.kind)
    .map((metadata) => metadata.id);
  await Promise.all([
    ...recoveredMetadata.map((metadata) => appearanceAssetMetadataDb.set(metadata.id, metadata)),
    ...staleIds.map((id) => appearanceAssetMetadataDb.del(id)),
  ]);

  const metadata = [...currentMetadata, ...recoveredMetadata].sort((left, right) =>
    left.id.localeCompare(right.id)
  );
  return {
    backgrounds: metadata.filter(
      (value): value is AppearanceBackgroundMetadata => value.kind === "background"
    ),
    fonts: metadata.filter((value): value is AppearanceFontMetadata => value.kind === "font"),
  };
}

export async function loadBackgroundAssetMetadata(): Promise<AppearanceBackgroundMetadata[]> {
  return (await loadAppearanceAssetCatalog()).backgrounds;
}

export async function loadFontAssetMetadata(): Promise<AppearanceFontMetadata[]> {
  return (await loadAppearanceAssetCatalog()).fonts;
}

export async function removeAppearanceAsset(
  id: string,
  kind: AppearanceAssetMetadata["kind"]
): Promise<void> {
  await Promise.all([
    kind === "background" ? appearanceAssetDb.del(id) : db.del(id),
    appearanceAssetMetadataDb.del(id),
  ]);
  notifyAppearanceAssetsChanged();
}

export function removeBackgroundAsset(id: string): Promise<void> {
  return removeAppearanceAsset(id, "background");
}

export async function exportAppearanceAssets(): Promise<AppearanceBundleV2["assets"]> {
  const [backgrounds, fonts] = await Promise.all([
    appearanceAssetDb.getAll<AppearanceAsset>(),
    db.getAll<StoredFontAsset>(),
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

export async function importAppearanceAssets(
  assets: AppearanceBundleV2["assets"],
  contentHashes: Readonly<Record<string, string>> = {}
): Promise<void> {
  await Promise.all(
    assets.map(async (asset) => {
      if (!asset.id || !asset.dataUrl.startsWith("data:")) {
        throw new Error("设置包包含无效资源");
      }
      const contentHash =
        contentHashes[asset.id] ?? (await hashAppearanceAssetContent(asset.dataUrl));
      if (asset.kind === "background") {
        const background: AppearanceAsset = {
          id: asset.id,
          kind: "background",
          name: asset.name,
          mimeType: asset.mimeType,
          dataUrl: asset.dataUrl,
          contentHash,
        };
        return Promise.all([
          appearanceAssetDb.set<AppearanceAsset>(asset.id, background),
          appearanceAssetMetadataDb.set(asset.id, toBackgroundMetadata(background)),
        ]);
      }
      if (!asset.family || !asset.format) throw new Error("设置包包含无效字体资源");
      const font: StoredFontAsset = {
        id: asset.id,
        family: asset.family,
        dataUrl: asset.dataUrl,
        format: asset.format,
        contentHash,
      };
      return Promise.all([
        db.set<StoredFontAsset>(asset.id, font),
        appearanceAssetMetadataDb.set(asset.id, toFontMetadata(font)),
      ]);
    })
  );
  if (assets.length > 0) notifyAppearanceAssetsChanged();
}

export async function clearAppearanceAssets(): Promise<void> {
  await Promise.all([appearanceAssetDb.clear(), appearanceAssetMetadataDb.clear(), db.clear()]);
  notifyAppearanceAssetsChanged();
}
