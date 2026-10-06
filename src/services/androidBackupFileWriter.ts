import { registerPlugin } from "@capacitor/core";

interface AndroidBackupFileWriterPlugin {
  beginSave(options: { fileName: string }): Promise<{ cancelled: boolean }>;
  writeChunk(options: { base64: string }): Promise<void>;
  finishSave(): Promise<void>;
  abortSave(): Promise<void>;
}

export type AndroidBackupSaveResult = { cancelled: true } | { cancelled: false };

const AndroidBackupFileWriter =
  registerPlugin<AndroidBackupFileWriterPlugin>("AndroidBackupFileWriter");
const BACKUP_CHUNK_SIZE = 128 * 1024;

function readBase64Chunk(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error("读取备份数据失败"));
    reader.onload = () => {
      if (typeof reader.result !== "string") {
        reject(new Error("备份数据格式无效"));
        return;
      }

      const separatorIndex = reader.result.indexOf(",");
      if (separatorIndex < 0) {
        reject(new Error("备份数据编码无效"));
        return;
      }

      resolve(reader.result.slice(separatorIndex + 1));
    };
    reader.readAsDataURL(blob);
  });
}

export async function saveBackupBlobOnAndroid(
  blob: Blob,
  fileName: string
): Promise<AndroidBackupSaveResult> {
  const { cancelled } = await AndroidBackupFileWriter.beginSave({ fileName });
  if (cancelled) return { cancelled: true };

  try {
    for (let offset = 0; offset < blob.size; offset += BACKUP_CHUNK_SIZE) {
      const chunk = blob.slice(offset, Math.min(offset + BACKUP_CHUNK_SIZE, blob.size));
      await AndroidBackupFileWriter.writeChunk({ base64: await readBase64Chunk(chunk) });
    }

    await AndroidBackupFileWriter.finishSave();
    return { cancelled: false };
  } catch (error) {
    await AndroidBackupFileWriter.abortSave().catch(() => undefined);
    throw error;
  }
}
