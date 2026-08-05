# 构建、发布与部署

项目产出 Web/PWA、Electron 桌面包、Android APK 和 Docker/Nginx 镜像。构建入口由
`package.json`、`vite.config.ts`、`capacitor.config.ts`、`electron-builder.json` 和 GitHub
Actions 共同定义，要求 Node.js 22 或更高版本。

## Web 与 PWA

`npm run build` 执行 Vite 生产构建及 postbuild、预渲染和合规检查，输出 `dist/`。
`VITE_APP_VERSION` 优先于 `package.json.version`，该值会注入应用、manifest、公告偏好和缓存键。

Web mode 启用 `vite-plugin-pwa` 与自动更新 Service Worker；Electron 和 Android 不注册 Service
Worker。发布前验证首次在线加载、离线重开、旧版本更新、`/docs/*.md` NetworkFirst 行为，以及
IndexedDB 中的自定义字体和背景不会因缓存清理丢失。

GitHub Release 中的 `immersive-clock-web-<version>.zip` 是可自托管的 Web 正式制品。生产部署必须
提供 HTTPS、SPA history fallback、`/docs/*` 静态文件，以及 `/api/xiaomi-weather/*` 同源代理。
仓库外在线站点的部署、域名与证书不属于 Release 工作流。

## Electron

`npm run build:electron` 构建渲染层、主进程和 CommonJS preload，并修正生产资源相对路径；
`npm run pack:electron` 使用 electron-builder 输出 `release/`。

| 平台 | 产物 |
| --- | --- |
| Windows x64 | NSIS `*-Setup.exe`、Portable `*-Portable.exe` |
| Linux x64 | AppImage、deb、rpm |

打包清单包含 `dist`、`dist-electron`、`public` 和 `package.json`。应用 ID 为
`io.github.qziky.immersiveclock`，生产运行时通过 `app://local` 提供静态资源和天气代理。

## Android

`npm run build:android` 使用相对资源路径构建 Web assets，禁用 Electron、PWA 插件与 Service
Worker，并执行 `cap sync android`。

- `npm run pack:android`：生成默认调试证书签名的 Debug APK，供独立 Android CI 和开发验收使用。
- `npm run pack:android:release`：生成 Release APK；必须提供
  `ANDROID_RELEASE_STORE_FILE`、`ANDROID_RELEASE_KEYSTORE_PASSWORD`、
  `ANDROID_RELEASE_KEY_ALIAS`、`ANDROID_RELEASE_KEY_PASSWORD`，缺少任一字段即失败。

application ID 为 `io.github.qziky.immersiveclock`，最低 API 24，使用 JDK 21、Android API 36 和
Build Tools 36.0.0。Manual Release 从 GitHub Actions Secrets 解码仓库外 keystore，通过
`apksigner` 验证签名并与 `ANDROID_RELEASE_CERT_SHA256` 仓库变量比对，再用 `aapt` 检查 package、
`versionName` 和 `versionCode`。Release 只发布正式签名 APK，不发布 Debug APK 或 AAB。

完整本地与 CI 说明见 [Android APK 构建与发布](android-debug-build.md)。

## Docker/Nginx

`Dockerfile` 使用 Node 24 Alpine 构建 Web，再复制到 Nginx Alpine。镜像提供 SPA fallback、
静态资源缓存、gzip、天气代理、开发者页 noindex 和 `/health`。

Manual Release 向 `ghcr.io/qziky/immersive-clock` 推送 amd64/arm64 manifest，并显式发布
`<version>`、`<major>.<minor>`、`<major>`、`latest` 四组标签。发布后必须检查双架构 manifest，
将 package visibility 设为 public，并在未登录状态验证可拉取。

## CI 与 Manual Release

`.github/workflows/ci.yml` 在 PR/main 执行类型、样式、UI Catalog、lint、Vitest 与构建；main push
还构建 Web、Windows/Linux Electron 和 Docker。`.github/workflows/android.yml` 独立构建 Debug
APK，不参与 Release 附件。

`.github/workflows/manual-release.yml` 仅允许手动触发，并执行：

1. 用 `npm ci` 安装依赖，校验 Tag、包版本、Android 版本和固定 Release Notes 一致；
2. 构建 Web ZIP、Windows、Linux、正式签名 Android APK；
3. 推送四组公开 GHCR 标签并检查 amd64/arm64 manifest；
4. 汇总全部附件并生成 `SHA256SUMS.txt`；
5. 从 `docs/marketing/releases/v<version>.md` 创建 GitHub Release。

v4.0.0 的标准流程先以 `draft=true`、`prerelease=false` 创建 Draft Release，下载并验收所有制品后，
再转为公开稳定版并标记 Latest。

## 发布检查清单

1. 运行 typecheck、lint、stylelint、Vitest、Playwright 和 Web build。
2. 构建并检查 Windows Setup/Portable、Linux AppImage/deb/rpm。
3. 构建 Android Release APK，核对 application ID、版本、证书指纹和校验和。
4. 检查 Web ZIP 内容、版本注入、公告、更新日志、manifest、sitemap 和 robots。
5. 检查 Docker 四组标签、双架构 manifest、健康端点与匿名拉取。
6. 真机可用时检查 Android 启动、重开、四种模式、定位、麦克风、拒绝权限和离线重开；没有设备时明确记录未执行。
7. Release 公开后确认 Tag 指向 `main` 发布提交、Release 为 Latest，并保持工作区干净。
