import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

import type { WeatherDetailsResponse } from "../../types/weather";
import {
  clearWeatherCache,
  cleanupWeatherCache,
  createWeatherLocationKey,
  getWeatherCache,
  getValidCoords,
  getValidDaily3d,
  getValidWeatherDetails,
  getValidHourly72h,
  getValidAirQuality,
  getValidAstronomySun,
  getValidLocation,
  getValidMinutely,
  getValidXiaomiLocation,
  readStationAlertRecord,
  updateCoordsCache,
  updateDaily3dCache,
  updateHourly72hCache,
  updateHourly72hLastFetch,
  updateAirQualityCache,
  updateAstronomySunCache,
  updateGeolocationDiagnostics,
  updateLocationCache,
  updateMinutelyCache,
  updateMinutelyCriticalFetch,
  updateMinutelyLastFetch,
  updateAlertTag,
  updateWeatherDetailsCache,
  updateWeatherNowSnapshot,
  updateXiaomiLocationCache,
  writeStationAlertRecord,
} from "../weatherStorage";

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

function weatherDetailsFixture(): WeatherDetailsResponse {
  return {
    alerts: [],
    brands: [],
    daily: [],
    hourly: [],
    indices: [],
    previousHours: [],
    raw: {
      sourceMaps: { rawSentinel: "details-raw" },
      status: 0,
    },
    technical: {
      channels: [],
      sourceMaps: { rawSentinel: "details-raw" },
      statuses: { response: 0 },
      units: {},
      urls: {},
    },
    typhoons: [],
  };
}

/** weatherStorage 单元测试（函数级注释：验证缓存 TTL、签名合并与预警记录清理） */
describe("weatherStorage", () => {
  const originalLocalStorage = globalThis.localStorage;

  beforeEach(() => {
    vi.restoreAllMocks();
    (globalThis as unknown as { localStorage: Storage }).localStorage = new MemoryStorage();
  });

  afterEach(() => {
    (globalThis as unknown as { localStorage: Storage }).localStorage = originalLocalStorage;
  });

  it("坐标缓存在 TTL 内有效，超时后无效", () => {
    vi.spyOn(Date, "now").mockReturnValue(1000);
    updateCoordsCache(31.2, 121.5, "ip");
    expect(getValidCoords()).toMatchObject({ lat: 31.2, lon: 121.5, source: "ip" });

    vi.spyOn(Date, "now").mockReturnValue(1000 + 12 * 60 * 60 * 1000 + 1);
    expect(getValidCoords()).toBeNull();
  });

  it("位置缓存按 signature 命中，并在同签名下保留旧字段", () => {
    vi.spyOn(Date, "now").mockReturnValue(1000);
    updateLocationCache(31.20009, 121.50001, {
      city: "上海",
      address: "A 路 1 号",
      addressSource: "amap",
    });

    vi.spyOn(Date, "now").mockReturnValue(1100);
    updateLocationCache(31.20008, 121.50002, { city: "上海市" });

    const loc = getValidLocation(31.20008, 121.50002);
    expect(loc?.city).toBe("上海市");
    expect(loc?.address).toBe("A 路 1 号");
    expect(loc?.addressSource).toBe("amap");
  });

  it("站点预警记录在 TTL 内可读，超时后不可读", () => {
    vi.spyOn(Date, "now").mockReturnValue(1000);
    writeStationAlertRecord("station-1", "sig-1");
    expect(readStationAlertRecord("station-1")?.sig).toBe("sig-1");

    vi.spyOn(Date, "now").mockReturnValue(1000 + 12 * 60 * 60 * 1000 + 1);
    expect(readStationAlertRecord("station-1")).toBeNull();
  });

  it("clearWeatherCache 会清空所有缓存", () => {
    vi.spyOn(Date, "now").mockReturnValue(1000);
    updateCoordsCache(1, 2, "ip");
    expect(getValidCoords()).not.toBeNull();

    clearWeatherCache();
    expect(getValidCoords()).toBeNull();
  });

  it("updateWeatherNowSnapshot 与 updateAlertTag 能写入快照与预警元数据", () => {
    vi.spyOn(Date, "now").mockReturnValue(1000);
    updateWeatherNowSnapshot({ code: "200", now: { text: "晴" } });
    updateAlertTag("tag-1");

    const cache = getWeatherCache();
    expect(cache.now?.data?.now?.text).toBe("晴");
    expect(cache.alertMetadata?.lastTag).toBe("tag-1");
  });

  it("完整天气详情按标准化坐标签名写入并保留原始响应", () => {
    vi.spyOn(Date, "now").mockReturnValue(1000);
    const location = createWeatherLocationKey(31.2, 121.5);
    const details = weatherDetailsFixture();

    updateWeatherDetailsCache(location, details);

    expect(location).toBe("121.5000,31.2000");
    expect(getValidWeatherDetails(location)).toBeTruthy();
    expect(getValidWeatherDetails(location)?.raw.sourceMaps).toEqual({
      rawSentinel: "details-raw",
    });
    expect(getWeatherCache().details).toMatchObject({
      location: "121.5000,31.2000",
      updatedAt: 1000,
    });
  });

  it("完整天气详情仅对匹配坐标生效，并在三小时后失效", () => {
    vi.spyOn(Date, "now").mockReturnValue(1000);
    updateWeatherDetailsCache("121.5000,31.2000", weatherDetailsFixture());

    expect(getValidWeatherDetails("116.4080,39.9040")).toBeNull();

    vi.spyOn(Date, "now").mockReturnValue(1000 + 3 * 60 * 60 * 1000 + 1);
    expect(getValidWeatherDetails("121.5000,31.2000")).toBeNull();
  });

  it("小米 locationKey 按四位坐标签名缓存 24 小时", () => {
    vi.spyOn(Date, "now").mockReturnValue(1000);
    updateXiaomiLocationCache({
      lat: 31.2,
      locationKey: "weathercn:101020100",
      lon: 121.5,
      name: "上海市",
    });

    expect(getValidXiaomiLocation(31.20001, 121.50001)).toMatchObject({
      locationKey: "weathercn:101020100",
      name: "上海市",
    });
    expect(getValidXiaomiLocation(39.904, 116.408)).toBeNull();

    vi.spyOn(Date, "now").mockReturnValue(1000 + 24 * 60 * 60 * 1000 + 1);
    expect(getValidXiaomiLocation(31.2, 121.5)).toBeNull();
  });

  it("updateMinutelyCache 与分钟级请求时间写入函数会保留/更新元数据", () => {
    vi.spyOn(Date, "now").mockReturnValue(1000);
    updateMinutelyCache(
      "121.5,31.2",
      {
        code: "200",
        provider: {
          flags: { responseStatus: 0 },
          raw: { new: "raw-v1", status: 0 },
        },
        summary: "ok",
      },
      900
    );
    expect(getWeatherCache().minutely?.lastApiFetchAt).toBe(900);
    expect(getWeatherCache().minutely?.data.provider?.raw).toEqual({
      new: "raw-v1",
      status: 0,
    });

    updateMinutelyLastFetch(1200);
    expect(getWeatherCache().minutely?.lastApiFetchAt).toBe(1200);

    updateMinutelyCriticalFetch(1300);
    expect(getWeatherCache().minutely?.lastCriticalFetchAt).toBe(1300);
  });

  it("切换坐标写入分钟数据时不继承旧地点请求时间", () => {
    vi.spyOn(Date, "now").mockReturnValue(1000);
    updateMinutelyCache("121.5000,31.2000", { code: "200" }, 900);
    updateMinutelyCriticalFetch(950);

    vi.spyOn(Date, "now").mockReturnValue(1100);
    updateMinutelyCache("116.4080,39.9040", { code: "200" });

    const minutely = getWeatherCache().minutely;
    expect(minutely?.location).toBe("116.4080,39.9040");
    expect(minutely).not.toHaveProperty("lastApiFetchAt");
    expect(minutely).not.toHaveProperty("lastCriticalFetchAt");
  });

  it("updateHourly72hCache 与 updateHourly72hLastFetch 会保留/更新 lastApiFetchAt", () => {
    vi.spyOn(Date, "now").mockReturnValue(1000);
    updateHourly72hCache(
      "121.5,31.2",
      { code: "200", hourly: [{ fxTime: "2026-02-06T05:00+08:00" }] },
      900
    );
    expect(getWeatherCache().hourly72h?.lastApiFetchAt).toBe(900);

    updateHourly72hLastFetch(1200);
    expect(getWeatherCache().hourly72h?.lastApiFetchAt).toBe(1200);
  });

  it("updateGeolocationDiagnostics 会写入定位诊断缓存", () => {
    vi.spyOn(Date, "now").mockReturnValue(1000);
    updateGeolocationDiagnostics({
      isSupported: true,
      isSecureContext: true,
      permissionState: "granted",
      usedHighAccuracy: true,
      timeoutMs: 1,
      maximumAgeMs: 1,
      attemptedAt: 1000,
    });

    const cache = getWeatherCache();
    expect(cache.geolocation?.diagnostics?.permissionState).toBe("granted");
  });

  it("三日预报/空气质量/日出日落缓存按 TTL 生效，超时后失效", () => {
    vi.spyOn(Date, "now").mockReturnValue(1000);
    updateDaily3dCache("121.5,31.2", { code: "200", daily: [{ fxDate: "2026-02-06" }] });
    updateAirQualityCache(31.2, 121.5, { indexes: [{ name: "AQI", aqi: 50 }] });
    updateAstronomySunCache("121.5,31.2", "20260206", {
      code: "200",
      sunrise: "06:58",
      sunset: "17:58",
    });

    expect(getValidDaily3d("121.5,31.2")?.code).toBe("200");
    expect(getValidAirQuality(31.2, 121.5)?.indexes?.[0]?.aqi).toBe(50);
    expect(getValidAstronomySun("121.5,31.2", "20260206")?.sunrise).toBe("06:58");

    vi.spyOn(Date, "now").mockReturnValue(1000 + 12 * 60 * 60 * 1000 + 1);
    expect(getValidAstronomySun("121.5,31.2", "20260206")).toBeNull();
  });

  it("cleanupWeatherCache 会清理过期的坐标/位置/分钟级降水与预警记录", () => {
    localStorage.setItem(
      "weather-cache",
      JSON.stringify({
        coords: { lat: 1, lon: 2, source: "ip", updatedAt: 0 },
        location: { signature: "1.0000,2.0000", updatedAt: 0, city: "X", address: "Y" },
        xiaomiLocation: {
          data: { lat: 1, locationKey: "weathercn:old", lon: 2 },
          location: "2.0000,1.0000",
          updatedAt: 0,
        },
        details: {
          location: "2.0000,1.0000",
          data: weatherDetailsFixture(),
          updatedAt: 0,
        },
        minutely: { location: "2,1", data: { code: "200" }, updatedAt: 0, lastApiFetchAt: 0 },
        daily3d: { location: "2,1", data: { code: "200" }, updatedAt: 0 },
        hourly72h: { location: "2,1", data: { code: "200" }, updatedAt: 0, lastApiFetchAt: 0 },
        airQuality: { signature: "1.00,2.00", data: { indexes: [] }, updatedAt: 0 },
        astronomySun: { location: "2,1", date: "20260206", data: { code: "200" }, updatedAt: 0 },
        alerts: {
          "station-old": { sig: "a", ts: 0 },
        },
      })
    );

    vi.spyOn(Date, "now").mockReturnValue(24 * 60 * 60 * 1000 + 10);
    cleanupWeatherCache();

    const cache = getWeatherCache();
    expect(cache.coords).toBeUndefined();
    expect(cache.location).toBeUndefined();
    expect(cache.xiaomiLocation).toBeUndefined();
    expect(cache.details).toBeUndefined();
    expect(cache.minutely).toBeUndefined();
    expect(cache.daily3d).toBeUndefined();
    expect(cache.hourly72h).toBeUndefined();
    expect(cache.airQuality).toBeUndefined();
    expect(cache.astronomySun).toBeUndefined();
    expect(cache.alerts).toBeUndefined();
  });

  it("getWeatherCache 遇到坏 JSON 时返回空对象", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    localStorage.setItem("weather-cache", "{bad json");
    expect(getWeatherCache()).toEqual({});
  });

  it("旧版缓存没有详情字段时仍可正常读取", () => {
    localStorage.setItem(
      "weather-cache",
      JSON.stringify({
        coords: { lat: 31.2, lon: 121.5, source: "legacy", updatedAt: 1000 },
        now: { data: { code: "200", now: { temp: "28" } }, updatedAt: 1000 },
      })
    );

    expect(getWeatherCache().now?.data.now?.temp).toBe("28");
    expect(getValidWeatherDetails("121.5000,31.2000")).toBeNull();
  });

  it("getValidMinutely 在 TTL 内有效，超时后无效", () => {
    vi.spyOn(Date, "now").mockReturnValue(1000);
    updateMinutelyCache("121.5,31.2", { code: "200" }, 999);
    expect(getValidMinutely("121.5,31.2")).not.toBeNull();

    vi.spyOn(Date, "now").mockReturnValue(1000 + 5 * 60 * 1000 + 1);
    expect(getValidMinutely("121.5,31.2")).toBeNull();
  });

  it("getValidHourly72h 在 TTL 内有效，超时后无效", () => {
    vi.spyOn(Date, "now").mockReturnValue(1000);
    updateHourly72hCache("121.5,31.2", { code: "200" }, 999);
    expect(getValidHourly72h("121.5,31.2")).not.toBeNull();

    vi.spyOn(Date, "now").mockReturnValue(1000 + 60 * 60 * 1000 + 1);
    expect(getValidHourly72h("121.5,31.2")).toBeNull();
  });

  it("updateMinutelyLastFetch 在无 minutely 时不应创建新字段", () => {
    updateMinutelyLastFetch(1234);
    expect(getWeatherCache().minutely).toBeUndefined();
  });

  it("cleanupWeatherCache 在无过期数据时不应清空字段", () => {
    vi.spyOn(Date, "now").mockReturnValue(1000);
    updateCoordsCache(1, 2, "ip");
    updateLocationCache(1, 2, { city: "X" });
    writeStationAlertRecord("station-1", "sig-1");

    vi.spyOn(Date, "now").mockReturnValue(2000);
    cleanupWeatherCache();

    const cache = getWeatherCache();
    expect(cache.coords).toBeDefined();
    expect(cache.location).toBeDefined();
    expect(cache.alerts?.["station-1"]).toBeDefined();
  });
});
