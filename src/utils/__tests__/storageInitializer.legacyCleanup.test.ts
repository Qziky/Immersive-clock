import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

import { initializeStorage } from "../storageInitializer";

class MemoryStorage implements Storage {
  private store = new Map<string, string>();

  get length(): number {
    return this.store.size;
  }

  clear(): void {
    this.store.clear();
  }

  getItem(key: string): string | null {
    return this.store.has(key) ? this.store.get(key)! : null;
  }

  key(index: number): string | null {
    return Array.from(this.store.keys())[index] ?? null;
  }

  removeItem(key: string): void {
    this.store.delete(key);
  }

  setItem(key: string, value: string): void {
    this.store.set(key, value);
  }
}

/** storageInitializer 单元测试（函数级注释：验证 legacy 键清理不会误保留） */
describe("storageInitializer - legacy cleanup", () => {
  const originalLocalStorage = globalThis.localStorage;

  beforeEach(() => {
    vi.restoreAllMocks();
    (globalThis as unknown as { localStorage: Storage }).localStorage = new MemoryStorage();
  });

  afterEach(() => {
    (globalThis as unknown as { localStorage: Storage }).localStorage = originalLocalStorage;
  });

  it("initializeStorage 只清理已知 legacy 键并保留当前接口治理状态", () => {
    localStorage.setItem("AppSettings", JSON.stringify({ version: 1, modifiedAt: 1 }));
    localStorage.setItem("quote-auto-refresh-interval", "123");
    localStorage.setItem("api-governance.hitokoto.block-until", "999999");
    localStorage.setItem("api-governance.hitokoto.backoff-level", "3");
    localStorage.setItem("api-governance.hitokoto.device-seed", "42");
    localStorage.setItem("api-governance.hitokoto.unknown-owner-key", "keep");
    localStorage.setItem("weather.city", "Shanghai");
    localStorage.setItem("noise-control-max-level-db", "55");

    initializeStorage();

    expect(localStorage.getItem("quote-auto-refresh-interval")).toBeNull();
    expect(localStorage.getItem("api-governance.hitokoto.block-until")).toBe("999999");
    expect(localStorage.getItem("api-governance.hitokoto.backoff-level")).toBe("3");
    expect(localStorage.getItem("api-governance.hitokoto.device-seed")).toBe("42");
    expect(localStorage.getItem("api-governance.hitokoto.unknown-owner-key")).toBe("keep");
    expect(localStorage.getItem("weather.city")).toBeNull();
    expect(localStorage.getItem("noise-control-max-level-db")).toBeNull();
    expect(localStorage.getItem("AppSettings")).not.toBeNull();
  });
});
