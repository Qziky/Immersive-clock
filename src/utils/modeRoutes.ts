import type { AppMode } from "../types";

export const MODE_ROUTE_PATHS: Record<AppMode, string> = {
  clock: "/clock",
  countdown: "/countdown",
  stopwatch: "/stopwatch",
  study: "/study",
};

const MODE_BY_PATH = new Map<string, AppMode>(
  Object.entries(MODE_ROUTE_PATHS).map(([mode, path]) => [path, mode as AppMode])
);

export function getModeFromPathname(pathname: string): AppMode | null {
  const normalizedPath = pathname.replace(/\/+$/, "") || "/";
  return MODE_BY_PATH.get(normalizedPath) ?? null;
}
