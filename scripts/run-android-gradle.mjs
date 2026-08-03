import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { ensureAndroidGradleWrapper, wrapperJarPath } from "./ensure-android-gradle-wrapper.mjs";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const androidDirectory = path.join(repositoryRoot, "android");
const javaExecutable = process.env.JAVA_HOME
  ? path.join(process.env.JAVA_HOME, "bin", process.platform === "win32" ? "java.exe" : "java")
  : "java";

await ensureAndroidGradleWrapper();

const gradleArguments = process.argv.slice(2);
const child = spawn(
  javaExecutable,
  ["-Dorg.gradle.appname=gradlew", "-jar", wrapperJarPath, ...gradleArguments],
  {
    cwd: androidDirectory,
    env: process.env,
    stdio: "inherit",
  }
);

child.on("error", (error) => {
  console.error(`[android] 无法启动 Java：${error.message}`);
  process.exitCode = 1;
});

child.on("exit", (code, signal) => {
  if (signal) {
    console.error(`[android] Gradle 被信号 ${signal} 终止。`);
    process.exitCode = 1;
    return;
  }
  process.exitCode = code ?? 1;
});
