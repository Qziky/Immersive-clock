import { afterEach, describe, expect, it } from "vitest";

import {
  applySearchIndexingPolicy,
  DEVELOPER_PAGE_ROBOTS_CONTENT,
  isDeveloperPagePath,
  PUBLIC_ROBOTS_CONTENT,
} from "../developerPages";

const ROBOTS_META_NAMES = ["robots", "googlebot"] as const;

function getMetaContent(name: (typeof ROBOTS_META_NAMES)[number]): string | null {
  return document.head.querySelector<HTMLMetaElement>(`meta[name="${name}"]`)?.content ?? null;
}

afterEach(() => {
  ROBOTS_META_NAMES.forEach((name) => {
    document.head.querySelector(`meta[name="${name}"]`)?.remove();
  });
});

describe("developerPages", () => {
  it.each([
    "/design-system",
    "/design-system/",
    "/debug",
    "/debug/",
    "/debug/audio",
    "/debug/audio/",
  ])("将 %s 识别为开发者页面", (pathname) => {
    expect(isDeveloperPagePath(pathname)).toBe(true);
  });

  it.each(["/", "/clock", "/design-system-preview", "/debugging/audio"])(
    "不将 %s 误判为开发者页面",
    (pathname) => {
      expect(isDeveloperPagePath(pathname)).toBe(false);
    }
  );

  it("为开发者页面同时设置 robots 与 googlebot 禁索引策略，并可恢复原值", () => {
    ROBOTS_META_NAMES.forEach((name) => {
      const meta = document.createElement("meta");
      meta.name = name;
      meta.content = PUBLIC_ROBOTS_CONTENT;
      document.head.appendChild(meta);
    });

    const restore = applySearchIndexingPolicy("/design-system");

    ROBOTS_META_NAMES.forEach((name) => {
      expect(getMetaContent(name)).toBe(DEVELOPER_PAGE_ROBOTS_CONTENT);
    });

    restore();

    ROBOTS_META_NAMES.forEach((name) => {
      expect(getMetaContent(name)).toBe(PUBLIC_ROBOTS_CONTENT);
    });
  });

  it("为公开页面恢复可索引策略，并为缺失的 meta 创建标签", () => {
    applySearchIndexingPolicy("/clock");

    ROBOTS_META_NAMES.forEach((name) => {
      expect(getMetaContent(name)).toBe(PUBLIC_ROBOTS_CONTENT);
      expect(document.head.querySelectorAll(`meta[name="${name}"]`)).toHaveLength(1);
    });
  });
});
