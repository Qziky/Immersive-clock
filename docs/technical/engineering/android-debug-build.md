# Android Debug APK 构建

项目使用 Capacitor 8 将 React/Vite 产物装入 Android WebView，永久 application ID 为
`io.github.qziky.immersiveclock`。当前只产出使用 Android 默认调试证书签名的 Debug APK，不包含
Release APK、AAB、Google Play 发布或正式签名配置。

## 本地环境

- Node.js 22 或更高版本；
- JDK 21，并设置 `JAVA_HOME`；
- Android SDK Platform 36 与 Build Tools 36.0.0；
- Android Studio（可选，用于真机调试和 Logcat）；
- Android 设备最低 API 24（Android 7.0）。

首次安装依赖后执行：

```bash
npm ci
npm run build:android
npm run pack:android
```

`build:android` 使用 Vite 的 `android` mode 构建 `dist/`，禁用 Electron、PWA 插件和 Service
Worker，然后执行 `cap sync android`。`pack:android` 会下载固定的 Gradle 8.14.3 Wrapper JAR，
校验 SHA-256 后运行 `assembleDebug`。生成文件位于：

```text
android/app/build/outputs/apk/debug/app-debug.apk
```

运行 `npm run open:android` 可补齐 Wrapper JAR并在 Android Studio 中打开原生工程。`android/`
中的 Web assets、Capacitor 生成配置、Cordova 兼容工程、Gradle 缓存和 APK 都是生成文件，不提交。

## GitHub Actions

`.github/workflows/android.yml` 支持手动触发，并在 `main` 分支的 Android 相关源码、配置或依赖
变化时触发。工作流使用 Node.js 22、JDK 21、Android API 36 和 Gradle 缓存，依次执行：

1. `npm ci`；
2. `npm run typecheck`；
3. `npm run build:android`；
4. `npm run pack:android`；
5. 校验并上传 `app-debug.apk`。

在 GitHub 仓库的 Actions 页面打开 “Android Debug APK” 运行，从 Artifacts 下载
`immersive-clock-android-debug`。Artifact 默认保留 14 天。该工作流是独立 job，不改变 Web、
Electron 或 Docker 工作流的依赖关系。

## 真机安装与验收

启用设备的开发者选项和 USB 调试后，可使用 Android Studio 安装，也可以执行：

```bash
adb install -r android/app/build/outputs/apk/debug/app-debug.apk
```

首次使用定位或噪音监测时，系统会请求位置和麦克风权限。Manifest 仅声明网络、粗略/精确定位、
录音和音频设置权限；应用只使用现有前台 `navigator.geolocation` 与 `getUserMedia` 能力，不进行
后台录音。验收至少覆盖启动/重开、四种时钟模式、设置持久化、定位与城市解析、天气请求、
麦克风设备选择、拒绝权限错误以及离线重开。

## 平台差异与已知限制

- Android 的小米天气请求通过 `CapacitorHttp` 直连固定 HTTPS 上游，绕过 WebView CORS；Web
  仍依赖 Vite/部署代理，Electron 仍依赖 `app://local` 协议代理。
- Android 构建不生成或注册 Service Worker，避免 WebView 内出现双重缓存；离线能力来自已打包
  的本地 Web assets，在线天气和语录仍需要网络。
- 首版没有后台通知、后台噪音监测、原生文件分享、自动更新、商店图标/截图或商店元数据。
- CI 不启动 Android Emulator；定位、麦克风和真实 WebView 权限流程必须由真机验收。
