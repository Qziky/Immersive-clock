import { expect, test } from "@playwright/test";

test("科目输入回车可开始，确认与取消保留明确的考试状态", async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-09-26T09:00:00"));
  await page.goto("/exam");
  await page.getByRole("button", { name: "自定义", exact: true }).click();
  await expect(page.getByLabel("考试科目")).toBeFocused();
  await expect(page.getByLabel("小时")).toHaveValue("2");
  await expect(page.getByLabel("分钟", { exact: true })).toHaveValue("30");
  await page.getByLabel("考试科目").fill("高三数学周测");
  await page.getByLabel("考试科目").press("Enter");
  await expect(page.getByRole("timer")).toBeVisible();
  await page.getByRole("button", { name: "更多", exact: true }).click();
  await page.getByRole("option", { name: "考试设置", exact: true }).click();
  await page.getByLabel("考试科目").fill("英语周测");
  await page.getByRole("button", { name: "开始考试", exact: true }).click();
  await page.getByRole("button", { name: "取消", exact: true }).last().click();
  await page.getByRole("button", { name: "取消", exact: true }).click();
  await expect(page.getByText("高三数学周测", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "更多", exact: true }).click();
  await page.getByRole("option", { name: "提前结束", exact: true }).click();
  await page.getByRole("button", { name: "取消", exact: true }).click();
  await expect(page.getByText("考试进行中", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "更多", exact: true }).click();
  await page.getByRole("option", { name: "提前结束", exact: true }).click();
  await page.getByRole("button", { name: "结束考试", exact: true }).click();
  await expect(page.getByText("已提前结束", { exact: true })).toBeVisible();
  await expect(page.getByRole("timer")).toHaveText("02:30:00");
  await page.getByRole("button", { name: "再考一次", exact: true }).click();
  await expect(page.getByLabel("考试科目")).toHaveValue("高三数学周测");
});

test("自动隐藏、呼出菜单和暂停不改变中央时间尺寸", async ({ page }) => {
  await page.clock.install({ time: new Date("2026-09-26T09:00:00") });
  await page.goto("/exam");
  await page.getByRole("button", { name: "开始考试", exact: true }).click();
  const timer = page.getByRole("timer");
  const before = await timer.boundingBox();
  await timer.click();
  await page.clock.fastForward(4000);
  await expect(
    page.getByRole("toolbar", { name: "考试操作", includeHidden: true })
  ).toHaveAttribute("inert", "");
  expect((await timer.boundingBox())!.height).toBe(before!.height);
  await timer.click();
  const more = page.getByRole("button", { name: "更多", exact: true });
  await more.press("Enter");
  await page.clock.fastForward(4000);
  await expect(more).toHaveAttribute("aria-expanded", "true");
  await page.keyboard.press("Escape");
  await expect(more).toBeFocused();
  await page.getByRole("button", { name: "暂停", exact: true }).click();
  expect((await timer.boundingBox())!.height).toBe(before!.height);
});

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
    await expect(page.getByRole("dialog", { name: "考试设置" })).toHaveScreenshot(
      `exam-settings-${viewport.width}.png`,
      { maxDiffPixels: 5 }
    );
    await page.getByLabel("开始方式").selectOption("scheduled");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true
    );
    await page.getByLabel("开始方式").selectOption("immediate");
    await page.getByRole("button", { name: "开始考试", exact: true }).click();
    const timer = page.getByRole("timer");
    const toolbar = page.getByRole("toolbar", { name: "考试操作" });
    const before = await timer.boundingBox();
    expect(before).not.toBeNull();
    expect(before!.x).toBeGreaterThanOrEqual(0);
    expect(before!.x + before!.width).toBeLessThanOrEqual(viewport.width);
    await page.getByRole("button", { name: "暂停", exact: true }).click();
    const after = await timer.boundingBox();
    const toolbarBounds = await toolbar.boundingBox();
    expect(toolbarBounds!.x).toBeGreaterThanOrEqual(0);
    expect(toolbarBounds!.x + toolbarBounds!.width).toBeLessThanOrEqual(viewport.width);
    expect(toolbarBounds!.y).toBeGreaterThanOrEqual(after!.y + after!.height);
    await expect(toolbar.locator('[data-app-icon="action.play"]')).toBeVisible();
    await expect(toolbar.locator('[data-app-icon="action.maximize"]')).toBeVisible();
    await expect(toolbar.locator('[data-app-icon="action.more"]')).toBeVisible();
    if (viewport.width < 480) {
      for (const button of await toolbar.getByRole("button").all()) {
        const bounds = await button.boundingBox();
        expect(bounds!.width).toBeGreaterThanOrEqual(44);
        expect(bounds!.height).toBeGreaterThanOrEqual(44);
      }
    }
    expect(after!.height).toBe(before!.height);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true
    );
    await expect(page).toHaveScreenshot(`exam-${viewport.width}.png`);
  });
}
