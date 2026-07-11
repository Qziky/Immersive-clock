import { beforeEach, describe, expect, it, vi } from "vitest";

const dbState = vi.hoisted(() => ({
  backgrounds: new Map<string, unknown>(),
  fonts: new Map<string, unknown>(),
  metadata: new Map<string, unknown>(),
}));

vi.mock("../db", () => {
  const createStore = (records: Map<string, unknown>) => ({
    get: vi.fn(async (key: string) => structuredClone(records.get(key))),
    set: vi.fn(async (_key: string, value: { id: string }) => {
      records.set(value.id, structuredClone(value));
    }),
    getAll: vi.fn(async () => structuredClone([...records.values()])),
    getAllKeys: vi.fn(async () => [...records.keys()]),
    del: vi.fn(async (key: string) => {
      records.delete(key);
    }),
    clear: vi.fn(async () => {
      records.clear();
    }),
  });
  return {
    appearanceAssetDb: createStore(dbState.backgrounds),
    appearanceAssetMetadataDb: createStore(dbState.metadata),
    db: createStore(dbState.fonts),
  };
});

import {
  getAppearanceAssetsRevision,
  importAppearanceAssets,
  loadAppearanceAssetCatalog,
  notifyAppearanceAssetsChanged,
  removeBackgroundAsset,
  saveBackgroundAsset,
  subscribeAppearanceAssetsChanged,
} from "../appearanceAssets";
import { importFontFile, removeImportedFont } from "../studyFontStorage";

describe("appearanceAssets metadata catalog", () => {
  beforeEach(() => {
    dbState.backgrounds.clear();
    dbState.fonts.clear();
    dbState.metadata.clear();
    document.getElementById("study-fonts-style")?.remove();
    localStorage.clear();
  });

  it("从完整资源修复目录，但只向列表返回轻量 metadata", async () => {
    dbState.backgrounds.set("background-1", {
      id: "background-1",
      kind: "background",
      name: "背景.png",
      mimeType: "image/png",
      dataUrl: "data:image/png;base64,QUJD",
    });
    dbState.fonts.set("font-1", {
      id: "font-1",
      family: "Test Sans",
      format: "woff2",
      dataUrl: "data:font/woff2;base64,REVG",
    });

    const catalog = await loadAppearanceAssetCatalog();

    expect(catalog.backgrounds).toEqual([
      {
        id: "background-1",
        kind: "background",
        name: "背景.png",
        mimeType: "image/png",
      },
    ]);
    expect(catalog.fonts).toEqual([
      {
        id: "font-1",
        kind: "font",
        name: "Test Sans",
        mimeType: "font/woff2",
        family: "Test Sans",
        format: "woff2",
      },
    ]);
    expect(JSON.stringify(catalog)).not.toContain("base64");
    expect(dbState.metadata.size).toBe(2);
  });

  it("资源变化订阅覆盖导入、删除和外部刷新", async () => {
    const revisions: number[] = [];
    const unsubscribe = subscribeAppearanceAssetsChanged((revision) => revisions.push(revision));
    const initialRevision = getAppearanceAssetsRevision();

    await importAppearanceAssets([
      {
        id: "background-imported",
        kind: "background",
        name: "导入背景.png",
        mimeType: "image/png",
        dataUrl: "data:image/png;base64,QUJD",
      },
    ]);
    await removeBackgroundAsset("background-imported");
    notifyAppearanceAssetsChanged();
    unsubscribe();

    expect(revisions).toEqual([initialRevision + 1, initialRevision + 2, initialRevision + 3]);
  });

  it("外部直接删除正文后会清理过期 metadata", async () => {
    await importAppearanceAssets([
      {
        id: "background-stale",
        kind: "background",
        name: "待清理.png",
        mimeType: "image/png",
        dataUrl: "data:image/png;base64,QUJD",
      },
    ]);
    dbState.backgrounds.delete("background-stale");
    notifyAppearanceAssetsChanged();

    const catalog = await loadAppearanceAssetCatalog();
    expect(catalog.backgrounds).toEqual([]);
    expect(dbState.metadata.has("background-stale")).toBe(false);
  });

  it("相同背景正文重复选择时复用已有 ID", async () => {
    const firstFile = new File(["same-image"], "first.png", { type: "image/png" });
    const secondFile = new File(["same-image"], "second.png", { type: "image/png" });
    const initialRevision = getAppearanceAssetsRevision();

    const first = await saveBackgroundAsset(firstFile);
    const second = await saveBackgroundAsset(secondFile);

    expect(second.id).toBe(first.id);
    expect(dbState.backgrounds.size).toBe(1);
    expect(getAppearanceAssetsRevision()).toBe(initialRevision + 1);
  });

  it("相同字体 family、format 和正文重复导入时复用已有 ID", async () => {
    const firstFile = new File(["same-font"], "first.woff2", { type: "font/woff2" });
    const secondFile = new File(["same-font"], "second.woff2", { type: "font/woff2" });
    const initialRevision = getAppearanceAssetsRevision();

    const first = await importFontFile(firstFile, "Example Font");
    const second = await importFontFile(secondFile, "Example Font");

    expect(second.id).toBe(first.id);
    expect(dbState.fonts.size).toBe(1);
    expect(getAppearanceAssetsRevision()).toBe(initialRevision + 1);

    await removeImportedFont(first.id);
    expect(dbState.fonts.size).toBe(0);
    expect(dbState.metadata.size).toBe(0);
  });
});
