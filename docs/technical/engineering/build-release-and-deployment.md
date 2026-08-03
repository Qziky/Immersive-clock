# 构建、发布与部署

项目同时产出 Web/PWA、Electron 桌面包、Android Debug APK 和 Docker/Nginx 镜像。构建入口由
`package.json`、`vite.config.ts`、`capacitor.config.ts`、`electron-builder.json` 和 GitHub
Actions 共同定义。

## Web 构建

`npm run build` 执行 `vite build`，输出 `dist/`，再运行 `scripts/postbuild.mjs`：

- 复制并更新 sitemap HTML/XML 日期；
- 复制 `robots.txt`；
- 不修改源码或 `public/docs`。

Vite 输出：

- JS：`js/[name]-[hash].js`；
- 字体：`fonts/[name]-[hash][ext]`；
- 图片：`images/[name]-[hash][ext]`；
- 音频：`audio/[name]-[hash][ext]`；
- 其他：`assets/[name]-[hash][ext]`。

生产模式 Terser 移除 console/debugger，4KB 以下资源允许内联。`VITE_APP_VERSION` 优先，缺失
时读取 `package.json.version`；值会注入 manifest、公告偏好和版本缓存插件。

## PWA 产物

Web 构建启用 `vite-plugin-pwa`：`registerType: "autoUpdate"`，自动生成 Service Worker 和 web
manifest；Electron 与 Android mode 均禁用注册，Android 还完全禁用 PWA 插件。Web 预缓存静态
资源，运行时缓存字体、图片、音频和 `/docs/*.md`。修改缓存规则、
资源路径或 manifest 时要验证：

1. 首次在线加载；
2. Service Worker 安装与更新；
3. 离线启动和旧版本更新；
4. 公告/更新日志 NetworkFirst 行为；
5. 自定义背景/字体不因缓存清理丢失（它们在 IndexedDB）。

## Electron 构建

`npm run build:electron` 会先删除 `dist-electron/`，以 Electron mode 构建渲染层、主进程和
CommonJS preload，再执行 `scripts/postbuild-electron.mjs` 修正绝对资源路径。`npm run pack:electron`
调用 electron-builder 输出 `release/`。

平台产物：

| 平台               | 产物                                          |
| ------------------ | --------------------------------------------- |
| Windows x64        | NSIS `*-Setup.exe`、Portable `*-Portable.exe` |
| Linux x64/目标架构 | AppImage、deb、rpm                            |

打包清单包含 `dist`、`dist-electron`、`public` 和 `package.json`。应用 ID 为
`io.github.qziky.immersiveclock`，图标来自 public。Electron 运行时使用 `app://local`，协议层会
服务静态文件并代理天气请求；生产页面不能依赖 `/` 绝对资源路径。

## Android Debug APK

`npm run build:android` 使用 Android mode 构建 Web assets 并执行 `cap sync android`；该 mode 使用
`./` base，禁用 Electron、PWA 插件和 Service Worker。`npm run pack:android` 通过经过 SHA-256
校验的 Gradle 8.14.3 Wrapper 执行 `assembleDebug`，输出
`android/app/build/outputs/apk/debug/app-debug.apk`。

Android application ID 为 `io.github.qziky.immersiveclock`，最低 API 24，使用 JDK 21。Debug APK
使用 Android 自动生成的调试签名，不需要 keystore 或 Secrets。完整本地依赖、Artifact 下载、
安装命令和限制见 [Android Debug APK 构建](android-debug-build.md)。

## Docker/Nginx

`Dockerfile` 使用 Node 24 Alpine 构建 Web，再复制 `dist/` 到 Nginx Alpine；`nginx.conf`：

- 为静态资源设置长期缓存和 gzip；
- 代理 `/api/xiaomi-weather/` 到小米天气；
- 对 `/design-system` 与 `/debug` 加 noindex；
- 用 `try_files` 提供 SPA history fallback；
- `/health` 返回纯文本 `healthy`。

`docker-compose.yml` 将容器 80 端口映射到本机 8080。生产环境必须保证代理与 SPA fallback
同时存在，否则天气会遇到 CORS、深链接会 404。

## Vercel/EdgeOne

`vercel.json` 与 `edgeone.json` 复制同源天气代理、`/docs` 直出和 SPA fallback，并设置：

- JS/CSS immutable 长缓存；
- 图片 1 天、音频 2 天、字体约 30 天；
- HTML 不缓存；
- Web manifest/JSON 1 天；
- docs noindex；开发者页面 noindex/nofollow/noarchive。

EdgeOne 当前配置声明 Node 18，而仓库开发和 CI 要求 Node `>=22.0.0`；部署平台若执行构建应
以 CI/项目支持的 Node 版本为准并单独验证，不要把该配置误写成开发环境要求。

## CI 与手动发布

`.github/workflows/ci.yml` 在 PR/main 执行类型、样式、UI Catalog、lint、Vitest；main push 还
构建 Web、Windows/Linux Electron 和 Docker。`manual-release.yml` 由 workflow_dispatch 触发，
读取 package 版本或自定义 tag，上传 Web zip、Windows 安装包、Linux 包，并创建 GitHub Release。

`.github/workflows/android.yml` 独立响应手动触发和 main 的 Android 相关路径变化，构建并上传
Debug APK；它不作为现有 Web、Electron 或 Docker job 的依赖。

Electron CI 会缓存 electron-builder，Windows 在打包失败时最多重试 3 次；发布前检查 release
目录和预期扩展名。不要把 `.env`、API key 或构建缓存提交到仓库。

## 发布检查清单

1. `npm ci`/`npm install` 后运行 typecheck、lint、styles、UI tests、Vitest。
2. 运行 Web build，检查 `dist/index.html`、manifest、`public/docs/*.md` 和天气代理路径。
3. 需要桌面包时运行 build:electron + pack:electron，检查 Windows/Linux 产物。
4. 需要 Android APK 时运行 build:android + pack:android，并在真机检查定位、麦克风和重启。
5. 验证深链接、全屏、定位、仅音频权限、NTP IPC、公告和离线启动。
6. 检查版本注入、sitemap、robots、缓存 header 和 noindex header。
7. 在发布说明中记录构建版本、平台、测试命令和已知限制。
