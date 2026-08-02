# 贡献指南

欢迎为 Immersive Clock 提交代码、文档、问题反馈和产品建议。本页只保留参与项目所需的
最短闭环；架构、组件治理、测试矩阵、发布和排障细节请阅读
[技术知识库](docs/technical/README.md)。

## 贡献方式

- 报告可复现的 Bug，并附上环境、步骤、预期与实际结果。
- 提交新功能或体验改进，先说明使用场景、边界和兼容性影响。
- 改进用户文案、使用说明、产品文档或宣传素材。
- 改善性能、可访问性、PWA、Electron 和跨平台体验。

## 开发前准备

- Node.js：`>=20.19.0`，以 `package.json` 的 `engines` 为准。
- Git。
- npm，以及仓库中的 `package-lock.json`。

```bash
git clone https://github.com/<your-username>/immersive-clock.git
cd immersive-clock
npm install
```

如需本地环境变量，请从 `.env.example` 创建 `.env`。

## 常用命令

```bash
# Web
npm run dev
npm run build
npm run preview

# Electron
npm run dev:electron
npm run build:electron
npm run dist:electron

# 质量检查
npm run typecheck
npm run lint
npm run lint:styles
npm run test
npm run test:e2e
```

根据改动范围选择最窄的验证命令。只改文档时，至少检查 Markdown 链接和
`git diff --check`；涉及组件、设置、持久化、权限、PWA 或 Electron 时，请参考
[测试策略](docs/technical/engineering/testing-strategy.md) 和
[构建发布文档](docs/technical/engineering/build-release-and-deployment.md)。

## 分支、提交与 Pull Request

建议使用以下分支前缀：

- `feat/`：新功能
- `fix/`：Bug 修复
- `docs/`：文档
- `refactor/`：重构
- `test/`：测试

提交信息保持简洁、可读、可追溯，尽量说明原因和影响范围。Pull Request 应包含：

- 改动内容与背景。
- 风险、兼容性和迁移说明。
- 实际运行的检查或测试。
- UI 改动对应的截图或录屏。

避免将无关格式化、依赖升级和功能修改混在同一个 PR 中。

## 代码与工程约定

- 使用 TypeScript strict mode，避免 `any` 和隐式 `any`。
- React 代码使用函数组件，样式使用 CSS Modules 和现有设计令牌。
- 公共 UI 组件、图标、设计系统和无障碍规则遵循
  [UI 组件与图标系统](docs/technical/engineering/ui-components-and-icons.md)。
- 设置和数据持久化优先复用现有 `appSettings`、storage 和 data management 边界。
- 业务代码不要直接使用 `console.log`，使用项目日志工具。

## 文档分类

- `docs/technical/`：架构、实现、工程规范、测试、发布和排障。
- `docs/product/`：产品定位、用户、设计原则和边界。
- `docs/user-guide/`：面向用户的操作百科与 FAQ。
- `docs/marketing/`：对外文案、素材索引和发布模板。

README 和本贡献指南只做入口，不复制完整知识库正文。新增或修改用户可见行为时，
同步更新对应用户指南；修改技术事实时，更新技术文档和测试覆盖地图。

## 安全与反馈

请不要在公开 Issue、群聊或截图中泄露密钥、Token、个人位置、课程安排或未脱敏备份文件。
安全问题请通过作者公开联系方式私下报告。

如需英文入口，请阅读 [English contributing guide](CONTRIBUTING.en-US.md)。
