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

export interface AppearanceVideoAsset {
  id: string;
  kind: "video";
  name: string;
  mimeType: "video/mp4" | "video/webm";
  blob: Blob;
  sizeBytes: number;
  contentHash?: string;
}

export interface AppearanceBackgroundMetadata {
  id: string;
  kind: "background";
  name: string;
  mimeType: string;
  sizeBytes?: number;
  contentHash?: string;
}

export interface AppearanceVideoMetadata {
  id: string;
  kind: "video";
  name: string;
  mimeType: "video/mp4" | "video/webm";
  sizeBytes: number;
  contentHash?: string;
}

export interface AppearanceFontMetadata {
  id: string;
  kind: "font";
  name: string;
  mimeType: string;
  family: string;
  format: FontFormat;
  sizeBytes?: number;
  contentHash?: string;
}

export type AppearanceAssetMetadata =
  | AppearanceBackgroundMetadata
  | AppearanceVideoMetadata
  | AppearanceFontMetadata;

export interface AppearanceAssetCatalog {
  backgrounds: AppearanceBackgroundMetadata[];
  videos: AppearanceVideoMetadata[];
  fonts: AppearanceFontMetadata[];
}

export const MAX_BACKGROUND_VIDEO_BYTES = 200 * 1024 * 1024;

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
    sizeBytes: Math.max(
      0,
      Math.floor((asset.dataUrl.length - (asset.dataUrl.indexOf(",") + 1)) * 0.75)
    ),
    ...(asset.contentHash ? { contentHash: asset.contentHash } : {}),
  };
}

function toVideoMetadata(asset: AppearanceVideoAsset): AppearanceVideoMetadata {
  return {
    id: asset.id,
    kind: "video",
    name: asset.name,
    mimeType: asset.mimeType,
    sizeBytes: asset.sizeBytes,
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
    sizeBytes: Math.max(
      0,
      Math.floor((font.dataUrl.length - (font.dataUrl.indexOf(",") + 1)) * 0.75)
    ),
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
  if (
    candidate.kind === "video" &&
    (candidate.mimeType === "video/mp4" || candidate.mimeType === "video/webm") &&
    typeof candidate.sizeBytes === "number" &&
    Number.isFinite(candidate.sizeBytes) &&
    candidate.sizeBytes >= 0
  ) {
    return true;
  }
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

export async function saveVideoBackgroundAsset(file: File): Promise<AppearanceVideoAsset> {
  const extension = /\.([^.]+)$/.exec(file.name)?.[1]?.toLowerCase();
  const mimeType = file.type.toLowerCase().split(";")[0];
  const resolvedMimeType =
    mimeType === "video/mp4" || mimeType === "video/webm"
      ? mimeType
      : !mimeType && extension === "mp4"
        ? "video/mp4"
        : !mimeType && extension === "webm"
          ? "video/webm"
          : "";
  if (!resolvedMimeType) throw new Error("请选择 MP4 或 WebM 视频文件");
  if (file.size > MAX_BACKGROUND_VIDEO_BYTES) throw new Error("动态背景视频不能超过 200MB");
  const asset: AppearanceVideoAsset = {
    id: `video_${Date.now()}_${crypto.randomUUID?.() ?? Math.random().toString(36).slice(2)}`,
    kind: "video",
    name: file.name,
    mimeType: resolvedMimeType,
    blob: file.slice(0, file.size, resolvedMimeType),
    sizeBytes: file.size,
  };
  await Promise.all([
    appearanceAssetDb.set(asset.id, asset),
    appearanceAssetMetadataDb.set(asset.id, toVideoMetadata(asset)),
  ]);
  notifyAppearanceAssetsChanged();
  return asset;
}

export function loadVideoBackgroundAsset(id: string): Promise<AppearanceVideoAsset | undefined> {
  return appearanceAssetDb.get<AppearanceVideoAsset>(id);
}

function blobToDataUrl(blob: Blob, mimeType: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error("读取视频资源失败"));
    reader.readAsDataURL(new Blob([blob], { type: mimeType }));
  });
}

function dataUrlToVideoBlob(dataUrl: string, mimeType: string): Blob {
  const separator = dataUrl.indexOf(",");
  if (separator < 0 || !dataUrl.slice(0, separator).includes(";base64")) {
    throw new Error("设置包包含无效视频资源");
  }
  const encoded = dataUrl.slice(separator + 1);
  const parts: Uint8Array[] = [];
  const chunkSize = 1024 * 1024;
  for (let offset = 0; offset < encoded.length; offset += chunkSize) {
    const limit = Math.min(encoded.length, offset + chunkSize);
    const chunkEnd = limit === encoded.length ? limit : limit - ((limit - offset) % 4);
    const decoded = atob(encoded.slice(offset, chunkEnd));
    const bytes = new Uint8Array(decoded.length);
    for (let index = 0; index < decoded.length; index += 1)
      bytes[index] = decoded.charCodeAt(index);
    parts.push(bytes);
  }
  return new Blob(
    parts.map(
      (part) => part.buffer.slice(part.byteOffset, part.byteOffset + part.byteLength) as ArrayBuffer
    ),
    { type: mimeType }
  );
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
  const storedKinds = new Map<string, AppearanceAssetMetadata["kind"]>();
  storedMetadata.filter(isAppearanceAssetMetadata).forEach((metadata) => {
    storedKinds.set(metadata.id, metadata.kind);
  });
  const activeKinds = new Map<string, AppearanceAssetMetadata["kind"]>();
  backgroundKeys.forEach((key) => {
    if (typeof key === "string") {
      activeKinds.set(
        key,
        storedKinds.get(key) === "video" ||
          key.startsWith("video_") ||
          key.startsWith("restored:video:")
          ? "video"
          : "background"
      );
    }
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
          const asset = await appearanceAssetDb.get<AppearanceAsset | AppearanceVideoAsset>(id);
          if (asset?.kind === "video" && asset.blob instanceof Blob) return toVideoMetadata(asset);
          return asset?.kind === "background" ? toBackgroundMetadata(asset) : null;
        }
        if (kind === "video") {
          const asset = await appearanceAssetDb.get<AppearanceVideoAsset>(id);
          return asset?.blob instanceof Blob ? toVideoMetadata(asset) : null;
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
    videos: metadata.filter((value): value is AppearanceVideoMetadata => value.kind === "video"),
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
    kind === "font" ? db.del(id) : appearanceAssetDb.del(id),
    appearanceAssetMetadataDb.del(id),
  ]);
  notifyAppearanceAssetsChanged();
}

export function removeBackgroundAsset(id: string): Promise<void> {
  return removeAppearanceAsset(id, "background");
}

export async function exportAppearanceAssets(): Promise<AppearanceBundleV2["assets"]> {
  const [backgrounds, fonts] = await Promise.all([
    appearanceAssetDb.getAll<AppearanceAsset | AppearanceVideoAsset>(),
    db.getAll<StoredFontAsset>(),
  ]);
  return [
    ...backgrounds
      .filter((asset): asset is AppearanceAsset => asset.kind === "background")
      .map((asset) => ({
        id: asset.id,
        kind: "background" as const,
        name: asset.name,
        mimeType: asset.mimeType,
        dataUrl: asset.dataUrl,
      })),
    ...(await Promise.all(
      backgrounds
        .filter((asset): asset is AppearanceVideoAsset => asset.kind === "video")
        .map(async (asset) => ({
          id: asset.id,
          kind: "video" as const,
          name: asset.name,
          mimeType: asset.mimeType,
          sizeBytes: asset.sizeBytes,
          dataUrl: await blobToDataUrl(asset.blob, asset.mimeType),
        }))
    )),
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

export async function exportAppearanceAssetsForBackup(): Promise<{
  assets: AppearanceBundleV2["assets"];
  videoBlobs: Record<string, Blob>;
}> {
  const [stored, fonts] = await Promise.all([
    appearanceAssetDb.getAll<AppearanceAsset | AppearanceVideoAsset>(),
    db.getAll<StoredFontAsset>(),
  ]);
  const videoBlobs: Record<string, Blob> = {};
  const assets: AppearanceBundleV2["assets"] = [
    ...stored
      .filter((asset): asset is AppearanceAsset => asset.kind === "background")
      .map((asset) => ({
        id: asset.id,
        kind: "background" as const,
        name: asset.name,
        mimeType: asset.mimeType,
        dataUrl: asset.dataUrl,
      })),
    ...stored
      .filter((asset): asset is AppearanceVideoAsset => asset.kind === "video")
      .map((asset) => {
        videoBlobs[asset.id] = asset.blob;
        return {
          id: asset.id,
          kind: "video" as const,
          name: asset.name,
          mimeType: asset.mimeType,
          sizeBytes: asset.sizeBytes,
          dataUrl: `data:${asset.mimeType};base64,`,
        };
      }),
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
  return { assets, videoBlobs };
}

export async function importAppearanceAssets(
  assets: AppearanceBundleV2["assets"],
  contentHashes: Readonly<Record<string, string>> = {},
  videoBlobs: Readonly<Record<string, Blob>> = {}
): Promise<void> {
  await Promise.all(
    assets.map(async (asset) => {
      if (!asset.id || !asset.dataUrl.startsWith("data:")) {
        throw new Error("设置包包含无效资源");
      }
      const contentHash =
        asset.kind === "video"
          ? contentHashes[asset.id]
          : (contentHashes[asset.id] ?? (await hashAppearanceAssetContent(asset.dataUrl)));
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
      if (asset.kind === "video") {
        if (
          (asset.mimeType !== "video/mp4" && asset.mimeType !== "video/webm") ||
          asset.dataUrl.length > MAX_BACKGROUND_VIDEO_BYTES * 1.38 + 128
        ) {
          throw new Error("设置包视频资源无效或超过 200MB");
        }
        const blob = videoBlobs[asset.id] ?? dataUrlToVideoBlob(asset.dataUrl, asset.mimeType);
        if (blob.size > MAX_BACKGROUND_VIDEO_BYTES) throw new Error("动态背景视频不能超过 200MB");
        const video: AppearanceVideoAsset = {
          id: asset.id,
          kind: "video",
          name: asset.name,
          mimeType: asset.mimeType,
          blob,
          sizeBytes: blob.size,
          ...(contentHashes[asset.id] ? { contentHash: contentHashes[asset.id] } : {}),
        };
        return Promise.all([
          appearanceAssetDb.set<AppearanceVideoAsset>(asset.id, video),
          appearanceAssetMetadataDb.set(asset.id, toVideoMetadata(video)),
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
