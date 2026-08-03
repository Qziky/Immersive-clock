import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const GRADLE_VERSION = "8.14.3";
const WRAPPER_SHA256 = "7d3a4ac4de1c32b59bc6a4eb8ecb8e612ccd0cf1ae1e99f66902da64df296172";
const WRAPPER_URL = `https://raw.githubusercontent.com/gradle/gradle/v${GRADLE_VERSION}/gradle/wrapper/gradle-wrapper.jar`;

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const wrapperJarPath = path.join(
  repositoryRoot,
  "android",
  "gradle",
  "wrapper",
  "gradle-wrapper.jar"
);

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

export async function ensureAndroidGradleWrapper() {
  if (fs.existsSync(wrapperJarPath)) {
    const existing = fs.readFileSync(wrapperJarPath);
    if (sha256(existing) === WRAPPER_SHA256) return wrapperJarPath;
    fs.rmSync(wrapperJarPath, { force: true });
  }

  const response = await fetch(WRAPPER_URL);
  if (!response.ok) {
    throw new Error(`Gradle Wrapper 下载失败：HTTP ${response.status} ${response.statusText}`);
  }

  const wrapper = Buffer.from(await response.arrayBuffer());
  const actualSha256 = sha256(wrapper);
  if (actualSha256 !== WRAPPER_SHA256) {
    throw new Error(`Gradle Wrapper 校验失败：期望 ${WRAPPER_SHA256}，实际 ${actualSha256}`);
  }

  fs.mkdirSync(path.dirname(wrapperJarPath), { recursive: true });
  const temporaryPath = `${wrapperJarPath}.tmp`;
  fs.writeFileSync(temporaryPath, wrapper);
  fs.renameSync(temporaryPath, wrapperJarPath);
  console.log(`[android] Gradle Wrapper ${GRADLE_VERSION} 已下载并通过 SHA-256 校验。`);
  return wrapperJarPath;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await ensureAndroidGradleWrapper();
}
