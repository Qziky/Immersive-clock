import { Capacitor } from "@capacitor/core";

export type RuntimePlatform = "android" | "electron" | "web";

export function getRuntimePlatform(userAgent?: string): RuntimePlatform {
  try {
    if (Capacitor.getPlatform() === "android") return "android";
  } catch {
    // Capacitor 未初始化时继续使用 UA 判断。
  }

  const resolvedUserAgent =
    userAgent ?? (typeof navigator !== "undefined" ? navigator.userAgent : "");
  return /electron/i.test(resolvedUserAgent) ? "electron" : "web";
}

export function shouldRegisterServiceWorker(
  buildEnabled: boolean,
  platform = getRuntimePlatform()
): boolean {
  return buildEnabled && platform === "web";
}
