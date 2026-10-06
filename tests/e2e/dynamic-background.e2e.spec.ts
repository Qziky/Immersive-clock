import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";

import { expect, test, type Page } from "@playwright/test";

import { showHud } from "./e2eUtils";

async function openOverview(page: Page) {
  await showHud(page);
  await page.getByRole("button", { name: "打开设置" }).click();
  const dialog = page.getByRole("dialog", { name: "设置" });
  await dialog.getByRole("button", { name: /^视觉外观/ }).click();
  await dialog.getByRole("button", { name: "整体样式", exact: true }).click();
  return dialog;
}

for (const variant of ["small", "large"] as const) {
  test(`动态视频 ${variant}：导入、静音预览、原声、Worker 备份恢复和离线播放`, async ({
    page,
    context,
  }) => {
    test.skip(
      variant === "large" && !process.env.DYNAMIC_BACKGROUND_LARGE_VIDEO,
      "大文件验证通过 DYNAMIC_BACKGROUND_LARGE_VIDEO 指定本地 MP4/WebM"
    );
    test.setTimeout(variant === "large" ? 180_000 : 60_000);
    const videoPath =
      variant === "large"
        ? process.env.DYNAMIC_BACKGROUND_LARGE_VIDEO!
        : path.resolve("tests/e2e/fixtures/dynamic-background.mp4");
    const fileSize = (await stat(videoPath)).size;
    const expectedHash = createHash("sha256")
      .update(await readFile(videoPath))
      .digest("hex");
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto("/");
    let dialog = await openOverview(page);
    await dialog.getByRole("radio", { name: "动态背景", exact: true }).click();
    await dialog.getByRole("radio", { name: "自定义视频", exact: true }).click();
    await dialog.getByLabel("选择本地视频", { exact: true }).setInputFiles(videoPath);
    const previewVideo = dialog.getByLabel("时钟外观预览").locator("video");
    await expect
      .poll(() => previewVideo.evaluate((element: HTMLVideoElement) => element.readyState))
      .toBeGreaterThanOrEqual(2);
    expect(await previewVideo.evaluate((element: HTMLVideoElement) => element.muted)).toBe(true);
    await dialog.getByRole("switch", { name: "允许手动开启原声" }).check();
    expect(await previewVideo.evaluate((element: HTMLVideoElement) => element.muted)).toBe(true);
    await dialog.getByRole("button", { name: "保存", exact: true }).click();
    await expect(dialog).toBeHidden();
    let mainVideo = page.locator('main > [data-testid="dynamic-background-layer"] video');
    await expect(mainVideo).toBeVisible();
    expect(
      await mainVideo.evaluate((element: HTMLVideoElement) => ({
        muted: element.muted,
        loop: element.loop,
        volume: element.volume,
      }))
    ).toEqual({ muted: true, loop: true, volume: 0.3 });
    await page.getByRole("button", { name: "开启视频声音", exact: true }).click();
    await expect
      .poll(() => mainVideo.evaluate((element: HTMLVideoElement) => element.muted))
      .toBe(false);
    await page.reload();
    await showHud(page);
    mainVideo = page.locator('main > [data-testid="dynamic-background-layer"] video');
    await expect(mainVideo).toBeVisible();
    expect(await mainVideo.evaluate((element: HTMLVideoElement) => element.muted)).toBe(true);

    await page.getByRole("button", { name: "打开设置" }).click();
    dialog = page.getByRole("dialog", { name: "设置" });
    await dialog.getByRole("button", { name: /^系统数据/ }).click();
    await dialog.getByRole("button", { name: "设置数据", exact: true }).click();
    await expect(dialog.getByLabel("备份文件", { exact: true })).toBeEnabled({ timeout: 10_000 });
    await dialog.getByRole("radio", { name: "设置与资源", exact: true }).click();
    const downloading = page.waitForEvent("download");
    await dialog.getByRole("button", { name: "创建备份", exact: true }).click();
    const backupPath = await (await downloading).path();
    expect(backupPath).not.toBeNull();
    expect((await stat(backupPath!)).size).toBeGreaterThan(fileSize);
    await dialog.getByLabel("备份文件", { exact: true }).setInputFiles(backupPath!);
    await expect(dialog.getByLabel("备份预检摘要")).toBeVisible({ timeout: 90_000 });
    await dialog.getByRole("button", { name: "恢复并刷新", exact: true }).click();
    const confirmation = page.getByRole("dialog", { name: "恢复本地数据" });
    await confirmation.getByRole("button", { name: "恢复并刷新", exact: true }).click();
    await expect(dialog).toBeHidden({ timeout: 90_000 });
    await showHud(page);
    mainVideo = page.locator('main > [data-testid="dynamic-background-layer"] video');
    await expect
      .poll(() => mainVideo.evaluate((element: HTMLVideoElement) => element.readyState))
      .toBeGreaterThanOrEqual(2);
    const restored = await page.evaluate(async () => {
      // Reading the actual restored Blob verifies the Worker and IndexedDB boundary.
      const modulePath = "/src/utils/appearanceAssets.ts";
      const assets = await import(/* @vite-ignore */ modulePath);
      const settings = JSON.parse(localStorage.getItem("AppSettings")!);
      const asset = await assets.loadVideoBackgroundAsset(
        settings.appearance.global.background.dynamic.assetId
      );
      const digest = await crypto.subtle.digest("SHA-256", await asset.blob.arrayBuffer());
      return {
        size: asset.blob.size,
        kind: asset.kind,
        hash: Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join(
          ""
        ),
      };
    });
    expect(restored).toEqual({ size: fileSize, kind: "video", hash: expectedHash });
    await context.setOffline(true);
    const firstTime = await mainVideo.evaluate((element: HTMLVideoElement) => element.currentTime);
    await expect
      .poll(() => mainVideo.evaluate((element: HTMLVideoElement) => element.currentTime))
      .not.toBe(firstTime);
    await context.setOffline(false);
    expect(errors).toEqual([]);
  });
}
