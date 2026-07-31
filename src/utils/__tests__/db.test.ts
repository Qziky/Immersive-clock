import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

interface ControlledOpenRequest extends IDBOpenDBRequest {
  onblocked: ((this: IDBOpenDBRequest, event: IDBVersionChangeEvent) => unknown) | null;
}

const originalIndexedDb = globalThis.indexedDB;

function installControlledOpenRequest(): ControlledOpenRequest {
  const request = {
    error: null,
    onblocked: null,
    onerror: null,
    onsuccess: null,
    onupgradeneeded: null,
    result: undefined,
    transaction: null,
  } as unknown as ControlledOpenRequest;
  Object.defineProperty(globalThis, "indexedDB", {
    configurable: true,
    writable: true,
    value: { open: vi.fn(() => request) } as unknown as IDBFactory,
  });
  return request;
}

describe("IndexedDB open lifecycle", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.useRealTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    Object.defineProperty(globalThis, "indexedDB", {
      configurable: true,
      writable: true,
      value: originalIndexedDb,
    });
  });

  it("数据库升级被其他页面阻塞时应立即失败", async () => {
    const request = installControlledOpenRequest();
    const { noiseHistoryDb } = await import("../db");
    const operation = noiseHistoryDb.list();

    request.onblocked?.call(request, new Event("blocked") as IDBVersionChangeEvent);

    await expect(operation).rejects.toThrow("升级被其他页面阻塞");
  });

  it("数据库打开没有事件时应在超时后失败", async () => {
    vi.useFakeTimers();
    installControlledOpenRequest();
    const { noiseHistoryDb } = await import("../db");
    const expectation = expect(noiseHistoryDb.list()).rejects.toThrow("打开 IndexedDB 超时");

    await vi.advanceTimersByTimeAsync(5_000);

    await expectation;
  });

  it("新建 v7 数据库时不再创建旧噪音历史 Store", async () => {
    const request = installControlledOpenRequest();
    const cursorRequest = { onsuccess: null, result: null };
    const createdStore = {
      createIndex: vi.fn(),
      indexNames: { contains: vi.fn(() => false) },
      openCursor: vi.fn(() => cursorRequest),
      put: vi.fn(),
    };
    const database = {
      objectStoreNames: { contains: vi.fn(() => false) },
      createObjectStore: vi.fn(
        (_name: string, _options?: IDBObjectStoreParameters) => createdStore
      ),
      deleteObjectStore: vi.fn(),
    };
    Object.assign(request, {
      result: database,
      transaction: { objectStore: vi.fn(() => createdStore) },
    });
    const { noiseHistoryDb } = await import("../db");
    const operation = noiseHistoryDb.list().catch(() => []);

    request.onupgradeneeded?.call(request, {
      oldVersion: 0,
      target: request,
    } as unknown as IDBVersionChangeEvent);

    expect(indexedDB.open).toHaveBeenCalledWith("immersive-clock-db", 7);
    expect(database.createObjectStore).not.toHaveBeenCalledWith("noise-history", expect.anything());
    expect(database.createObjectStore.mock.calls.map(([name]) => name)).toEqual(
      expect.arrayContaining([
        "noise-capture-sessions",
        "noise-feature-chunks",
        "noise-score-chunks",
        "noise-rescore-state",
      ])
    );
    expect(database.deleteObjectStore).not.toHaveBeenCalled();

    Object.assign(request, { error: new Error("test complete") });
    request.onerror?.call(request, new Event("error"));
    await operation;
  });

  it("v6 升级到 v7 时删除旧 Store 并只清理旧模型评分", async () => {
    const request = installControlledOpenRequest();
    const assetCursorRequest = { onsuccess: null, result: null };
    const scoreCursorRequest = {
      onsuccess: null as (() => void) | null,
      result: null as IDBCursorWithValue | null,
    };
    const scoreCursor = {
      continue: vi.fn(),
      delete: vi.fn(),
      value: { modelVersion: "spectral-activity-v1" },
    } as unknown as IDBCursorWithValue;
    const indexedStore = {
      createIndex: vi.fn(),
      indexNames: { contains: vi.fn(() => true) },
      openCursor: vi.fn(() => assetCursorRequest),
    };
    const scoreStore = {
      ...indexedStore,
      openCursor: vi.fn(() => scoreCursorRequest),
    };
    const metadataStore = { put: vi.fn() };
    const database = {
      objectStoreNames: { contains: vi.fn(() => true) },
      createObjectStore: vi.fn(),
      deleteObjectStore: vi.fn(),
    };
    Object.assign(request, {
      result: database,
      transaction: {
        objectStore: vi.fn((name: string) => {
          if (name === "appearance-asset-metadata") return metadataStore;
          if (name === "noise-score-chunks") return scoreStore;
          return indexedStore;
        }),
      },
    });
    const { noiseHistoryDb } = await import("../db");
    const operation = noiseHistoryDb.list().catch(() => []);

    request.onupgradeneeded?.call(request, {
      oldVersion: 6,
      target: request,
    } as unknown as IDBVersionChangeEvent);

    expect(indexedDB.open).toHaveBeenCalledWith("immersive-clock-db", 7);
    expect(database.deleteObjectStore).toHaveBeenCalledWith("noise-history");
    expect(database.createObjectStore).not.toHaveBeenCalledWith("noise-history", expect.anything());

    scoreCursorRequest.result = scoreCursor;
    scoreCursorRequest.onsuccess?.();
    expect(scoreCursor.delete).toHaveBeenCalledTimes(1);
    Object.assign(scoreCursor, { value: { modelVersion: "spectral-activity-v2" } });
    scoreCursorRequest.onsuccess?.();
    expect(scoreCursor.delete).toHaveBeenCalledTimes(1);

    Object.assign(request, { error: new Error("test complete") });
    request.onerror?.call(request, new Event("error"));
    await operation;
  });
});
