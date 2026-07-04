# Immersive Clock 开发者 Wiki

这里是 Immersive Clock 的开发者入口，面向维护者、贡献者和二次开发者。它补充
README、使用说明和专题技术文档，帮助你快速理解项目结构、运行方式、核心模块和发布
链路。

## 快速导航

- [架构总览](architecture.md)：React、Vite、PWA、Electron 的整体关系和运行入口。
- [功能模块](feature-modules.md)：时钟、倒计时、自习、天气、噪音、公告等模块的职责边界。
- [开发指南](development.md)：本地环境、常用脚本、目录约定和编码规范。
- [测试指南](testing.md)：Vitest、Playwright 覆盖范围和新增测试建议。
- [发布与部署](release-deployment.md)：Web/PWA、Electron、Docker、Vercel、EdgeOne 的构建入口。
- [排障手册](troubleshooting.md)：开发期常见问题和排查路径。

## 项目定位

Immersive Clock 是一个 React 19 + TypeScript + Vite 构建的沉浸式时间管理应用，支持
Web/PWA 和 Electron 桌面形态。核心场景包括普通时钟、倒计时、秒表、自习看板、天气
提示、噪音监测、课表和励志语录。

仓库的主要代码位于 `src/`，Electron 主进程代码位于 `electron/`，静态资源位于
`public/`，测试位于 `src/**/__tests__/` 和 `tests/e2e/`。

## 推荐阅读路径

新贡献者建议按以下顺序阅读：

1. 阅读本页，了解文档地图。
2. 阅读 [开发指南](development.md)，完成本地环境和命令准备。
3. 阅读 [架构总览](architecture.md)，理解入口、状态流和构建模式。
4. 根据任务范围阅读 [功能模块](feature-modules.md) 中对应模块。
5. 修改前查看 [测试指南](testing.md)，确认应该补充或运行哪些测试。
6. 涉及发布、PWA、Electron 或部署时阅读 [发布与部署](release-deployment.md)。

## 现有文档

这些文档仍然是对应主题的权威入口：

- [中文使用说明](../usage.zh-CN.md)
- [中文 FAQ](../faq.zh-CN.md)
- [噪音技术规格](../noise-technical-spec.md)
- [噪音评分系统](../noise-scoring.md)
- [测试地图](../testing-map.md)
- [Electron 说明](../../ELECTRON.md)
- [贡献指南](../../CONTRIBUTING.md)

## 维护原则

- Wiki 记录代码库当前事实，不替代代码中的类型、测试和配置。
- 功能行为变化时，同步更新对应模块页和测试说明。
- 发布、部署或脚本变化时，同步更新 [发布与部署](release-deployment.md)。
- 新增开发者文档优先放入 `docs/wiki/`；面向用户的操作教程仍放在 `docs/usage.*.md`
  或 FAQ。
