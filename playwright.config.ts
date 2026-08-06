import { defineConfig } from "@playwright/test";

import { LEGAL_DOCUMENT_VERSION } from "./src/constants/legal";

/**
 * Playwright 端到端测试配置（函数级注释）：
 * - 使用 Vite 开发服务器作为被测应用
 * - 配置基础多浏览器并行与 HTML 报告
 */
const useBundledBrowsers = String(process.env.PW_BUNDLED_BROWSERS || "").trim() === "1";
const baseURL = "http://127.0.0.1:3005";

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: true,
  timeout: 30 * 1000,
  expect: {
    timeout: 5 * 1000,
  },
  reporter: [["list"], ["html", { outputFolder: "playwright-report", open: "never" }]],
  use: {
    baseURL,
    storageState: {
      cookies: [],
      origins: [
        {
          origin: baseURL,
          localStorage: [
            {
              name: "immersive-clock:legal-consent:v1",
              value: JSON.stringify({
                schemaVersion: 1,
                documentVersion: LEGAL_DOCUMENT_VERSION,
                acceptedAt: 1,
              }),
            },
          ],
        },
      ],
    },
    trace: "on-first-retry",
    video: "retain-on-failure",
  },
  webServer: {
    command: "npm run dev",
    url: "http://127.0.0.1:3005",
    reuseExistingServer: !process.env.CI,
    timeout: 60 * 1000,
  },
  projects: useBundledBrowsers
    ? [
        { name: "chromium", use: { browserName: "chromium" } },
        { name: "firefox", use: { browserName: "firefox" } },
        { name: "webkit", use: { browserName: "webkit" } },
      ]
    : [{ name: "msedge", use: { browserName: "chromium", channel: "msedge" } }],
});
