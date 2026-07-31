/** Small IndexedDB facade shared by assets and the noise capture stores. */

import {
  NOISE_SCORE_MODEL_VERSION,
  type NoiseCaptureSession,
  type NoiseFeatureChunk,
  type NoiseScoreWindow,
} from "../types/noise";

const DB_NAME = "immersive-clock-db";
export const DB_VERSION = 7;
const FONT_STORE_NAME = "custom-fonts";
const APPEARANCE_ASSET_STORE_NAME = "appearance-assets";
const APPEARANCE_ASSET_METADATA_STORE_NAME = "appearance-asset-metadata";
const LEGACY_NOISE_HISTORY_STORE_NAME = "noise-history";
const NOISE_SESSION_STORE_NAME = "noise-capture-sessions";
const NOISE_FEATURE_STORE_NAME = "noise-feature-chunks";
const NOISE_SCORE_STORE_NAME = "noise-score-chunks";
const NOISE_RESCORE_STORE_NAME = "noise-rescore-state";
const IDB_OPEN_TIMEOUT_MS = 5_000;

export interface IDBWrapper {
  get<T>(key: string): Promise<T | undefined>;
  set<T>(key: string, value: T): Promise<void>;
  getAll<T>(): Promise<T[]>;
  getAllKeys(): Promise<IDBValidKey[]>;
  del(key: string): Promise<void>;
  clear(): Promise<void>;
}

export interface IndexedRecord {
  id: string;
  end?: number;
  startAt?: number;
  endAt?: number;
  captureSessionId?: string;
}

export interface IndexedQuery {
  endFrom?: number;
  endTo?: number;
  direction?: "asc" | "desc";
  limit?: number;
  captureSessionId?: string;
}

export type NoiseHistoryQuery = IndexedQuery;

export interface IndexedRecordDb {
  list<T extends IndexedRecord>(query?: IndexedQuery): Promise<T[]>;
  get<T extends IndexedRecord>(id: string): Promise<T | undefined>;
  put<T extends IndexedRecord>(record: T): Promise<void>;
  putAll<T extends IndexedRecord>(records: T[]): Promise<void>;
  replaceAll<T extends IndexedRecord>(records: T[]): Promise<void>;
  del(id: string): Promise<void>;
  deleteEndedBefore(cutoff: number): Promise<void>;
  clear(): Promise<void>;
}

export interface NoiseRescoreState {
  modelVersion: string;
  configDigest: string;
  status: "queued" | "running" | "paused" | "complete" | "error";
  sessionId: string | null;
  chunkSequence: number;
  completedSessionIds: string[];
  completedSessionCount: number;
  totalSessionCount: number;
  updatedAt: number;
  error: string | null;
}

let dbPromise: Promise<IDBDatabase> | null = null;

function openDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    let settled = false;
    const timeoutId = globalThis.setTimeout(
      () => fail(new Error("打开 IndexedDB 超时")),
      IDB_OPEN_TIMEOUT_MS
    );
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
      const oldVersion = event.oldVersion;
      const transaction = request.transaction;

      [FONT_STORE_NAME, APPEARANCE_ASSET_STORE_NAME, APPEARANCE_ASSET_METADATA_STORE_NAME].forEach(
        (storeName) => {
          if (!db.objectStoreNames.contains(storeName))
            db.createObjectStore(storeName, { keyPath: "id" });
        }
      );

      const metadataStore = transaction?.objectStore(APPEARANCE_ASSET_METADATA_STORE_NAME);
      const migrateAppearanceMetadata = (storeName: string, kind: "background" | "font") => {
        if (!metadataStore) return;
        const cursorRequest = transaction?.objectStore(storeName).openCursor();
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
      migrateAppearanceMetadata(APPEARANCE_ASSET_STORE_NAME, "background");
      migrateAppearanceMetadata(FONT_STORE_NAME, "font");

      if (db.objectStoreNames.contains(LEGACY_NOISE_HISTORY_STORE_NAME)) {
        db.deleteObjectStore(LEGACY_NOISE_HISTORY_STORE_NAME);
      }

      const create = (name: string, indexes: Array<[string, string]>) => {
        const store = db.objectStoreNames.contains(name)
          ? transaction?.objectStore(name)
          : db.createObjectStore(name, { keyPath: "id" });
        if (!store) return;
        indexes.forEach(([indexName, keyPath]) => {
          if (!store.indexNames.contains(indexName))
            store.createIndex(indexName, keyPath, { unique: false });
        });
      };
      create(NOISE_SESSION_STORE_NAME, [
        ["startedAt", "startedAt"],
        ["endedAt", "endedAt"],
      ]);
      create(NOISE_FEATURE_STORE_NAME, [
        ["captureSessionId", "captureSessionId"],
        ["startAt", "startAt"],
        ["endAt", "endAt"],
      ]);
      create(NOISE_SCORE_STORE_NAME, [
        ["captureSessionId", "captureSessionId"],
        ["end", "end"],
      ]);
      if (oldVersion > 0 && oldVersion < DB_VERSION) {
        const scoreCursor = transaction?.objectStore(NOISE_SCORE_STORE_NAME).openCursor();
        if (scoreCursor) {
          scoreCursor.onsuccess = () => {
            const cursor = scoreCursor.result;
            if (!cursor) return;
            const score = cursor.value as Partial<NoiseScoreWindow>;
            if (score.modelVersion !== NOISE_SCORE_MODEL_VERSION) cursor.delete();
            cursor.continue();
          };
        }
      }
      if (!db.objectStoreNames.contains(NOISE_RESCORE_STORE_NAME)) {
        db.createObjectStore(NOISE_RESCORE_STORE_NAME, { keyPath: "modelVersion" });
      }
    };

    request.onsuccess = (event) => {
      const database = (event.target as IDBOpenDBRequest).result;
      database.onversionchange = () => {
        database.close();
        dbPromise = null;
      };
      finish(database);
    };
    request.onerror = () => fail(request.error ?? new Error("打开 IndexedDB 失败"));
    request.onblocked = () => fail(new Error("IndexedDB 升级被其他页面阻塞"));
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
    async get<T>(key: string) {
      const database = await openDB();
      return new Promise<T | undefined>((resolve, reject) => {
        const request = database.transaction(storeName, "readonly").objectStore(storeName).get(key);
        request.onsuccess = () => resolve(request.result as T | undefined);
        request.onerror = () => reject(request.error);
      });
    },
    async set<T>(key: string, value: T) {
      void key;
      const database = await openDB();
      const transaction = database.transaction(storeName, "readwrite");
      transaction.objectStore(storeName).put(value);
      await transactionDone(transaction);
    },
    async getAll<T>() {
      const database = await openDB();
      return new Promise<T[]>((resolve, reject) => {
        const request = database.transaction(storeName, "readonly").objectStore(storeName).getAll();
        request.onsuccess = () => resolve(request.result as T[]);
        request.onerror = () => reject(request.error);
      });
    },
    async getAllKeys() {
      const database = await openDB();
      return new Promise<IDBValidKey[]>((resolve, reject) => {
        const request = database
          .transaction(storeName, "readonly")
          .objectStore(storeName)
          .getAllKeys();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    },
    async del(key) {
      const database = await openDB();
      const transaction = database.transaction(storeName, "readwrite");
      transaction.objectStore(storeName).delete(key);
      await transactionDone(transaction);
    },
    async clear() {
      const database = await openDB();
      const transaction = database.transaction(storeName, "readwrite");
      transaction.objectStore(storeName).clear();
      await transactionDone(transaction);
    },
  };
}

function createIndexedRecordStore(storeName: string, endIndexName: string): IndexedRecordDb {
  return {
    async list<T extends IndexedRecord>(query: IndexedQuery = {}) {
      const database = await openDB();
      const transaction = database.transaction(storeName, "readonly");
      const store = transaction.objectStore(storeName);
      const index = store.index(endIndexName);
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
      const limit = Number.isFinite(query.limit) ? Math.max(0, Math.floor(query.limit!)) : Infinity;
      return new Promise<T[]>((resolve, reject) => {
        const records: T[] = [];
        const request = index.openCursor(range, direction);
        request.onsuccess = () => {
          const cursor = request.result;
          if (!cursor || records.length >= limit) {
            resolve(records);
            return;
          }
          const record = cursor.value as T;
          if (!query.captureSessionId || record.captureSessionId === query.captureSessionId)
            records.push(record);
          cursor.continue();
        };
        request.onerror = () => reject(request.error);
        transaction.onabort = () => reject(transaction.error);
      });
    },
    async get<T extends IndexedRecord>(id: string) {
      const database = await openDB();
      return new Promise<T | undefined>((resolve, reject) => {
        const request = database.transaction(storeName, "readonly").objectStore(storeName).get(id);
        request.onsuccess = () => resolve(request.result as T | undefined);
        request.onerror = () => reject(request.error);
      });
    },
    async put(record) {
      const database = await openDB();
      const transaction = database.transaction(storeName, "readwrite");
      transaction.objectStore(storeName).put(record);
      await transactionDone(transaction);
    },
    async putAll(records) {
      if (records.length === 0) return;
      const database = await openDB();
      const transaction = database.transaction(storeName, "readwrite");
      const store = transaction.objectStore(storeName);
      records.forEach((record) => store.put(record));
      await transactionDone(transaction);
    },
    async replaceAll(records) {
      const database = await openDB();
      const transaction = database.transaction(storeName, "readwrite");
      const store = transaction.objectStore(storeName);
      store.clear();
      records.forEach((record) => store.put(record));
      await transactionDone(transaction);
    },
    async del(id) {
      const database = await openDB();
      const transaction = database.transaction(storeName, "readwrite");
      transaction.objectStore(storeName).delete(id);
      await transactionDone(transaction);
    },
    async deleteEndedBefore(cutoff) {
      const database = await openDB();
      const transaction = database.transaction(storeName, "readwrite");
      const index = transaction.objectStore(storeName).index(endIndexName);
      index.openCursor(IDBKeyRange.upperBound(cutoff, true)).onsuccess = (event) => {
        const cursor = (event.target as IDBRequest<IDBCursorWithValue | null>).result;
        if (!cursor) return;
        cursor.delete();
        cursor.continue();
      };
      await transactionDone(transaction);
    },
    async clear() {
      const database = await openDB();
      const transaction = database.transaction(storeName, "readwrite");
      transaction.objectStore(storeName).clear();
      await transactionDone(transaction);
    },
  };
}

export const db = createStore(FONT_STORE_NAME);
export const appearanceAssetDb = createStore(APPEARANCE_ASSET_STORE_NAME);
export const appearanceAssetMetadataDb = createStore(APPEARANCE_ASSET_METADATA_STORE_NAME);

export const noiseCaptureSessionDb = createIndexedRecordStore(
  NOISE_SESSION_STORE_NAME,
  "startedAt"
);
export const noiseFeatureChunkDb = createIndexedRecordStore(NOISE_FEATURE_STORE_NAME, "startAt");
export const noiseScoreChunkDb = createIndexedRecordStore(NOISE_SCORE_STORE_NAME, "end");

export const noiseHistoryDb = noiseScoreChunkDb;

export async function commitNoiseFeatureCheckpoint(
  session: NoiseCaptureSession,
  chunks: readonly NoiseFeatureChunk[]
): Promise<void> {
  const database = await openDB();
  const transaction = database.transaction(
    [NOISE_SESSION_STORE_NAME, NOISE_FEATURE_STORE_NAME],
    "readwrite"
  );
  transaction.objectStore(NOISE_SESSION_STORE_NAME).put(session);
  const chunkStore = transaction.objectStore(NOISE_FEATURE_STORE_NAME);
  chunks.forEach((chunk) => chunkStore.put(chunk));
  await transactionDone(transaction);
}

export async function putNoiseArchiveData(
  sessions: readonly NoiseCaptureSession[],
  chunks: readonly NoiseFeatureChunk[]
): Promise<void> {
  const database = await openDB();
  const transaction = database.transaction(
    [NOISE_SESSION_STORE_NAME, NOISE_FEATURE_STORE_NAME],
    "readwrite"
  );
  const sessionStore = transaction.objectStore(NOISE_SESSION_STORE_NAME);
  const chunkStore = transaction.objectStore(NOISE_FEATURE_STORE_NAME);
  sessions.forEach((session) => sessionStore.put(session));
  chunks.forEach((chunk) => chunkStore.put(chunk));
  await transactionDone(transaction);
}

function deleteBySessionIndex(store: IDBObjectStore, sessionId: string): void {
  const request = store.index("captureSessionId").openCursor(IDBKeyRange.only(sessionId));
  request.onsuccess = () => {
    const cursor = request.result;
    if (!cursor) return;
    cursor.delete();
    cursor.continue();
  };
}

export async function deleteNoiseSessionData(sessionIds: readonly string[]): Promise<void> {
  if (sessionIds.length === 0) return;
  const database = await openDB();
  const transaction = database.transaction(
    [NOISE_SESSION_STORE_NAME, NOISE_FEATURE_STORE_NAME, NOISE_SCORE_STORE_NAME],
    "readwrite"
  );
  const sessionStore = transaction.objectStore(NOISE_SESSION_STORE_NAME);
  const featureStore = transaction.objectStore(NOISE_FEATURE_STORE_NAME);
  const scoreStore = transaction.objectStore(NOISE_SCORE_STORE_NAME);
  sessionIds.forEach((sessionId) => {
    sessionStore.delete(sessionId);
    deleteBySessionIndex(featureStore, sessionId);
    deleteBySessionIndex(scoreStore, sessionId);
  });
  await transactionDone(transaction);
}

export async function deleteSupersededNoiseScores(currentModelVersion: string): Promise<void> {
  const database = await openDB();
  const transaction = database.transaction(NOISE_SCORE_STORE_NAME, "readwrite");
  const request = transaction.objectStore(NOISE_SCORE_STORE_NAME).openCursor();
  request.onsuccess = () => {
    const cursor = request.result;
    if (!cursor) return;
    const value = cursor.value as Partial<NoiseScoreWindow>;
    if (value.modelVersion !== currentModelVersion) cursor.delete();
    cursor.continue();
  };
  await transactionDone(transaction);
}

export const noiseRescoreStateDb = {
  async get(modelVersion: string): Promise<NoiseRescoreState | undefined> {
    return createStore(NOISE_RESCORE_STORE_NAME).get<NoiseRescoreState>(modelVersion);
  },
  async put(state: NoiseRescoreState): Promise<void> {
    return createStore(NOISE_RESCORE_STORE_NAME).set(state.modelVersion, state);
  },
  async clear(): Promise<void> {
    return createStore(NOISE_RESCORE_STORE_NAME).clear();
  },
};

export type { NoiseCaptureSession, NoiseFeatureChunk, NoiseScoreWindow };
