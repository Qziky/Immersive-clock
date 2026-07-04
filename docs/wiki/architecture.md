# 架构总览

Immersive Clock 是一个单页 React 应用，同时支持 Web/PWA 和 Electron 桌面形态。Web
形态由 Vite 构建，Electron 形态复用同一套渲染层，并在 `electron/` 中补充主进程、
预加载脚本和本地能力。

## 应用入口

- `src/main.tsx` 挂载 React 应用，并接入路由、全局样式和 PWA 注册逻辑。
- `src/App.tsx` 负责顶层路由、进入动画、公告弹窗和新手引导完成后的礼花效果。
- `src/pages/ClockPage/ClockPage.tsx` 是主页面容器，按当前模式渲染时钟、倒计时、
  秒表或自习界面，并管理 HUD、设置面板、公告弹窗和全局消息弹窗。
- `src/contexts/AppContext.tsx` 提供全局状态和 reducer，是模式、HUD、倒计时、秒表、
  自习配置和语录配置的主要状态入口。

## 状态与数据流

全局 UI 状态通过 `AppContext` 管理。组件通过 `useAppState()` 读取状态，通过
`useAppDispatch()` 触发 reducer action。需要持久化的偏好设置由 `src/utils/appSettings.ts`
读取和更新，初始化时再回填到全局状态。

典型流程：

1. 应用启动时从本地设置读取启动模式、自习设置、语录设置和频道配置。
2. 用户通过 HUD 或设置面板触发 action。
3. reducer 更新内存状态；涉及持久化的设置同步写入本地存储。
4. 页面容器和功能组件根据新状态重新渲染。

倒计时和秒表的实时刷新尽量在组件或 hook 中局部处理，避免把高频 tick 全部压到全局
reducer。时间同步由 `src/utils/timeSync.ts` 管理，主页面挂载后启动。

## 模块分层

- `src/components/`：可复用 UI 和功能组件，例如 Clock、Countdown、HUD、SettingsPanel、
  NoiseMonitor、Weather、Study。
- `src/pages/`：页面级容器，目前主屏集中在 `ClockPage`。
- `src/contexts/`：跨组件状态管理。
- `src/hooks/`：计时、音频、全屏、事件监听、轮播等共享行为。
- `src/services/`：天气、定位、HTTP、API 治理，以及噪音流处理服务。
- `src/utils/`：本地存储、设置迁移、时间格式化、噪音评分、课表导入、公告存储等纯工具
  或边界工具。
- `src/types/`：跨模块共享类型。
- `electron/`：Electron 主进程、预加载脚本、IPC 通道和 NTP 服务。

## Web/PWA 架构

`vite.config.ts` 集成 `vite-plugin-pwa`，Web 构建默认启用 PWA。PWA 使用自动更新注册模式，
并针对字体、图片、音频和 `/docs/*.md` 配置运行时缓存策略。Web 端还通过 Vite dev server
代理 `/api/xiaomi-weather` 到小米天气接口，生产部署中由 Vercel 或 EdgeOne rewrite 承接。

`public/manifest.json` 是 PWA manifest 的基础配置，构建时会注入应用版本号。

## Electron 架构

Electron 模式通过 `vite --mode electron` 启动。`vite.config.ts` 在该模式下启用
`vite-plugin-electron` 和 `vite-plugin-electron-renderer`：

- `electron/main.ts` 是主进程入口。
- `electron/preload.ts` 是预加载脚本入口，构建为 CommonJS 输出。
- `electron/ipc/` 定义 IPC 通道和时间同步相关注册逻辑。
- `electron/ntpService/` 提供 NTP 客户端能力。

Electron 构建输出分为 Web 渲染产物和 `dist-electron/` 主进程产物，最终由
`electron-builder` 打包。

## 构建模式

- 普通开发：`npm run dev`，启动 Vite Web dev server。
- Electron 开发：`npm run dev:electron`，使用 Electron 模式启动 Vite。
- Web 构建：`npm run build`，输出 `dist/` 并执行 postbuild 脚本。
- Electron 构建：`npm run build:electron`，清理并重建 `dist-electron/`，再执行
  Electron postbuild 脚本。
- Electron 打包：`npm run dist:electron`，先构建再调用 `electron-builder`。

## 设计约束

- 运行时行为以浏览器能力为主，Electron 只补充桌面能力。
- 本地设置优先通过 `appSettings.ts` 管理，避免散落新的 localStorage key。
- 用户可见功能优先由组件表达，业务处理和存储逻辑下沉到 `services/` 或 `utils/`。
- 高频计时、音频和噪音流处理应避免不必要的全局状态刷新。
