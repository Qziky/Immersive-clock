# Web、PWA、Electron 与 Android

同一套 React 渲染代码同时服务 Web/PWA、Electron 和 Android。差异集中在 Vite mode、资源
基路径、Service Worker、天气传输、`app://local` 协议和原生容器能力。

## 构建模式

| 命令                     | 结果                                                              |
| ------------------------ | ----------------------------------------------------------------- |
| `npm run dev`            | Vite Web 开发服务器，默认 `127.0.0.1:3005`。                      |
| `npm run dev:electron`   | `vite --mode electron`，启动 Electron 主进程并加载开发服务器。    |
| `npm run build`          | Web/PWA 构建到 `dist/`，随后执行 `scripts/postbuild.mjs`。        |
| `npm run build:electron` | 清理并构建渲染层和 `dist-electron/`，随后修正 Electron 相对路径。 |
| `npm run pack:electron`  | 使用 `electron-builder.json` 打包到 `release/`。                  |
| `npm run dist:electron`  | 先构建 Electron，再执行打包。                                     |
| `npm run build:android`  | Android mode 构建到 `dist/`，随后执行 `cap sync android`。        |
| `npm run pack:android`   | 通过 Gradle Wrapper 生成 Debug APK。                              |
| `npm run open:android`   | 补齐 Wrapper 并在 Android Studio 打开原生工程。                   |

`vite.config.ts` 从 `package.json` 或 `VITE_APP_VERSION` 注入版本，Web 使用 `/` base，Electron
和 Android 使用 `./` base。生产构建以 Terser 压缩并移除 `console`/`debugger`；开发和测试保留
source map。

## Web 与 PWA

`vite-plugin-pwa` 使用 `registerType: "autoUpdate"`，仅 Web mode 启用。Electron 与 Android 不注册
Service Worker；Android mode 也不加载 PWA 插件，避免 WebView 内的双重缓存。Web Service Worker：

- precache JS、CSS、HTML、图像、音频和字体；
- 字体使用 CacheFirst，图片和音频按数量/时间限制缓存；
- `/docs/*.md` 使用 NetworkFirst，便于公告和更新日志在线更新；
- 导航 fallback 到 `/index.html`，静态扩展名不会被 SPA fallback 截获。

`public/manifest.json` 是 manifest 基础模板，构建时注入当前应用版本。PWA 注册由
`src/pwa-register.ts` 动态导入，注册失败不应阻塞主应用。

开发服务器将 `/api/xiaomi-weather` 代理到固定的小米天气上游；部署平台需要复制该 rewrite，
避免把上游地址或签名配置暴露为客户端环境变量。Vercel、EdgeOne、Nginx 配置还负责 SPA fallback、
静态资源缓存和开发者页 `X-Robots-Tag`。

## Android 原生容器

`capacitor.config.ts` 定义 `io.github.qziky.immersiveclock`、应用名称和 `dist` Web 目录。原生工程
位于 `android/`，最低 API 24，Manifest 声明网络、前台定位、录音和音频设置权限。现有
`navigator.geolocation`、`getUserMedia`、localStorage 和 IndexedDB 继续由 WebView 提供。

Android 的小米天气客户端使用 `CapacitorHttp` 请求固定绝对上游地址，避开 WebView CORS；请求
仍经过 `weatherRequestGuard`，并将原生状态码、超时、非 JSON 与网络失败映射为现有
`HttpRequestError`。Web 继续使用部署代理，Electron 继续使用 `app://local` 协议代理。

## Electron 主进程

`electron/main.ts` 完成以下工作：

1. 注册安全的 `app://local` scheme，并把请求映射到 `dist/`；没有扩展名的路径回退到
   `index.html`，目录穿越返回 400。
2. 将 `/api/xiaomi-weather/wtr-v3/*` 代理到 `https://weatherapi.market.xiaomi.com`，仅允许 GET。
3. 创建 1280×800、最小 800×600、隐藏菜单栏的 BrowserWindow，关闭 Node Integration 和开启
   Context Isolation。
4. 开发模式加载 `VITE_DEV_SERVER_URL`，生产模式加载 `app://local/index.html`；导航仅允许开发
   服务器 origin 或 `app:` 协议。
5. 注册时间同步 IPC，并安装权限策略。

## 预加载与 IPC

`electron/preload.ts` 只通过 `contextBridge` 暴露窄接口：

```ts
window.electronAPI = {
  platform: string,
  timeSync: {
    ntp(options: { host: string; port?: number; timeoutMs?: number }): Promise<{
      offsetMs: number;
      rttMs: number;
      serverEpochMs: number;
      measuredAt: number;
    }>;
  };
}
```

当前 IPC 通道只有 `timeSync:ntp`。主进程通过 UDP/123 查询 NTP，使用四时间戳公式返回 offset
和 RTT；渲染层 `timeSync.ts` 负责多次采样、按 RTT 选最多三次并取中位数。

## 权限策略

默认拒绝未列出的权限：

- geolocation：允许天气定位；
- media：仅允许 audio，不允许 video；macOS 额外调用 `systemPreferences.askForMediaAccess`；
- fullscreen：仅主窗口顶层 frame；
- 其他权限：拒绝。

Electron 的权限策略不改变 Web 浏览器的用户授权；渲染层仍必须处理拒绝、设备变化和轨道结束。

## 打包资源

`electron-builder.json`：

- Windows：NSIS 安装包和 Portable，x64；
- Linux：AppImage、deb、rpm；
- 图标来自 `public/favicon.ico` / `public/favicon.png`；
- 打包文件包含 `dist/**/*`、`dist-electron/**/*`、`public/**/*` 和 `package.json`。

`scripts/postbuild-electron.mjs` 修正字体、图标和天气资源的绝对路径为相对路径；改动静态资源
或 base 配置时必须同时验证生产 Electron 页面和公告 Markdown 加载。

## 部署契约

Web 生产部署必须同时提供：

- SPA history fallback；
- `/api/xiaomi-weather/*` 到小米天气的同源代理；
- `/docs/*` 静态文件直出；
- 静态资源长期缓存，HTML/Markdown 按配置重新验证；
- `/design-system` 与 `/debug` 的 noindex header。

Docker 使用 Node 构建阶段和 Nginx 运行阶段，默认暴露容器 80 端口；`docker-compose.yml` 将其映射到本机 8080。
