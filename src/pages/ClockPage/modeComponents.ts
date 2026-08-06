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

const modeComponentPromises: Partial<Record<AppMode, Promise<{ default: ComponentType }>>> = {};

function getModeComponentPromise(mode: AppMode): Promise<{ default: ComponentType }> {
  const existingPromise = modeComponentPromises[mode];
  if (existingPromise) return existingPromise;

  const promise = MODE_COMPONENT_LOADERS[mode]().catch((error: unknown) => {
    if (modeComponentPromises[mode] === promise) delete modeComponentPromises[mode];
    throw error;
  });
  modeComponentPromises[mode] = promise;
  return promise;
}

export const MODE_COMPONENTS: Record<AppMode, LazyExoticComponent<ComponentType>> = {
  clock: lazy(() => getModeComponentPromise("clock")),
  countdown: lazy(() => getModeComponentPromise("countdown")),
  stopwatch: lazy(() => getModeComponentPromise("stopwatch")),
  study: lazy(() => getModeComponentPromise("study")),
};

export async function preloadModeComponent(mode: AppMode): Promise<void> {
  await getModeComponentPromise(mode).then(
    () => undefined,
    () => undefined
  );
}

export function getModePreloadOrder(priorityMode: AppMode): AppMode[] {
  const modes = Object.keys(MODE_COMPONENT_LOADERS) as AppMode[];
  return [priorityMode, ...modes.filter((mode) => mode !== priorityMode)];
}
