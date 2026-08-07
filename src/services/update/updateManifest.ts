import type {
  AndroidPlatformRelease,
  LinuxPlatformRelease,
  UpdateManifest,
  UpdatePlatform,
  WindowsPlatformRelease,
} from "../../types/update";

const DEFAULT_REMOTE_MANIFEST_URL =
  "https://github.com/Qziky/Immersive-clock/releases/latest/download/update-manifest.json";
const MANIFEST_TIMEOUT_MS = 10_000;

type PlatformRelease =
  AndroidPlatformRelease | LinuxPlatformRelease | WindowsPlatformRelease | { version: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isHttpsUrl(value: unknown): value is string {
  if (typeof value !== "string" || !value.trim()) return false;
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

function parseVersion(value: unknown): number[] | null {
  if (typeof value !== "string") return null;
  const match = value
    .trim()
    .replace(/^v/i, "")
    .match(/^(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/);
  if (!match) return null;
  return match.slice(1, 4).map(Number);
}

export function compareVersions(left: string, right: string): number {
  const leftParts = parseVersion(left);
  const rightParts = parseVersion(right);
  if (!leftParts || !rightParts) return left.localeCompare(right);
  for (let index = 0; index < leftParts.length; index += 1) {
    if (leftParts[index] !== rightParts[index]) {
      return leftParts[index] > rightParts[index] ? 1 : -1;
    }
  }
  return 0;
}

function hasPrerelease(value: string): boolean {
  return /^v?\d+\.\d+\.\d+-/.test(value.trim());
}

function parsePlatformRelease(value: unknown): PlatformRelease | undefined {
  if (
    !isRecord(value) ||
    typeof value.version !== "string" ||
    !parseVersion(value.version) ||
    hasPrerelease(value.version)
  ) {
    return undefined;
  }

  const release: Record<string, unknown> = { version: value.version };
  for (const key of ["installerUrl", "portableUrl", "appImageUrl", "debUrl", "rpmUrl", "apkUrl"]) {
    if (value[key] !== undefined && !isHttpsUrl(value[key])) return undefined;
    if (value[key] !== undefined) release[key] = value[key];
  }
  if (value.versionCode !== undefined) {
    if (
      typeof value.versionCode !== "number" ||
      !Number.isInteger(value.versionCode) ||
      value.versionCode <= 0
    ) {
      return undefined;
    }
    release.versionCode = value.versionCode;
  }
  return release as PlatformRelease;
}

export function parseUpdateManifest(value: unknown): UpdateManifest {
  if (!isRecord(value)) throw new TypeError("更新清单必须是对象");
  if (value.schemaVersion !== 1 || value.channel !== "stable") {
    throw new TypeError("更新清单版本或渠道不受支持");
  }
  if (
    typeof value.version !== "string" ||
    !parseVersion(value.version) ||
    hasPrerelease(value.version)
  ) {
    throw new TypeError("更新清单版本无效");
  }
  if (
    typeof value.publishedAt !== "string" ||
    !value.publishedAt.trim() ||
    Number.isNaN(Date.parse(value.publishedAt))
  ) {
    throw new TypeError("更新清单缺少发布时间");
  }
  if (!isHttpsUrl(value.releaseUrl)) throw new TypeError("更新清单发布地址无效");
  if (value.minimumSupportedVersion !== undefined) {
    if (
      typeof value.minimumSupportedVersion !== "string" ||
      !parseVersion(value.minimumSupportedVersion)
    ) {
      throw new TypeError("更新清单最低版本无效");
    }
  }

  if (!isRecord(value.platforms)) throw new TypeError("更新清单缺少平台信息");
  const rawPlatforms = value.platforms;
  const platforms: UpdateManifest["platforms"] = {};
  for (const key of ["web", "windows", "linux", "android"] as const) {
    const release = parsePlatformRelease(rawPlatforms[key]);
    if (rawPlatforms[key] !== undefined && !release) {
      throw new TypeError(`更新清单的 ${key} 平台信息无效`);
    }
    if (!release) continue;
    if (compareVersions(release.version, value.version) !== 0) {
      throw new TypeError(`更新清单的 ${key} 平台版本与主版本不一致`);
    }
    if (key === "web") platforms.web = release as { version: string };
    if (key === "windows") platforms.windows = release as WindowsPlatformRelease;
    if (key === "linux") platforms.linux = release as LinuxPlatformRelease;
    if (key === "android") platforms.android = release as AndroidPlatformRelease;
  }
  return {
    schemaVersion: 1,
    channel: "stable",
    version: value.version,
    publishedAt: value.publishedAt,
    minimumSupportedVersion:
      typeof value.minimumSupportedVersion === "string" ? value.minimumSupportedVersion : undefined,
    releaseUrl: value.releaseUrl,
    platforms,
  };
}

export function getUpdateManifestUrl(platform: UpdatePlatform): string {
  const configured = import.meta.env.VITE_UPDATE_MANIFEST_URL?.trim();
  if (configured) return configured;
  return platform === "web" ? "/update-manifest.json" : DEFAULT_REMOTE_MANIFEST_URL;
}

export async function fetchUpdateManifest(platform: UpdatePlatform): Promise<UpdateManifest> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), MANIFEST_TIMEOUT_MS);
  try {
    const url = getUpdateManifestUrl(platform);
    const response = await fetch(url, {
      cache: "no-store",
      headers: { accept: "application/json" },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`更新清单请求失败（${response.status}）`);
    return parseUpdateManifest(await response.json());
  } finally {
    window.clearTimeout(timeout);
  }
}

export function getPlatformRelease(
  manifest: UpdateManifest,
  platform: UpdatePlatform
): PlatformRelease | undefined {
  if (platform === "web") return manifest.platforms.web;
  if (platform === "android") return manifest.platforms.android;
  if (platform === "electron") {
    const userAgent = typeof navigator !== "undefined" ? navigator.userAgent : "";
    return /win/i.test(userAgent) ? manifest.platforms.windows : manifest.platforms.linux;
  }
  return undefined;
}

export function getCurrentVersion(): string {
  return import.meta.env.VITE_APP_VERSION || "0.0.0";
}
