import { readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";

import { describe, expect, it } from "vitest";

const ROOT = resolve(process.cwd());

function source(path: string): string {
  return readFileSync(join(ROOT, path), "utf8");
}

function projectPath(path: string): string {
  return relative(ROOT, path).replace(/\\/g, "/");
}

describe("WeatherRuntime network boundary", () => {
  it("只有统一运行时调用天气全量与分钟网络入口", () => {
    const runtime = source("src/services/weatherRuntime.ts");
    expect(runtime).toContain("buildWeatherFlow");
    expect(runtime).toContain("fetchMinutelyPrecip");

    const productionFiles = [
      "src/components/Weather/Weather.tsx",
      "src/components/SettingsPanel/sections/WeatherSettingsPanel.tsx",
      "src/services/minutelyWeatherRuntime.ts",
      "src/services/weatherAlertRuntime.ts",
    ];
    for (const file of productionFiles) {
      const content = source(file);
      expect(content, projectPath(join(ROOT, file))).not.toMatch(
        /buildWeatherFlow|fetchMinutelyPrecip|xiaomiWeatherGetJson/
      );
    }
  });

  it("不存在旧协调器、刷新层和高德接口引用", () => {
    const files = [
      "src/services/locationService.ts",
      "src/services/weatherRuntime.ts",
      "src/services/weatherService.ts",
      "src/components/SettingsPanel/sections/WeatherSettingsPanel.tsx",
    ];
    for (const file of files) {
      const content = source(file);
      expect(content, file).not.toMatch(
        /weatherRefreshDone|weatherLocationRefresh|restapi\.amap|VITE_AMAP/
      );
    }
  });
});
