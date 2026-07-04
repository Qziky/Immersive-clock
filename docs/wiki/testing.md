# 测试指南

项目使用 Vitest 覆盖单元和组件测试，使用 Playwright 覆盖关键浏览器流程。完整测试地图
见 [测试地图](../testing-map.md)。

## 测试入口

```bash
npm run test
npm run test:coverage
npm run test:e2e
```

- `npm run test`：运行 Vitest。
- `npm run test:coverage`：运行 Vitest 并输出覆盖率。
- `npm run test:e2e`：运行 Playwright E2E，执行前会调用 `scripts/ensure-playwright.mjs`。

Playwright 默认使用系统 Edge 项目。若需要 Playwright 自带浏览器，可设置
`PW_BUNDLED_BROWSERS=1` 后再运行 E2E。

## Vitest 覆盖重点

单元测试主要覆盖工具、服务、状态和算法：

- 设置与持久化：`appSettings.ts`、`storageInitializer.ts`。
- 天气：`weatherService.ts`、`weatherStorage.ts`、`weatherAlert.ts`。
- 时间同步：`timeSync.ts` 和 Electron/NTP 相关客户端。
- 噪音：切片服务、评分引擎、历史构建、帧处理和流服务。
- 公告、新手引导、日志、时间格式化等通用工具。
- 组件工具，例如 Dropdown 工具函数。

新增测试优先放在被测模块附近的 `__tests__/` 目录，或使用 `*.test.ts(x)` 命名。

## Playwright 覆盖重点

E2E 测试位于 `tests/e2e/`，覆盖真实用户路径：

- 首页加载 smoke。
- 模式切换。
- 倒计时设置、启动、暂停和重置。
- 秒表启动、暂停和重置。
- 自习模式入口。
- 设置持久化。

新增 E2E 文件使用 `*.e2e.spec.ts` 命名。公共交互辅助函数放在 `tests/e2e/e2eUtils.ts`。

## 选择测试范围

- 只改文档：检查 Markdown 链接和 `git diff --check`。
- 只改纯工具函数：运行对应 Vitest 文件。
- 改共享设置、存储迁移或 reducer：运行对应单测，并考虑运行完整 Vitest。
- 改天气、噪音、时间同步等服务：运行对应 service/util 单测。
- 改 HUD、模式切换、倒计时、秒表或设置面板：运行相关单测和对应 E2E。
- 改构建、PWA、Electron 或部署配置：运行对应构建命令，必要时再做浏览器或 Electron 手测。

## 新增测试建议

- 优先测试业务规则和边界条件，而不是实现细节。
- 对 localStorage、sessionStorage、时间和浏览器 API 使用稳定 mock。
- 噪音和天气逻辑尽量把算法或分支放在可单测的纯函数中。
- E2E 只覆盖关键路径，避免把所有细节都压到浏览器测试里。
- 修改测试覆盖范围后，同步更新 [测试地图](../testing-map.md)。

## 验收记录

提交或 PR 中建议写明：

- 运行了哪些命令。
- 是否有未运行的测试以及原因。
- UI 或交互变更是否包含截图或录屏。
- 涉及 PWA、Electron、权限、缓存时的手动验证环境。
