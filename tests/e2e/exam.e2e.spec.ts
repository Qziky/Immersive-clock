import { expect, test } from "@playwright/test";

test("立即开始支持暂停、刷新恢复、继续以及返回时钟", async ({ page }) => {
  await page.goto("/exam");
  await page.getByRole("button", { name: "数学 · 120分", exact: true }).click();
  await page.getByRole("button", { name: "开始考试", exact: true }).click();
  await expect(page.getByRole("timer")).toHaveText("02:00:00");
  await page.getByRole("button", { name: "暂停", exact: true }).click();
  const paused = await page.getByRole("timer").innerText();
  await page.reload();
  await expect(page.getByText("已暂停", { exact: true })).toBeVisible();
  await expect(page.getByRole("timer")).toHaveText(paused);
  await page.getByRole("button", { name: "继续", exact: true }).click();
  await expect(page.getByText("考试进行中", { exact: true })).toBeVisible();
  await expect(page.getByRole("tab", { name: /考试/ })).toHaveCount(0);
  await page.getByRole("button", { name: "更多", exact: true }).click();
  await page.getByText("返回时钟", { exact: true }).click();
  await expect(page).toHaveURL(/\/clock$/);
});

test("固定时间段等待后开考，隐藏暂停并到点结束", async ({ page }) => {
  await page.clock.install({ time: new Date("2026-09-26T09:00:00") });
  await page.goto("/exam");
  await page.getByLabel("开始方式").selectOption("scheduled");
  await page.getByLabel("开始时间", { exact: true }).fill("2026-09-26T09:01");
  await page.getByLabel("结束时间", { exact: true }).fill("2026-09-26T09:03");
  await page.getByRole("button", { name: "启用考试安排" }).click();
  await expect(page.getByRole("timer")).toHaveAccessibleName("距开考");
  await page.clock.fastForward(60000);
  await expect(page.getByText("考试进行中", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "暂停", exact: true })).toHaveCount(0);
  await page.clock.fastForward(120000);
  await expect(page.getByText("考试已结束", { exact: true })).toBeVisible();
  await expect(page.getByRole("timer")).toHaveText("00:00:00");
});

for (const viewport of [
  { width: 1440, height: 900 },
  { width: 390, height: 844 },
  { width: 320, height: 568 },
]) {
  test(`考试布局 ${viewport.width} 保持主时间尺寸`, async ({ page }) => {
    await page.clock.setFixedTime(new Date("2026-09-26T09:00:00"));
    await page.setViewportSize(viewport);
    await page.goto("/exam");
    await page.getByRole("button", { name: "开始考试", exact: true }).click();
    const timer = page.getByRole("timer");
    const before = await timer.boundingBox();
    expect(before).not.toBeNull();
    expect(before!.x).toBeGreaterThanOrEqual(0);
    expect(before!.x + before!.width).toBeLessThanOrEqual(viewport.width);
    await page.getByRole("button", { name: "暂停", exact: true }).click();
    const after = await timer.boundingBox();
    expect(after!.height).toBe(before!.height);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true
    );
    await expect(page).toHaveScreenshot(`exam-${viewport.width}.png`, {
      mask: [page.locator("time")],
    });
  });
}
