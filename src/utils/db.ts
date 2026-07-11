/**
 * 简单的 IndexedDB 封装工具
 */

const DB_NAME = "immersive-clock-db";
const DB_VERSION = 4;
const FONT_STORE_NAME = "custom-fonts";
const APPEARANCE_ASSET_STORE_NAME = "appearance-assets";
const APPEARANCE_ASSET_METADATA_STORE_NAME = "appearance-asset-metadata";
const NOISE_HISTORY_STORE_NAME = "noise-history";
const NOISE_HISTORY_END_INDEX = "end";
const IDB_OPEN_TIMEOUT_MS = 5_000;

export interface IDBWrapper {
  get<T>(key: string): Promise<T | undefined>;
  set<T>(key: string, value: T): Promise<void>;
  getAll<T>(): Promise<T[]>;
  getAllKeys(): Promise<IDBValidKey[]>;
  del(key: string): Promise<void>;
  clear(): Promise<void>;
}

export interface NoiseHistoryRecord {
  id: string;
  end: number;
}

export interface NoiseHistoryQuery {
  endFrom?: number;
  endTo?: number;
  direction?: "asc" | "desc";
  limit?: number;
}

export interface NoiseHistoryDb {
  list<T extends NoiseHistoryRecord>(query?: NoiseHistoryQuery): Promise<T[]>;
  put<T extends NoiseHistoryRecord>(record: T): Promise<void>;
  putAll<T extends NoiseHistoryRecord>(records: T[]): Promise<void>;
  replaceAll<T extends NoiseHistoryRecord>(records: T[]): Promise<void>;
  deleteEndedBefore(cutoff: number): Promise<void>;
  clear(): Promise<void>;
}

let dbPromise: Promise<IDBDatabase> | null = null;

/**
 * 打开 IndexedDB 数据库
 */
function openDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    let settled = false;
    const timeoutId = globalThis.setTimeout(() => {
      fail(new Error("打开 IndexedDB 超时"));
    }, IDB_OPEN_TIMEOUT_MS);
    const finish = (database: IDBDatabase): void => {
      if (settled) {
        database.close();
        return;
      }
      settled = true;
      globalThis.clearTimeout(timeoutId);
      resolve(database);
    };
    const fail = (error: unknown): void => {
      if (settled) return;
      settled = true;
      globalThis.clearTimeout(timeoutId);
      reject(error);
    };

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      [FONT_STORE_NAME, APPEARANCE_ASSET_STORE_NAME, APPEARANCE_ASSET_METADATA_STORE_NAME].forEach(
        (storeName) => {
          if (!db.objectStoreNames.contains(storeName)) {
            db.createObjectStore(storeName, { keyPath: "id" });
          }
        }
      );

      const metadataStore = request.transaction?.objectStore(APPEARANCE_ASSET_METADATA_STORE_NAME);
      const migrateMetadata = (storeName: string, kind: "background" | "font") => {
        if (!metadataStore) return;
        const cursorRequest = request.transaction?.objectStore(storeName).openCursor();
        if (!cursorRequest) return;
        cursorRequest.onsuccess = () => {
          const cursor = cursorRequest.result;
          if (!cursor) return;
          const value = cursor.value as Record<string, unknown>;
          if (typeof value.id === "string") {
            if (
              kind === "background" &&
              typeof value.name === "string" &&
              typeof value.mimeType === "string"
            ) {
              metadataStore.put({
                id: value.id,
                kind,
                name: value.name,
                mimeType: value.mimeType,
                ...(typeof value.contentHash === "string"
                  ? { contentHash: value.contentHash }
                  : {}),
              });
            }
            if (
              kind === "font" &&
              typeof value.family === "string" &&
              typeof value.format === "string"
            ) {
              metadataStore.put({
                id: value.id,
                kind,
                name: value.family,
                mimeType: `font/${value.format}`,
                family: value.family,
                format: value.format,
                ...(typeof value.contentHash === "string"
                  ? { contentHash: value.contentHash }
                  : {}),
              });
            }
          }
          cursor.continue();
        };
      };
      migrateMetadata(APPEARANCE_ASSET_STORE_NAME, "background");
      migrateMetadata(FONT_STORE_NAME, "font");

      const noiseHistoryStore = db.objectStoreNames.contains(NOISE_HISTORY_STORE_NAME)
        ? request.transaction?.objectStore(NOISE_HISTORY_STORE_NAME)
        : db.createObjectStore(NOISE_HISTORY_STORE_NAME, { keyPath: "id" });
      if (noiseHistoryStore && !noiseHistoryStore.indexNames.contains(NOISE_HISTORY_END_INDEX)) {
        noiseHistoryStore.createIndex(NOISE_HISTORY_END_INDEX, "end", { unique: false });
      }
    };

    request.onsuccess = (event) => {
      const database = (event.target as IDBOpenDBRequest).result;
      if (settled) {
        database.close();
        return;
      }
      database.onversionchange = () => {
        database.close();
        dbPromise = null;
      };
      finish(database);
    };

    request.onerror = () => {
      fail(request.error ?? new Error("打开 IndexedDB 失败"));
    };

    request.onblocked = () => {
      fail(new Error("IndexedDB 升级被其他页面阻塞"));
    };
  });

  void dbPromise.catch(() => {
    dbPromise = null;
  });
  return dbPromise;
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error ?? new Error("IndexedDB 事务已中止"));
    transaction.onerror = () => reject(transaction.error ?? new Error("IndexedDB 事务失败"));
  });
}

function createStore(storeName: string): IDBWrapper {
  return {
    async get<T>(key: string): Promise<T | undefined> {
      const database = await openDB();
      return new Promise((resolve, reject) => {
        const transaction = database.transaction(storeName, "readonly");
        const store = transaction.objectStore(storeName);
        const request = store.get(key);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    },

    async set<T>(key: string, value: T): Promise<void> {
      void key;
      const database = await openDB();
      const transaction = database.transaction(storeName, "readwrite");
      transaction.objectStore(storeName).put(value);
      await transactionDone(transaction);
    },

    async getAll<T>(): Promise<T[]> {
      const database = await openDB();
      return new Promise((resolve, reject) => {
        const transaction = database.transaction(storeName, "readonly");
        const store = transaction.objectStore(storeName);
        const request = store.getAll();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    },

    async getAllKeys(): Promise<IDBValidKey[]> {
      const database = await openDB();
      return new Promise((resolve, reject) => {
        const transaction = database.transaction(storeName, "readonly");
        const request = transaction.objectStore(storeName).getAllKeys();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    },

    async del(key: string): Promise<void> {
      const database = await openDB();
      const transaction = database.transaction(storeName, "readwrite");
      transaction.objectStore(storeName).delete(key);
      await transactionDone(transaction);
    },

    async clear(): Promise<void> {
      const database = await openDB();
      const transaction = database.transaction(storeName, "readwrite");
      transaction.objectStore(storeName).clear();
      await transactionDone(transaction);
    },
  };
}

function createNoiseHistoryStore(): NoiseHistoryDb {
  return {
    async list<T extends NoiseHistoryRecord>(query: NoiseHistoryQuery = {}): Promise<T[]> {
      const database = await openDB();
      const transaction = database.transaction(NOISE_HISTORY_STORE_NAME, "readonly");
      const index = transaction
        .objectStore(NOISE_HISTORY_STORE_NAME)
        .index(NOISE_HISTORY_END_INDEX);
      const lower = Number.isFinite(query.endFrom) ? query.endFrom : undefined;
      const upper = Number.isFinite(query.endTo) ? query.endTo : undefined;
      const range =
        lower !== undefined && upper !== undefined
          ? IDBKeyRange.bound(lower, upper)
          : lower !== undefined
            ? IDBKeyRange.lowerBound(lower)
            : upper !== undefined
              ? IDBKeyRange.upperBound(upper)
              : undefined;
      const direction: IDBCursorDirection = query.direction === "desc" ? "prev" : "next";
      const limit =
        typeof query.limit === "number" && Number.isFinite(query.limit)
          ? Math.max(0, Math.floor(query.limit))
          : Infinity;

      return new Promise((resolve, reject) => {
        const records: T[] = [];
        const request = index.openCursor(range, direction);
        request.onsuccess = () => {
          const cursor = request.result;
          if (!cursor || records.length >= limit) {
            resolve(records);
            return;
          }
          records.push(cursor.value as T);
          cursor.continue();
        };
        request.onerror = () => reject(request.error);
        transaction.onabort = () => reject(transaction.error);
      });
    },

    async put<T extends NoiseHistoryRecord>(record: T): Promise<void> {
      const database = await openDB();
      const transaction = database.transaction(NOISE_HISTORY_STORE_NAME, "readwrite");
      transaction.objectStore(NOISE_HISTORY_STORE_NAME).put(record);
      await transactionDone(transaction);
    },

    async putAll<T extends NoiseHistoryRecord>(records: T[]): Promise<void> {
      if (records.length === 0) return;
      const database = await openDB();
      const transaction = database.transaction(NOISE_HISTORY_STORE_NAME, "readwrite");
      const store = transaction.objectStore(NOISE_HISTORY_STORE_NAME);
      records.forEach((record) => store.put(record));
      await transactionDone(transaction);
    },

    async replaceAll<T extends NoiseHistoryRecord>(records: T[]): Promise<void> {
      const database = await openDB();
      const transaction = database.transaction(NOISE_HISTORY_STORE_NAME, "readwrite");
      const store = transaction.objectStore(NOISE_HISTORY_STORE_NAME);
      store.clear();
      records.forEach((record) => store.put(record));
      await transactionDone(transaction);
    },

    async deleteEndedBefore(cutoff: number): Promise<void> {
      const database = await openDB();
      const transaction = database.transaction(NOISE_HISTORY_STORE_NAME, "readwrite");
      const index = transaction
        .objectStore(NOISE_HISTORY_STORE_NAME)
        .index(NOISE_HISTORY_END_INDEX);
      index.openCursor(IDBKeyRange.upperBound(cutoff, true)).onsuccess = (event) => {
        const cursor = (event.target as IDBRequest<IDBCursorWithValue | null>).result;
        if (!cursor) return;
        cursor.delete();
        cursor.continue();
      };
      await transactionDone(transaction);
    },

    async clear(): Promise<void> {
      const database = await openDB();
      const transaction = database.transaction(NOISE_HISTORY_STORE_NAME, "readwrite");
      transaction.objectStore(NOISE_HISTORY_STORE_NAME).clear();
      await transactionDone(transaction);
    },
  };
}

export const db = createStore(FONT_STORE_NAME);
export const appearanceAssetDb = createStore(APPEARANCE_ASSET_STORE_NAME);
export const appearanceAssetMetadataDb = createStore(APPEARANCE_ASSET_METADATA_STORE_NAME);
export const noiseHistoryDb = createNoiseHistoryStore();
