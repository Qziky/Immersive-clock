import { spawn } from "node:child_process";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { chromium } from "@playwright/test";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ASSET_DIR = path.join(ROOT, "docs", "marketing", "assets", "readme");
const SOURCE_DIR = path.join(ASSET_DIR, "source");
const LEGACY_HERO_PATH = path.join(ROOT, "public", "assets", "readme-hero.png");
const README_HERO_PATH = path.join(ASSET_DIR, "readme-hero.png");
const LEGAL_CONSENT_STORAGE_KEY = "immersive-clock:legal-consent:v1";
const LEGAL_DOCUMENT_VERSION = "2026-08-06";
const BASE_URL = process.env.README_CAPTURE_BASE_URL || "http://127.0.0.1:3005";
const FIXED_TIME = new Date("2026-08-05T08:30:00+08:00");
const VIEWPORT = { width: 1440, height: 900 };
const APP_VERSION = JSON.parse(await readFile(path.join(ROOT, "package.json"), "utf8")).version;

const BUILT_IN_QUOTE_CHANNELS = [
  { id: "local-inspirational", enabled: false, weight: 1, orderMode: "sequential" },
  { id: "university-mottos", enabled: false, weight: 1, orderMode: "sequential" },
  { id: "hitokoto-api", enabled: false, weight: 1 },
  { id: "jinrishici-api", enabled: false, weight: 1 },
  { id: "advice-slip-api", enabled: false, weight: 1 },
];

const MOTION_RESET = `
  *, *::before, *::after {
    caret-color: transparent !important;
    transition: none !important;
  }
`;

function createDemoSettings(fixedTime) {
  return {
    version: 12,
    modifiedAt: fixedTime,
    general: {
      developerModeEnabled: false,
      keepAwakeEnabled: false,
      startup: { initialMode: "clock" },
      timeDisplay: { showClockSeconds: true, showStudySeconds: true },
      announcement: {
        hideUntil: fixedTime + 14 * 24 * 60 * 60 * 1000,
        version: APP_VERSION,
      },
      weather: {
        locationMode: "manual",
        manualLocation: {
          query: "上海市",
          selected: {
            affiliation: "上海市",
            lat: 31.2,
            locationKey: "weathercn:101020100",
            lon: 121.5,
            name: "上海市",
          },
        },
      },
      quote: {
        autoRefreshEnabled: false,
        autoRefreshIntervalSec: 600,
        animationMode: "none",
        typingSpeed: "normal",
        typewriterBackspaceEnabled: false,
        channels: BUILT_IN_QUOTE_CHANNELS,
        customChannels: [
          {
            id: "readme-demo",
            name: "README 演示",
            enabled: true,
            weight: 100,
            quotes: ["专注当下，让时间沉淀答案。"],
            orderMode: "sequential",
          },
        ],
      },
    },
    study: {
      targetYear: 2027,
      countdownType: "custom",
      countdownMode: "single",
      customCountdown: { name: "阶段目标", date: "2027-12-31" },
      countdownItems: [
        {
          id: "readme-stage-goal",
          kind: "custom",
          name: "阶段目标",
          targetDate: "2027-12-31",
          order: 0,
          digitOpacity: 1,
        },
      ],
      display: {
        showWeather: true,
        showNoiseMonitor: false,
        showCountdown: true,
        showQuote: true,
        showTime: true,
        showDate: true,
      },
      infoCarousel: {
        intervalSec: 30,
        items: [
          {
            id: "readme-progress",
            source: "progress",
            progressKind: "day",
            enabled: true,
            order: 0,
          },
        ],
      },
      alerts: {
        weatherAlert: false,
        errorPopup: false,
        errorCenterMode: "off",
        airQuality: false,
        sunriseSunset: false,
      },
    },
    noiseControl: {
      monitoringEnabled: false,
      historyEnabled: false,
    },
  };
}

function createWeatherCache(fixedTime) {
  const isoTime = new Date(fixedTime).toISOString();
  const city = {
    affiliation: "上海市",
    lat: 31.2,
    locationKey: "weathercn:101020100",
    lon: 121.5,
    name: "上海市",
  };
  return {
    version: 2,
    activeLocation: {
      city,
      coords: { accuracy: 20, lat: city.lat, lon: city.lon },
      mode: "manual",
      resolvedAt: fixedTime,
      source: "manual_city",
    },
    coords: {
      accuracy: 20,
      lat: city.lat,
      lon: city.lon,
      source: "manual_city",
      updatedAt: fixedTime,
    },
    xiaomiLocations: {
      "121.5000,31.2000": { data: city, updatedAt: fixedTime },
    },
    now: {
      data: {
        code: "200",
        now: {
          feelsLike: "27",
          humidity: "58",
          obsTime: isoTime,
          pressure: "1008",
          temp: "26",
          text: "多云",
          uvIndex: "2",
          vis: "18",
          wind360: "135",
          windDir: "东南风",
          windSpeed: "2",
        },
      },
      updatedAt: fixedTime,
    },
    details: {
      data: {
        code: "200",
        current: {
          feelsLike: { unit: "℃", value: "27" },
          humidity: { unit: "%", value: "58" },
          observationTime: isoTime,
          pressure: { unit: "hPa", value: "1008" },
          temperature: { unit: "℃", value: "26" },
          weatherCode: "1",
          weatherText: "多云",
          windDirectionText: "东南风",
          windSpeed: { unit: "km/h", value: "2" },
        },
        daily: [],
        hourly: [],
        previousHours: [],
        indices: [],
        alerts: [],
        brands: [],
        typhoons: [],
        raw: { status: 0, updateTime: isoTime },
        technical: {
          channels: [],
          sourceMaps: {},
          statuses: { response: 0 },
          units: { currentTemperature: "℃" },
          urls: {},
        },
        updateTime: isoTime,
      },
      location: "121.5000,31.2000",
      updatedAt: fixedTime,
    },
  };
}

async function isServerReady() {
  try {
    const response = await fetch(BASE_URL, { signal: AbortSignal.timeout(1000) });
    return response.ok;
  } catch {
    return false;
  }
}

async function startServer() {
  if (await isServerReady()) return null;

  const viteBin = path.join(ROOT, "node_modules", "vite", "bin", "vite.js");
  const server = spawn(
    process.execPath,
    [viteBin, "--host", "127.0.0.1", "--port", new URL(BASE_URL).port || "3005"],
    { cwd: ROOT, stdio: "ignore" }
  );

  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (await isServerReady()) return server;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  server.kill();
  throw new Error(`Vite did not become ready at ${BASE_URL}`);
}

async function seedDemoState(page) {
  await page.goto(`${BASE_URL}/clock`, { waitUntil: "domcontentloaded" });
  await page.evaluate(
    ({ fixedTime, legalConsentStorageKey, legalDocumentVersion, settings, weatherCache }) => {
      localStorage.clear();
      sessionStorage.clear();
      localStorage.setItem("immersive-clock:has-seen-tour", "true");
      localStorage.setItem(
        legalConsentStorageKey,
        JSON.stringify({
          schemaVersion: 1,
          documentVersion: legalDocumentVersion,
          acceptedAt: fixedTime,
        })
      );
      localStorage.setItem("AppSettings", JSON.stringify(settings));
      localStorage.setItem("weather-cache", JSON.stringify(weatherCache));
      localStorage.setItem(
        "immersive-clock.quote-runtime.v2",
        JSON.stringify({
          version: 2,
          providers: {
            hitokoto: { quotes: [], blockedUntil: 0, failureCount: 0, lastRequestAt: 0 },
            jinrishici: { quotes: [], blockedUntil: 0, failureCount: 0, lastRequestAt: 0 },
            "advice-slip": { quotes: [], blockedUntil: 0, failureCount: 0, lastRequestAt: 0 },
          },
          recentQuotes: [],
          localCursors: { "readme-demo": 0 },
        })
      );
      localStorage.setItem("readme-demo-fixed-time", String(fixedTime));
    },
    {
      fixedTime: FIXED_TIME.getTime(),
      legalConsentStorageKey: LEGAL_CONSENT_STORAGE_KEY,
      legalDocumentVersion: LEGAL_DOCUMENT_VERSION,
      settings: createDemoSettings(FIXED_TIME.getTime()),
      weatherCache: createWeatherCache(FIXED_TIME.getTime()),
    }
  );
}

async function preparePage(page, pathname) {
  await page.goto(`${BASE_URL}${pathname}`, { waitUntil: "domcontentloaded" });
  await page.addStyleTag({ content: MOTION_RESET });
  await page.evaluate(() => document.fonts.ready);
  await page.locator('main[aria-label="时钟应用主界面"]').waitFor({ state: "visible" });
  await page.locator("#loading-screen").waitFor({ state: "detached" });
}

async function hideHud(page) {
  await page.addStyleTag({
    content: `
      [aria-label="HUD 控制面板"] {
        opacity: 0 !important;
        pointer-events: none !important;
      }
    `,
  });
}

async function captureSources(browser) {
  const context = await browser.newContext({
    colorScheme: "dark",
    reducedMotion: "reduce",
    timezoneId: "Asia/Shanghai",
    viewport: VIEWPORT,
  });
  const page = await context.newPage();
  await page.clock.setFixedTime(FIXED_TIME);
  await page.route("**/api/xiaomi-weather/**", (route) =>
    route.fulfill({ status: 503, contentType: "application/json", body: "{}" })
  );

  await seedDemoState(page);

  await preparePage(page, "/clock");
  await page.locator("#clock-panel").waitFor({ state: "visible" });
  await page.getByLabel("当前时间：08:30:00").waitFor({ state: "visible" });
  await page.screenshot({
    animations: "disabled",
    caret: "hide",
    path: path.join(SOURCE_DIR, "clock.png"),
  });

  await preparePage(page, "/countdown");
  await page.locator('main[aria-label="时钟应用主界面"]').click({ position: { x: 20, y: 20 } });
  const countdownToolbar = page.getByRole("toolbar", { name: "时钟控制" });
  await countdownToolbar.getByRole("button", { name: "设置倒计时" }).click();
  const countdownDialog = page.getByRole("dialog", { name: "设置倒计时" });
  await countdownDialog.getByRole("radio", { name: "30分钟" }).check();
  await countdownDialog.getByRole("button", { name: "确认" }).click();
  await page
    .locator("#countdown-panel")
    .getByRole("button", { name: /倒计时时间：30:00/ })
    .waitFor();
  await hideHud(page);
  await page.screenshot({
    animations: "disabled",
    caret: "hide",
    path: path.join(SOURCE_DIR, "countdown.png"),
  });

  await preparePage(page, "/stopwatch");
  await page.locator('main[aria-label="时钟应用主界面"]').click({ position: { x: 20, y: 20 } });
  const stopwatchToolbar = page.getByRole("toolbar", { name: "时钟控制" });
  await stopwatchToolbar.getByRole("button", { name: "开始秒表" }).click();
  await page.waitForTimeout(8_250);
  await stopwatchToolbar.getByRole("button", { name: "暂停秒表" }).click();
  await hideHud(page);
  await page.screenshot({
    animations: "disabled",
    caret: "hide",
    path: path.join(SOURCE_DIR, "stopwatch.png"),
  });

  await preparePage(page, "/study");
  await page.locator("#study-panel").waitFor({ state: "visible" });
  await page.getByText("26°", { exact: true }).waitFor({ state: "visible" });
  const countdownDays = page.getByText("513", { exact: true });
  await countdownDays.waitFor({ state: "visible" });
  await countdownDays.evaluate((element) => {
    if (getComputedStyle(element).opacity !== "1") {
      throw new Error("Study countdown demo value is not fully visible");
    }
  });
  await page.getByText("专注当下，让时间沉淀答案。", { exact: true }).first().waitFor();
  await page.waitForTimeout(400);
  await page.screenshot({
    caret: "hide",
    path: path.join(SOURCE_DIR, "study.png"),
  });

  await preparePage(page, "/clock");
  await page.getByRole("button", { name: "打开设置" }).click();
  const settingsDialog = page.getByRole("dialog", { name: "设置" });
  await settingsDialog
    .getByRole("button", { name: /视觉外观/ })
    .first()
    .click();
  await settingsDialog.getByLabel("时钟外观预览").waitFor({ state: "visible" });
  await page.screenshot({
    animations: "disabled",
    caret: "hide",
    path: path.join(SOURCE_DIR, "appearance-settings.png"),
  });

  await context.close();
}

async function imageDataUri(filePath) {
  const content = await readFile(filePath);
  return `data:image/png;base64,${content.toString("base64")}`;
}

function htmlDocument(body, css) {
  return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <style>
      * { box-sizing: border-box; }
      html, body { margin: 0; width: 100%; height: 100%; overflow: hidden; }
      body { font-family: Inter, "Segoe UI", "Microsoft YaHei", sans-serif; }
      ${css}
    </style>
  </head>
  <body>${body}</body>
</html>`;
}

async function renderPng(browser, viewport, html, outputPath) {
  const context = await browser.newContext({ colorScheme: "dark", viewport });
  const page = await context.newPage();
  await page.setContent(html, { waitUntil: "load" });
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: outputPath });
  await context.close();
}

async function buildModesGrid(browser) {
  const modes = await Promise.all(
    [
      ["clock.png", "时钟 · Clock"],
      ["countdown.png", "倒计时 · Countdown"],
      ["stopwatch.png", "秒表 · Stopwatch"],
      ["study.png", "自习 · Study"],
    ].map(async ([file, label]) => ({
      label,
      image: await imageDataUri(path.join(SOURCE_DIR, file)),
    }))
  );
  const cards = modes
    .map(
      ({ image, label }) => `
        <figure class="card">
          <img src="${image}" alt="" />
          <figcaption>${label}</figcaption>
        </figure>
      `
    )
    .join("");
  const css = `
    body {
      padding: 54px;
      background: #121212;
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 28px;
      width: 100%;
      height: 100%;
    }
    .card {
      position: relative;
      margin: 0;
      overflow: hidden;
      border: 1px solid rgba(149, 231, 207, .16);
      border-radius: 24px;
      background: #121212;
      box-shadow: 0 20px 56px rgba(0, 0, 0, .35);
    }
    .card img { width: 100%; height: 100%; object-fit: cover; display: block; }
    .card::after {
      content: "";
      position: absolute;
      inset: 0;
      background: linear-gradient(180deg, transparent 62%, rgba(1, 5, 4, .82));
    }
    figcaption {
      position: absolute;
      z-index: 1;
      left: 26px;
      bottom: 22px;
      color: rgba(245, 250, 248, .92);
      font-size: 22px;
      font-weight: 650;
      letter-spacing: .02em;
      text-shadow: 0 2px 16px #000;
    }
  `;
  await renderPng(
    browser,
    VIEWPORT,
    htmlDocument(`<div class="grid">${cards}</div>`, css),
    path.join(ASSET_DIR, "readme-modes-grid.png")
  );
}

async function copyFinalScreenshots() {
  const study = await readFile(path.join(SOURCE_DIR, "study.png"));
  const appearance = await readFile(path.join(SOURCE_DIR, "appearance-settings.png"));
  await writeFile(path.join(ASSET_DIR, "readme-study-dashboard.png"), study);
  await writeFile(path.join(ASSET_DIR, "readme-appearance-settings.png"), appearance);
}

async function main() {
  await mkdir(SOURCE_DIR, { recursive: true });
  const server = await startServer();
  const browser = await chromium.launch({ channel: "msedge", headless: true });
  try {
    await captureSources(browser);
    await Promise.all([buildModesGrid(browser), copyFinalScreenshots()]);
    await Promise.all([
      rm(README_HERO_PATH, { force: true }),
      rm(LEGACY_HERO_PATH, { force: true }),
    ]);
  } finally {
    await browser.close();
    server?.kill();
  }
  console.log(`README assets generated in ${ASSET_DIR}`);
}

await main();
