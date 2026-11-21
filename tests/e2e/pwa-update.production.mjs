/** Same-origin, real service-worker update smoke. Both fixtures must be production Web builds. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { extname, resolve, sep } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

const [beforeDir, afterDir, mode] = process.argv.slice(2);
assert(
  beforeDir && afterDir && (!mode || mode === "--check-fixtures"),
  "Usage: node pwa-update.production.mjs <before-dist> <after-dist> [--check-fixtures]"
);
const apiTimeout = 15_000;
const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".mp3": "audio/mpeg",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
};

async function fixture(dir) {
  const root = resolve(dir);
  const [manifest, sw, index] = await Promise.all(
    ["update-manifest.json", "sw.js", "index.html"].map((file) =>
      readFile(resolve(root, file), "utf8")
    )
  );
  const { version, platforms } = JSON.parse(manifest);
  assert.match(version, /^\d+\.\d+\.\d+$/);
  assert.equal(platforms.web.version, version);
  assert(
    index.includes(`"softwareVersion": "${version}"`),
    `HTML version is not ${version}: ${root}`
  );
  assert(sw.includes("SKIP_WAITING"), `Expected the genuine prompt worker in ${root}`);
  return { root, version, workerSha: createHash("sha256").update(sw).digest("hex") };
}

const [before, after] = await Promise.all([fixture(beforeDir), fixture(afterDir)]);
const parts = (version) => version.split(".").map(Number);
const oldParts = parts(before.version);
const newParts = parts(after.version);
const firstDiff = oldParts.findIndex((part, index) => part !== newParts[index]);
assert(
  firstDiff !== -1 && oldParts[firstDiff] < newParts[firstDiff],
  "Fixture B must be newer than A"
);
assert.notEqual(before.workerSha, after.workerSha, "Production service-worker bodies must differ");

let hosted = before;
const isFile = (path) =>
  stat(path).then(
    (info) => info.isFile(),
    () => false
  );
const server = createServer(async (req, res) => {
  try {
    const { root } = hosted;
    const pathname = decodeURIComponent(new URL(req.url, "http://127.0.0.1").pathname);
    let file = resolve(root, `.${pathname}`);
    if (file !== root && !file.startsWith(`${root}${sep}`)) return res.writeHead(403).end();
    if (!extname(pathname) && !(await isFile(file))) {
      const prerender = resolve(file, "index.html");
      file = (await isFile(prerender)) ? prerender : resolve(root, "index.html");
    }
    if (!(await isFile(file))) return res.writeHead(404).end();
    res.writeHead(200, {
      "Cache-Control": "no-cache, no-store, must-revalidate",
      "Content-Type": contentTypes[extname(file)] ?? "application/octet-stream",
    });
    if (req.method === "HEAD") return res.end();
    createReadStream(file)
      .on("error", () => res.destroy())
      .pipe(res);
  } catch {
    res.writeHead(500).end();
  }
});
await new Promise((ok, fail) => server.once("error", fail).listen(0, "127.0.0.1", ok));
const origin = `http://127.0.0.1:${server.address().port}`;

async function checkHttpFixture(expected) {
  const worker = await fetch(`${origin}/sw.js`);
  assert(worker.ok && worker.headers.get("content-type").includes("javascript"));
  assert.equal(
    createHash("sha256")
      .update(await worker.text())
      .digest("hex"),
    expected.workerSha
  );
  const manifest = await fetch(`${origin}/update-manifest.json`).then((res) => res.json());
  assert.equal(manifest.platforms.web.version, expected.version);
  assert.match(await fetch(`${origin}/countdown`).then((res) => res.text()), /<html/i);
}

const main = (page) => page.getByRole("main", { name: "时钟应用主界面" });
const toolbar = (page) => page.getByRole("toolbar", { name: "时钟控制" });
const clock = (page) => page.getByRole("button", { name: "单击设置倒计时时间" });
const settings = (page) => page.getByRole("dialog", { name: "设置", exact: true });
const action = (page) => settings(page).getByRole("button", { name: "刷新并更新", exact: true });
const doc = (page) => page.evaluate(() => ({ ...window.__pwaSmokeDocument }));

async function showControls(page) {
  if (!(await toolbar(page).isVisible())) await main(page).click({ position: { x: 20, y: 20 } });
  await toolbar(page).waitFor();
}

async function openUpdates(page) {
  await showControls(page);
  await page.getByRole("button", { name: "打开设置", exact: true }).click();
  const panel = settings(page);
  await panel.waitFor();
  const nav = panel.getByRole("navigation", { name: "设置分组", exact: true });
  // On desktop the group button's accessible name includes its description.
  const system = nav.getByRole("button", { name: /^系统数据/ });
  if ((await system.getAttribute("aria-expanded")) !== "true") {
    await system.click();
    await waitUntil(
      "System data group did not expand",
      async () => (await system.getAttribute("aria-expanded")) === "true"
    );
  }
  await nav
    .getByRole("group", { name: "系统数据", exact: true })
    .getByRole("button", { name: "应用更新", exact: true })
    .click();
  await panel.getByRole("button", { name: "检查更新", exact: true }).waitFor();
}

async function closeSettings(page) {
  await settings(page).getByRole("button", { name: "关闭设置", exact: true }).click();
  await settings(page).waitFor({ state: "hidden" });
}

async function expectRuntimeVersion(page, version) {
  // Check the current-version metric, not the latest-version value fetched from the manifest.
  const metric = settings(page)
    .getByText("当前版本", { exact: true })
    .locator("xpath=ancestor::*[@data-ui-motion-item][1]");
  await metric.getByText(`v${version}`, { exact: true }).waitFor();
}

async function suppressNextAnnouncement(page, version) {
  await page.evaluate((nextVersion) => {
    const saved = JSON.parse(localStorage.getItem("AppSettings"));
    saved.general.announcement = { version: nextVersion, hideUntil: Date.now() + 86400000 };
    localStorage.setItem("AppSettings", JSON.stringify(saved));
  }, version);
}

async function waitUntil(description, condition) {
  const limit = Date.now() + apiTimeout;
  while (Date.now() < limit) {
    if (await condition()) return;
    await sleep(100);
  }
  assert.fail(description);
}

async function remainingSeconds(page) {
  const text = (await clock(page).textContent()).trim();
  const match = /^(\d{2}):(\d{2})$/.exec(text);
  assert(match, `Unexpected countdown readout: ${text}`);
  return Number(match[1]) * 60 + Number(match[2]);
}

async function expectVersion(page, version) {
  await page.waitForFunction(
    (expected) => {
      const candidates = document.querySelectorAll('script[type="application/ld+json"]');
      return [...candidates].some((script) => {
        try {
          return JSON.parse(script.textContent).softwareVersion === expected;
        } catch {
          return false;
        }
      });
    },
    version,
    { polling: 100, timeout: apiTimeout }
  );
  await main(page).waitFor();
}

async function openControlled(page) {
  await page.goto(`${origin}/countdown`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(
    async () => (await navigator.serviceWorker.getRegistration("/"))?.active?.state === "activated",
    null,
    { polling: 100, timeout: apiTimeout }
  );
  if (!(await page.evaluate(() => Boolean(navigator.serviceWorker.controller)))) {
    await page.reload({ waitUntil: "domcontentloaded" });
  }
  await page.waitForFunction(() => navigator.serviceWorker.controller?.state === "activated");
  await expectVersion(page, before.version);
}

async function startCountdown(page) {
  await clock(page).click();
  const modal = page.getByRole("dialog", { name: "设置倒计时" });
  await modal.getByRole("radio", { name: "10分钟", exact: true }).check();
  await modal.getByRole("button", { name: "确认", exact: true }).click();
  await showControls(page);
  await toolbar(page).getByRole("button", { name: "开始倒计时" }).click();
  await toolbar(page).getByRole("button", { name: "暂停倒计时" }).waitFor();
  await waitUntil(
    "Countdown did not begin moving",
    async () => (await remainingSeconds(page)) < 600
  );
}

async function assertBlocked(page, situation) {
  const button = action(page);
  await button.waitFor();
  assert(!(await button.isEnabled()), `${situation} allowed refresh`);
}

async function expectOtherTabNotReloaded(page, original, label) {
  await page.waitForFunction(
    ({ nonce, swaps }) =>
      window.__pwaSmokeDocument.nonce !== nonce || window.__pwaSmokeDocument.swaps > swaps,
    original,
    { polling: 100, timeout: apiTimeout }
  );
  assert.equal(
    (await doc(page)).nonce,
    original.nonce,
    `${label} force-reloaded on controller change`
  );
}

async function runBrowserSmoke() {
  // Resolve dependencies from the repo cwd, so this also runs as an untracked scratch script.
  const { chromium } = createRequire(resolve("package.json"))("playwright-core");
  const browser = await chromium.launch({
    headless: true,
    ...(process.env.PWA_CHROMIUM_PATH && { executablePath: process.env.PWA_CHROMIUM_PATH }),
  });
  const tabs = new Map();
  try {
    const ctx = await browser.newContext({
      serviceWorkers: "allow",
      viewport: { width: 1440, height: 900 },
      reducedMotion: "reduce",
    });
    ctx.setDefaultTimeout(apiTimeout);
    await ctx.addInitScript(
      ({ testOrigin, legalVersion, oldVersion }) => {
        if (window.location.origin !== testOrigin) return;
        window.__pwaSmokeDocument = { nonce: crypto.randomUUID(), swaps: 0 };
        navigator.serviceWorker.addEventListener("controllerchange", () => {
          window.__pwaSmokeDocument.swaps += 1;
        });
        if (localStorage.getItem("immersive-clock:pwa-smoke-seeded")) return;
        localStorage.setItem("immersive-clock:pwa-smoke-seeded", "true");
        localStorage.setItem("immersive-clock:has-seen-tour", "true");
        localStorage.setItem(
          "immersive-clock:legal-consent:v1",
          JSON.stringify({
            schemaVersion: 1,
            documentVersion: legalVersion,
            acceptedAt: 1,
          })
        );
        localStorage.setItem(
          "AppSettings",
          JSON.stringify({
            countdown: { favoritePresetSeconds: [9000] },
            general: { announcement: { version: oldVersion, hideUntil: Date.now() + 86400000 } },
          })
        );
      },
      {
        testOrigin: origin,
        oldVersion: before.version,
        legalVersion: process.env.PWA_LEGAL_DOCUMENT_VERSION ?? "2026-08-06",
      }
    );

    const idle = await ctx.newPage();
    tabs.set("applying", idle);
    await openControlled(idle);
    const observer = await ctx.newPage();
    tabs.set("idle observer", observer);
    await openControlled(observer);
    const busy = await ctx.newPage();
    tabs.set("countdown observer", busy);
    await openControlled(busy);
    await busy.bringToFront();
    await startCountdown(busy);
    await openUpdates(busy);
    await expectRuntimeVersion(busy, before.version);
    await idle.bringToFront();
    await openUpdates(idle);
    await expectRuntimeVersion(idle, before.version);
    const idleOriginal = await doc(idle);
    const observerOriginal = await doc(observer);
    const busyOriginal = await doc(busy);
    console.log(`All tabs are controlled by ${before.version}; one other tab is counting down.`);

    hosted = after;
    await checkHttpFixture(after);
    // Exercise the real manual check without waiting for a background check interval.
    await settings(idle).getByRole("button", { name: "检查更新", exact: true }).click();
    await idle.waitForFunction(
      async () =>
        (await navigator.serviceWorker.getRegistration("/"))?.waiting?.state === "installed",
      null,
      { polling: 100, timeout: apiTimeout }
    );
    console.log(`The real ${after.version} worker is installed and waiting.`);
    await busy.bringToFront();
    await assertBlocked(busy, "Running countdown");
    assert.equal((await doc(idle)).nonce, idleOriginal.nonce, "Idle tab refreshed without a click");
    assert.equal(
      (await doc(observer)).nonce,
      observerOriginal.nonce,
      "Idle observer refreshed without a click"
    );
    assert.equal(
      (await doc(busy)).nonce,
      busyOriginal.nonce,
      "Running tab refreshed without a click"
    );

    await idle.bringToFront();
    await suppressNextAnnouncement(idle, after.version);
    await action(idle).click();
    await expectVersion(idle, after.version);
    await idle.waitForFunction(() => navigator.serviceWorker.controller?.state === "activated");
    assert.notEqual((await doc(idle)).nonce, idleOriginal.nonce, "Explicit apply never navigated");
    assert.deepEqual(
      await idle.evaluate(
        () => JSON.parse(localStorage.getItem("AppSettings")).countdown.favoritePresetSeconds
      ),
      [9000]
    );
    await busy.bringToFront();
    await expectOtherTabNotReloaded(busy, busyOriginal, "Running observer");
    await assertBlocked(busy, "Running countdown after controller change");

    await closeSettings(busy);
    const remained = await remainingSeconds(busy);
    assert(remained > 0 && remained < 600, `Running countdown reset to ${remained}`);
    await waitUntil(
      "Sibling countdown stopped after controller change",
      async () => (await remainingSeconds(busy)) < remained
    );
    await showControls(busy);
    await toolbar(busy).getByRole("button", { name: "暂停倒计时" }).click();
    await toolbar(busy).getByRole("button", { name: "开始倒计时" }).waitFor();
    await openUpdates(busy);
    await assertBlocked(busy, "Paused countdown with progress");
    assert.equal((await doc(busy)).nonce, busyOriginal.nonce, "Paused countdown lost its document");
    await expectRuntimeVersion(busy, before.version);

    await idle.bringToFront();
    await openUpdates(idle);
    await expectRuntimeVersion(idle, after.version);
    await observer.bringToFront();
    await expectOtherTabNotReloaded(observer, observerOriginal, "Idle observer");

    console.log(
      `Browser smoke passed: explicit idle update to ${after.version}, saved favorite intact, idle and running sibling tabs not reloaded, paused countdown protected.`
    );
  } catch (error) {
    await Promise.all(
      [...tabs].map(async ([label, page]) => {
        const [worker, drawer] = await Promise.all([
          Promise.race([
            page
              .evaluate(async () => {
                const registration = await navigator.serviceWorker.getRegistration("/");
                return {
                  controller: navigator.serviceWorker.controller?.state,
                  active: registration?.active?.state,
                  waiting: registration?.waiting?.state,
                  installing: registration?.installing?.state,
                  swaps: window.__pwaSmokeDocument?.swaps,
                };
              })
              .catch(() => null),
            sleep(1_000, null, { ref: false }),
          ]),
          settings(page)
            .ariaSnapshot({ timeout: 1_000 })
            .catch(() => "(settings not open)"),
        ]);
        console.error(
          `[PWA smoke: ${label}] ${page.url()} worker=${JSON.stringify(worker)}\n${drawer.slice(0, 2600)}`
        );
      })
    );
    throw error;
  } finally {
    await browser.close();
  }
}

try {
  await checkHttpFixture(before);
  if (mode === "--check-fixtures") {
    hosted = after;
    await checkHttpFixture(after);
    console.log(
      `Fixture HTTP/SW bytes validated (${before.version} → ${after.version}); browser NOT run.`
    );
  } else {
    await runBrowserSmoke();
  }
} finally {
  server.closeAllConnections();
  await new Promise((done) => server.close(done));
}
