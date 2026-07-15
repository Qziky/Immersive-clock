const js = require("@eslint/js");
const reactPlugin = require("eslint-plugin-react");
const reactHooks = require("eslint-plugin-react-hooks");
const importPlugin = require("eslint-plugin-import");
const prettierPlugin = require("eslint-plugin-prettier");
const tsPlugin = require("@typescript-eslint/eslint-plugin");
const globals = require("globals");
const { FlatCompat } = require("@eslint/eslintrc");
const compat = new FlatCompat({ baseDirectory: __dirname });

const businessTsxFiles = ["src/**/*.tsx"];
const businessTsxIgnores = [
  "src/ui/**",
  "src/**/__tests__/**",
  "src/**/*.test.tsx",
  "src/**/*.spec.tsx",
];
const restrictedIconImports = [
  {
    name: "lucide-react",
    message: "请使用 src/ui 导出的 AppIcon 与语义 AppIconName",
  },
];
const restrictedUiDeepImport = {
  group: ["**/ui/**"],
  message: "业务代码必须从 src/ui 公共入口导入；通用工具请从 src/utils 导入",
};
const prettierRule = ["warn", { endOfLine: "auto" }];

module.exports = [
  js.configs.recommended,
  ...compat.extends(
    "plugin:@typescript-eslint/recommended",
    "plugin:react/recommended",
    "plugin:react-hooks/recommended",
    "plugin:import/recommended",
    "plugin:import/typescript",
    "plugin:prettier/recommended"
  ),
  {
    rules: {
      "prettier/prettier": prettierRule,
    },
  },
  {
    files: ["**/*.{js,jsx,mjs,cjs,ts,tsx}"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: { ...globals.browser, ...globals.node },
    },
    settings: {
      react: { version: "detect" },
    },
    plugins: {
      react: reactPlugin,
      "react-hooks": reactHooks,
      import: importPlugin,
      prettier: prettierPlugin,
      "@typescript-eslint": tsPlugin,
    },
    rules: {
      "prettier/prettier": prettierRule,
      "no-console": ["warn", { allow: ["warn", "error"] }],
      "no-restricted-imports": [
        "error",
        {
          paths: restrictedIconImports,
        },
      ],
      "react/react-in-jsx-scope": "off",
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", ignoreRestSiblings: true },
      ],
      "@typescript-eslint/ban-ts-comment": "off",
      "no-empty": ["warn", { allowEmptyCatch: true }],
      "import/no-named-as-default": "off",
      "import/no-unresolved": ["error", { ignore: ["virtual:pwa-register"] }],
      "no-case-declarations": "off",
      "import/order": [
        "error",
        {
          "newlines-between": "always",
          alphabetize: { order: "asc", caseInsensitive: true },
        },
      ],
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
      "react-hooks/set-state-in-effect": "off",
      "react-hooks/purity": "off",
      "react-hooks/immutability": "off",
      "react-hooks/preserve-manual-memoization": "off",
      "@typescript-eslint/no-empty-object-type": "off",
      "@typescript-eslint/no-unused-expressions": "off",
    },
  },
  {
    files: ["src/ui/icons/appIconRegistry.ts"],
    rules: {
      "no-restricted-imports": "off",
    },
  },
  {
    files: businessTsxFiles,
    ignores: businessTsxIgnores,
    rules: {
      "react/forbid-elements": [
        "error",
        {
          forbid: [
            {
              element: "button",
              message: "请使用 src/ui 的 Button 或 IconButton；领域交互例外需逐行说明",
            },
            {
              element: "input",
              message: "请使用 src/ui 的 Input",
            },
            {
              element: "select",
              message: "请使用 src/ui 的 Select 或 Dropdown",
            },
            {
              element: "textarea",
              message: "请使用 src/ui 的 Textarea",
            },
          ],
        },
      ],
    },
  },
  {
    files: businessTsxFiles,
    ignores: [...businessTsxIgnores, "src/pages/DesignSystem/componentCatalog.tsx"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: restrictedIconImports,
          patterns: [restrictedUiDeepImport],
        },
      ],
    },
  },
  {
    files: ["src/pages/DesignSystem/componentCatalog.tsx"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: restrictedIconImports,
          patterns: [
            {
              regex: "^(?!\\.\\./\\.\\./ui/icons/appIconRegistry$)(?:.*\\/)?ui\\/",
              message:
                "Catalog 仅可深层导入 src/ui/icons/appIconRegistry；其他导出必须使用 src/ui 公共入口",
            },
          ],
        },
      ],
    },
  },
  {
    ignores: ["dist", "public"],
  },
];
