import { lazy, type ComponentType, type LazyExoticComponent } from "react";

import type { AppMode } from "../../types";

type ModeComponentLoader = () => Promise<{ default: ComponentType }>;

const MODE_COMPONENT_LOADERS: Record<AppMode, ModeComponentLoader> = {
  clock: () => import("../../components/Clock/Clock").then((module) => ({ default: module.Clock })),
  countdown: () =>
    import("../../components/Countdown/Countdown").then((module) => ({
      default: module.Countdown,
    })),
  stopwatch: () =>
    import("../../components/Stopwatch/Stopwatch").then((module) => ({
      default: module.Stopwatch,
    })),
  study: () => import("../../components/Study/Study").then((module) => ({ default: module.Study })),
};

export const MODE_COMPONENTS: Record<AppMode, LazyExoticComponent<ComponentType>> = {
  clock: lazy(MODE_COMPONENT_LOADERS.clock),
  countdown: lazy(MODE_COMPONENT_LOADERS.countdown),
  stopwatch: lazy(MODE_COMPONENT_LOADERS.stopwatch),
  study: lazy(MODE_COMPONENT_LOADERS.study),
};

export function preloadModeComponent(mode: AppMode): void {
  void MODE_COMPONENT_LOADERS[mode]().catch(() => undefined);
}
