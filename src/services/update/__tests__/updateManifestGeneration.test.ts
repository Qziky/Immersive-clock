import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

describe("generate-update-manifest", () => {
  it("uses electron-builder's Linux artifact names by default", () => {
    const outputDir = mkdtempSync(path.join(tmpdir(), "immersive-clock-update-manifest-"));
    try {
      execFileSync("node", [path.join(process.cwd(), "scripts/generate-update-manifest.mjs")], {
        cwd: process.cwd(),
        env: {
          ...process.env,
          VITE_APP_VERSION: "4.0.3",
          UPDATE_RELEASE_TAG: "v4.0.3",
          UPDATE_MANIFEST_OUTPUT_DIR: outputDir,
        },
        stdio: "pipe",
      });

      const manifest = JSON.parse(
        readFileSync(path.join(outputDir, "update-manifest.json"), "utf8")
      );
      expect(manifest.platforms.linux.appImageUrl).toContain(
        "immersive-clock-4.0.3-x86_64.AppImage"
      );
      expect(manifest.platforms.linux.debUrl).toContain("immersive-clock-4.0.3-amd64.deb");
      expect(manifest.platforms.linux.rpmUrl).toContain("immersive-clock-4.0.3-x86_64.rpm");
    } finally {
      rmSync(outputDir, { recursive: true, force: true });
    }
  });
});
