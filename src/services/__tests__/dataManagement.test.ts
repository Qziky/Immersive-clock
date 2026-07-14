import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { AppearanceBackupAsset, ImmersiveClockBackupV1 } from "../../types/dataManagement";
import type { NoiseSliceSummary } from "../../types/noise";
import {
  APP_SETTINGS_KEY,
  APP_SETTINGS_QUARANTINE_KEY,
  getAppSettings,
  getDefaultAppSettings,
} from "../../utils/appSettings";
import {
  BACKUP_FORMAT,
  BACKUP_VERSION,
  DataManagementError,
  MAX_BACKUP_BYTES,
  clearDataScope,
  clearUnusedAssets,
  createBackup,
  discardQuarantinedSettingsRecovery,
  eraseAllData,
  getQuarantinedSettingsRecovery,
  inspectUnusedAssets,
  prepareBackup,
  prepareBackupFile,
  resetPreferences,
  restoreBackup,
} from "../dataManagement";

const dataState = vi.hoisted(() => ({
  assets: [] as AppearanceBackupAsset[],
  noise: [] as NoiseSliceSummary[],
  failNoiseReplaceCount: 0,
}));

vi.mock("../../utils/appearanceAssets", () => ({
  clearAppearanceAssets: vi.fn(async () => {
    dataState.assets = [];
  }),
  exportAppearanceAssets: vi.fn(async () => structuredClone(dataState.assets)),
  importAppearanceAssets: vi.fn(async (assets: AppearanceBackupAsset[]) => {
    for (const asset of structuredClone(assets)) {
      const index = dataState.assets.findIndex(
        (current) => current.kind === asset.kind && current.id === asset.id
      );
      if (index >= 0) dataState.assets[index] = asset;
      else dataState.assets.push(asset);
    }
  }),
  notifyAppearanceAssetsChanged: vi.fn(),
}));

vi.mock("../../utils/db", () => ({
  appearanceAssetDb: {
    del: vi.fn(async (id: string) => {
      dataState.assets = dataState.assets.filter(
        (asset) => !(asset.kind === "background" && asset.id === id)
      );
    }),
  },
  appearanceAssetMetadataDb: {
    del: vi.fn(async () => {}),
  },
  db: {
    del: vi.fn(async (id: string) => {
      dataState.assets = dataState.assets.filter(
        (asset) => !(asset.kind === "font" && asset.id === id)
      );
    }),
  },
}));

vi.mock("../../utils/noiseSliceService", () => ({
  clearNoiseSlices: vi.fn(async () => {
    dataState.noise = [];
  }),
  exportNoiseSlices: vi.fn(async () => structuredClone(dataState.noise)),
  inspectNoiseSlices: vi.fn(async () => ({
    count: dataState.noise.length,
    itemCount: dataState.noise.length,
    bytes: JSON.stringify(dataState.noise).length * 2,
    updatedAt:
      dataState.noise.length > 0
        ? Math.max(...dataState.noise.map((slice) => Number(slice.end)))
        : undefined,
  })),
  isNoiseSliceSummary: vi.fn(
    (value: unknown) =>
      !!value &&
      typeof value === "object" &&
      typeof (value as { start?: unknown }).start === "number" &&
      typeof (value as { scoreDetail?: unknown }).scoreDetail === "object"
  ),
  validateNoiseSlicesForReplacement: vi.fn((value: unknown) => {
    if (!Array.isArray(value)) throw new TypeError("invalid noise history");
    const normalized = value.map((slice) => {
      if (!slice || typeof slice !== "object") throw new TypeError("invalid noise history");
      const record = structuredClone(slice) as NoiseSliceSummary;
      record.start = Math.round(record.start);
      record.end = Math.round(record.end);
      return record;
    });
    const identities = normalized.map((slice) => JSON.stringify(slice));
    if (new Set(identities).size !== identities.length) {
      throw new TypeError("duplicate noise history");
    }
    return normalized;
  }),
  replaceNoiseSlices: vi.fn(async (value: NoiseSliceSummary[]) => {
    if (dataState.failNoiseReplaceCount > 0) {
      dataState.failNoiseReplaceCount -= 1;
      throw new Error("injected noise write failure");
    }
    dataState.noise = structuredClone(value);
  }),
}));

function backgroundAsset(id: string, payload = "AA=="): AppearanceBackupAsset {
  return {
    id,
    kind: "background",
    name: `${id}.png`,
    mimeType: "image/png",
    dataUrl: `data:image/png;base64,${payload}`,
  };
}

function fontAsset(id: string, payload = "AA=="): AppearanceBackupAsset {
  return {
    id,
    kind: "font",
    name: `${id}.woff2`,
    mimeType: "font/woff2",
    dataUrl: `data:font/woff2;base64,${payload}`,
    family: `${id} Font`,
    format: "woff2",
  };
}

function noiseSlice(start = 1_000): NoiseSliceSummary {
  return {
    start,
    end: start + 60_000,
    frames: 10,
    raw: {
      avgDbfs: -40,
      maxDbfs: -20,
      p50Dbfs: -42,
      p95Dbfs: -25,
      overRatioDbfs: 0.1,
      segmentCount: 1,
    },
    display: { avgDb: 45, p95Db: 60 },
    score: 90,
    scoreDetail: {
      sustainedPenalty: 1,
      timePenalty: 2,
      segmentPenalty: 3,
      thresholdsUsed: {
        scoreThresholdDbfs: -30,
        segmentMergeGapMs: 500,
        maxSegmentsPerMin: 10,
      },
      sustainedLevelDbfs: -35,
      overRatioDbfs: 0.1,
      segmentCount: 1,
      minutes: 1,
    },
  };
}

function settingsWithBackground(assetId?: string) {
  const settings = getDefaultAppSettings();
  if (assetId) settings.appearance.global.background = { type: "image", assetId };
  return settings;
}

function backupWith(
  settings: Record<string, unknown>,
  assets: AppearanceBackupAsset[],
  noise?: NoiseSliceSummary[]
): ImmersiveClockBackupV1 {
  const summary = (id: "settings" | "assets" | "noiseHistory", data: unknown) => ({
    id,
    schemaVersion: 1,
    itemCount: Array.isArray(data) ? data.length : 1,
    bytes: new TextEncoder().encode(JSON.stringify(data)).byteLength,
  });
  return {
    format: BACKUP_FORMAT,
    backupVersion: BACKUP_VERSION,
    appVersion: "test",
    exportedAt: "2026-07-11T00:00:00.000Z",
    scope: noise ? "full" : "settings-and-assets",
    manifest: [
      summary("settings", settings),
      summary("assets", assets),
      ...(noise ? [summary("noiseHistory", noise)] : []),
    ],
    domains: {
      settings: { schemaVersion: 1, data: settings },
      assets: { schemaVersion: 1, data: assets },
      ...(noise ? { noiseHistory: { schemaVersion: 1, data: noise } } : {}),
    },
  };
}

describe("dataManagement", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    dataState.assets = [];
    dataState.noise = [];
    dataState.failNoiseReplaceCount = 0;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("创建完整备份并剔除可再生运行态", async () => {
    const settings = settingsWithBackground("background-main");
    settings.general.announcement = { hideUntil: 123, version: "3.0.0" };
    settings.general.timeSync.lastError = "offline";
    settings.general.timeSync.lastRttMs = 88;
    settings.general.timeSync.lastSyncAt = 456;
    settings.general.weather.manualLocation.resolved = { city: "杭州", lat: 30, lon: 120 };
    localStorage.setItem(APP_SETTINGS_KEY, JSON.stringify(settings));
    dataState.assets = [backgroundAsset("background-main")];
    dataState.noise = [noiseSlice()];

    const backup = await createBackup("full");
    const exported = backup.domains.settings.data;
    const general = exported.general as Record<string, unknown>;
    const timeSync = general.timeSync as Record<string, unknown>;
    const weather = general.weather as { manualLocation: Record<string, unknown> };

    expect(backup.format).toBe("immersive-clock-backup");
    expect(backup.domains.noiseHistory?.data).toHaveLength(1);
    expect(exported).not.toHaveProperty("modifiedAt");
    expect(general).not.toHaveProperty("announcement");
    expect(timeSync).toMatchObject({ offsetMs: 0, lastSyncAt: 0 });
    expect(timeSync).not.toHaveProperty("lastError");
    expect(timeSync).not.toHaveProperty("lastRttMs");
    expect(weather.manualLocation).not.toHaveProperty("resolved");

    const prepared = await prepareBackup(JSON.stringify(backup));
    expect(prepared.preview.hasNoiseHistory).toBe(true);
    expect(prepared.preview.domains.map((domain) => domain.id)).toEqual([
      "settings",
      "assets",
      "noiseHistory",
    ]);
  });

  it("settings-and-assets 备份不包含噪声历史", async () => {
    localStorage.setItem(APP_SETTINGS_KEY, JSON.stringify(settingsWithBackground()));
    dataState.noise = [noiseSlice()];

    const backup = await createBackup("settings-and-assets");
    expect(backup.domains.noiseHistory).toBeUndefined();
    expect(backup.manifest.map((entry) => entry.id)).toEqual(["settings", "assets"]);
  });

  it("备份恢复会保留中央信息轮播与自定义消息", async () => {
    const settings = settingsWithBackground();
    settings.study.infoCarousel = {
      autoRotate: false,
      intervalSec: 12,
      items: [
        { id: "progress-default", source: "progress", enabled: true, order: 0 },
        { id: "next-schedule-default", source: "nextSchedule", enabled: false, order: 1 },
        { id: "rain-default", source: "rain", enabled: true, order: 2 },
        {
          id: "custom-review",
          source: "custom",
          enabled: true,
          order: 3,
          text: "完成今日复盘",
        },
      ],
    };
    localStorage.setItem(APP_SETTINGS_KEY, JSON.stringify(settings));

    const prepared = await prepareBackup(JSON.stringify(await createBackup("settings-and-assets")));
    localStorage.setItem(APP_SETTINGS_KEY, JSON.stringify(settingsWithBackground()));
    await restoreBackup(prepared);

    expect(getAppSettings().study.infoCarousel).toMatchObject({
      autoRotate: false,
      intervalSec: 12,
      items: expect.arrayContaining([
        expect.objectContaining({ id: "next-schedule-default", enabled: false }),
        expect.objectContaining({ id: "custom-review", text: "完成今日复盘" }),
      ]),
    });
  });

  it("创建备份超过 150MB 时拒绝导出", async () => {
    localStorage.setItem(APP_SETTINGS_KEY, JSON.stringify(settingsWithBackground()));
    const encoded = new Uint8Array(new ArrayBuffer(0));
    Object.defineProperty(encoded, "byteLength", { value: MAX_BACKUP_BYTES + 1 });
    vi.spyOn(TextEncoder.prototype, "encode").mockReturnValue(encoded);

    await expect(createBackup("settings-and-assets")).rejects.toMatchObject({
      code: "BACKUP_TOO_LARGE",
    });
  });

  it("创建备份时合并重复背景并重写设置引用", async () => {
    localStorage.setItem(
      APP_SETTINGS_KEY,
      JSON.stringify(settingsWithBackground("background-copy"))
    );
    const original = backgroundAsset("background-original");
    dataState.assets = [original, { ...original, id: "background-copy" }];

    const backup = await createBackup("settings-and-assets");
    const appearance = backup.domains.settings.data.appearance as Record<string, unknown>;
    const global = appearance.global as { background: { assetId?: string } };

    expect(backup.domains.assets.data.map((asset) => asset.id)).toEqual(["background-original"]);
    expect(global.background.assetId).toBe("background-original");
  });

  it("兼容旧 v2 设置包与纯 AppSettings", async () => {
    const settings = settingsWithBackground();
    const importedQuote = settings.general.quote as unknown as Record<string, unknown>;
    importedQuote.animationMode = "slide";
    importedQuote.typingSpeed = "instant";
    importedQuote.typewriterBackspaceEnabled = "invalid";
    const legacyBundle = await prepareBackup({
      format: "immersive-clock-settings",
      version: 2,
      settings,
      assets: [],
    });
    const plainSettings = await prepareBackup(settings);
    const plainGeneral = plainSettings.backup.domains.settings.data.general as {
      quote: Record<string, unknown>;
    };

    expect(legacyBundle.sourceFormat).toBe("immersive-clock-settings-v2");
    expect(legacyBundle.preview.warnings[0]).toContain("v2");
    expect(plainSettings.sourceFormat).toBe("legacy-app-settings");
    expect(plainSettings.preview.hasNoiseHistory).toBe(false);
    expect(plainGeneral.quote).toMatchObject({
      animationMode: "typewriter",
      typingSpeed: "normal",
      typewriterBackspaceEnabled: true,
    });
  });

  it("在 Worker 不可用时仍可从 File 预检备份", async () => {
    const backup = backupWith(settingsWithBackground() as unknown as Record<string, unknown>, []);
    const file = new File([JSON.stringify(backup)], "immersive-clock-backup.json", {
      type: "application/json",
    });

    const prepared = await prepareBackupFile(file);
    expect(prepared.sourceFormat).toBe("immersive-clock-backup-v1");
  });

  it("预检拒绝未来版本、危险 URL、非法 MIME 和重复 ID 且不写存储", async () => {
    const original = JSON.stringify(settingsWithBackground());
    localStorage.setItem(APP_SETTINGS_KEY, original);
    dataState.assets = [backgroundAsset("existing")];
    dataState.noise = [noiseSlice()];

    await expect(
      prepareBackup({ ...settingsWithBackground(), version: 999 })
    ).rejects.toMatchObject({ code: "UNSUPPORTED_BACKUP_VERSION" });

    const unsafeSettings = settingsWithBackground() as unknown as Record<string, unknown>;
    const general = unsafeSettings.general as Record<string, unknown>;
    const timeSync = general.timeSync as Record<string, unknown>;
    timeSync.httpDateUrl = "javascript:alert(1)";
    await expect(prepareBackup(unsafeSettings)).rejects.toMatchObject({ code: "INVALID_BACKUP" });

    const duplicate = backgroundAsset("duplicate-a");
    const duplicateSettings = settingsWithBackground("duplicate-b");
    const deduplicated = await prepareBackup(
      backupWith(duplicateSettings as unknown as Record<string, unknown>, [
        duplicate,
        { ...duplicate, id: "duplicate-b" },
      ])
    );
    expect(deduplicated.backup.domains.assets.data.map((asset) => asset.id)).toEqual([
      "duplicate-a",
    ]);
    expect(
      (
        (deduplicated.backup.domains.settings.data.appearance as Record<string, unknown>)
          .global as { background: { assetId?: string } }
      ).background.assetId
    ).toBe("duplicate-a");

    await expect(
      prepareBackup(
        backupWith(settingsWithBackground() as unknown as Record<string, unknown>, [
          duplicate,
          backgroundAsset("duplicate-a", "AQ=="),
        ])
      )
    ).rejects.toMatchObject({ code: "INVALID_RESOURCE" });

    await expect(
      prepareBackup(
        backupWith(
          settingsWithBackground() as unknown as Record<string, unknown>,
          [],
          [noiseSlice(), noiseSlice()]
        )
      )
    ).rejects.toMatchObject({ code: "INVALID_BACKUP" });

    await expect(
      prepareBackup(
        backupWith(settingsWithBackground() as unknown as Record<string, unknown>, [
          {
            ...backgroundAsset("unsafe-svg"),
            mimeType: "image/svg+xml",
            dataUrl: "data:image/svg+xml;base64,AA==",
          },
        ])
      )
    ).rejects.toMatchObject({ code: "INVALID_RESOURCE" });

    expect(localStorage.getItem(APP_SETTINGS_KEY)).toBe(original);
    expect(dataState.assets).toEqual([backgroundAsset("existing")]);
    expect(dataState.noise).toHaveLength(1);
  });

  it("恢复失败时回滚设置、噪声历史和已暂存资源", async () => {
    const oldSettings = settingsWithBackground("background-old");
    const oldAsset = backgroundAsset("background-old");
    const oldNoise = noiseSlice(10_000);
    localStorage.setItem(APP_SETTINGS_KEY, JSON.stringify(oldSettings));
    dataState.assets = [oldAsset];
    dataState.noise = [oldNoise];

    const nextSettings = settingsWithBackground("background-new");
    const prepared = await prepareBackup(
      backupWith(
        nextSettings as unknown as Record<string, unknown>,
        [backgroundAsset("background-new", "AQ==")],
        [noiseSlice(20_000)]
      )
    );
    dataState.failNoiseReplaceCount = 1;

    await expect(restoreBackup(prepared)).rejects.toBeInstanceOf(DataManagementError);
    expect(localStorage.getItem(APP_SETTINGS_KEY)).toBe(JSON.stringify(oldSettings));
    expect(dataState.assets).toEqual([oldAsset]);
    expect(dataState.noise).toEqual([oldNoise]);
  });

  it("localStorage 配额写入失败时回滚已提交的资源和历史", async () => {
    const oldSettings = settingsWithBackground("background-old");
    const oldAsset = backgroundAsset("background-old");
    const oldNoise = noiseSlice(10_000);
    localStorage.setItem(APP_SETTINGS_KEY, JSON.stringify(oldSettings));
    dataState.assets = [oldAsset];
    dataState.noise = [oldNoise];

    const prepared = await prepareBackup(
      backupWith(
        settingsWithBackground("background-new") as unknown as Record<string, unknown>,
        [backgroundAsset("background-new", "AQ==")],
        [noiseSlice(20_000)]
      )
    );
    const originalSetItem = Storage.prototype.setItem;
    let remainingFailures = 1;
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (this: Storage, key, value) {
      if (key === APP_SETTINGS_KEY && remainingFailures > 0) {
        remainingFailures -= 1;
        throw new DOMException("quota exceeded", "QuotaExceededError");
      }
      return originalSetItem.call(this, key, value);
    });

    await expect(restoreBackup(prepared)).rejects.toMatchObject({ code: "RESTORE_FAILED" });
    expect(localStorage.getItem(APP_SETTINGS_KEY)).toBe(JSON.stringify(oldSettings));
    expect(dataState.assets).toEqual([oldAsset]);
    expect(dataState.noise).toEqual([oldNoise]);
  });

  it("恢复时为同 ID 不同正文的资源重映射设置引用", async () => {
    const sharedId = "background-shared";
    const oldAsset = backgroundAsset(sharedId, "AA==");
    const incomingAsset = backgroundAsset(sharedId, "AQ==");
    localStorage.setItem(APP_SETTINGS_KEY, JSON.stringify(settingsWithBackground(sharedId)));
    dataState.assets = [oldAsset];
    const prepared = await prepareBackup(
      backupWith(settingsWithBackground(sharedId) as unknown as Record<string, unknown>, [
        incomingAsset,
      ])
    );

    await restoreBackup(prepared);

    const restoredBackground = getAppSettings().appearance.global.background;
    const restoredId = restoredBackground.type === "image" ? restoredBackground.assetId : undefined;
    expect(restoredId).toMatch(/^restored:background:/);
    expect(restoredId).not.toBe(sharedId);
    expect(dataState.assets).toEqual([{ ...incomingAsset, id: restoredId }]);
  });

  it("完整替换按资源类型和 ID 清理跨类型同 ID 残留", async () => {
    const sharedId = "shared-resource";
    const retainedBackground = backgroundAsset(sharedId);
    localStorage.setItem(APP_SETTINGS_KEY, JSON.stringify(settingsWithBackground(sharedId)));
    dataState.assets = [retainedBackground, fontAsset(sharedId)];
    const prepared = await prepareBackup(
      backupWith(settingsWithBackground(sharedId) as unknown as Record<string, unknown>, [
        retainedBackground,
      ])
    );

    await restoreBackup(prepared);

    expect(dataState.assets).toEqual([retainedBackground]);
  });

  it("缓存清理仅命中白名单并保留设备种子和未知同源数据", async () => {
    localStorage.setItem("weather-cache", "cached");
    localStorage.setItem("immersive-clock.quote-runtime.v1", "cached");
    localStorage.setItem("api-governance.hitokoto.block-until", "100");
    localStorage.setItem("api-governance.hitokoto.backoff-level", "2");
    localStorage.setItem("api-governance.hitokoto.device-seed", "42");
    localStorage.setItem("sentinel.owner-data", "keep");
    sessionStorage.setItem("weather.minutely.popupOpen", "1");
    sessionStorage.setItem("other-session", "keep");

    const result = await clearDataScope("cache");

    expect(result.itemCount).toBe(5);
    expect(localStorage.getItem("weather-cache")).toBeNull();
    expect(localStorage.getItem("immersive-clock.quote-runtime.v1")).toBeNull();
    expect(localStorage.getItem("api-governance.hitokoto.block-until")).toBeNull();
    expect(localStorage.getItem("api-governance.hitokoto.backoff-level")).toBeNull();
    expect(localStorage.getItem("api-governance.hitokoto.device-seed")).toBe("42");
    expect(localStorage.getItem("sentinel.owner-data")).toBe("keep");
    expect(sessionStorage.getItem("weather.minutely.popupOpen")).toBeNull();
    expect(sessionStorage.getItem("other-session")).toBe("keep");
  });

  it("CacheStorage 删除失败时向上抛出清理错误", async () => {
    const deleteCache = vi.fn().mockRejectedValue(new Error("injected cache delete failure"));
    vi.stubGlobal("caches", {
      delete: deleteCache,
      keys: vi.fn().mockResolvedValue(["images-cache"]),
      open: vi.fn().mockResolvedValue({
        keys: vi.fn().mockResolvedValue([]),
        match: vi.fn(),
      }),
    });
    localStorage.setItem("weather-cache", "cached");

    await expect(clearDataScope("cache")).rejects.toThrow(
      "本地键已清理，但浏览器运行时缓存删除失败"
    );
    expect(deleteCache).toHaveBeenCalledWith("images-cache");
    expect(localStorage.getItem("weather-cache")).toBeNull();
  });

  it("识别并清理未引用资源", async () => {
    const settings = settingsWithBackground("background-used");
    localStorage.setItem(APP_SETTINGS_KEY, JSON.stringify(settings));
    dataState.assets = [backgroundAsset("background-used"), backgroundAsset("background-unused")];

    const inspection = await inspectUnusedAssets();
    expect(inspection.assets.map((asset) => asset.id)).toEqual(["background-unused"]);

    const result = await clearUnusedAssets();
    expect(result.itemCount).toBe(1);
    expect(dataState.assets).toEqual([backgroundAsset("background-used")]);
  });

  it("恢复默认偏好时保留课程、倒计时、语录、资源和噪声历史", async () => {
    const settings = settingsWithBackground("background-unused-after-reset");
    settings.study.schedule = [
      { id: "lesson", name: "数学", startTime: "08:00", endTime: "08:45" },
    ];
    settings.study.countdownItems = [
      {
        id: "exam",
        kind: "custom",
        name: "考试",
        targetDate: "2027-06-07",
        order: 0,
      },
    ];
    settings.study.infoCarousel.items.push({
      id: "custom-reset",
      source: "custom",
      enabled: false,
      order: 3,
      text: "保留自定义消息",
    });
    settings.general.quote.customChannels = [
      {
        id: "local-custom",
        name: "我的语录",
        enabled: true,
        weight: 10,
        quotes: ["保持专注"],
        orderMode: "random",
      },
    ];
    localStorage.setItem(APP_SETTINGS_KEY, JSON.stringify(settings));
    dataState.assets = [backgroundAsset("background-unused-after-reset")];
    dataState.noise = [noiseSlice()];

    await resetPreferences();
    const reset = getAppSettings();

    expect(reset.study.schedule).toEqual(settings.study.schedule);
    expect(reset.study.countdownItems).toEqual(settings.study.countdownItems);
    expect(reset.study.infoCarousel.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "custom-reset",
          enabled: false,
          text: "保留自定义消息",
        }),
      ])
    );
    expect(reset.general.quote.customChannels).toEqual(settings.general.quote.customChannels);
    expect(reset.appearance.global.background.type).toBe("default");
    expect(dataState.assets).toHaveLength(1);
    expect(dataState.noise).toHaveLength(1);
  });

  it("删除全部应用数据仍保留未知同源键", async () => {
    localStorage.setItem(APP_SETTINGS_KEY, JSON.stringify(settingsWithBackground()));
    localStorage.setItem("weather-cache", "cached");
    localStorage.setItem("error-center.records", "[]");
    localStorage.setItem("immersive-clock:has-seen-tour", "true");
    localStorage.setItem("api-governance.hitokoto.device-seed", "42");
    localStorage.setItem("noise-report.is-main-chart-combined", "true");
    localStorage.setItem("sentinel.owner-data", "keep");
    dataState.assets = [backgroundAsset("unused")];
    dataState.noise = [noiseSlice()];

    const result = await eraseAllData();

    expect(result.affectedDomains).toEqual([
      "settings",
      "assets",
      "noiseHistory",
      "cache",
      "diagnostics",
      "deviceState",
    ]);
    expect(localStorage.getItem(APP_SETTINGS_KEY)).toBeNull();
    expect(localStorage.getItem("weather-cache")).toBeNull();
    expect(localStorage.getItem("error-center.records")).toBeNull();
    expect(localStorage.getItem("immersive-clock:has-seen-tour")).toBeNull();
    expect(localStorage.getItem("api-governance.hitokoto.device-seed")).toBeNull();
    expect(localStorage.getItem("noise-report.is-main-chart-combined")).toBeNull();
    expect(localStorage.getItem("sentinel.owner-data")).toBe("keep");
    expect(dataState.assets).toEqual([]);
    expect(dataState.noise).toEqual([]);
  });

  it("通过服务读取并丢弃隔离的原始设置", () => {
    localStorage.setItem(
      APP_SETTINGS_QUARANTINE_KEY,
      JSON.stringify({ createdAt: 1_700_000_000_000, reason: "invalid-json", raw: "{bad" })
    );

    expect(getQuarantinedSettingsRecovery()).toEqual(
      expect.objectContaining({
        createdAt: 1_700_000_000_000,
        reason: "invalid-json",
        raw: "{bad",
        fileName: expect.stringMatching(/^immersive-clock-quarantined-settings-.*\.json$/),
      })
    );

    discardQuarantinedSettingsRecovery();
    expect(getQuarantinedSettingsRecovery()).toBeNull();
  });
});
