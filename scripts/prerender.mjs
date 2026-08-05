import { createServer } from "node:http";
import fs from "node:fs";
import path from "node:path";

/**
 * 构建期预渲染脚本（SSG，增强、可降级）
 *
 * 使用 Node 内置 http 服务 dist（SPA 回退到 index.html），
 * 通过 Playwright 的 chromium 逐条访问公共路由，等待可爬取正文出现后
 * 抓取完整 DOM，写入 dist/<route>/index.html。
 *
 * 该脚本可降级：当无可用无头浏览器时打印警告并跳过（退出码 0），
 * 不阻断构建。首页的可爬取正文已静态内联进 index.html 作为保底。
 */

const rootDir = process.cwd();
const distDir = path.join(rootDir, "dist");
const PORT = 4319;
const HOST = "127.0.0.1";

// 需要预渲染的公共路由（与 App.tsx 路由、routeSeo.ts 数据表保持一致）。
const ROUTES = ["/", "/clock", "/countdown", "/stopwatch", "/study"];

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".mp3": "audio/mpeg",
  ".map": "application/json; charset=utf-8",
};

/** 创建服务 dist 目录的极简静态服务器，未命中的路由回退到 index.html（SPA）。 */
function createStaticServer() {
  return createServer((req, res) => {
    try {
      const requestUrl = new URL(req.url ?? "/", `http://${HOST}:${PORT}`);
      const pathname = decodeURIComponent(requestUrl.pathname);
      let filePath = path.join(distDir, pathname);

      // 防止路径穿越。
      if (!filePath.startsWith(distDir)) {
        res.statusCode = 403;
        res.end("Forbidden");
        return;
      }

      if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
        const ext = path.extname(filePath).toLowerCase();
        res.setHeader("Content-Type", MIME_TYPES[ext] ?? "application/octet-stream");
        res.end(fs.readFileSync(filePath));
        return;
      }

      // SPA 回退：使用原始 index.html 启动应用，由前端路由渲染目标路由。
      filePath = path.join(distDir, "index.html");
      res.setHeader("Content-Type", MIME_TYPES[".html"]);
      res.end(fs.readFileSync(filePath));
    } catch (error) {
      res.statusCode = 500;
      res.end(String(error));
    }
  });
}

/** 依次尝试打开无头浏览器：bundled chromium → msedge → chrome。 */
async function launchBrowser(chromium) {
  const attempts = [
    { label: "bundled chromium", options: {} },
    { label: "msedge channel", options: { channel: "msedge" } },
    { label: "chrome channel", options: { channel: "chrome" } },
  ];
  for (const attempt of attempts) {
    try {
      const browser = await chromium.launch(attempt.options);
      console.log(`[prerender] 使用 ${attempt.label} 启动无头浏览器。`);
      return browser;
    } catch {
      // 尝试下一种方式。
    }
  }
  return null;
}

/** 移除快照中的引导层、公告弹窗与加载动画等运行时覆盖层。 */
function stripRuntimeOverlays() {
  const selectors = [
    "#loading-screen",
    ".driver-overlay",
    ".driver-popover",
    "svg.driver-overlay",
    "[data-announcement-modal]",
    "[data-tour='noise-history-modal']",
  ];
  selectors.forEach((selector) => {
    document.querySelectorAll(selector).forEach((node) => node.remove());
  });
}

async function main() {
  if (!fs.existsSync(path.join(distDir, "index.html"))) {
    console.warn("[prerender] 未找到 dist/index.html，跳过预渲染。");
    return;
  }

  let chromium;
  try {
    ({ chromium } = await import("@playwright/test"));
  } catch {
    console.warn("[prerender] 未安装 Playwright，跳过预渲染（首页静态正文仍可用）。");
    return;
  }

  const server = createStaticServer();
  await new Promise((resolve) => server.listen(PORT, HOST, resolve));

  const browser = await launchBrowser(chromium);
  if (!browser) {
    console.warn(
      "[prerender] 无可用无头浏览器（可执行 `npx playwright install chromium`），跳过预渲染。"
    );
    await new Promise((resolve) => server.close(resolve));
    return;
  }

  const snapshots = [];
  try {
    const context = await browser.newContext();
    // 预置本地存储，抑制引导与公告弹窗污染快照。
    await context.addInitScript(() => {
      try {
        localStorage.setItem("immersive-clock:has-seen-tour", "true");
      } catch {
        // 忽略无痕环境下的存储异常。
      }
    });

    for (const route of ROUTES) {
      const page = await context.newPage();
      try {
        await page.goto(`http://${HOST}:${PORT}${route}`, {
          waitUntil: "networkidle",
          timeout: 30000,
        });
        // 等待可爬取正文渲染完成。
        await page.waitForSelector("[data-seo-content] h1", { timeout: 15000 });
        await page.evaluate(stripRuntimeOverlays);
        const html = await page.evaluate(() => `<!DOCTYPE html>\n${document.documentElement.outerHTML}`);
        snapshots.push({ route, html });
        console.log(`[prerender] 已渲染路由 ${route}`);
      } catch (error) {
        console.warn(`[prerender] 渲染路由 ${route} 失败：${error}. 跳过该路由。`);
      } finally {
        await page.close();
      }
    }
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }

  for (const { route, html } of snapshots) {
    const outPath =
      route === "/"
        ? path.join(distDir, "index.html")
        : path.join(distDir, route.replace(/^\//, ""), "index.html");
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, html, "utf-8");
    console.log(`[prerender] 已写入 ${path.relative(rootDir, outPath)}`);
  }

  console.log(`[prerender] 预渲染完成，共 ${snapshots.length}/${ROUTES.length} 条路由。`);
}

main().catch((error) => {
  // 预渲染是增强步骤，失败不应阻断构建。
  console.warn(`[prerender] 预渲染出错，已跳过：${error}`);
});
