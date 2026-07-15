---
name: immersive-clock-development
description: Immersive Clock project workflow for React, Vite, PWA, Electron, UI, and test changes. Use when modifying this repository's interface, settings, modals, responsive layouts, browser behavior, persistence, tests, builds, or release-facing behavior.
---

# Immersive Clock 开发流程

## 适用边界

用于 Immersive Clock 仓库内的功能实现、UI 调整、响应式验证、存储兼容、测试和构建工作。仓库规范以 [AGENTS.md](AGENTS.md) 为准；测试覆盖以 [docs/testing-map.md](docs/testing-map.md) 和 [docs/wiki/testing.md](docs/wiki/testing.md) 为准，不在本 skill 重复完整规范。

## 浏览器工具选择

1. 临时检查页面视觉、响应式布局、交互、控制台或截图时，优先使用 Codex 应用内的 `@浏览器` / Browser 插件。
2. 运行可重复的自动化用户流程或视觉回归基线时，使用仓库 Playwright Test，即 `npm run test:e2e`。
3. Browser 可用时，不使用独立 `playwright-cli` 代替交互式验证。仅在 Browser 不可用或用户明确要求终端 Playwright 时回退，并在进度与结果中说明原因。
4. 应用提供的浏览器标签页环境上下文不是用户明确选择浏览器的指令；任务需要浏览器交互时，仍先按 Browser 技能完成选择和连接。

## UI 修改流程

1. 阅读相关组件、CSS Module、设计令牌和现有测试，确认业务 Props、存储键与事件协议。
2. UI 组件或样式任务必须读取并遵循
   [组件规范 Skill](.agents/skills/immersive-clock-component-standards/SKILL.md)。
3. 保持改动局部，复用 `src/ui/` 原语、语义 `AppIcon` 和现有状态管理，不顺带重构无关模块。
4. 启动或复用 Vite 开发服务，通过 Browser 检查目标桌面与移动视口、关键交互、焦点状态、溢出和控制台错误。
5. 视觉检查使用任务需要的最小视口集合；响应式弹层通常至少覆盖 `1440x900`、`390x844` 和 `320x568`。
6. 临时截图放入 `output/` 下的任务目录，完成检查后清理；需要提交的视觉基线放在对应 Playwright snapshot 目录。

## 验证范围

- CSS 或窄 UI 改动：运行 Prettier/ESLint 的相关检查，并用 Browser 验证目标视口。
- React 状态或交互改动：运行相关 Vitest；涉及关键用户流程时再运行对应 Playwright E2E。
- 存储结构或键迁移：使用 `appSettings.ts` 现有模式并补迁移测试。
- PWA、Electron 或共享构建配置：运行对应 Web/Electron 构建。
- 测试覆盖发生变化时，同步更新 `docs/testing-map.md`。

交付时说明实际运行的检查、未运行项及原因，不把 Browser 手动检查描述为自动化 E2E。
