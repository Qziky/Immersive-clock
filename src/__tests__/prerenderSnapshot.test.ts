import { within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

// @ts-expect-error The standalone Node build script does not emit TypeScript declarations.
import { serializePrerenderedPage } from "../../scripts/prerender.mjs";

describe("public prerender snapshot", () => {
  it("去掉模态框和根节点遮罩，同时保留有意义的静态正文", () => {
    const body = document.body.innerHTML;
    try {
      document.body.innerHTML = `
        <div id="root" role="main" inert aria-hidden="true">
          <main aria-label="时钟应用主界面">
            <h1>倒计时</h1>
            <div hidden inert aria-hidden="true">应用本身隐藏的内容</div>
          </main>
        </div>
        <div data-ui-overlay-root><section role="dialog">系统公告</section></div>
        <div class="driver-overlay"></div>
        <script type="module" src="/js/index.js"></script>
      `;
      expect(within(document.body).queryByRole("main", { name: "时钟应用主界面" })).toBeNull();

      const html = serializePrerenderedPage();
      expect(html).toMatch(/^<!DOCTYPE html>/);
      // It is a serialized copy. React still owns the live capture DOM.
      expect(document.querySelector("#root")).toHaveAttribute("inert");
      expect(document.querySelector("[data-ui-overlay-root]")).toBeInTheDocument();

      const saved = new DOMParser().parseFromString(html, "text/html");
      document.body.innerHTML = saved.body.innerHTML;
      const root = document.querySelector("#root");
      expect(root).not.toHaveAttribute("inert");
      expect(root).not.toHaveAttribute("aria-hidden");
      expect(root).toHaveAttribute("role", "main");
      expect(root?.querySelector("h1")).toHaveTextContent("倒计时");
      expect(root?.querySelector("[hidden]")).toHaveAttribute("inert");
      expect(document.querySelector("[data-ui-overlay-root], .driver-overlay")).toBeNull();
      expect(document.querySelector('script[src="/js/index.js"]')).not.toBeNull();
      expect(
        within(document.body).getByRole("main", { name: "时钟应用主界面" })
      ).toBeInTheDocument();
    } finally {
      document.body.innerHTML = body;
    }
  });
});
