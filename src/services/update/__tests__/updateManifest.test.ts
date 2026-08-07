import { afterEach, describe, expect, it, vi } from "vitest";

import { compareVersions, fetchUpdateManifest, parseUpdateManifest } from "../updateManifest";

const validManifest = {
  schemaVersion: 1,
  channel: "stable",
  version: "4.1.0",
  publishedAt: "2026-08-07T00:00:00Z",
  minimumSupportedVersion: "4.0.0",
  releaseUrl: "https://github.com/Qziky/Immersive-clock/releases/tag/v4.1.0",
  platforms: {
    web: { version: "4.1.0" },
    android: {
      version: "4.1.0",
      versionCode: 40100,
      apkUrl: "https://github.com/Qziky/Immersive-clock/releases/download/v4.1.0/app.apk",
    },
  },
};

describe("updateManifest", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("解析稳定版清单并保留平台下载地址", () => {
    expect(parseUpdateManifest(validManifest)).toEqual(validManifest);
  });

  it.each([
    ["预发布版本", { version: "4.1.0-beta.1" }],
    ["预发布平台版本", { platforms: { web: { version: "4.1.0-beta.1" } } }],
    ["不支持渠道", { channel: "beta" }],
    ["非法发布地址", { releaseUrl: "http://example.com/release" }],
    ["缺少发布时间", { publishedAt: "not-a-date" }],
    ["非法 Android 版本号", { platforms: { android: { version: "4.1.0", versionCode: 0 } } }],
    ["平台版本不一致", { platforms: { web: { version: "4.0.9" } } }],
  ])("拒绝%s", (_label, override) => {
    expect(() => parseUpdateManifest({ ...validManifest, ...override })).toThrow();
  });

  it("版本比较忽略 v 前缀并识别新旧版本", () => {
    expect(compareVersions("v4.1.0", "4.0.9")).toBeGreaterThan(0);
    expect(compareVersions("4.1.0", "4.1.0")).toBe(0);
    expect(compareVersions("4.0.0", "4.1.0")).toBeLessThan(0);
  });

  it("请求清单时禁用缓存并发送 JSON Accept 头", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(validManifest),
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchUpdateManifest("web")).resolves.toMatchObject({ version: "4.1.0" });
    expect(fetchMock).toHaveBeenCalledWith(
      "/update-manifest.json",
      expect.objectContaining({ cache: "no-store", headers: { accept: "application/json" } })
    );
  });
});
