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
    await page.getByRole("button", { name: "查看噪音历史" }).click();

    const historyDialog = page.getByRole("dialog", { name: "历史记录管理" });
    await expect(historyDialog).toBeVisible();
    await expect(historyDialog.getByText("暂无历史记录")).toBeVisible();

    await historyDialog.getByText("自定义时间段报告").click();
    await expect(historyDialog.getByLabel("报告名称")).toBeVisible();
    const notificationClose = page.getByRole("button", { name: "关闭通知" });
    if (await notificationClose.count()) await notificationClose.last().click();
    const startInput = historyDialog.getByLabel("开始时间");
    const endInput = historyDialog.getByLabel("结束时间");
    const validEndValue = await endInput.inputValue();
    await endInput.fill(await startInput.inputValue());
    await historyDialog.getByRole("button", { name: "查看报告" }).click();
    await expect(historyDialog.getByRole("alert")).toContainText("结束时间必须晚于开始时间");

    await endInput.fill(validEndValue);
    await historyDialog.getByRole("button", { name: "查看报告" }).click();

    const reportDialog = page.getByRole("dialog", { name: "噪音统计报告" });
    await expect(reportDialog.getByText("该时段暂无有效噪音评分")).toBeVisible();
    await expect(reportDialog.locator("svg[role='img']")).toHaveCount(0);
    await reportDialog.getByRole("button", { name: "返回" }).click();
    const reopenedHistory = page.getByRole("dialog", { name: "历史记录管理" });
    await expect(reopenedHistory).toBeVisible();

    await page.evaluate(async () => {
      const now = Date.now();
      const scores = [94, 86, 78, 70];
      const slices = scores.map((score, index) => {
        const start = now - (50 - index * 12) * 60_000;
        const end = start + 60_000;
        return {
          schemaVersion: 1 as const,
          id: `spectral-activity-v2:modal-e2e:${(index + 1) * 50}`,
          modelVersion: "spectral-activity-v2" as const,
          captureSessionId: "modal-e2e",
          leaderEpoch: "modal-e2e-epoch",
          windowSequence: index + 1,
          sourceStartFrameSequence: index * 50 + 1,
          sourceEndFrameSequence: (index + 1) * 50,
          sourceStartSample: index * 2_880_000,
          sourceEndSample: (index + 1) * 2_880_000,
          start,
          end,
          featureCount: 600,
          coverageRatio: 1,
          signalHealth: "healthy" as const,
          confidence: "high" as const,
          estimated: {
            calibrationId: "modal-e2e-calibration",
            avgDbA: 42 + index * 2,
            p95DbA: 50 + index * 2,
          },
          score,
          detail: {
            activityMean: 0.05 + index * 0.1,
            activityFloor: 0.02 + index * 0.08,
            eventFactor: 0.1 + index * 0.1,
            eventCount: index + 1,
            durationMs: end - start,
            sampledDurationMs: end - start,
            coverageRatio: 1,
            validSecondCount: 60,
            totalSecondCount: 60,
            quality: "high" as const,
            thresholdsUsed: {
              activityEnter: 0.78,
              activityExit: 0.4,
              eventMergeGapSec: 3,
              coverageRequired: 0.8,
            },
          },
          sourceAvailable: false,
        };
      });
      // eslint-disable-next-line import/no-unresolved -- This module is loaded by the Vite page runtime.
      const service = await import("/src/utils/noiseSliceService.ts");
      await service.replaceNoiseSlices(slices);
    });

    await page.reload();
    await showHud(page);
    await page
      .getByRole("tablist", { name: "选择时钟模式" })
      .getByRole("tab", { name: /自习/ })
      .click();
    await page.getByRole("button", { name: "查看噪音历史" }).click();
    await expect(reopenedHistory).toBeVisible();
    const reopenedNotificationClose = page.getByRole("button", { name: "关闭通知" });
    if (await reopenedNotificationClose.count()) await reopenedNotificationClose.last().click();
    await reopenedHistory.getByText("自定义时间段报告").click();
    await reopenedHistory.getByRole("button", { name: "查看报告" }).click();
    const populatedReport = page.getByRole("dialog", { name: "噪音统计报告" });
    const quietRateSummary = populatedReport.getByRole("group", { name: "安静达标率摘要" });
    await expect(quietRateSummary).toBeVisible();
    await expect(quietRateSummary.getByText("安静达标率")).toBeVisible();
    await expect(quietRateSummary.getByText(/数据质量/)).toHaveCount(0);
    await expect(populatedReport.getByText(/数据质量：覆盖/)).toBeVisible();
    await expect(populatedReport.locator("svg[role='img']")).toHaveCount(1);
    expect(
      await populatedReport
        .locator("svg[role='img']")
        .evaluateAll((charts) =>
          charts.every((chart) =>
            Boolean(chart.querySelector("title") && chart.querySelector("desc"))
          )
        )
    ).toBe(true);

    await populatedReport.getByRole("radio", { name: "估算 dB(A)" }).click();
    await expect(populatedReport.getByRole("img", { name: "估算 dB(A) 走势" })).toBeVisible();

    for (const viewport of [
      { width: 1440, height: 900 },
      { width: 390, height: 844 },
      { width: 320, height: 568 },
    ]) {
      await page.setViewportSize(viewport);
      await expect(populatedReport).toBeVisible();
      await expect(populatedReport.getByRole("button", { name: "返回" })).toBeVisible();
      const layout = await populatedReport.evaluate((dialog) => {
        const rect = dialog.getBoundingClientRect();
        const body = dialog.querySelector<HTMLElement>("[data-ui-modal-body]");
        return {
          bodyFits: body ? body.scrollWidth <= body.clientWidth : false,
          dialogFits:
            rect.left >= 0 &&
            rect.top >= 0 &&
            rect.right <= window.innerWidth &&
            rect.bottom <= window.innerHeight,
          documentFits: document.documentElement.scrollWidth <= window.innerWidth,
        };
      });
      expect(layout).toEqual({ bodyFits: true, dialogFits: true, documentFits: true });
    }
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
