/**
 * 简单的 IndexedDB 封装工具
 */

const DB_NAME = "immersive-clock-db";
const DB_VERSION = 2;
const FONT_STORE_NAME = "custom-fonts";
const APPEARANCE_ASSET_STORE_NAME = "appearance-assets";

export interface IDBWrapper {
  get<T>(key: string): Promise<T | undefined>;
  set<T>(key: string, value: T): Promise<void>;
  getAll<T>(): Promise<T[]>;
  del(key: string): Promise<void>;
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

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      [FONT_STORE_NAME, APPEARANCE_ASSET_STORE_NAME].forEach((storeName) => {
        if (!db.objectStoreNames.contains(storeName)) {
          db.createObjectStore(storeName, { keyPath: "id" });
        }
      });
    };

    request.onsuccess = (event) => {
      resolve((event.target as IDBOpenDBRequest).result);
    };

    request.onerror = (event) => {
      reject((event.target as IDBOpenDBRequest).error);
    };
  });

  return dbPromise;
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
      const database = await openDB();
      return new Promise((resolve, reject) => {
        const transaction = database.transaction(storeName, "readwrite");
        const store = transaction.objectStore(storeName);
        const request = store.put(value);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
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

    async del(key: string): Promise<void> {
      const database = await openDB();
      return new Promise((resolve, reject) => {
        const transaction = database.transaction(storeName, "readwrite");
        const store = transaction.objectStore(storeName);
        const request = store.delete(key);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
    },

    async clear(): Promise<void> {
      const database = await openDB();
      return new Promise((resolve, reject) => {
        const transaction = database.transaction(storeName, "readwrite");
        const store = transaction.objectStore(storeName);
        const request = store.clear();
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
    },
  };
}

export const db = createStore(FONT_STORE_NAME);
export const appearanceAssetDb = createStore(APPEARANCE_ASSET_STORE_NAME);
