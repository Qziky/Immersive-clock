# 发布与部署

本项目支持 Web/PWA、Electron 桌面包、Docker/Nginx、Vercel 和 EdgeOne 等发布形态。
发布前应确认版本号、构建产物、缓存策略和目标平台配置。

## Web/PWA 构建

```bash
npm run build
```

该命令执行 Vite 构建并运行 `scripts/postbuild.mjs`，输出目录为 `dist/`。PWA 配置位于
`vite.config.ts`，manifest 基础文件位于 `public/manifest.json`。构建时会把
`VITE_APP_VERSION` 或 `package.json` 中的版本号注入运行环境和 manifest。

Web 构建包含：

- React 渲染层。
- 静态资源分组输出。
- PWA service worker 和缓存策略。
- `/docs/*.md` 的 NetworkFirst 运行时缓存。

## 本地预览

```bash
npm run preview
```

用于预览生产构建结果。涉及 PWA、静态资源路径、路由 fallback 或缓存策略时，建议使用
生产预览而不只依赖 dev server。

## Electron 构建与打包

```bash
npm run build:electron
npm run dist:electron
```

- `build:electron` 会清理 `dist-electron/`，以 Electron 模式构建渲染层、主进程和预加载脚本。
- `dist:electron` 会继续调用 `electron-builder` 生成安装包。
- Electron 打包配置位于 `electron-builder.json`。
- 额外说明见 [Electron 说明](../../ELECTRON.md)。

Electron 相关入口：

- `electron/main.ts`：主进程。
- `electron/preload.ts`：预加载脚本。
- `electron/ipc/`：IPC 通道。
- `electron/ntpService/`：NTP 时间同步能力。

## Docker 部署

Dockerfile 使用两阶段构建：

1. Node builder 阶段安装依赖并运行 `npm run build`。
2. Nginx 阶段将 `dist/` 拷贝到 `/usr/share/nginx/html`，并使用 `nginx.conf`。

本地 compose 入口：

```bash
docker compose up --build
```

默认将容器 80 端口映射到宿主机 8080。

## Vercel 部署

配置文件为 `vercel.json`：

- `buildCommand`: `npm run build`
- `outputDirectory`: `dist`
- `framework`: `vite`
- `/api/xiaomi-weather/(.*)` rewrite 到小米天气接口。
- `/docs/(.*)` 保持文档路径可访问。
- 其他非静态资源路径 fallback 到 `/index.html`。
- 针对字体、图片、音频、JS/CSS、HTML、manifest/JSON 配置缓存头。
- `/docs/(.*)` 设置 `X-Robots-Tag: noindex, nofollow`。

## EdgeOne 部署

配置文件为 `edgeone.json`，整体结构与 Vercel 部署类似：

- 构建命令为 `npm run build`。
- 输出目录为 `dist`。
- 配置天气 API rewrite、文档路径 rewrite 和 SPA fallback。
- 配置静态资源缓存头和文档 noindex。

## 发布检查清单

- 确认 `package.json` 版本号或 `VITE_APP_VERSION`。
- 运行对应构建命令。
- 预览 Web/PWA 构建并确认首页、模式切换、设置入口和静态资源加载。
- 涉及缓存策略时确认 service worker 更新行为。
- Electron 发布前确认目标平台安装包、预加载脚本和主进程能力。
- 部署配置变化后确认天气 API rewrite 和 SPA fallback。
