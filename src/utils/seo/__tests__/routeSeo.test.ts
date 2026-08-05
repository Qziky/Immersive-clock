import { afterEach, describe, expect, it } from "vitest";

import {
  applyRouteSeo,
  buildRouteStructuredData,
  getCanonicalUrl,
  getRouteSeo,
  HOME_BREADCRUMB_JSONLD_ID,
  HOME_FAQ_JSONLD_ID,
  normalizeSeoPath,
  PUBLIC_ROUTE_SEO,
  ROUTE_STRUCTURED_DATA_ID,
  SITE_URL,
} from "../routeSeo";

const PUBLIC_PATHS = ["/", "/clock", "/countdown", "/stopwatch", "/study"] as const;

function cleanupInjectedHead(): void {
  document.getElementById(ROUTE_STRUCTURED_DATA_ID)?.remove();
  document.head.querySelectorAll("meta").forEach((meta) => {
    const key = meta.getAttribute("name") ?? meta.getAttribute("property");
    if (
      key &&
      [
        "description",
        "keywords",
        "og:title",
        "og:description",
        "og:url",
        "twitter:title",
        "twitter:description",
      ].includes(key)
    ) {
      meta.remove();
    }
  });
  document.head.querySelector('link[rel="canonical"]')?.remove();
}

afterEach(() => {
  cleanupInjectedHead();
  document.getElementById(HOME_FAQ_JSONLD_ID)?.remove();
  document.getElementById(HOME_BREADCRUMB_JSONLD_ID)?.remove();
});

describe("routeSeo 数据模型", () => {
  it("为全部公共路由提供完整的 SEO 数据", () => {
    for (const path of PUBLIC_PATHS) {
      const data = PUBLIC_ROUTE_SEO[path];
      expect(data).toBeDefined();
      expect(data.path).toBe(path);
      expect(data.title.length).toBeGreaterThan(0);
      expect(data.description.length).toBeGreaterThan(0);
      expect(data.keywords.length).toBeGreaterThan(0);
      expect(data.h1.length).toBeGreaterThan(0);
      expect(data.intro.length).toBeGreaterThan(0);
      expect(data.featureList.length).toBeGreaterThan(0);
      expect(data.faq.length).toBeGreaterThan(0);
      data.faq.forEach((item) => {
        expect(item.question.length).toBeGreaterThan(0);
        expect(item.answer.length).toBeGreaterThan(0);
      });
    }
  });

  it("各公共路由的 title 唯一，避免重复标题", () => {
    const titles = PUBLIC_PATHS.map((path) => PUBLIC_ROUTE_SEO[path].title);
    expect(new Set(titles).size).toBe(titles.length);
  });

  it.each([
    ["/", "/"],
    ["/clock/", "/clock"],
    ["/study//", "/study"],
    ["", "/"],
  ])("normalizeSeoPath(%s) => %s", (input, expected) => {
    expect(normalizeSeoPath(input)).toBe(expected);
  });

  it("未命中的路径回退到首页数据", () => {
    expect(getRouteSeo("/unknown-path")).toBe(PUBLIC_ROUTE_SEO["/"]);
  });

  it("生成自引用的 canonical URL", () => {
    expect(getCanonicalUrl("/")).toBe(`${SITE_URL}/`);
    expect(getCanonicalUrl("/clock")).toBe(`${SITE_URL}/clock`);
    expect(getCanonicalUrl("/study/")).toBe(`${SITE_URL}/study`);
  });
});

describe("buildRouteStructuredData", () => {
  it("首页仅生成一级面包屑与 FAQPage", () => {
    const data = buildRouteStructuredData(PUBLIC_ROUTE_SEO["/"]);
    const faq = data.find((entry) => entry["@type"] === "FAQPage");
    const breadcrumb = data.find((entry) => entry["@type"] === "BreadcrumbList");
    expect(faq).toBeDefined();
    expect(breadcrumb).toBeDefined();
    expect((breadcrumb?.itemListElement as unknown[]).length).toBe(1);
    expect((faq?.mainEntity as unknown[]).length).toBe(PUBLIC_ROUTE_SEO["/"].faq.length);
  });

  it("子路由生成二级面包屑并指向自身 canonical", () => {
    const data = buildRouteStructuredData(PUBLIC_ROUTE_SEO["/clock"]);
    const breadcrumb = data.find((entry) => entry["@type"] === "BreadcrumbList");
    const items = breadcrumb?.itemListElement as Array<Record<string, unknown>>;
    expect(items).toHaveLength(2);
    expect(items[1].item).toBe(`${SITE_URL}/clock`);
  });
});

describe("applyRouteSeo", () => {
  it("命令式更新 title、description、canonical 与结构化数据", () => {
    applyRouteSeo("/countdown");

    expect(document.title).toBe(PUBLIC_ROUTE_SEO["/countdown"].title);
    expect(document.head.querySelector('meta[name="description"]')?.getAttribute("content")).toBe(
      PUBLIC_ROUTE_SEO["/countdown"].description
    );
    expect(document.head.querySelector('link[rel="canonical"]')?.getAttribute("href")).toBe(
      `${SITE_URL}/countdown`
    );

    const script = document.getElementById(ROUTE_STRUCTURED_DATA_ID);
    expect(script).toBeDefined();
    const parsed = JSON.parse(script?.textContent ?? "[]") as Array<Record<string, unknown>>;
    expect(parsed.some((entry) => entry["@type"] === "FAQPage")).toBe(true);
  });

  it("多次调用始终只保留一个路由级 JSON-LD 脚本", () => {
    applyRouteSeo("/clock");
    applyRouteSeo("/stopwatch");
    expect(document.querySelectorAll(`#${ROUTE_STRUCTURED_DATA_ID}`)).toHaveLength(1);
    expect(document.title).toBe(PUBLIC_ROUTE_SEO["/stopwatch"].title);
  });

  it("移除 index.html 中的静态首页 JSON-LD 以避免重复", () => {
    const faq = document.createElement("script");
    faq.id = HOME_FAQ_JSONLD_ID;
    faq.type = "application/ld+json";
    document.head.appendChild(faq);
    const breadcrumb = document.createElement("script");
    breadcrumb.id = HOME_BREADCRUMB_JSONLD_ID;
    breadcrumb.type = "application/ld+json";
    document.head.appendChild(breadcrumb);

    applyRouteSeo("/");

    expect(document.getElementById(HOME_FAQ_JSONLD_ID)).toBeNull();
    expect(document.getElementById(HOME_BREADCRUMB_JSONLD_ID)).toBeNull();
  });
});
