import { expect, test } from "@playwright/test";

import { showHud } from "./e2eUtils";

test.describe("弹层重设计", () => {
  test("320px 公告 Tabs 可完整访问且保留底栏说明", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 568 });
    await page.goto("/");
    await showHud(page);

    await page.getByRole("button", { name: /版本 v.+点击查看更新公告/ }).click();
    const dialog = page.getByRole("dialog", { name: "系统公告" });
    await expect(dialog).toBeVisible();

    const tabs = dialog.getByRole("tablist");
    for (const name of ["公告", "更新日志", "意见反馈"]) {
      const tab = tabs.getByRole("tab", { name });
      await tab.scrollIntoViewIfNeeded();
      await tab.click();
      await expect(tab).toHaveAttribute("aria-selected", "true");
    }

    await expect(dialog.locator('iframe[title="意见反馈（腾讯问卷）"]')).toBeVisible();
    await expect(dialog.getByText("之后仍可点击版本号重新打开公告。")).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)
    ).toBe(true);
  });

  test("噪音历史可展开并进入无图表的报告空态", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    await showHud(page);

    const modeTabs = page.getByRole("tablist", { name: "选择时钟模式" });
    await modeTabs.getByRole("tab", { name: /自习/ }).click();
    await page.getByRole("button", { name: /查看历史记录/ }).click();

    const historyDialog = page.getByRole("dialog", { name: "历史记录管理" });
    await expect(historyDialog).toBeVisible();
    await expect(historyDialog.getByText("暂无历史记录")).toBeVisible();

    await historyDialog.getByText("自定义时间段报告").click();
    await expect(historyDialog.getByLabel("报告名称")).toBeVisible();
    const startInput = historyDialog.getByLabel("开始时间");
    const endInput = historyDialog.getByLabel("结束时间");
    const validEndValue = await endInput.inputValue();
    await endInput.fill(await startInput.inputValue());
    await historyDialog.getByRole("button", { name: "查看报告" }).click();
    await expect(historyDialog.getByRole("alert")).toContainText("结束时间必须晚于开始时间");

    await endInput.fill(validEndValue);
    await historyDialog.getByRole("button", { name: "查看报告" }).click();

    const reportDialog = page.getByRole("dialog", { name: "自定义报告 统计报告" });
    await expect(reportDialog.getByText("该时段暂无噪音数据")).toBeVisible();
    await expect(reportDialog.locator("svg[role='img']")).toHaveCount(0);
    await reportDialog.getByRole("button", { name: "返回" }).click();
    const reopenedHistory = page.getByRole("dialog", { name: "历史记录管理" });
    await expect(reopenedHistory).toBeVisible();

    await page.evaluate(() => {
      const now = Date.now();
      const values = [44, 51, 63, 57];
      const slices = values.map((avgDb, index) => {
        const start = now - (50 - index * 12) * 60_000;
        const end = start + 8 * 60_000;
        return {
          start,
          end,
          frames: 480,
          raw: {
            avgDbfs: -48 + index * 5,
            maxDbfs: -22,
            p50Dbfs: -50 + index * 5,
            p95Dbfs: -28 + index * 3,
            overRatioDbfs: 0.08 + index * 0.07,
            segmentCount: index + 1,
            sampledDurationMs: end - start,
          },
          display: { avgDb, p95Db: avgDb + 10 },
          score: 94 - index * 8,
          scoreDetail: {
            sustainedPenalty: 0.04 + index * 0.04,
            timePenalty: 0.03 + index * 0.03,
            segmentPenalty: 0.02 + index * 0.04,
            thresholdsUsed: {
              scoreThresholdDbfs: -32,
              segmentMergeGapMs: 1000,
              maxSegmentsPerMin: 8,
            },
            sustainedLevelDbfs: -48 + index * 5,
            overRatioDbfs: 0.08 + index * 0.07,
            segmentCount: index + 1,
            minutes: 8,
            durationMs: end - start,
            sampledDurationMs: end - start,
            coverageRatio: 1,
          },
        };
      });
      localStorage.setItem("noise-slices", JSON.stringify(slices));
    });

    await page.reload();
    await showHud(page);
    await page
      .getByRole("tablist", { name: "选择时钟模式" })
      .getByRole("tab", { name: /自习/ })
      .click();
    await page.getByRole("button", { name: /查看历史记录/ }).click();
    await expect(reopenedHistory).toBeVisible();
    await expect.poll(() => page.evaluate(() => localStorage.getItem("noise-slices"))).toBeNull();

    await reopenedHistory.getByText("自定义时间段报告").click();
    await reopenedHistory.getByRole("button", { name: "查看报告" }).click();
    const populatedReport = page.getByRole("dialog", { name: "自定义报告 统计报告" });
    await expect(populatedReport.locator("svg[role='img']")).toHaveCount(3);
    expect(
      await populatedReport
        .locator("svg[role='img']")
        .evaluateAll((charts) =>
          charts.every((chart) =>
            Boolean(chart.querySelector("title") && chart.querySelector("desc"))
          )
        )
    ).toBe(true);
  });

  test("Toast 显示在右下角且始终位于业务弹窗上方", async ({ page }) => {
    await page.goto("/");
    await showHud(page);
    await page.getByRole("button", { name: /版本 v.+点击查看更新公告/ }).click();
    await expect(page.getByRole("dialog", { name: "系统公告" })).toBeVisible();

    await page.evaluate(() => {
      window.dispatchEvent(
        new CustomEvent("messagePopup:open", {
          detail: {
            id: "e2e-layer-toast",
            type: "weatherAlert",
            title: "暴雨预警",
            message: "预计未来一小时有强降雨。",
          },
        })
      );
    });

    await expect(page.getByRole("alert")).toContainText("暴雨预警");
    const layout = await page.evaluate(() => {
      const toastViewport = document.querySelector<HTMLElement>("[aria-label='通知']");
      const modalBackdrop = document.querySelector<HTMLElement>(
        "[data-ui-overlay-root][role='presentation']"
      );
      const bottomChrome = document.querySelector<HTMLElement>("[aria-label='底栏工具与项目信息']");
      const toastRect = toastViewport!.getBoundingClientRect();
      const bottomChromeRect = bottomChrome!.getBoundingClientRect();
      return {
        bottomGap: window.innerHeight - toastRect.bottom,
        bottomChromeTop: bottomChromeRect.top,
        modalLayer: Number(getComputedStyle(modalBackdrop!).zIndex),
        rightGap: window.innerWidth - toastRect.right,
        toastBottom: toastRect.bottom,
        toastLayer: Number(getComputedStyle(toastViewport!).zIndex),
      };
    });
    expect(layout.rightGap).toBeGreaterThanOrEqual(11);
    expect(layout.rightGap).toBeLessThanOrEqual(13);
    expect(layout.bottomGap).toBeGreaterThanOrEqual(47);
    expect(layout.bottomGap).toBeLessThanOrEqual(49);
    expect(layout.toastBottom).toBeLessThanOrEqual(layout.bottomChromeTop - 29);
    expect(layout.toastLayer).toBeGreaterThan(layout.modalLayer);
  });
});
