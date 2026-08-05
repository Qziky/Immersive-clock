import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";

import { PUBLIC_ROUTE_SEO, ROUTE_STRUCTURED_DATA_ID, SITE_URL } from "../../../utils/seo/routeSeo";
import { RouteSeo } from "../RouteSeo";
import { SeoContent } from "../SeoContent";

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <RouteSeo />
      <SeoContent />
    </MemoryRouter>
  );
}

afterEach(() => {
  document.getElementById(ROUTE_STRUCTURED_DATA_ID)?.remove();
  document.head.querySelector('link[rel="canonical"]')?.remove();
});

describe("RouteSeo 组件", () => {
  it.each(["/", "/clock", "/countdown", "/stopwatch", "/study"])(
    "为 %s 设置对应 title 与自引用 canonical",
    (path) => {
      renderAt(path);

      const expected = PUBLIC_ROUTE_SEO[path];
      expect(document.title).toBe(expected.title);
      const canonical = document.head.querySelector('link[rel="canonical"]')?.getAttribute("href");
      const expectedCanonical = path === "/" ? `${SITE_URL}/` : `${SITE_URL}${path}`;
      expect(canonical).toBe(expectedCanonical);
      expect(document.getElementById(ROUTE_STRUCTURED_DATA_ID)).not.toBeNull();
    }
  );

  it("开发者路由不注入路由级结构化数据", () => {
    document.title = "unchanged-title";
    renderAt("/debug/audio");

    expect(document.getElementById(ROUTE_STRUCTURED_DATA_ID)).toBeNull();
    expect(document.title).toBe("unchanged-title");
  });
});

describe("SeoContent 组件", () => {
  it("渲染当前路由的可爬取 h1、简介与 FAQ", () => {
    renderAt("/study");

    const section = document.querySelector("[data-seo-content]");
    expect(section).not.toBeNull();
    expect(
      screen.getByRole("heading", { level: 1, name: PUBLIC_ROUTE_SEO["/study"].h1 })
    ).toBeInTheDocument();
    PUBLIC_ROUTE_SEO["/study"].faq.forEach((item) => {
      expect(screen.getByRole("heading", { level: 3, name: item.question })).toBeInTheDocument();
    });
  });

  it("开发者路由不渲染可爬取正文", () => {
    renderAt("/design-system");
    expect(document.querySelector("[data-seo-content]")).toBeNull();
  });
});
