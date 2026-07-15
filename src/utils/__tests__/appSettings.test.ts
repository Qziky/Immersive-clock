import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

import { resolveQuoteChannels } from "../../services/quotes/quoteRegistry";
import { QuoteRuntimeStore } from "../../services/quotes/runtimeStorage";
import {
  APP_SETTINGS_KEY,
  APP_SETTINGS_QUARANTINE_KEY,
  CURRENT_SETTINGS_VERSION,
  MAX_STUDY_INFO_ITEMS,
  consumeStudyInfoLimitAdjustedNotice,
  getAppSettings,
  getQuarantinedAppSettings,
  migrateStoredAppSettings,
  normalizeAppSettings,
  normalizeStudyInfoCarousel,
  resetAppSettingsPreservingUserContent,
  saveQuoteSettings,
  updateTimeSyncSettings,
  updateStudySettings,
} from "../appSettings";
import {
  readStudyBackground,
  saveNormalBackground,
  saveStudyBackground,
} from "../studyBackgroundStorage";

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

/** appSettings 单元测试（函数级注释：验证默认值合并、深合并与局部更新行为） */
describe("appSettings", () => {
  const originalLocalStorage = globalThis.localStorage;

  beforeEach(() => {
    vi.restoreAllMocks();
    (globalThis as unknown as { localStorage: Storage }).localStorage = new MemoryStorage();
  });

  afterEach(() => {
    (globalThis as unknown as { localStorage: Storage }).localStorage = originalLocalStorage;
  });

  it("getAppSettings 在无存储时返回默认配置", () => {
    const s = getAppSettings();
    expect(s.version).toBe(4);
    expect(s.general.timeSync.provider).toBe("httpDate");
    expect(s.study.display).not.toHaveProperty("showStatusBar");
    expect(s.study.display).not.toHaveProperty("timeProgressMode");
    expect(s.study.display.showTime).toBe(true);
    expect(s.general.quote.autoRefreshEnabled).toBe(true);
    expect(s.general.quote.autoRefreshIntervalSec).toBe(600);
    expect(s.general.quote.animationMode).toBe("typewriter");
    expect(s.general.quote.typingSpeed).toBe("normal");
    expect(s.general.quote.typewriterBackspaceEnabled).toBe(true);
    expect(s.general.quote.channels).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "local-inspirational", enabled: true, weight: 40 }),
        expect.objectContaining({ id: "university-mottos", enabled: true, weight: 40 }),
        expect.objectContaining({ id: "hitokoto-api", enabled: true, weight: 20 }),
        expect.objectContaining({ id: "jinrishici-api", enabled: true, weight: 10 }),
        expect.objectContaining({ id: "advice-slip-api", enabled: true, weight: 10 }),
      ])
    );
    expect(s.general.quote.customChannels).toEqual([]);
    expect(s.study.infoCarousel).toMatchObject({ intervalSec: 6 });
    expect(s.study.infoCarousel).not.toHaveProperty("autoRotate");
    expect(s.study.infoCarousel.items.map((item) => item.source)).toEqual([
      "progress",
      "progress",
      "nextSchedule",
      "rain",
    ]);
    expect(s.study.infoCarousel.items).toEqual([
      expect.objectContaining({ source: "progress", progressKind: "day", enabled: true }),
      expect.objectContaining({ source: "progress", progressKind: "schedule", enabled: false }),
      expect.objectContaining({
        source: "nextSchedule",
        backgroundProgressKind: "day",
        leadMinutes: "always",
        enabled: false,
      }),
      expect.objectContaining({
        source: "rain",
        backgroundProgressKind: "day",
        leadMinutes: 30,
        enabled: false,
      }),
    ]);
  });

  it("normalizeStudyInfoCarousel 会补齐内置配置、按类型去重并依用户顺序限制 20 条", () => {
    consumeStudyInfoLimitAdjustedNotice();
    const customItems = Array.from({ length: MAX_STUDY_INFO_ITEMS + 5 }, (_, index) => ({
      id: `custom-${index}`,
      source: "custom",
      enabled: true,
      order: index,
      text: `消息 ${index}`,
    }));
    const normalized = normalizeStudyInfoCarousel({
      intervalSec: 99,
      items: [
        ...customItems,
        {
          id: "progress-default",
          source: "progress",
          progressKind: "day",
          enabled: true,
          order: 99,
        },
        {
          id: "progress-duplicate",
          source: "progress",
          progressKind: "day",
          enabled: true,
          order: 1,
        },
      ],
    });

    expect(normalized.intervalSec).toBe(30);
    expect(normalized).not.toHaveProperty("autoRotate");
    expect(normalized.items).toHaveLength(customItems.length + 4);
    expect(normalized.items.filter((item) => item.enabled)).toHaveLength(MAX_STUDY_INFO_ITEMS);
    expect(normalized.items.filter((item) => item.source !== "custom")).toHaveLength(4);
    expect(
      normalized.items.find((item) => item.source === "progress" && item.progressKind === "day")
        ?.enabled
    ).toBe(false);
    expect(normalized.items.find((item) => item.source === "nextSchedule")?.enabled).toBe(false);
    expect(normalized.items.find((item) => item.source === "rain")?.enabled).toBe(false);
    expect(normalized.items.find((item) => item.id === "custom-19")?.enabled).toBe(true);
    expect(normalized.items.find((item) => item.id === "custom-20")).toMatchObject({
      enabled: false,
      text: "消息 20",
    });
    expect(new Set(normalized.items.map((item) => item.id)).size).toBe(normalized.items.length);
    expect(consumeStudyInfoLimitAdjustedNotice()).toBe(false);
  });

  it("normalizeStudyInfoCarousel 按首次出现稳定去除重复 ID", () => {
    const normalized = normalizeStudyInfoCarousel({
      items: [
        { id: "custom-shared", source: "custom", enabled: true, order: 0, text: "保留我" },
        { id: "custom-shared", source: "custom", enabled: true, order: 1, text: "重复项" },
      ],
    });

    expect(normalized.items.filter((item) => item.id === "custom-shared")).toEqual([
      expect.objectContaining({ text: "保留我" }),
    ]);
  });

  it("启动迁移只提示一次被调整的旧轮播配置", () => {
    consumeStudyInfoLimitAdjustedNotice();
    localStorage.setItem(
      APP_SETTINGS_KEY,
      JSON.stringify({
        version: 3,
        study: {
          infoCarousel: {
            intervalSec: 6,
            items: Array.from({ length: MAX_STUDY_INFO_ITEMS + 1 }, (_, index) => ({
              id: `legacy-${index}`,
              source: "custom",
              enabled: true,
              order: index,
              text: `旧消息 ${index}`,
            })),
          },
        },
      })
    );

    migrateStoredAppSettings();

    expect(consumeStudyInfoLimitAdjustedNotice()).toBe(true);
    expect(consumeStudyInfoLimitAdjustedNotice()).toBe(false);
    expect(getAppSettings().study.infoCarousel.items.filter((item) => item.enabled)).toHaveLength(
      MAX_STUDY_INFO_ITEMS
    );
  });

  it("normalizeStudyInfoCarousel 会约束非法间隔和空白自定义消息", () => {
    const normalized = normalizeStudyInfoCarousel({
      intervalSec: 0,
      items: [{ id: "custom-empty", source: "custom", enabled: true, order: 0, text: "   " }],
    });

    expect(normalized.intervalSec).toBe(3);
    expect(normalized.items.some((item) => item.id === "custom-empty")).toBe(false);
    expect(normalized.items.map((item) => item.source)).toEqual([
      "progress",
      "progress",
      "nextSchedule",
      "rain",
    ]);
    expect(normalized.items.every((item) => !item.enabled)).toBe(true);
  });

  it("getAppSettings 能对 study.display 做深合并，避免缺字段", () => {
    localStorage.setItem(
      APP_SETTINGS_KEY,
      JSON.stringify({
        study: {
          display: { showQuote: false },
        },
      })
    );

    const s = getAppSettings();
    expect(s.study.display.showQuote).toBe(false);
    expect(s.study.display).not.toHaveProperty("timeProgressMode");
    expect(s.study.display.showWeather).toBe(true);
    expect(s.study.display.showTime).toBe(true);
    expect(s.study.display.showDate).toBe(true);
  });

  it("getAppSettings 能对 general.weather 做合并并补齐默认字段", () => {
    localStorage.setItem(
      APP_SETTINGS_KEY,
      JSON.stringify({
        general: {
          weather: { autoRefreshIntervalMin: 60 },
        },
      })
    );

    const s = getAppSettings();
    expect(s.general.weather.autoRefreshIntervalMin).toBe(60);
    expect(s.general.weather.locationMode).toBe("auto");
    expect(s.general.weather.manualLocation.type).toBe("city");
  });

  it("getAppSettings 能兼容拆分版 alerts 字段，并合并到 minutelyPrecip", () => {
    localStorage.setItem(
      APP_SETTINGS_KEY,
      JSON.stringify({
        study: {
          alerts: { minutelyForecast: true, precipDuration: false },
        },
      })
    );

    const s = getAppSettings();
    expect(s.study.alerts.minutelyPrecip).toBe(true);
  });

  it("updateTimeSyncSettings 会深合并 timeSync，避免覆盖丢字段", () => {
    localStorage.setItem(
      APP_SETTINGS_KEY,
      JSON.stringify({
        general: {
          timeSync: { provider: "timeApi", timeApiUrl: "https://api.example/time" },
        },
      })
    );

    updateTimeSyncSettings({ enabled: true });

    const s = getAppSettings();
    expect(s.general.timeSync.enabled).toBe(true);
    expect(s.general.timeSync.provider).toBe("timeApi");
    expect(s.general.timeSync.timeApiUrl).toBe("https://api.example/time");
  });

  it("updateStudySettings 会深合并 display/style/alerts/background", () => {
    localStorage.setItem(
      APP_SETTINGS_KEY,
      JSON.stringify({
        study: {
          display: { showQuote: false },
          style: { digitOpacity: 0.5 },
          alerts: { weatherAlert: true },
          background: { type: "color", color: "#000000" },
        },
      })
    );

    updateStudySettings({
      display: { showCountdown: false },
      infoCarousel: { intervalSec: 12 },
      alerts: { minutelyPrecip: true },
      background: { colorAlpha: 0.8 },
    });

    const s = getAppSettings();
    expect(s.study.display.showQuote).toBe(false);
    expect(s.study.display.showCountdown).toBe(false);
    expect(s.study.display.showTime).toBe(true);
    expect(s.study.infoCarousel.intervalSec).toBe(12);
    expect(s.study.infoCarousel.items).toHaveLength(4);
    expect(s.study.style.digitOpacity).toBe(0.5);
    expect(s.study.alerts.weatherAlert).toBe(true);
    expect(s.study.alerts.minutelyPrecip).toBe(true);
    expect(s.study.background.type).toBe("color");
    expect(s.study.background.color).toBe("#000000");
    expect(s.study.background.colorAlpha).toBe(0.8);
  });

  it("saveStudyBackground 能兼容旧系统背景并映射为深灰", () => {
    updateStudySettings({
      background: {
        type: "image",
        imageDataUrl: "data:image/png;base64,example",
      },
    });

    saveStudyBackground({ type: "system" });

    expect(getAppSettings().study.background).toEqual({ type: "dark" });
  });

  it("saveNormalBackground 会独立保存普通页面背景", () => {
    saveNormalBackground({ type: "color", color: "#102030", colorAlpha: 0.75 });

    const settings = getAppSettings();
    expect(settings.general.background).toEqual({
      type: "color",
      color: "#102030",
      colorAlpha: 0.75,
    });
    expect(settings.study.background.type).toBe("default");
  });

  it("readStudyBackground 会将旧系统背景映射为深灰", () => {
    updateStudySettings({ background: { type: "system" } });

    expect(readStudyBackground().type).toBe("dark");
  });

  it("纯黑预设不会保留自定义背景字段", () => {
    saveNormalBackground({
      type: "black",
      color: "#ffffff",
      colorAlpha: 0.5,
      imageDataUrl: "data:image/png;base64,unused",
    });

    expect(getAppSettings().general.background).toEqual({ type: "black" });
  });

  it("会把 v1 外观显式迁移并保留旧 standalone 样式键", () => {
    localStorage.setItem(
      APP_SETTINGS_KEY,
      JSON.stringify({
        version: 1,
        general: { background: { type: "dark" } },
        study: { background: { type: "black" }, style: {} },
      })
    );
    localStorage.setItem("study-digit-color", "#12abef");
    localStorage.setItem("study-digit-opacity", "0.45");

    const migrated = migrateStoredAppSettings();

    expect(migrated.version).toBe(CURRENT_SETTINGS_VERSION);
    expect(migrated.appearance.scenes.study.components.studyCountdown?.slots?.digit).toEqual({
      color: "#12abef",
      opacity: 0.45,
    });
    expect(JSON.parse(localStorage.getItem(APP_SETTINGS_KEY) ?? "{}").version).toBe(
      CURRENT_SETTINGS_VERSION
    );
  });

  it.each([
    { hitokotoEnabled: true, expectedNewRemoteEnabled: true },
    { hitokotoEnabled: false, expectedNewRemoteEnabled: false },
  ])(
    "v2 一言启用状态为 $hitokotoEnabled 时会为新增在线源选择对应默认值",
    ({ hitokotoEnabled, expectedNewRemoteEnabled }) => {
      localStorage.setItem(
        APP_SETTINGS_KEY,
        JSON.stringify({
          version: 2,
          general: {
            quote: {
              autoRefreshInterval: 600,
              channels: [
                {
                  id: "hitokoto-api",
                  enabled: hitokotoEnabled,
                  weight: 27,
                  onlineFetch: true,
                  hitokotoCategories: ["a", "h", "j"],
                },
              ],
              lastUpdated: 123,
            },
          },
        })
      );

      const quote = migrateStoredAppSettings().general.quote;
      const channelMap = new Map(quote.channels.map((channel) => [channel.id, channel]));

      expect(channelMap.get("hitokoto-api")).toEqual(
        expect.objectContaining({
          enabled: hitokotoEnabled,
          weight: 27,
          hitokotoCategories: ["a", "h", "j"],
        })
      );
      expect(channelMap.get("jinrishici-api")?.enabled).toBe(expectedNewRemoteEnabled);
      expect(channelMap.get("advice-slip-api")?.enabled).toBe(expectedNewRemoteEnabled);
      expect(quote).not.toHaveProperty("lastUpdated");
    }
  );

  it("v2 迁移会保留本地覆盖与自定义 TXT，并丢弃未知在线源和重复项", () => {
    localStorage.setItem(
      APP_SETTINGS_KEY,
      JSON.stringify({
        version: 2,
        general: {
          quote: {
            autoRefreshInterval: 1800,
            channels: [
              null,
              { id: "hitokoto-api", enabled: true, weight: 31, hitokotoCategories: ["k"] },
              { id: "hitokoto-api", enabled: false, weight: 99, hitokotoCategories: ["l"] },
              {
                id: "local-inspirational",
                enabled: false,
                weight: 55,
                onlineFetch: false,
                quotes: [" 自定义本地句子 ", "", 123],
                orderMode: "sequential",
                currentQuoteIndex: 8,
              },
              {
                id: "txt-channel",
                name: "导入文件",
                enabled: true,
                weight: 12,
                onlineFetch: false,
                quotes: ["第一句", "第二句"],
                orderMode: "sequential",
                currentQuoteIndex: 1,
              },
              {
                id: "txt-channel",
                name: "重复文件",
                enabled: false,
                weight: 99,
                onlineFetch: false,
                quotes: ["不应覆盖"],
              },
              {
                id: "unknown-api",
                name: "未知在线源",
                enabled: true,
                weight: 99,
                onlineFetch: true,
                apiEndpoint: "https://example.com/quote",
                quotes: ["不应保留"],
              },
            ],
          },
        },
      })
    );

    const migrated = migrateStoredAppSettings();
    const quote = migrated.general.quote;
    const channelMap = new Map(quote.channels.map((channel) => [channel.id, channel]));

    expect(channelMap.get("hitokoto-api")).toEqual(
      expect.objectContaining({ weight: 31, hitokotoCategories: ["k"] })
    );
    expect(channelMap.get("local-inspirational")).toEqual(
      expect.objectContaining({
        enabled: false,
        weight: 55,
        orderMode: "sequential",
        quotesOverride: ["自定义本地句子"],
      })
    );
    expect(quote.customChannels).toEqual([
      expect.objectContaining({
        id: "txt-channel",
        name: "导入文件",
        quotes: ["第一句", "第二句"],
        orderMode: "sequential",
      }),
    ]);
    expect(quote.channels.some((channel) => channel.id === "unknown-api")).toBe(false);
    expect(JSON.stringify(quote)).not.toContain("currentQuoteIndex");
    expect(JSON.stringify(quote)).not.toContain("apiEndpoint");

    const runtimeStore = new QuoteRuntimeStore({ storage: localStorage });
    expect(runtimeStore.takeSequentialIndex("local-inspirational", 30)).toBe(8);
    expect(runtimeStore.takeSequentialIndex("txt-channel", 2)).toBe(1);
  });

  it.each([
    { legacyInterval: 0, enabled: false, interval: 600 },
    { legacyInterval: 1, enabled: true, interval: 30 },
    { legacyInterval: 30, enabled: true, interval: 30 },
    { legacyInterval: 1800, enabled: true, interval: 1800 },
    { legacyInterval: 9999, enabled: true, interval: 1800 },
    { legacyInterval: null, enabled: true, interval: 600 },
    { legacyInterval: "invalid", enabled: true, interval: 600 },
  ])(
    "v2 自动刷新值 $legacyInterval 会迁移为 enabled=$enabled interval=$interval",
    ({ legacyInterval, enabled, interval }) => {
      localStorage.setItem(
        APP_SETTINGS_KEY,
        JSON.stringify({
          version: 2,
          general: { quote: { autoRefreshInterval: legacyInterval, channels: [] } },
        })
      );

      const quote = migrateStoredAppSettings().general.quote;
      expect(quote.autoRefreshEnabled).toBe(enabled);
      expect(quote.autoRefreshIntervalSec).toBe(interval);
    }
  );

  it("v3 损坏数据会安全归一，并由 saveQuoteSettings 一次写入精简偏好", () => {
    localStorage.setItem(
      APP_SETTINGS_KEY,
      JSON.stringify({
        version: 3,
        general: {
          quote: {
            autoRefreshEnabled: false,
            autoRefreshIntervalSec: null,
            animationMode: "slide",
            typingSpeed: "instant",
            typewriterBackspaceEnabled: "invalid",
            channels: [
              { id: "hitokoto-api", enabled: "bad", weight: "bad" },
              { id: "hitokoto-api", enabled: false, weight: 44 },
              { id: "missing-api", enabled: true, weight: 100 },
            ],
            customChannels: [null, { id: "empty", quotes: [] }],
          },
        },
      })
    );

    const loaded = getAppSettings();
    expect(loaded.general.quote.autoRefreshEnabled).toBe(false);
    expect(loaded.general.quote.autoRefreshIntervalSec).toBe(600);
    expect(loaded.general.quote.animationMode).toBe("typewriter");
    expect(loaded.general.quote.typingSpeed).toBe("normal");
    expect(loaded.general.quote.typewriterBackspaceEnabled).toBe(true);
    expect(loaded.general.quote.channels.find((channel) => channel.id === "hitokoto-api")).toEqual(
      expect.objectContaining({ enabled: true, weight: 20 })
    );
    expect(loaded.general.quote.customChannels).toEqual([]);

    const resolvedChannels = resolveQuoteChannels(
      loaded.general.quote.channels,
      loaded.general.quote.customChannels
    );
    const setItemSpy = vi.spyOn(localStorage, "setItem");
    saveQuoteSettings(resolvedChannels, {
      autoRefreshEnabled: true,
      autoRefreshIntervalSec: 5000,
      animationMode: "crossfade",
      typingSpeed: "fast",
      typewriterBackspaceEnabled: false,
    });

    expect(setItemSpy).toHaveBeenCalledTimes(1);
    const saved = JSON.parse(localStorage.getItem(APP_SETTINGS_KEY) ?? "{}");
    expect(saved.version).toBe(4);
    expect(saved.general.quote.autoRefreshEnabled).toBe(true);
    expect(saved.general.quote.autoRefreshIntervalSec).toBe(1800);
    expect(saved.general.quote.animationMode).toBe("crossfade");
    expect(saved.general.quote.typingSpeed).toBe("fast");
    expect(saved.general.quote.typewriterBackspaceEnabled).toBe(false);
    expect(saved.general.quote).not.toHaveProperty("lastUpdated");
    expect(saved.general.quote.channels[0]).not.toHaveProperty("apiEndpoint");
  });

  it.each([
    ["缺失", {}],
    ["非法", { animationMode: "slide", typingSpeed: "instant" }],
  ])("启动迁移会将 v3 %s动画设置归一到默认值并写回", (_label, animationSettings) => {
    localStorage.setItem(
      APP_SETTINGS_KEY,
      JSON.stringify({
        version: 3,
        general: {
          quote: {
            ...animationSettings,
            autoRefreshEnabled: true,
            autoRefreshIntervalSec: 600,
            channels: [],
            customChannels: [],
          },
        },
      })
    );

    const migrated = migrateStoredAppSettings();
    const saved = JSON.parse(localStorage.getItem(APP_SETTINGS_KEY) ?? "{}");

    expect(migrated.general.quote.animationMode).toBe("typewriter");
    expect(migrated.general.quote.typingSpeed).toBe("normal");
    expect(migrated.general.quote.typewriterBackspaceEnabled).toBe(true);
    expect(saved.general.quote.animationMode).toBe("typewriter");
    expect(saved.general.quote.typingSpeed).toBe("normal");
    expect(saved.general.quote.typewriterBackspaceEnabled).toBe(true);
  });

  it("normalizeAppSettings 会在不写入存储的情况下规范化导入候选", () => {
    const original = JSON.stringify({ marker: "unchanged" });
    localStorage.setItem(APP_SETTINGS_KEY, original);

    const normalized = normalizeAppSettings({
      version: 1,
      study: { display: { showQuote: false } },
    });

    expect(normalized.version).toBe(CURRENT_SETTINGS_VERSION);
    expect(normalized.study.display.showQuote).toBe(false);
    expect(localStorage.getItem(APP_SETTINGS_KEY)).toBe(original);
  });

  it.each([
    ["缺失", undefined],
    ["非法", "semester"],
  ])("v3 %s进度模式会迁移为 day 进度项并移除旧显示字段", (_label, candidate) => {
    localStorage.setItem(
      APP_SETTINGS_KEY,
      JSON.stringify({
        version: 3,
        study: {
          display: {
            showStatusBar: true,
            ...(candidate === undefined ? {} : { timeProgressMode: candidate }),
          },
        },
      })
    );
    const setItemSpy = vi.spyOn(localStorage, "setItem");

    const migrated = migrateStoredAppSettings();
    const saved = JSON.parse(localStorage.getItem(APP_SETTINGS_KEY) ?? "{}");
    const enabledProgress = migrated.study.infoCarousel.items.find(
      (item) => item.source === "progress" && item.enabled
    );

    expect(migrated.version).toBe(4);
    expect(enabledProgress).toMatchObject({ source: "progress", progressKind: "day" });
    expect(migrated.study.display).not.toHaveProperty("showStatusBar");
    expect(migrated.study.display).not.toHaveProperty("timeProgressMode");
    expect(saved.study.display).not.toHaveProperty("showStatusBar");
    expect(saved.study.display).not.toHaveProperty("timeProgressMode");
    expect(setItemSpy).toHaveBeenCalledTimes(1);
  });

  it("v3 会把进度模式迁移到进度项和每个提示项的背景", () => {
    localStorage.setItem(
      APP_SETTINGS_KEY,
      JSON.stringify({
        version: 3,
        study: {
          display: { showStatusBar: true, timeProgressMode: "schedule" },
          infoCarousel: {
            autoRotate: false,
            intervalSec: 12,
            items: [
              { id: "progress-default", source: "progress", enabled: true, order: 0 },
              { id: "next-schedule-default", source: "nextSchedule", enabled: true, order: 1 },
              { id: "rain-default", source: "rain", enabled: true, order: 2 },
              {
                id: "custom-review",
                source: "custom",
                enabled: true,
                order: 3,
                text: "完成复盘",
              },
            ],
          },
        },
      })
    );

    const migrated = migrateStoredAppSettings();

    expect(migrated.study.infoCarousel.intervalSec).toBe(12);
    expect(migrated.study.infoCarousel).not.toHaveProperty("autoRotate");
    expect(migrated.study.infoCarousel.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ source: "progress", progressKind: "schedule", enabled: true }),
        expect.objectContaining({
          source: "nextSchedule",
          backgroundProgressKind: "schedule",
          leadMinutes: "always",
        }),
        expect.objectContaining({
          source: "rain",
          backgroundProgressKind: "schedule",
          leadMinutes: 30,
        }),
        expect.objectContaining({
          source: "custom",
          backgroundProgressKind: "schedule",
          text: "完成复盘",
        }),
      ])
    );
    expect(
      migrated.study.infoCarousel.items.find(
        (item) => item.source === "progress" && item.progressKind === "day"
      )?.enabled
    ).toBe(false);
  });

  it("v3 隐藏状态栏会迁移为全部信息项停用", () => {
    const migrated = normalizeAppSettings({
      version: 3,
      study: {
        display: { showStatusBar: false, timeProgressMode: "schedule" },
        infoCarousel: {
          autoRotate: true,
          intervalSec: 9,
          items: [
            { id: "progress-default", source: "progress", enabled: true, order: 0 },
            { id: "rain-default", source: "rain", enabled: true, order: 1 },
          ],
        },
      },
    });

    expect(migrated.study.infoCarousel.items.every((item) => !item.enabled)).toBe(true);
    expect(migrated.study.infoCarousel.intervalSec).toBe(9);
  });

  it("v4 信息项可无损往返并保留各自的进度绑定和提示窗口", () => {
    const normalized = normalizeAppSettings({
      version: 4,
      study: {
        infoCarousel: {
          autoRotate: false,
          intervalSec: 15,
          items: [
            {
              id: "progress-day",
              source: "progress",
              progressKind: "day",
              enabled: true,
              order: 0,
            },
            {
              id: "progress-schedule",
              source: "progress",
              progressKind: "schedule",
              enabled: true,
              order: 1,
            },
            {
              id: "next",
              source: "nextSchedule",
              backgroundProgressKind: "schedule",
              leadMinutes: 60,
              enabled: true,
              order: 2,
            },
            {
              id: "rain",
              source: "rain",
              backgroundProgressKind: "day",
              leadMinutes: 10,
              enabled: true,
              order: 3,
            },
            {
              id: "custom",
              source: "custom",
              backgroundProgressKind: "schedule",
              text: "保持专注",
              enabled: true,
              order: 4,
            },
          ],
        },
      },
    });

    expect(normalized.study.infoCarousel).not.toHaveProperty("autoRotate");
    expect(normalized.study.infoCarousel.items).toEqual([
      expect.objectContaining({ source: "progress", progressKind: "day" }),
      expect.objectContaining({ source: "progress", progressKind: "schedule" }),
      expect.objectContaining({
        source: "nextSchedule",
        backgroundProgressKind: "schedule",
        leadMinutes: 60,
      }),
      expect.objectContaining({
        source: "rain",
        backgroundProgressKind: "day",
        leadMinutes: 10,
      }),
      expect.objectContaining({
        source: "custom",
        backgroundProgressKind: "schedule",
        text: "保持专注",
      }),
    ]);
    expect(normalizeAppSettings(JSON.parse(JSON.stringify(normalized)))).toEqual(normalized);
  });

  it("恢复默认设置时保留课程、倒计时和语录内容，但重置外观与功能偏好", () => {
    const current = getAppSettings();
    current.general.startup.initialMode = "study";
    current.general.quote.animationMode = "crossfade";
    current.general.quote.typingSpeed = "fast";
    current.general.quote.typewriterBackspaceEnabled = false;
    current.general.quote.customChannels = [
      {
        id: "custom:test",
        name: "自定义",
        enabled: true,
        weight: 10,
        quotes: ["保留内容"],
        orderMode: "random",
      },
    ];
    current.study.countdownMode = "single";
    current.study.customCountdown = { name: "期末", date: "2030-01-01" };
    current.study.countdownItems = [
      {
        id: "exam",
        kind: "custom",
        name: "考试",
        targetDate: "2030-01-01",
        order: 0,
      },
    ];
    current.study.infoCarousel = {
      intervalSec: 24,
      items: [
        {
          id: "progress-day-default",
          source: "progress",
          progressKind: "day",
          enabled: false,
          order: 0,
        },
        {
          id: "custom-review",
          source: "custom",
          backgroundProgressKind: "schedule",
          enabled: true,
          order: 7,
          text: "完成今日复盘",
        },
      ],
    };
    current.study.schedule = [
      { id: "morning", startTime: "08:00", endTime: "09:00", name: "数学" },
    ];
    current.appearance.global.background = { type: "black" };
    localStorage.setItem(APP_SETTINGS_KEY, JSON.stringify(current));

    const reset = resetAppSettingsPreservingUserContent();

    expect(reset.general.startup.initialMode).toBe("clock");
    expect(reset.general.quote.animationMode).toBe("crossfade");
    expect(reset.general.quote.typingSpeed).toBe("fast");
    expect(reset.general.quote.typewriterBackspaceEnabled).toBe(false);
    expect(reset.general.quote.customChannels[0]?.quotes).toEqual(["保留内容"]);
    expect(reset.study.countdownItems[0]?.name).toBe("考试");
    expect(reset.study.schedule[0]?.name).toBe("数学");
    expect(reset.study.infoCarousel.intervalSec).toBe(6);
    expect(
      reset.study.infoCarousel.items.find(
        (item) => item.source === "progress" && item.progressKind === "day"
      )?.enabled
    ).toBe(true);
    expect(
      reset.study.infoCarousel.items.find((item) => item.id === "custom-review")
    ).toMatchObject({
      enabled: false,
      order: 7,
      backgroundProgressKind: "schedule",
      text: "完成今日复盘",
    });
    expect(reset.appearance.global.background.type).toBe("default");
  });

  it("启动迁移会隔离损坏 JSON 并恢复默认设置", () => {
    localStorage.setItem(APP_SETTINGS_KEY, "{broken-json");

    const migrated = migrateStoredAppSettings();

    expect(migrated.version).toBe(CURRENT_SETTINGS_VERSION);
    expect(getQuarantinedAppSettings()).toMatchObject({
      reason: "invalid-json",
      raw: "{broken-json",
    });
    expect(localStorage.getItem(APP_SETTINGS_QUARANTINE_KEY)).not.toBeNull();
  });

  it("启动迁移会隔离未来版本设置而不是阻断启动", () => {
    const raw = JSON.stringify({ version: CURRENT_SETTINGS_VERSION + 1, study: {} });
    localStorage.setItem(APP_SETTINGS_KEY, raw);

    const migrated = migrateStoredAppSettings();

    expect(migrated.version).toBe(CURRENT_SETTINGS_VERSION);
    expect(getQuarantinedAppSettings()).toMatchObject({
      reason: "unsupported-version",
      raw,
    });
  });
});
