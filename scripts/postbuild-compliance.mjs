import crypto from "crypto";
import fs from "fs";
import path from "path";

const rootDir = process.cwd();
const distDir = path.join(rootDir, "dist");
const sourceLicensesDir = path.join(rootDir, "LICENSES");
const distLicensesDir = path.join(distDir, "LICENSES");
const noticeFilePattern = /^(license|licence|copying|notice)(?:[._-].*)?$/i;
const maxNoticeSize = 1024 * 1024;

function ensureBuildOutput() {
  if (!fs.existsSync(distDir)) {
    throw new Error("未找到 dist 目录，请先完成 Vite 构建。");
  }
}

function copyComplianceFiles() {
  fs.mkdirSync(distLicensesDir, { recursive: true });
  fs.copyFileSync(path.join(rootDir, "LICENSE"), path.join(distDir, "LICENSE"));
  fs.copyFileSync(
    path.join(rootDir, "THIRD_PARTY_NOTICES.md"),
    path.join(distDir, "THIRD_PARTY_NOTICES.md")
  );
  fs.cpSync(sourceLicensesDir, distLicensesDir, { recursive: true, force: true });
}

function getPackageNameFromPath(packagePath) {
  const suffix = packagePath.slice(packagePath.lastIndexOf("node_modules/") + 13);
  const parts = suffix.split("/");
  return parts[0].startsWith("@") ? parts.slice(0, 2).join("/") : parts[0];
}

function formatLicense(license) {
  if (typeof license === "string" && license.trim()) return license.trim();
  if (license && typeof license === "object") {
    if (typeof license.type === "string") return license.type;
    return JSON.stringify(license);
  }
  return "UNKNOWN";
}

function readInstalledPackage(packagePath, lockMetadata) {
  const packageDir = path.join(rootDir, packagePath);
  const packageJsonPath = path.join(packageDir, "package.json");
  if (!fs.existsSync(packageJsonPath)) return null;

  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
  return {
    dir: packageDir,
    name: packageJson.name || getPackageNameFromPath(packagePath),
    version: packageJson.version || lockMetadata.version || "UNKNOWN",
    license: formatLicense(packageJson.license || lockMetadata.license),
  };
}

function readNoticeFiles(packageInfo) {
  return fs
    .readdirSync(packageInfo.dir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && noticeFilePattern.test(entry.name))
    .sort((left, right) => left.name.localeCompare(right.name))
    .flatMap((entry) => {
      const filePath = path.join(packageInfo.dir, entry.name);
      const fileSize = fs.statSync(filePath).size;
      if (fileSize === 0 || fileSize > maxNoticeSize) return [];

      const text = fs.readFileSync(filePath, "utf8").trim();
      if (!text) return [];

      return [{ fileName: entry.name, text }];
    });
}

function generateNpmNotices() {
  const packageLock = JSON.parse(fs.readFileSync(path.join(rootDir, "package-lock.json"), "utf8"));
  const productionPackages = Object.entries(packageLock.packages || {})
    .filter(
      ([packagePath, metadata]) =>
        packagePath.startsWith("node_modules/") && metadata.dev !== true && metadata.link !== true
    )
    .map(([packagePath, metadata]) => readInstalledPackage(packagePath, metadata))
    .filter(Boolean)
    .sort((left, right) =>
      `${left.name}@${left.version}`.localeCompare(`${right.name}@${right.version}`)
    );

  const noticeGroups = new Map();
  const packagesWithoutNoticeFiles = [];

  for (const packageInfo of productionPackages) {
    const packageId = `${packageInfo.name}@${packageInfo.version}`;
    const noticeFiles = readNoticeFiles(packageInfo);
    if (noticeFiles.length === 0) packagesWithoutNoticeFiles.push(packageId);

    for (const noticeFile of noticeFiles) {
      const hash = crypto.createHash("sha256").update(noticeFile.text).digest("hex");
      const existing = noticeGroups.get(hash) || {
        files: new Set(),
        packages: new Set(),
        text: noticeFile.text,
      };
      existing.files.add(`${packageId}/${noticeFile.fileName}`);
      existing.packages.add(packageId);
      noticeGroups.set(hash, existing);
    }
  }

  const output = [
    "Immersive Clock - Production Dependency Notices",
    "================================================",
    "",
    "This file is generated from installed production dependencies and package-lock.json.",
    "Third-party packages remain subject to their respective licenses.",
    "",
    "Package summary",
    "---------------",
    ...productionPackages.map(
      (packageInfo) => `${packageInfo.name}@${packageInfo.version} | ${packageInfo.license}`
    ),
    "",
  ];

  if (packagesWithoutNoticeFiles.length > 0) {
    output.push(
      "Packages without a top-level LICENSE/NOTICE/COPYING file",
      "---------------------------------------------------------",
      ...packagesWithoutNoticeFiles,
      ""
    );
  }

  output.push("License and notice texts", "------------------------", "");

  const sortedNoticeGroups = [...noticeGroups.values()].sort((left, right) =>
    [...left.packages][0].localeCompare([...right.packages][0])
  );

  for (const noticeGroup of sortedNoticeGroups) {
    output.push(
      `Packages: ${[...noticeGroup.packages].sort().join(", ")}`,
      `Files: ${[...noticeGroup.files].sort().join(", ")}`,
      "",
      noticeGroup.text,
      "",
      "--------------------------------------------------------------------------------",
      ""
    );
  }

  const outputPath = path.join(distLicensesDir, "npm-production-dependencies.txt");
  fs.writeFileSync(outputPath, `${output.join("\n").trimEnd()}\n`, "utf8");
  console.log(
    `[compliance] 已复制项目许可证并生成 ${productionPackages.length} 个生产依赖的许可证清单。`
  );
}

ensureBuildOutput();
copyComplianceFiles();
generateNpmNotices();
