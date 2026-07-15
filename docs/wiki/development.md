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
npm run typecheck
npm run lint
npm run lint:fix
npm run lint:styles
npm run format
npm run test
npm run test:coverage
npm run test:ui
npm run check:ui
npm run test:e2e
```

常用选择：

- Web 开发使用 `npm run dev`。
- Electron 开发使用 `npm run dev:electron`。
- 只改文档时通常不需要运行构建或测试，可用链接检查和 `git diff --check` 做轻量验证。
- 改 TypeScript/React 代码时至少运行相关 Vitest 或 ESLint。
- 改公共组件、设计令牌或 `/design-system` 时运行 `npm run check:ui`。
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
- 样式优先使用 CSS Modules；公共视觉令牌统一放在 `src/ui/tokens.css`。
- 使用语义化 HTML，并补充必要的 `aria-*` 属性。
- 命名遵循：组件和接口 PascalCase，函数和变量 camelCase，常量 UPPER_SNAKE_CASE。
- 避免直接使用 `console.log`，使用 `src/utils/logger.ts`。
- 功能图标使用 `src/ui` 导出的 `AppIcon` 或组件语义 `icon` 属性，禁止业务代码直接导入
  `lucide-react`；完整规则见 [图标系统](icon-system.md)。
- Prettier 规则为 2 空格、双引号、分号、尾随逗号、100 字符行宽。

## 组件库治理

- 可复用视觉控件、公开 variant 和交互状态由 `src/ui/` 持有，并统一从
  `src/ui/index.ts` 导出。所有非测试业务 TSX 不得深层导入 `src/ui/**`；DesignSystem Catalog
  仅可精确导入 `src/ui/icons/appIconRegistry` 以枚举语义图标。
- `src/ui/` 之外的业务组件只负责领域数据、页面布局和公共控件组合，不使用原生 `button`、
  `input`、`select`、`textarea` 重复实现控件。确有领域语义的原生按钮必须在单行
  `eslint-disable` 中说明原因，并由 UI governance 契约测试锁定文件、元素和说明。
- 业务 CSS 只控制外部布局、定位和领域呈现，不使用任何 `[data-ui-*]`、`[aria-*]` 或
  `[role]` 属性选择器覆盖公共组件内部样式。`src/styles/tour.css` 是第三方 `driver.js` 的
  精确适配例外。
- 通用颜色、间距、圆角、阴影、排版和动效使用 `src/ui/tokens.css`。Stylelint 对新增业务
  CSS 禁止命名色、hex、rgb/rgba 和 hsl/hsla；领域色由 `stylelint.config.cjs` 的明确文件
  清单管理。
- 每个运行时公共导出都要登记在 `/design-system` 的组件 Catalog。新增组件或公开状态时，
  同步添加确定性样例、Catalog 契约测试和必要的三视口视觉基线。

允许保留的领域原生按钮仅有两项：

- `src/components/MotivationalQuote/MotivationalQuotePresentation.tsx`：整块语录是用于刷新语录
  的领域内容表面，不复刻公共按钮视觉。
- `src/components/NoiseMonitor/NoisePresentation.tsx`：呼吸灯是噪音状态与操作合一的领域数据
  表面，不是通用图标按钮。

允许保留硬编码领域色的文件及原因：

- `src/App.module.css`：应用根场景的打印和系统高对比度适配。
- `src/components/ControlBar/ControlBar.module.css`：主画布控制栏保留无边框、透明的极简 HUD 视觉。
- `src/components/ModeSelector/ModeSelector.module.css`：主画布模式切换器保留独立 HUD 视觉。
- `src/components/NoiseMonitor/NoiseMonitor.module.css`：噪音级别及呼吸灯的数据状态色。
- `src/components/NoiseSettings/NoiseSettings.module.css`：实时噪音图表和阈值数据色。
- `src/components/SettingsPanel/sections/AppearanceSettingsPanel.module.css`：用户外观预览画布。
- `src/components/Study/Study.module.css`：自习场景背景与系统高对比度适配。
- `src/components/StudyStatus/StudyStatus.module.css`：顶部进度数据填充和高对比度状态。
- `src/components/Weather/Weather.module.css`：天气与预警领域状态色。
- `src/pages/ClockPage/ClockPage.module.css`：主时钟场景背景与系统高对比度适配。
- `src/styles/tour.css`：第三方 `driver.js` 浮层适配，同时是属性选择器规则的唯一例外。

相关自动化入口：

- `npm run typecheck`：TypeScript 无输出检查。
- `npm run lint:styles`：CSS Modules、公共组件样式边界和新增硬编码颜色检查。
- `npm run test:ui`：公共组件行为与 DesignSystem Catalog 契约测试。
- `npm run check:ui`：依次执行类型、ESLint、Stylelint 和 UI Vitest 门禁。

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
7. 修改或新增图标语义时，同步检查 `/design-system` 图标矩阵与图标契约测试。
8. 修改公共视觉 API 时同步更新组件 Catalog；CI 会在常规单测和构建前运行类型、样式与
   Catalog 门禁，并在 Windows Edge 中检查 DesignSystem 视觉基线。

## 文档维护

- 面向用户的功能说明放入 `docs/usage.*.md` 或 FAQ。
- 面向开发者的架构、模块和流程说明放入 `docs/wiki/`。
- 噪音算法细节继续维护在 `docs/noise-technical-spec.md` 和 `docs/noise-scoring.md`。
- 测试覆盖地图继续维护在 `docs/testing-map.md`，Wiki 测试页只做入口和实践说明。
