interface ParseBackupRequest {
  id: number;
  file: Blob;
}

type ParseBackupResponse =
  | {
      id: number;
      ok: true;
      value: unknown;
      resourceFingerprints: Record<string, string>;
      videoBlobs: Record<string, Blob>;
    }
  | {
      id: number;
      ok: false;
      code: "INVALID_BACKUP" | "INVALID_RESOURCE" | "BACKUP_TOO_LARGE";
      error: string;
    };

const MAX_BACKUP_BYTES = 450 * 1024 * 1024;
const MAX_TOTAL_ASSET_BYTES = 300 * 1024 * 1024;
const MAX_BACKGROUND_BYTES = 20 * 1024 * 1024;
const MAX_VIDEO_BYTES = 200 * 1024 * 1024;
const MAX_FONT_BYTES = 50 * 1024 * 1024;
const BACKGROUND_MIME_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "image/avif",
  "image/bmp",
]);
const VIDEO_MIME_TYPES = new Set(["video/mp4", "video/webm"]);
const FONT_MIME_TYPES = new Set([
  "font/ttf",
  "font/otf",
  "font/woff",
  "font/woff2",
  "font/truetype",
  "font/opentype",
  "application/font-woff",
  "application/font-woff2",
  "application/x-font-ttf",
  "application/x-font-opentype",
  "application/octet-stream",
]);

class WorkerValidationError extends Error {
  constructor(
    public readonly code: "INVALID_BACKUP" | "INVALID_RESOURCE" | "BACKUP_TOO_LARGE",
    message: string
  ) {
    super(message);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseDataUrl(dataUrl: string): { mimeType: string; bytes: number; payload: string } {
  const match = /^data:([^;,]+);base64,([A-Za-z0-9+/]*={0,2})$/i.exec(dataUrl);
  if (!match || match[2].length % 4 !== 0) {
    throw new WorkerValidationError("INVALID_RESOURCE", "资源必须使用有效的 base64 Data URL");
  }
  const payload = match[2];
  const padding = payload.endsWith("==") ? 2 : payload.endsWith("=") ? 1 : 0;
  return {
    mimeType: match[1].toLowerCase(),
    bytes: Math.max(0, (payload.length / 4) * 3 - padding),
    payload,
  };
}

function fingerprintContent(value: string): string {
  let first = 0x811c9dc5;
  let second = 0x9e3779b9;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    first = Math.imul(first ^ code, 0x01000193);
    second = Math.imul(second ^ code, 0x85ebca6b);
  }
  return `fast-${value.length}-${(first >>> 0).toString(16)}-${(second >>> 0).toString(16)}`;
}

function base64ToBlob(value: string, mimeType: string): Blob {
  const chunks: BlobPart[] = [];
  const chunkSize = 1024 * 1024;
  for (let offset = 0; offset < value.length; offset += chunkSize) {
    const binary = atob(value.slice(offset, Math.min(value.length, offset + chunkSize)));
    const bytes = new Uint8Array(new ArrayBuffer(binary.length));
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    chunks.push(bytes);
  }
  return new Blob(chunks, { type: mimeType });
}

async function fingerprintBlob(blob: Blob): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", await blob.arrayBuffer());
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function getBackupAssets(value: unknown): unknown | undefined {
  if (!isRecord(value)) return undefined;
  if (value.format === "immersive-clock-backup") {
    const domains = isRecord(value.domains) ? value.domains : null;
    const assets = domains && isRecord(domains.assets) ? domains.assets : null;
    return assets?.data;
  }
  if (value.format === "immersive-clock-settings") return value.assets;
  return undefined;
}

function validateInlineImages(value: unknown): void {
  const queue: unknown[] = [value];
  while (queue.length > 0) {
    const candidate = queue.pop();
    if (Array.isArray(candidate)) {
      queue.push(...candidate);
      continue;
    }
    if (!isRecord(candidate)) continue;
    for (const [key, child] of Object.entries(candidate)) {
      if (key === "imageDataUrl" && typeof child === "string" && child) {
        const parsed = parseDataUrl(child);
        if (!BACKGROUND_MIME_TYPES.has(parsed.mimeType)) {
          throw new WorkerValidationError("INVALID_RESOURCE", "设置包含不受支持的内嵌背景格式");
        }
        if (parsed.bytes > MAX_BACKGROUND_BYTES) {
          throw new WorkerValidationError("INVALID_RESOURCE", "设置中的内嵌背景超过 20MB");
        }
      }
      if (typeof child === "object" && child !== null) queue.push(child);
    }
  }
}

async function validateAndHashResources(
  value: unknown
): Promise<{ fingerprints: Record<string, string>; videoBlobs: Record<string, Blob> }> {
  validateInlineImages(value);
  const rawAssets = getBackupAssets(value);
  if (rawAssets === undefined) return { fingerprints: {}, videoBlobs: {} };
  if (!Array.isArray(rawAssets)) {
    throw new WorkerValidationError("INVALID_RESOURCE", "备份的资源域不是数组");
  }

  const fingerprints: Record<string, string> = {};
  const videoBlobs: Record<string, Blob> = {};
  const ids = new Set<string>();
  let totalBytes = 0;
  let encodedLengthDelta = 0;
  for (const candidate of rawAssets) {
    if (!isRecord(candidate)) {
      throw new WorkerValidationError("INVALID_RESOURCE", "备份包含无效资源记录");
    }
    const { id, kind, name, mimeType, dataUrl } = candidate;
    if (
      typeof id !== "string" ||
      !/^[A-Za-z0-9._:-]{1,160}$/.test(id) ||
      (kind !== "background" && kind !== "video" && kind !== "font") ||
      typeof name !== "string" ||
      !name.trim() ||
      name.length > 255 ||
      typeof mimeType !== "string" ||
      typeof dataUrl !== "string"
    ) {
      throw new WorkerValidationError("INVALID_RESOURCE", "备份包含字段不完整的资源");
    }
    if (ids.has(id)) {
      throw new WorkerValidationError("INVALID_RESOURCE", `资源 ID 重复：${id}`);
    }
    ids.add(id);

    const parsed = parseDataUrl(dataUrl);
    if (kind === "background") {
      if (
        !BACKGROUND_MIME_TYPES.has(parsed.mimeType) ||
        (mimeType !== "image/*" && !BACKGROUND_MIME_TYPES.has(mimeType.toLowerCase()))
      ) {
        throw new WorkerValidationError("INVALID_RESOURCE", `背景 ${name} 的 MIME 类型不受支持`);
      }
      if (parsed.bytes > MAX_BACKGROUND_BYTES) {
        throw new WorkerValidationError("INVALID_RESOURCE", `背景 ${name} 超过 20MB`);
      }
      fingerprints[id] = fingerprintContent(parsed.payload);
    } else if (kind === "video") {
      if (!VIDEO_MIME_TYPES.has(parsed.mimeType) || mimeType.toLowerCase() !== parsed.mimeType) {
        throw new WorkerValidationError("INVALID_RESOURCE", `视频 ${name} 的 MIME 类型不受支持`);
      }
      if (parsed.bytes > MAX_VIDEO_BYTES) {
        throw new WorkerValidationError("INVALID_RESOURCE", `视频 ${name} 超过 200MB`);
      }
      if (candidate.sizeBytes !== undefined && candidate.sizeBytes !== parsed.bytes) {
        throw new WorkerValidationError("INVALID_RESOURCE", `视频 ${name} 的资源大小校验失败`);
      }
      const blob = base64ToBlob(parsed.payload, parsed.mimeType);
      if (blob.size !== parsed.bytes) {
        throw new WorkerValidationError("INVALID_RESOURCE", `视频 ${name} 解码大小不匹配`);
      }
      videoBlobs[id] = blob;
      fingerprints[id] = await fingerprintBlob(blob);
      const placeholder = `data:${parsed.mimeType};base64,`;
      encodedLengthDelta += placeholder.length - dataUrl.length;
      candidate.dataUrl = placeholder;
      candidate.sizeBytes = blob.size;
    } else {
      const family = candidate.family;
      const format = candidate.format;
      if (
        typeof family !== "string" ||
        !family.trim() ||
        family.length > 128 ||
        (format !== "truetype" &&
          format !== "opentype" &&
          format !== "woff" &&
          format !== "woff2") ||
        !FONT_MIME_TYPES.has(parsed.mimeType) ||
        !FONT_MIME_TYPES.has(mimeType.toLowerCase())
      ) {
        throw new WorkerValidationError(
          "INVALID_RESOURCE",
          `字体 ${name} 的元数据或 MIME 类型无效`
        );
      }
      if (parsed.bytes > MAX_FONT_BYTES) {
        throw new WorkerValidationError("INVALID_RESOURCE", `字体 ${name} 超过 50MB`);
      }
      fingerprints[id] = fingerprintContent(parsed.payload);
    }
    totalBytes += parsed.bytes;
  }
  if (totalBytes > MAX_TOTAL_ASSET_BYTES) {
    throw new WorkerValidationError("INVALID_RESOURCE", "备份资源总大小超过 300MB");
  }
  if (encodedLengthDelta && isRecord(value) && value.format === "immersive-clock-backup") {
    if (Array.isArray(value.manifest)) {
      const assetsEntry = value.manifest.find(
        (entry): entry is Record<string, unknown> => isRecord(entry) && entry.id === "assets"
      );
      if (assetsEntry && typeof assetsEntry.bytes === "number") {
        assetsEntry.bytes += encodedLengthDelta;
      }
    }
  }
  return { fingerprints, videoBlobs };
}

const workerScope = self as unknown as {
  onmessage: ((event: MessageEvent<ParseBackupRequest>) => void) | null;
  postMessage(message: ParseBackupResponse): void;
};

workerScope.onmessage = (event) => {
  const { id, file } = event.data;
  if (file.size > MAX_BACKUP_BYTES) {
    workerScope.postMessage({
      id,
      ok: false,
      code: "BACKUP_TOO_LARGE",
      error: "备份文件不能超过 450MB",
    });
    return;
  }
  void file
    .text()
    .then(async (text) => {
      let value: unknown;
      try {
        value = JSON.parse(text) as unknown;
      } catch {
        throw new WorkerValidationError("INVALID_BACKUP", "备份文件不是有效 JSON");
      }
      const { fingerprints: resourceFingerprints, videoBlobs } =
        await validateAndHashResources(value);
      workerScope.postMessage({ id, ok: true, value, resourceFingerprints, videoBlobs });
    })
    .catch((error: unknown) => {
      const code = error instanceof WorkerValidationError ? error.code : "INVALID_BACKUP";
      workerScope.postMessage({
        id,
        ok: false,
        code,
        error: error instanceof Error ? error.message : "备份文件预检失败",
      });
    });
};

export {};
