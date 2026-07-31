import { readFile } from "node:fs/promises";

import { expect, test, type Page } from "@playwright/test";

import { showHud } from "./e2eUtils";

async function openDataSettings(page: Page) {
  await page.goto("/");
  await showHud(page);
  await page.getByRole("button", { name: "打开设置" }).click();

  const dialog = page.getByRole("dialog", { name: "设置" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "系统数据" }).click();
  await dialog.getByRole("button", { name: "设置数据" }).click();
  await expect(dialog.getByRole("heading", { name: "本地数据概览" })).toBeVisible();
  return dialog;
}

test("完整备份会下载 v1 数据包并包含噪声历史域", async ({ page }) => {
  const dialog = await openDataSettings(page);
  const fullBackup = dialog.getByRole("radio", { name: "完整备份" });
  await expect(fullBackup).toBeChecked();

  const downloadPromise = page.waitForEvent("download");
  await dialog.getByRole("button", { name: "创建备份" }).click();
  const download = await downloadPromise;
  const downloadPath = await download.path();
  expect(downloadPath).not.toBeNull();

  const backup = JSON.parse(await readFile(downloadPath!, "utf8"));
  expect(backup).toMatchObject({
    format: "immersive-clock-backup",
    backupVersion: 1,
    scope: "full",
  });
  expect(backup.domains.settings).toBeDefined();
  expect(backup.domains.assets).toBeDefined();
  expect(backup.domains.noiseHistory).toBeDefined();
});

test("清理临时缓存会保留设置和未注册的同源数据", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("data-management-sentinel", "keep");
    localStorage.setItem("api-governance.hitokoto.block-until", "123");
    localStorage.setItem("api-governance.hitokoto.backoff-level", "2");
  });

  const dialog = await openDataSettings(page);
  const settingsBefore = await page.evaluate(() => localStorage.getItem("AppSettings"));
  await dialog.getByRole("button", { name: "清理临时缓存" }).click();

  const confirmDialog = page.getByRole("dialog", { name: "清理临时缓存" });
  await confirmDialog.getByRole("button", { name: "清理缓存" }).click();
  await expect(confirmDialog).toBeHidden();

  const stored = await page.evaluate(() => ({
    settings: localStorage.getItem("AppSettings"),
    sentinel: localStorage.getItem("data-management-sentinel"),
    blockUntil: localStorage.getItem("api-governance.hitokoto.block-until"),
    backoffLevel: localStorage.getItem("api-governance.hitokoto.backoff-level"),
  }));
  expect(stored.settings).toBe(settingsBefore);
  expect(stored.sentinel).toBe("keep");
  expect(stored.blockUntil).toBeNull();
  expect(stored.backoffLevel).toBeNull();
});

test("无效备份在预检阶段被拒绝且不会写入设置", async ({ page }) => {
  const dialog = await openDataSettings(page);
  const settingsBefore = await page.evaluate(() => localStorage.getItem("AppSettings"));

  await dialog.getByLabel("备份文件", { exact: true }).setInputFiles({
    name: "invalid-backup.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify({ unrelated: true })),
  });

  await expect(dialog.getByText("无法识别旧版 AppSettings 数据")).toBeVisible({
    timeout: 10_000,
  });
  expect(await page.evaluate(() => localStorage.getItem("AppSettings"))).toBe(settingsBefore);
});

test("非法文件 MIME 在 Worker 启动前被拒绝且不会写入设置", async ({ page }) => {
  const dialog = await openDataSettings(page);
  const settingsBefore = await page.evaluate(() => localStorage.getItem("AppSettings"));

  await dialog.getByLabel("备份文件", { exact: true }).setInputFiles({
    name: "fake-backup.html",
    mimeType: "text/html",
    buffer: Buffer.from(JSON.stringify({ format: "immersive-clock-backup" })),
  });

  await expect(dialog.getByText("备份文件必须是 JSON 文件")).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem("AppSettings"))).toBe(settingsBefore);
});

test("危险 URL 在完整预检阶段被拒绝且不会写入设置", async ({ page }) => {
  const dialog = await openDataSettings(page);
  const settingsBefore = await page.evaluate(() => localStorage.getItem("AppSettings"));
  const settings = await page.evaluate(() => JSON.parse(localStorage.getItem("AppSettings")!));
  settings.general ??= {};
  settings.general.timeSync ??= {};
  settings.general.timeSync.httpDateUrl = "javascript:alert(1)";
  const assets: unknown[] = [];
  const serializedBytes = (value: unknown) => Buffer.byteLength(JSON.stringify(value), "utf8");
  const backup = {
    format: "immersive-clock-backup",
    backupVersion: 1,
    appVersion: "3.13.3",
    exportedAt: new Date().toISOString(),
    scope: "settings-and-assets",
    manifest: [
      { id: "settings", schemaVersion: 1, itemCount: 1, bytes: serializedBytes(settings) },
      { id: "assets", schemaVersion: 1, itemCount: 0, bytes: serializedBytes(assets) },
    ],
    domains: {
      settings: { schemaVersion: 1, data: settings },
      assets: { schemaVersion: 1, data: assets },
    },
  };

  await dialog.getByLabel("备份文件", { exact: true }).setInputFiles({
    name: "dangerous-url.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(backup)),
  });

  await expect(dialog.getByText(/使用了不安全协议/)).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem("AppSettings"))).toBe(settingsBefore);
});

test("Worker 会拒绝非法资源正文且不会写入设置", async ({ page }) => {
  const dialog = await openDataSettings(page);
  const settingsBefore = await page.evaluate(() => localStorage.getItem("AppSettings"));
  const settings = await page.evaluate(() => JSON.parse(localStorage.getItem("AppSettings")!));
  const assets = [
    {
      id: "unsafe-background",
      kind: "background",
      name: "unsafe.html",
      mimeType: "text/html",
      dataUrl: "data:text/html;base64,PGgxPm5vPC9oMT4=",
    },
  ];
  const serializedBytes = (value: unknown) => Buffer.byteLength(JSON.stringify(value), "utf8");
  const backup = {
    format: "immersive-clock-backup",
    backupVersion: 1,
    appVersion: "3.13.3",
    exportedAt: new Date().toISOString(),
    scope: "settings-and-assets",
    manifest: [
      { id: "settings", schemaVersion: 1, itemCount: 1, bytes: serializedBytes(settings) },
      { id: "assets", schemaVersion: 1, itemCount: 1, bytes: serializedBytes(assets) },
    ],
    domains: {
      settings: { schemaVersion: 1, data: settings },
      assets: { schemaVersion: 1, data: assets },
    },
  };

  await dialog.getByLabel("备份文件", { exact: true }).setInputFiles({
    name: "unsafe-resource.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(backup)),
  });

  await expect(dialog.getByText(/MIME 类型不受支持/)).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem("AppSettings"))).toBe(settingsBefore);
});

test("数据中心在桌面与窄屏下不显示原生文件框且没有横向溢出", async ({ page }) => {
  const dialog = await openDataSettings(page);
  const panel = dialog.locator("#data-settings-panel");
  const nativeFileInputs = panel.locator('input[type="file"]');

  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 390, height: 844 },
    { width: 320, height: 568 },
  ]) {
    await page.setViewportSize(viewport);
    await expect(dialog.getByRole("button", { name: "选择备份文件" })).toBeVisible();
    await expect(dialog.getByRole("button", { name: "选择 .icnoise 文件" })).toBeVisible();
    expect(await panel.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(
      true
    );
    expect(await nativeFileInputs.count()).toBe(2);
    expect(
      await nativeFileInputs.evaluateAll((elements) =>
        elements.every((element) => {
          const rect = element.getBoundingClientRect();
          const style = getComputedStyle(element);
          return rect.width <= 1 && rect.height <= 1 && style.position === "absolute";
        })
      )
    ).toBe(true);
  }
});
