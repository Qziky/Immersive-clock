import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";

import ts from "typescript";
import { describe, expect, it } from "vitest";

const PROJECT_ROOT = resolve(process.cwd());
const SOURCE_ROOT = join(PROJECT_ROOT, "src");
const SERVICE_ROOT = join(SOURCE_ROOT, "services");

const MODULE_PATHS = {
  locationService: join(SERVICE_ROOT, "locationService"),
  weatherRefresh: join(SERVICE_ROOT, "weatherRefresh"),
  weatherService: join(SERVICE_ROOT, "weatherService"),
  xiaomiWeatherClient: join(SERVICE_ROOT, "xiaomiWeatherClient"),
} as const;

const ALLOWED_IMPORTERS = {
  locationService: new Set(["src/services/weatherService.ts"]),
  weatherRefresh: new Set(["src/services/weatherCoordinator.ts"]),
  xiaomiWeatherClient: new Set([
    "src/services/locationService.ts",
    "src/services/weatherService.ts",
  ]),
} as const;

const WEATHER_NETWORK_EXPORT_IMPORTERS: Record<string, ReadonlySet<string>> = {
  buildWeatherFlow: new Set(["src/services/weatherRefresh.ts"]),
  fetchMinutelyPrecip: new Set(["src/services/weatherCoordinator.ts"]),
};

const LEGACY_NETWORK_EXPORTS = [
  "fetchAirQualityCurrent",
  "fetchAstronomySun",
  "fetchWeatherAlertsByCoords",
  "fetchWeatherDaily3d",
  "fetchWeatherHourly72h",
  "fetchWeatherNow",
  "resolveXiaomiLocation",
] as const;

function toProjectPath(filePath: string): string {
  return relative(PROJECT_ROOT, filePath).replace(/\\/g, "/");
}

function sourceFiles(directory = SOURCE_ROOT): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolutePath = join(directory, entry.name);
    if (entry.isDirectory()) return entry.name === "__tests__" ? [] : sourceFiles(absolutePath);
    if (!entry.isFile() || !/\.(?:ts|tsx)$/.test(entry.name)) return [];
    if (/\.(?:test|spec)\.(?:ts|tsx)$/.test(entry.name)) return [];
    return [absolutePath];
  });
}

function resolveLocalModule(importer: string, specifier: string): string | null {
  if (!specifier.startsWith(".")) return null;
  return resolve(dirname(importer), specifier).replace(/\.(?:js|jsx|ts|tsx)$/, "");
}

function collectBoundaryViolations(): string[] {
  const violations: string[] = [];

  for (const file of sourceFiles()) {
    const projectPath = toProjectPath(file);
    const source = readFileSync(file, "utf8");
    const sourceFile = ts.createSourceFile(
      file,
      source,
      ts.ScriptTarget.Latest,
      true,
      file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS
    );

    const inspectModule = (
      specifier: string,
      node: ts.ImportDeclaration | ts.ExportDeclaration | ts.CallExpression
    ) => {
      const resolvedModule = resolveLocalModule(file, specifier);
      if (!resolvedModule) return;

      for (const moduleName of [
        "locationService",
        "weatherRefresh",
        "xiaomiWeatherClient",
      ] as const) {
        if (
          resolvedModule === MODULE_PATHS[moduleName] &&
          !ALLOWED_IMPORTERS[moduleName].has(projectPath)
        ) {
          violations.push(`${projectPath} 不得直接导入 ${moduleName}`);
        }
      }

      if (resolvedModule !== MODULE_PATHS.weatherService) return;
      if (!ts.isImportDeclaration(node) || !node.importClause) {
        if (
          projectPath !== "src/services/weatherCoordinator.ts" &&
          projectPath !== "src/services/weatherRefresh.ts"
        ) {
          violations.push(`${projectPath} 不得动态导入或转出 weatherService`);
        }
        return;
      }

      const bindings = node.importClause.namedBindings;
      if (!bindings || ts.isNamespaceImport(bindings) || node.importClause.name) {
        if (
          projectPath !== "src/services/weatherCoordinator.ts" &&
          projectPath !== "src/services/weatherRefresh.ts"
        ) {
          violations.push(`${projectPath} 必须按名称导入 weatherService 的纯适配函数`);
        }
        return;
      }

      for (const element of bindings.elements) {
        const importedName = element.propertyName?.text ?? element.name.text;
        const allowed = WEATHER_NETWORK_EXPORT_IMPORTERS[importedName];
        if (allowed && !allowed.has(projectPath)) {
          violations.push(`${projectPath} 不得导入 weatherService.${importedName}`);
        }
      }
    };

    const visit = (node: ts.Node) => {
      if (
        (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
        node.moduleSpecifier &&
        ts.isStringLiteral(node.moduleSpecifier)
      ) {
        inspectModule(node.moduleSpecifier.text, node);
      } else if (
        ts.isCallExpression(node) &&
        node.expression.kind === ts.SyntaxKind.ImportKeyword &&
        node.arguments.length === 1 &&
        ts.isStringLiteral(node.arguments[0])
      ) {
        inspectModule(node.arguments[0].text, node);
      }
      ts.forEachChild(node, visit);
    };

    visit(sourceFile);
  }

  return violations.sort();
}

describe("weatherCoordinator network boundary", () => {
  it("生产代码只能沿协调器允许的内部调用链访问天气网络", () => {
    expect(collectBoundaryViolations()).toEqual([]);
  });

  it("weatherService 不再公开旧的独立天气请求包装函数", async () => {
    const weatherService = await import("../weatherService");

    for (const exportName of LEGACY_NETWORK_EXPORTS) {
      expect(weatherService).not.toHaveProperty(exportName);
    }
  });
});
