import type { AppMode } from "../../types";

import { getModePreloadOrder, preloadModeComponent } from "./modeComponents";

type BackgroundOpportunityWaiter = () => Promise<boolean>;
type ResourceLoader = () => Promise<unknown>;

interface ClockPagePreloadOptions {
  currentMode: AppMode;
  loadModeComponent?: (mode: AppMode) => Promise<void>;
  secondaryLoaders: readonly ResourceLoader[];
  waitForBackgroundOpportunity: BackgroundOpportunityWaiter;
}

/**
 * 先等待当前模式完成，再利用空闲片段逐项加载后续页面资源。
 * 返回 false 的空闲等待器用于在页面切换或卸载时终止尚未开始的任务。
 */
export async function preloadClockPageResources({
  currentMode,
  loadModeComponent = preloadModeComponent,
  secondaryLoaders,
  waitForBackgroundOpportunity,
}: ClockPagePreloadOptions): Promise<void> {
  await loadModeComponent(currentMode);

  const remainingModes = getModePreloadOrder(currentMode).slice(1);
  const remainingLoaders: ResourceLoader[] = [
    ...remainingModes.map((mode) => () => loadModeComponent(mode)),
    ...secondaryLoaders,
  ];

  for (const loadResource of remainingLoaders) {
    if (!(await waitForBackgroundOpportunity())) return;
    await loadResource().catch(() => undefined);
  }
}
