import type { NoiseCaptureSession, NoiseFeatureChunk } from "../../types/noise";
import { noiseCaptureSessionDb, noiseFeatureChunkDb, putNoiseArchiveData } from "../../utils/db";

import { listNoiseCaptureSessions, listNoiseFeatureChunks } from "./noiseFeatureRepository";
import { withNoiseHistoryWriteLock } from "./noiseHistoryLock";
import { scheduleNoiseRescore } from "./noiseRescoreService";

const MAGIC = "ICNOISE1";
const FORMAT = "immersive-clock-noise-features";
const COLUMN_NAMES = [
  "sequenceOffsets",
  "startSampleOffsets",
  "rmsDbfs",
  "aWeightedDbfs",
  "sampleP01Dbfs",
  "zeroRatio",
  "clippedRatio",
] as const;

type ColumnName = (typeof COLUMN_NAMES)[number];

interface ArchiveChunkMetadata extends Omit<NoiseFeatureChunk, ColumnName> {
  byteOffset: number;
  byteLengths: Record<ColumnName, number>;
}

interface NoiseFeatureArchiveHeader {
  format: typeof FORMAT;
  version: 1;
  exportedAt: string;
  sessions: NoiseCaptureSession[];
  chunks: ArchiveChunkMetadata[];
  pcmIncluded: false;
}

function uint32(value: number): Uint8Array {
  const bytes = new Uint8Array(4);
  new DataView(bytes.buffer).setUint32(0, value, true);
  return bytes;
}

function copyBuffer(view: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(view.byteLength);
  copy.set(view);
  return copy.buffer;
}

function sameBytes(left: ArrayBufferView, right: ArrayBufferView): boolean {
  if (left.byteLength !== right.byteLength) return false;
  const leftBytes = new Uint8Array(left.buffer, left.byteOffset, left.byteLength);
  const rightBytes = new Uint8Array(right.buffer, right.byteOffset, right.byteLength);
  return leftBytes.every((value, index) => value === rightBytes[index]);
}

function sameChunk(left: NoiseFeatureChunk, right: NoiseFeatureChunk): boolean {
  return (
    left.id === right.id &&
    left.frameCount === right.frameCount &&
    left.firstFrameSequence === right.firstFrameSequence &&
    left.firstStartSample === right.firstStartSample &&
    COLUMN_NAMES.every((column) => sameBytes(left[column], right[column]))
  );
}

export async function exportNoiseFeatureArchive(
  options: {
    startAt?: number;
    endAt?: number;
  } = {}
): Promise<Blob> {
  const sessions = (await listNoiseCaptureSessions()).filter(
    (session) =>
      (!Number.isFinite(options.startAt) ||
        (session.endedAt ?? session.startedAt) >= options.startAt!) &&
      (!Number.isFinite(options.endAt) || session.startedAt <= options.endAt!)
  );
  const chunks = (
    await Promise.all(sessions.map((session) => listNoiseFeatureChunks(session.captureSessionId)))
  ).flat();
  let byteOffset = 0;
  const chunkMetadata: ArchiveChunkMetadata[] = chunks.map((chunk) => {
    const byteLengths = Object.fromEntries(
      COLUMN_NAMES.map((column) => [column, chunk[column].byteLength])
    ) as Record<ColumnName, number>;
    const metadata: ArchiveChunkMetadata = {
      schemaVersion: chunk.schemaVersion,
      id: chunk.id,
      captureSessionId: chunk.captureSessionId,
      leaderEpoch: chunk.leaderEpoch,
      chunkSequence: chunk.chunkSequence,
      firstFrameSequence: chunk.firstFrameSequence,
      firstStartSample: chunk.firstStartSample,
      frameCount: chunk.frameCount,
      startAt: chunk.startAt,
      endAt: chunk.endAt,
      sealed: chunk.sealed,
      byteOffset,
      byteLengths,
    };
    byteOffset += Object.values(byteLengths).reduce((sum, length) => sum + length, 0);
    return metadata;
  });
  const header: NoiseFeatureArchiveHeader = {
    format: FORMAT,
    version: 1,
    exportedAt: new Date().toISOString(),
    sessions,
    chunks: chunkMetadata,
    pcmIncluded: false,
  };
  const encoder = new TextEncoder();
  const magic = encoder.encode(MAGIC);
  const headerBytes = encoder.encode(JSON.stringify(header));
  const payload = chunks.flatMap((chunk) =>
    COLUMN_NAMES.map(
      (column) =>
        new Uint8Array(chunk[column].buffer, chunk[column].byteOffset, chunk[column].byteLength)
    )
  );
  return new Blob(
    [magic, uint32(headerBytes.byteLength), headerBytes, ...payload].map(copyBuffer),
    {
      type: "application/x-immersive-clock-noise-features",
    }
  );
}

function parseHeader(buffer: ArrayBuffer): {
  header: NoiseFeatureArchiveHeader;
  payloadStart: number;
} {
  const decoder = new TextDecoder();
  const magic = decoder.decode(buffer.slice(0, MAGIC.length));
  if (magic !== MAGIC) throw new TypeError("不是有效的 .icnoise 文件");
  const headerLength = new DataView(buffer, MAGIC.length, 4).getUint32(0, true);
  const payloadStart = MAGIC.length + 4 + headerLength;
  if (payloadStart > buffer.byteLength) throw new TypeError(".icnoise 文件头已损坏");
  const value: unknown = JSON.parse(decoder.decode(buffer.slice(MAGIC.length + 4, payloadStart)));
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(".icnoise 文件头无效");
  }
  const header = value as Partial<NoiseFeatureArchiveHeader>;
  if (
    header.format !== FORMAT ||
    header.version !== 1 ||
    header.pcmIncluded !== false ||
    !Array.isArray(header.sessions) ||
    !Array.isArray(header.chunks)
  ) {
    throw new TypeError("不支持的 .icnoise 格式或版本");
  }
  return { header: header as NoiseFeatureArchiveHeader, payloadStart };
}

function parseChunk(
  buffer: ArrayBuffer,
  payloadStart: number,
  metadata: ArchiveChunkMetadata
): NoiseFeatureChunk {
  if (!Number.isInteger(metadata.frameCount) || metadata.frameCount < 0 || !metadata.sealed) {
    throw new TypeError(".icnoise 包含无效或未封存的特征分块");
  }
  let offset = payloadStart + metadata.byteOffset;
  const read = (column: ColumnName, bytesPerElement: number): ArrayBuffer => {
    const byteLength = metadata.byteLengths[column];
    if (
      byteLength !== metadata.frameCount * bytesPerElement ||
      offset + byteLength > buffer.byteLength
    ) {
      throw new TypeError(`.icnoise ${column} 列长度无效`);
    }
    const result = buffer.slice(offset, offset + byteLength);
    offset += byteLength;
    return result;
  };
  return {
    schemaVersion: metadata.schemaVersion,
    id: metadata.id,
    captureSessionId: metadata.captureSessionId,
    leaderEpoch: metadata.leaderEpoch,
    chunkSequence: metadata.chunkSequence,
    firstFrameSequence: metadata.firstFrameSequence,
    firstStartSample: metadata.firstStartSample,
    frameCount: metadata.frameCount,
    startAt: metadata.startAt,
    endAt: metadata.endAt,
    sealed: metadata.sealed,
    sequenceOffsets: new Uint32Array(read("sequenceOffsets", 4)),
    startSampleOffsets: new Uint32Array(read("startSampleOffsets", 4)),
    rmsDbfs: new Float32Array(read("rmsDbfs", 4)),
    aWeightedDbfs: new Float32Array(read("aWeightedDbfs", 4)),
    sampleP01Dbfs: new Float32Array(read("sampleP01Dbfs", 4)),
    zeroRatio: new Float32Array(read("zeroRatio", 4)),
    clippedRatio: new Float32Array(read("clippedRatio", 4)),
  };
}

export interface NoiseFeatureArchivePreview {
  sessionCount: number;
  chunkCount: number;
  frameCount: number;
  requiredBytes: number;
  additionalBytes: number;
  startAt: number | null;
  endAt: number | null;
}

interface PreparedNoiseFeatureArchive {
  sessions: NoiseCaptureSession[];
  chunks: NoiseFeatureChunk[];
  preview: NoiseFeatureArchivePreview;
}

async function prepareNoiseFeatureArchive(file: Blob): Promise<PreparedNoiseFeatureArchive> {
  const buffer = await file.arrayBuffer();
  const { header, payloadStart } = parseHeader(buffer);
  const sessions = header.sessions;
  const sessionIds = new Set(sessions.map((session) => session.captureSessionId));
  if (
    sessionIds.size !== sessions.length ||
    sessions.some((session) => session.id !== session.captureSessionId)
  ) {
    throw new TypeError(".icnoise 包含重复或无效会话");
  }
  const chunks = header.chunks.map((metadata) => parseChunk(buffer, payloadStart, metadata));
  if (
    new Set(chunks.map((chunk) => chunk.id)).size !== chunks.length ||
    chunks.some((chunk) => !sessionIds.has(chunk.captureSessionId))
  ) {
    throw new TypeError(".icnoise 包含重复分块或未知会话引用");
  }
  const requiredBytes = chunks.reduce(
    (sum, chunk) =>
      sum + COLUMN_NAMES.reduce((total, column) => total + chunk[column].byteLength, 0),
    0
  );
  for (const session of sessions) {
    const existing = await noiseCaptureSessionDb.get<NoiseCaptureSession>(session.id);
    if (existing && JSON.stringify(existing) !== JSON.stringify(session)) {
      throw new Error(`会话 ${session.id} 与本地数据冲突`);
    }
  }
  let additionalBytes = 0;
  for (const chunk of chunks) {
    const existing = await noiseFeatureChunkDb.get<NoiseFeatureChunk>(chunk.id);
    if (existing && !sameChunk(existing, chunk)) throw new Error(`分块 ${chunk.id} 与本地数据冲突`);
    if (!existing) {
      additionalBytes += COLUMN_NAMES.reduce(
        (total, column) => total + chunk[column].byteLength,
        0
      );
    }
  }
  const estimate = await navigator.storage?.estimate?.();
  if (
    typeof estimate?.quota === "number" &&
    typeof estimate.usage === "number" &&
    additionalBytes > estimate.quota - estimate.usage
  ) {
    throw new DOMException("本地存储空间不足，无法导入原始特征", "QuotaExceededError");
  }

  return {
    sessions,
    chunks,
    preview: {
      sessionCount: sessions.length,
      chunkCount: chunks.length,
      frameCount: chunks.reduce((sum, chunk) => sum + chunk.frameCount, 0),
      requiredBytes,
      additionalBytes,
      startAt:
        sessions.length > 0 ? Math.min(...sessions.map((session) => session.startedAt)) : null,
      endAt:
        sessions.length > 0
          ? Math.max(...sessions.map((session) => session.endedAt ?? session.startedAt))
          : null,
    },
  };
}

export async function preflightNoiseFeatureArchive(
  file: Blob
): Promise<NoiseFeatureArchivePreview> {
  return (await prepareNoiseFeatureArchive(file)).preview;
}

export async function importNoiseFeatureArchive(file: Blob): Promise<NoiseFeatureArchivePreview> {
  const { sessions, chunks, preview } = await prepareNoiseFeatureArchive(file);

  await withNoiseHistoryWriteLock(async () => {
    await putNoiseArchiveData(sessions, chunks);
  });
  void scheduleNoiseRescore();
  return preview;
}
