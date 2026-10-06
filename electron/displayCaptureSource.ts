import type { MenuItemConstructorOptions } from "electron";

export interface DisplayCaptureSourceOption {
  id: string;
  name: string;
}

export function createDisplayCaptureMenuTemplate<T extends DisplayCaptureSourceOption>(
  sources: readonly T[],
  onSelect: (sourceId: string | null) => void
): MenuItemConstructorOptions[] {
  return [
    { label: "选择要共享的屏幕", enabled: false },
    { type: "separator" },
    ...sources.map((source, index) => ({
      label: source.name.trim() ? `屏幕 ${index + 1} — ${source.name.trim()}` : `屏幕 ${index + 1}`,
      click: () => onSelect(source.id),
    })),
    { type: "separator" },
    { label: "取消共享", click: () => onSelect(null) },
  ];
}

export function resolveDisplayCaptureSource<T extends DisplayCaptureSourceOption>(
  sources: readonly T[],
  selectedSourceId: string | null
): T | null {
  if (!selectedSourceId) return null;
  return sources.find((source) => source.id === selectedSourceId) ?? null;
}
