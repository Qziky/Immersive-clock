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
});
