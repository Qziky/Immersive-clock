# 测试策略

项目使用 Vitest（jsdom）覆盖纯逻辑、服务和组件，Playwright 覆盖关键浏览器流程和视觉基线。
设计系统、构建和文档也有独立的验证边界。

## 测试入口

```bash
npm run typecheck
npm run lint
npm run lint:styles
npm run test
npm run test:coverage
npm run test:ui
npm run check:ui
npm run test:e2e
```

`vitest.config.ts` 使用 jsdom、`src/setupTests.ts`，只收集 `src/**/*.{test,spec}.{ts,tsx}`；
Playwright 使用 `tests/e2e`，默认连接 `127.0.0.1:3005` 和系统 Edge。设置
`PW_BUNDLED_BROWSERS=1` 才使用 Chromium/Firefox/WebKit 并安装 Playwright 浏览器。

## Vitest 分层

### 纯函数与存储

测试设置规范化/深合并/版本迁移、课表校验、时间格式化、天气缓存、错误中心、公告偏好、外观
模型、数据域、噪音分数和切片聚合。它们应使用稳定的时间、随机数、fetch、localStorage、
IndexedDB mock，不依赖真实网络或设备。

### 服务运行时

天气运行时测试请求去重、TTL、前后台刷新、离线/退避、定位降级、跨标签页锁和同步；噪音测试
覆盖 Leader 选举、AudioWorklet 特征、会话恢复、列式存储、信号健康、实时流、历史重算和归档；
语录测试覆盖注册表、provider adapter、冷却、失败转移和缓存。

### React 组件

组件测试关注可见行为和可访问性：模式切换、HUD、倒计时、秒表、自习状态、天气、噪音、语录、
设置导航、外观预览、弹层和 Toast。使用 Testing Library 查询角色/名称，不依赖实现类名。

### UI governance

`npm run test:ui` 运行 `src/ui/**/__tests__` 和 DesignSystem Catalog 契约。公共组件必须覆盖
受控/非受控状态、键盘焦点、disabled/loading/error、Portal 和窄屏长文本；修改公共视觉 API
时同步更新视觉基线。

## Playwright E2E

E2E 文件命名 `*.e2e.spec.ts`，公共助手放 `tests/e2e/e2eUtils.ts`。稳定流程包括：

- 首页加载与首次引导；
- 模式切换；
- 倒计时、秒表开始/暂停/重置；
- 自习模式 smoke；
- 设置持久化与数据管理；
- 天气跨标签页协调、噪音多标签页；
- 音频诊断和开发者页；
- Design System 视觉和关键模态/外观回归。

E2E 只覆盖用户关键路径，不把所有算法分支搬到浏览器。网络、麦克风和定位流程应使用可控
fixture 或测试开关，不能依赖实时第三方服务。

## Browser 人工验证边界

临时检查视觉、响应式、交互、焦点和控制台时，优先使用 Codex 应用内 Browser；它不等同于
Playwright 自动化。需要提交基线或可重复运行时才写 Playwright Test；Browser 可用时不要用
独立 `playwright-cli` 替代。

标准 UI 视口：

| 视口     | 关注点                                 |
| -------- | -------------------------------------- |
| 1440×900 | 桌面密度、完整设置、菜单、弹层定位     |
| 390×844  | 触控按钮、抽屉、表单换行和 Portal      |
| 320×568  | 长文案、最窄控件、底部操作栏和横向溢出 |

## 选择测试范围

| 改动                      | 最小建议                                           |
| ------------------------- | -------------------------------------------------- |
| 仅文档                    | Markdown 链接/图片检查、`git diff --check`         |
| 纯工具/算法               | 对应 Vitest 文件                                   |
| AppSettings/迁移          | 设置与 storage initializer 测试，必要时完整 Vitest |
| 天气/噪音/时间同步服务    | 对应 service/util 测试，检查跨标签页和权限边界     |
| HUD/模式/计时/设置 UI     | 相关组件测试 + 对应 E2E                            |
| `src/ui`、tokens、Catalog | `check:ui`、目标视觉基线、必要时 build             |
| Vite/PWA/Electron/部署    | 对应 build，必要时 Browser/Electron 手测           |

## 稳定性与断言原则

- 断言业务规则、输出和可访问性，不断言内部实现顺序。
- 为时间、随机、网络、权限、storage 和 Worker 提供可控注入或 mock。
- 跨标签页测试必须清理 lock/lease、BroadcastChannel 和 storage key。
- 噪音测试锁定模型版本、digest、60 秒窗口、5 秒步长和覆盖边界。
- E2E 完成后关闭页面和服务；视觉测试使用确定数据、关闭随机语录和实时动画。
