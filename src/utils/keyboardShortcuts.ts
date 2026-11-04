export interface KeyboardShortcuts {
  toggleTimer: string | null;
  resetCountdown: string | null;
  toggleFullscreen: string | null;
}

export type ShortcutAction = keyof KeyboardShortcuts;

export const DEFAULT_KEYBOARD_SHORTCUTS: KeyboardShortcuts = {
  toggleTimer: "Space",
  resetCountdown: "KeyR",
  toggleFullscreen: "KeyF",
};

export const SHORTCUT_LABELS: Record<ShortcutAction, string> = {
  toggleTimer: "开始 / 暂停 / 继续",
  resetCountdown: "重置倒计时",
  toggleFullscreen: "切换全屏",
};

export const SHORTCUT_ACTIONS = Object.keys(SHORTCUT_LABELS) as ShortcutAction[];

// 保留 Enter、Esc 和浏览器组合键的原有用途。
export function isShortcutCode(code: unknown): code is string {
  return typeof code === "string" && /^(Key[A-Z]|Digit[0-9]|Space)$/.test(code);
}

export function formatShortcut(code: string | null): string {
  if (code === null) return "未设置";
  if (code === "Space") return "空格";
  return code.replace(/^(Key|Digit)/, "");
}

export function normalizeKeyboardShortcuts(value: unknown): KeyboardShortcuts {
  const source = value && typeof value === "object" ? value : {};
  const result = { ...DEFAULT_KEYBOARD_SHORTCUTS };
  const used = new Set<string>();
  for (const action of SHORTCUT_ACTIONS) {
    const candidate = (source as Record<string, unknown>)[action];
    const code = candidate === null || isShortcutCode(candidate) ? candidate : result[action];
    result[action] = code !== null && used.has(code) ? null : code;
    if (result[action] !== null) used.add(result[action]);
  }
  return result;
}
