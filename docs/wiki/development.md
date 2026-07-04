# 开发指南

本页记录本地开发所需的环境、脚本和代码约定。开始修改前建议先确认任务涉及的模块，
再运行最窄范围的验证命令。

## 环境要求

- Node.js `>=20.19.0`。
- 项目脚本以 `npm` 为主要入口。
- 依赖锁文件为 `package-lock.json`，不要混入其他包管理器锁文件。

## 常用命令

```bash
npm run dev
npm run dev:electron
npm run build
npm run build:electron
npm run dist:electron
npm run preview
npm run lint
npm run lint:fix
npm run format
npm run test
npm run test:coverage
npm run test:e2e
```

常用选择：

- Web 开发使用 `npm run dev`。
- Electron 开发使用 `npm run dev:electron`。
- 只改文档时通常不需要运行构建或测试，可用链接检查和 `git diff --check` 做轻量验证。
- 改 TypeScript/React 代码时至少运行相关 Vitest 或 ESLint。
- 改关键用户流程时补充或运行 Playwright E2E。

## 目录约定

- `src/components/`：组件和组件私有样式，样式使用 CSS Modules。
- `src/pages/`：页面容器。
- `src/contexts/`：全局状态。
- `src/hooks/`：跨组件复用的 React hook。
- `src/services/`：网络、定位、天气、噪音流等业务服务。
- `src/utils/`：设置、本地存储、算法和通用工具。
- `src/types/`：共享类型。
- `src/constants/`：跨模块常量。
- `electron/`：Electron 主进程、预加载脚本和 IPC。
- `public/`：静态资源、PWA manifest、公告文档和图标。
- `docs/`：用户文档、专题技术文档和开发者 Wiki。
- `tests/e2e/`：Playwright 端到端测试。

## 编码规范

- 使用 TypeScript strict mode，避免 `any`。
- React 组件使用函数组件。
- 样式优先使用 CSS Modules；全局变量放在 `src/styles/`。
- 使用语义化 HTML，并补充必要的 `aria-*` 属性。
- 命名遵循：组件和接口 PascalCase，函数和变量 camelCase，常量 UPPER_SNAKE_CASE。
- 避免直接使用 `console.log`，使用 `src/utils/logger.ts`。
- Prettier 规则为 2 空格、双引号、分号、尾随逗号、100 字符行宽。

## 导入顺序

推荐导入顺序：

1. React 和第三方库。
2. 本地模块，尽量按路径或名称保持稳定排序。
3. 样式和静态资源。

新增代码时优先跟随所在文件的现有风格，不为单个变更引入大规模排序或格式化噪音。

## 开发流程

1. 明确任务影响范围，先读对应组件、服务、工具和测试。
2. 找到最小变更点，优先复用已有状态、设置和 helper。
3. 涉及持久化时优先通过 `appSettings.ts` 或已有 storage 工具，不随意新增 localStorage key。
4. 涉及天气、噪音、时间同步等边界能力时，把副作用留在 service/hook 中，保持 UI 组件可读。
5. 添加或调整测试，优先覆盖改变的业务规则或用户流程。
6. 运行最窄范围验证，并在 PR 中说明测试结果。

## 文档维护

- 面向用户的功能说明放入 `docs/usage.*.md` 或 FAQ。
- 面向开发者的架构、模块和流程说明放入 `docs/wiki/`。
- 噪音算法细节继续维护在 `docs/noise-technical-spec.md` 和 `docs/noise-scoring.md`。
- 测试覆盖地图继续维护在 `docs/testing-map.md`，Wiki 测试页只做入口和实践说明。
