# 排障手册

本页收集开发和维护中常见问题。遇到线上问题时，应先确认目标形态是 Web/PWA、Electron、
本地 dev server 还是部署平台。

## 文档或终端中文乱码

如果 README、旧文档或终端输出出现乱码，优先检查文件编码和终端编码设置。新增 Markdown
文档统一使用 UTF-8。编辑已有乱码文件时，先确认原始编码，避免在一次无关变更中扩大
编码差异。

## 依赖安装失败

确认 Node.js 版本满足 `>=20.19.0`。项目锁文件是 `package-lock.json`，不要混用其他
包管理器锁文件。网络受限时，先确认 npm registry 配置，再重试安装。

## Dev server 无法访问

Vite dev server 默认监听 `127.0.0.1:3005`。如果端口被占用，先停止占用进程或临时指定
其他端口。Electron 模式使用 `npm run dev:electron`，不要用普通 Web dev server 期待
主进程能力可用。

## Playwright E2E 浏览器问题

项目默认使用系统 Edge。如果本机没有可用 Edge，或需要 Playwright 自带浏览器，设置
`PW_BUNDLED_BROWSERS=1` 后运行 `npm run test:e2e`，预检脚本会处理浏览器安装。

## PWA 更新或缓存异常

PWA 使用自动更新和运行时缓存。排查时可以：

- 在浏览器 DevTools 的 Application 面板检查 service worker 状态。
- 清理站点数据后重新加载。
- 使用 `npm run build` + `npm run preview` 验证生产模式。
- 检查 `vite.config.ts` 中 Workbox runtimeCaching 和 `public/manifest.json`。

## 天气请求失败

本地开发时 `/api/xiaomi-weather` 由 Vite dev server 代理到小米天气接口。部署时由
`vercel.json` 或 `edgeone.json` 的 rewrite 承接。

排查顺序：

1. 确认浏览器定位权限和网络状态。
2. 检查 dev server 或部署平台 rewrite 是否生效。
3. 查看 `src/services/weatherService.ts` 和 `src/services/xiaomiWeatherClient.ts` 的错误路径。
4. 检查 `src/utils/weatherStorage.ts` 中缓存是否导致展示旧数据。

## 麦克风或噪音监测无数据

噪音监测依赖浏览器麦克风权限和 Web Audio API。常见原因包括：

- 浏览器未授予麦克风权限。
- 页面不在安全上下文中运行。
- 系统输入设备不可用或被其他应用占用。
- 浏览器策略限制自动启动音频上下文。

开发排查时先确认权限，再查看 `src/services/noise/` 采集和流服务，最后检查报告构建和
评分工具。

## 设置没有持久化

设置应通过 `src/utils/appSettings.ts` 或已有 storage 工具读写。若 UI 已更新但刷新后丢失，
检查：

- reducer 是否只更新了内存状态。
- 对应 action 是否同步调用设置更新函数。
- 初始化读取逻辑是否从同一个字段回填。
- 是否存在旧存储迁移或 legacy 清理逻辑影响。

## Electron 行为与 Web 不一致

先确认当前运行命令是否为 `npm run dev:electron` 或 Electron 构建产物。Electron 相关
能力集中在 `electron/`：

- 主进程窗口、菜单、生命周期在 `electron/main.ts`。
- 渲染层暴露能力在 `electron/preload.ts`。
- IPC 通道在 `electron/ipc/`。
- 时间同步相关能力在 `electron/ntpService/`。

如果问题只在桌面包出现，还需要检查 `electron-builder.json` 和打包后的资源路径。

## 静态资源路径异常

Web 构建使用 `/` 作为 base，Electron 模式使用 `./` 作为 base。若图片、字体、音频或
manifest 路径异常，检查：

- 资源是否位于 `public/` 或由 Vite 正确打包。
- `vite.config.ts` 中 `base` 和 `assetFileNames`。
- 部署平台缓存头是否让旧资源继续生效。
- Electron 包内资源是否被正确包含。
