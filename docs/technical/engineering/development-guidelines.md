# 开发指南

本页是贡献者的工程速查。根目录 [CONTRIBUTING.md](../../../CONTRIBUTING.md) 负责协作流程；
本页说明如何在当前仓库中定位代码、选择验证和维护技术文档。

## 环境与脚本

- Node.js `>=20.19.0`；包管理器使用 npm，锁文件为 `package-lock.json`。
- Web 开发：`npm run dev`。
- Electron 开发：`npm run dev:electron`。
- Web 构建：`npm run build`。
- Electron 构建/打包：`npm run build:electron`、`npm run pack:electron`、`npm run dist:electron`。
- 类型检查：`npm run typecheck`。
- ESLint/Stylelint：`npm run lint`、`npm run lint:styles`。
- 单元测试：`npm run test`、`npm run test:coverage`、`npm run test:ui`。
- UI 门禁：`npm run check:ui`。
- E2E：`npm run test:e2e`。

只改 Markdown 时不必运行生产构建；至少检查相对链接、图片引用和 `git diff --check`。

## 代码落点

| 需求                   | 首选位置                               |
| ---------------------- | -------------------------------------- |
| 页面路由或整页编排     | `src/pages/`、`src/App.tsx`            |
| 领域 UI 和组合         | `src/components/`                      |
| 跨页面公共控件         | `src/ui/`，并从 `src/ui/index.ts` 导出 |
| Context 状态/Reducer   | `src/contexts/`                        |
| 可复用 React 行为      | `src/hooks/`                           |
| 网络、音频、异步运行时 | `src/services/`                        |
| 持久化、迁移、纯算法   | `src/utils/`                           |
| 跨模块契约             | `src/types/`                           |
| 共享常量               | `src/constants/`                       |
| Electron 主进程能力    | `electron/`                            |
| 静态资产和运行时公告   | `public/`                              |

服务不应反向依赖页面；组件不应直接操作 IndexedDB、CacheStorage 或第三方 HTTP。

## TypeScript 与 React

- `tsconfig.json` 开启 strict、ESM bundler resolution 和 `noEmit`；新增代码避免 `any`。
- 组件使用函数组件和 Hooks；高频状态尽量局部化，不把每帧 tick 放进全局 reducer。
- 共享类型放在 `src/types`，不要在多个组件中复制结构。
- 输入来自 localStorage、网络或用户编辑时，先运行 runtime normalization/validation，再进入
  业务逻辑。
- 时间、日期和地理坐标必须明确时区/单位；不要把本地日期字符串隐式交给 UTC `Date` 解析。
- 副作用在 `useEffect` 或 service 生命周期中创建，并返回清理函数。

## 命名、格式与日志

- 组件、接口和类型 PascalCase；函数、变量 camelCase；跨模块常量 UPPER_SNAKE_CASE。
- Prettier：2 空格、双引号、分号、尾随逗号、100 字符行宽。
- import 顺序：React/第三方 → 本地模块 → 样式/资源，保持同文件现有排序。
- 不直接使用 `console.log`；使用 `src/utils/logger.ts`，生产构建会移除 console/debugger。
- 错误消息应能直接呈现给用户或测试断言，保留 cause/诊断信息但不要泄露敏感数据。

## 持久化与副作用规则

1. 需要跨刷新保存的设置扩展 `AppSettings`、默认值、规范化、更新函数和迁移测试。
2. 新数据域加入 `dataDomainRegistry`，实现 inspect/export/validate/replace/clear/migrate，
   并定义备份与清理边界。
3. 清理操作只允许删除已知键、Store 和 CacheStorage；不要使用 `localStorage.clear()`。
4. 网络请求接入 `httpClient`、`apiGovernance` 或领域 guard；天气还必须经过跨标签页锁。
5. 麦克风、定位、全屏和 Electron IPC 都必须处理拒绝、超时、权限变更和恢复。

## UI 组件治理

公共视觉规则集中在 [UI components and icons](ui-components-and-icons.md)。摘要如下：

- 复用 `src/ui` 的 Button/Input/Modal/Dropdown/SettingsShell 等，不在领域层复制原生控件。
- 业务 CSS 只处理外部布局和领域呈现，不用属性选择器或内部类名覆盖公共组件。
- 新公共导出、variant、尺寸或状态必须登记 Design System Catalog，并补行为/视觉测试。
- 顶层 SettingsShell 内的 `FormSection` 使用 `variant="plain"`；`soft` 只用于明确的二级表面。

## 功能实现流程

1. 读入口、类型、服务和附近测试，明确状态/存储/事件契约。
2. 选择最小改动点，优先复用现有 helper、公共组件和数据域。
3. 先写或更新纯逻辑测试，再连 UI 和副作用。
4. 运行最窄验证；共享设置、服务或公共 UI 再扩大到对应门禁。
5. 更新本目录技术文档、[测试覆盖地图](testing-coverage-map.md) 和根入口链接。
6. 在 PR 中写明实际运行命令、未运行项和任何兼容性边界。

## 文档规则

- `docs/technical/`：当前实现、协议、架构和工程实践。
- `docs/product/`：定位、原则、用户场景和边界。
- `docs/user-guide/`：面向普通用户的操作说明，不出现源码术语。
- `docs/marketing/`：宣传文案、素材清单和发布模板。
- `public/docs/announcement.md`、`public/docs/changelog.md`：应用内运行时内容，不与知识库
  文档混写。

文件名和目录使用英文小写 kebab-case；技术正文可以中文。文档相互引用使用相对路径，不提交
本机绝对链接或构建产物路径。
