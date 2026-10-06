interface WriteBackupRequest {
  id: number;
  value: unknown;
  videoBlobs: Record<string, Blob>;
}

type WriteBackupResponse =
  | { id: number; ok: true; file: Blob }
  | { id: number; ok: false; error: string };

const MAX_FILE_BYTES = 450 * 1024 * 1024;
const MAX_VIDEO_BYTES = 200 * 1024 * 1024;
const VIDEO_TYPES = new Set(["video/mp4", "video/webm"]);
const output: BlobPart[] = [];
let pendingBase64: string[] = [];
let pendingCharacters = 0;

function append(value: string): void {
  output.push(value);
}

function flushBase64(): void {
  if (pendingBase64.length === 0) return;
  output.push(pendingBase64.join(""));
  pendingBase64 = [];
  pendingCharacters = 0;
}

function base64FromBytes(bytes: Uint8Array<ArrayBuffer>): string {
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 8192) {
    binary += String.fromCharCode(...bytes.subarray(offset, Math.min(bytes.length, offset + 8192)));
  }
  return btoa(binary);
}

async function appendBlobAsBase64(blob: Blob): Promise<void> {
  const reader = blob.stream().getReader();
  let carry = new Uint8Array(new ArrayBuffer(0));
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const combined = new Uint8Array(new ArrayBuffer(carry.length + value.length));
      combined.set(carry);
      combined.set(value, carry.length);
      const completeLength = combined.length - (combined.length % 3);
      if (completeLength > 0) {
        pendingBase64.push(base64FromBytes(combined.slice(0, completeLength)));
        pendingCharacters += Math.floor(completeLength / 3) * 4;
        if (pendingCharacters >= 1024 * 1024) flushBase64();
      }
      carry = combined.slice(completeLength);
    }
    if (carry.length > 0) pendingBase64.push(base64FromBytes(carry));
    flushBase64();
  } finally {
    reader.releaseLock();
  }
}

async function writeJson(
  value: unknown,
  videoBlobs: Readonly<Record<string, Blob>>
): Promise<void> {
  if (value === null || typeof value !== "object") {
    append(JSON.stringify(value) ?? "null");
    return;
  }
  if (Array.isArray(value)) {
    append("[");
    for (let index = 0; index < value.length; index += 1) {
      if (index > 0) append(",");
      await writeJson(value[index], videoBlobs);
    }
    append("]");
    return;
  }

  const record = value as Record<string, unknown>;
  const video = record.kind === "video" && typeof record.id === "string";
  const blob = video ? videoBlobs[record.id as string] : undefined;
  if (video) {
    if (!blob || typeof record.mimeType !== "string" || !VIDEO_TYPES.has(record.mimeType)) {
      throw new Error("备份缺少有效的视频数据");
    }
    if (blob.size > MAX_VIDEO_BYTES) throw new Error("单个备份视频不能超过 200MB");
    if (record.sizeBytes !== blob.size) throw new Error("备份视频大小校验失败");
  }

  append("{");
  let first = true;
  for (const [key, child] of Object.entries(record)) {
    if (!first) append(",");
    first = false;
    append(`${JSON.stringify(key)}:`);
    if (video && key === "dataUrl") {
      append(JSON.stringify(`data:${String(record.mimeType)};base64,`).slice(0, -1));
      await appendBlobAsBase64(blob!);
      append('"');
    } else {
      await writeJson(child, videoBlobs);
    }
  }
  append("}");
}

const workerScope = self as unknown as {
  onmessage: ((event: MessageEvent<WriteBackupRequest>) => void) | null;
  postMessage(message: WriteBackupResponse): void;
};

workerScope.onmessage = (event) => {
  const { id, value, videoBlobs } = event.data;
  output.length = 0;
  pendingBase64 = [];
  pendingCharacters = 0;
  void writeJson(value, videoBlobs)
    .then(() => {
      const file = new Blob(output, { type: "application/json;charset=utf-8" });
      if (file.size > MAX_FILE_BYTES) throw new Error("备份文件不能超过 450MB");
      workerScope.postMessage({ id, ok: true, file });
    })
    .catch((error: unknown) => {
      workerScope.postMessage({
        id,
        ok: false,
        error: error instanceof Error ? error.message : "备份文件生成失败",
      });
    });
};

export {};
