import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const packageJson = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const version = process.env.VITE_APP_VERSION?.trim() || packageJson.version;
const repository = process.env.UPDATE_REPOSITORY?.trim() || "Qziky/Immersive-clock";
const tag = process.env.UPDATE_RELEASE_TAG?.trim() || `v${version}`;
const releaseUrl =
  process.env.UPDATE_RELEASE_URL?.trim() || `https://github.com/${repository}/releases/tag/${tag}`;
const releaseAssetBase = `https://github.com/${repository}/releases/download/${tag}`;

function envOrDefault(name, fallback) {
  return process.env[name]?.trim() || fallback;
}

function readAndroidVersionCode() {
  const configured = Number(process.env.ANDROID_VERSION_CODE);
  if (Number.isInteger(configured) && configured > 0) return configured;
  try {
    const gradle = fs.readFileSync(path.join(root, "android", "app", "build.gradle"), "utf8");
    const match = gradle.match(/versionCode\s+(\d+)/);
    if (match) return Number(match[1]);
  } catch {
    // Android is optional for Web-only builds.
  }
  return undefined;
}

const androidVersionCode = readAndroidVersionCode();
const manifest = {
  schemaVersion: 1,
  channel: "stable",
  version,
  publishedAt: envOrDefault("RELEASE_PUBLISHED_AT", new Date().toISOString()),
  minimumSupportedVersion: envOrDefault("UPDATE_MINIMUM_SUPPORTED_VERSION", version),
  releaseUrl,
  platforms: {
    web: { version },
    windows: {
      version,
      installerUrl: envOrDefault(
        "UPDATE_WINDOWS_INSTALLER_URL",
        `${releaseAssetBase}/immersive-clock-${version}-x64-Setup.exe`
      ),
      portableUrl: envOrDefault(
        "UPDATE_WINDOWS_PORTABLE_URL",
        `${releaseAssetBase}/immersive-clock-${version}-x64-Portable.exe`
      ),
    },
    linux: {
      version,
      appImageUrl: envOrDefault(
        "UPDATE_LINUX_APPIMAGE_URL",
        `${releaseAssetBase}/immersive-clock-${version}-x86_64.AppImage`
      ),
      debUrl: envOrDefault(
        "UPDATE_LINUX_DEB_URL",
        `${releaseAssetBase}/immersive-clock-${version}-amd64.deb`
      ),
      rpmUrl: envOrDefault(
        "UPDATE_LINUX_RPM_URL",
        `${releaseAssetBase}/immersive-clock-${version}-x86_64.rpm`
      ),
    },
    android: {
      version,
      ...(androidVersionCode ? { versionCode: androidVersionCode } : {}),
      apkUrl: envOrDefault(
        "UPDATE_ANDROID_APK_URL",
        `${releaseAssetBase}/immersive-clock-${version}-android-release.apk`
      ),
    },
  },
};

const outputDir = process.env.UPDATE_MANIFEST_OUTPUT_DIR?.trim() || path.join(root, "dist");
fs.mkdirSync(outputDir, { recursive: true });
const outputPath = path.join(outputDir, "update-manifest.json");
fs.writeFileSync(outputPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
console.log(`[update-manifest] wrote ${path.relative(root, outputPath)}`);
