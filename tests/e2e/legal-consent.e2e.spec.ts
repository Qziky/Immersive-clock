import { expect, test, type Page } from "@playwright/test";

import { LEGAL_DOCUMENT_VERSION } from "../../src/constants/legal";

import { CURRENT_APP_VERSION } from "./e2eUtils";

const LEGAL_CONSENT_STORAGE_KEY = "immersive-clock:legal-consent:v1";

test.use({ storageState: { cookies: [], origins: [] } });

async function seedQuietStartup(page: Page) {
  await page.addInitScript((appVersion) => {
    localStorage.setItem("immersive-clock:has-seen-tour", "true");
    localStorage.setItem(
      "AppSettings",
      JSON.stringify({
        version: 14,
        general: {
          analytics: { experienceProgramEnabled: true },
          announcement: {
            hideUntil: Date.now() + 7 * 24 * 60 * 60 * 1000,
            version: appVersion,
          },
        },
      })
    );
  }, CURRENT_APP_VERSION);
}

test("首次使用门禁不可跳过，拒绝后可重新选择并进入", async ({ page }) => {
  await seedQuietStartup(page);
  await page.goto("/");

  const gate = page.getByRole("dialog", { name: "在开始使用前" });
  await expect(gate).toBeVisible();
  await expect(gate.getByRole("button", { name: "同意并进入" })).toBeDisabled();
  await expect(gate.getByRole("region", { name: "用户使用协议和隐私政策全文" })).toBeVisible();
  await expect(gate.getByRole("link", { name: "《用户使用协议》" })).toHaveAttribute(
    "href",
    "/terms"
  );
  await expect(gate.getByRole("link", { name: "《隐私政策》" })).toHaveAttribute(
    "href",
    "/privacy"
  );
  await expect(gate.getByRole("link", { name: "《分析服务说明》" })).toHaveCount(0);

  await page.keyboard.press("Escape");
  await expect(gate).toBeVisible();

  await gate.getByRole("button", { name: "不同意" }).click();
  await expect(page.getByRole("region", { name: "暂时无法继续使用" })).toBeVisible();
  await expect(page.getByRole("main", { name: "时钟应用主界面" })).toHaveCount(0);

  await page.getByRole("button", { name: "重新阅读并选择" }).click();
  await gate.getByRole("checkbox").setChecked(true, { force: true });
  await gate.getByRole("button", { name: "同意并进入" }).click();

  await expect(page.getByRole("main", { name: "时钟应用主界面" })).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate((storageKey) => {
        const record = JSON.parse(localStorage.getItem(storageKey) ?? "null");
        return record?.documentVersion ?? null;
      }, LEGAL_CONSENT_STORAGE_KEY)
    )
    .toBe(LEGAL_DOCUMENT_VERSION);
});

test("未同意时功能路由被阻断，法律文档仍可直接访问", async ({ page }) => {
  await seedQuietStartup(page);

  await page.goto("/study");
  await expect(page.getByRole("dialog", { name: "在开始使用前" })).toBeVisible();
  await expect(page.getByRole("main", { name: "时钟应用主界面" })).toHaveCount(0);

  for (const document of [
    { path: "/terms", title: "用户使用协议" },
    { path: "/privacy", title: "隐私政策" },
  ]) {
    await page.goto(document.path);
    await expect(page.locator("[data-legal-document]")).toBeVisible();
    await expect(
      page.getByRole("heading", { name: document.title, level: 1 }).first()
    ).toBeVisible();
  }

  await page.goto("/analytics");
  await expect(page.locator("[data-legal-document='privacy']")).toBeVisible();
  await expect(page.getByRole("heading", { name: "隐私政策", level: 1 }).first()).toBeVisible();
});

test("旧协议版本会要求重新确认", async ({ page }) => {
  await seedQuietStartup(page);
  await page.addInitScript((storageKey) => {
    localStorage.setItem(
      storageKey,
      JSON.stringify({ schemaVersion: 1, documentVersion: "2026-01-01", acceptedAt: 1 })
    );
  }, LEGAL_CONSENT_STORAGE_KEY);

  await page.goto("/");
  await expect(page.getByRole("dialog", { name: "在开始使用前" })).toBeVisible();
});

test("关闭用户体验改进计划后保存、刷新且不请求 Clarity", async ({ page }) => {
  let clarityRequestCount = 0;
  page.on("request", (request) => {
    const hostname = new URL(request.url()).hostname;
    if (hostname === "clarity.ms" || hostname.endsWith(".clarity.ms")) {
      clarityRequestCount += 1;
    }
  });

  await seedQuietStartup(page);
  await page.addInitScript(
    ({ documentVersion, storageKey }) => {
      localStorage.setItem(
        storageKey,
        JSON.stringify({ schemaVersion: 1, documentVersion, acceptedAt: Date.now() })
      );
    },
    { documentVersion: LEGAL_DOCUMENT_VERSION, storageKey: LEGAL_CONSENT_STORAGE_KEY }
  );
  await page.goto("/");

  await page.getByRole("button", { name: "打开设置" }).click();
  const settings = page.getByRole("dialog", { name: "设置" });
  await settings.getByRole("button", { name: "系统数据" }).click();
  await settings.getByRole("button", { name: "隐私与分析" }).click();

  const experienceSwitch = settings.getByRole("switch", { name: "用户体验改进计划" });
  await expect(experienceSwitch).toBeChecked();
  await experienceSwitch.click();

  const retention = page.getByRole("dialog", { name: "要关闭用户体验改进计划吗？" });
  await expect(retention).toContainText("这个项目主要由作者个人维护");
  await retention.getByRole("button", { name: "仍然关闭" }).click();
  await expect(experienceSwitch).not.toBeChecked();
  await settings.getByRole("button", { name: "保存" }).click();

  await expect
    .poll(() =>
      page.evaluate(() => {
        const settingsValue = JSON.parse(localStorage.getItem("AppSettings") ?? "{}");
        return settingsValue.general?.analytics?.experienceProgramEnabled;
      })
    )
    .toBe(false);
  await expect(page.getByRole("main", { name: "时钟应用主界面" })).toBeVisible();
  expect(clarityRequestCount).toBe(0);
});
