import { readdirSync, readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";

import { ESLint } from "eslint";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const PROJECT_ROOT = resolve(process.cwd());
const SOURCE_ROOT = join(PROJECT_ROOT, "src");
const eslint = new ESLint({ cwd: PROJECT_ROOT });

interface RawControlException {
  element: string;
  file: string;
  reason: string;
}

interface UiDeepImportException {
  file: string;
  specifier: string;
}

const RAW_CONTROL_EXCEPTIONS: readonly RawControlException[] = [
  {
    element: "button",
    file: "src/components/MotivationalQuote/MotivationalQuotePresentation.tsx",
    reason: "整块语录是领域内容表面，不是公共按钮视觉。",
  },
  {
    element: "button",
    file: "src/components/NoiseMonitor/NoisePresentation.tsx",
    reason: "呼吸灯是噪音领域状态表面，不是公共图标按钮。",
  },
];

const UI_DEEP_IMPORT_EXCEPTIONS: readonly UiDeepImportException[] = [
  {
    file: "src/pages/DesignSystem/componentCatalog.tsx",
    specifier: "../../ui/icons/appIconRegistry",
  },
];

function toProjectPath(filePath: string) {
  return relative(PROJECT_ROOT, filePath).replace(/\\/g, "/");
}

function getBusinessTsxFiles(directory = SOURCE_ROOT): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolutePath = join(directory, entry.name);
    const projectPath = toProjectPath(absolutePath);

    if (entry.isDirectory()) {
      if (projectPath === "src/ui" || entry.name === "__tests__") {
        return [];
      }

      return getBusinessTsxFiles(absolutePath);
    }

    if (!entry.isFile() || !entry.name.endsWith(".tsx")) {
      return [];
    }

    if (/\.(?:test|spec)\.tsx$/.test(entry.name)) {
      return [];
    }

    return [absolutePath];
  });
}

function collectRawControlExceptions(files: readonly string[]) {
  const exceptions: RawControlException[] = [];
  let directiveMentions = 0;
  const directivePattern =
    /\{\/\*\s*eslint-disable-next-line\s+react\/forbid-elements\s+--\s*([^*\r\n]+?)\s*\*\/\}\s*<([a-z][\w-]*)\b/g;

  for (const file of files) {
    const source = readFileSync(file, "utf8");
    directiveMentions += source.split("react/forbid-elements").length - 1;

    for (const match of source.matchAll(directivePattern)) {
      exceptions.push({
        element: match[2],
        file: toProjectPath(file),
        reason: match[1].trim(),
      });
    }
  }

  return {
    directiveMentions,
    exceptions: exceptions.sort((left, right) => left.file.localeCompare(right.file)),
  };
}

function collectUiDeepImports(files: readonly string[]) {
  const imports: UiDeepImportException[] = [];

  for (const file of files) {
    const source = readFileSync(file, "utf8");
    const sourceFile = ts.createSourceFile(
      file,
      source,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX
    );

    const recordSpecifier = (specifier: string) => {
      const normalizedSpecifier = specifier.replace(/\\/g, "/");
      if (/(?:^|\/)ui\/[^/]/.test(normalizedSpecifier)) {
        imports.push({ file: toProjectPath(file), specifier: normalizedSpecifier });
      }
    };

    const visit = (node: ts.Node) => {
      if (
        (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
        node.moduleSpecifier &&
        ts.isStringLiteral(node.moduleSpecifier)
      ) {
        recordSpecifier(node.moduleSpecifier.text);
      } else if (
        ts.isCallExpression(node) &&
        node.expression.kind === ts.SyntaxKind.ImportKeyword &&
        node.arguments.length === 1 &&
        ts.isStringLiteral(node.arguments[0])
      ) {
        recordSpecifier(node.arguments[0].text);
      }

      ts.forEachChild(node, visit);
    };

    visit(sourceFile);
  }

  return imports.sort((left, right) =>
    `${left.file}:${left.specifier}`.localeCompare(`${right.file}:${right.specifier}`)
  );
}

async function restrictedRuleIds(file: string, source: string) {
  const [result] = await eslint.lintText(source, {
    filePath: join(PROJECT_ROOT, file),
    warnIgnored: false,
  });

  return result.messages
    .map((message) => message.ruleId)
    .filter((ruleId): ruleId is string => ruleId !== null);
}

describe("UI governance contract", () => {
  const businessTsxFiles = getBusinessTsxFiles();

  it("只保留两处有说明的原生按钮逐行例外", () => {
    const { directiveMentions, exceptions } = collectRawControlExceptions(businessTsxFiles);

    expect(directiveMentions).toBe(exceptions.length);
    expect(exceptions).toEqual(RAW_CONTROL_EXCEPTIONS);
  });

  it("只允许 Catalog 深层导入语义图标注册表", () => {
    expect(collectUiDeepImports(businessTsxFiles)).toEqual(UI_DEEP_IMPORT_EXCEPTIONS);
  });

  it.each([
    "src/App.tsx",
    "src/components/GovernanceProbe.tsx",
    "src/contexts/GovernanceProbe.tsx",
    "src/hooks/GovernanceProbe.tsx",
    "src/pages/DesignSystem/DesignSystemPage.tsx",
  ])(
    "在所有业务 TSX 范围禁止原生控件：%s",
    async (file) => {
      const ruleIds = await restrictedRuleIds(
        file,
        'export function GovernanceProbe() { return <button type="button" />; }'
      );

      expect(ruleIds).toContain("react/forbid-elements");
    },
    15_000
  );

  it("不限制组件库实现和测试夹具使用原生控件", async () => {
    const source = 'export function GovernanceProbe() { return <button type="button" />; }';
    const uiRuleIds = await restrictedRuleIds("src/ui/components/GovernanceProbe.tsx", source);
    const testRuleIds = await restrictedRuleIds(
      "src/contexts/__tests__/GovernanceProbe.tsx",
      source
    );

    expect(uiRuleIds).not.toContain("react/forbid-elements");
    expect(testRuleIds).not.toContain("react/forbid-elements");
  });

  it("Catalog 仅放行 appIconRegistry 的精确深层导入", async () => {
    const file = "src/pages/DesignSystem/componentCatalog.tsx";
    const allowedRuleIds = await restrictedRuleIds(
      file,
      'import { APP_ICON_NAMES } from "../../ui/icons/appIconRegistry"; export { APP_ICON_NAMES };'
    );
    const blockedRuleIds = await restrictedRuleIds(
      file,
      'import { AppIcon } from "../../ui/icons/AppIcon"; export { AppIcon };'
    );
    const wrongPathRuleIds = await restrictedRuleIds(
      file,
      'import { APP_ICON_NAMES } from "../../../ui/icons/appIconRegistry"; export { APP_ICON_NAMES };'
    );

    expect(allowedRuleIds).not.toContain("no-restricted-imports");
    expect(blockedRuleIds).toContain("no-restricted-imports");
    expect(wrongPathRuleIds).toContain("no-restricted-imports");
  });
});
