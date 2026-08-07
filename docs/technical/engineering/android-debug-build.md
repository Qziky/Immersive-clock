# Android APK 构建与发布

项目使用 Capacitor 8 将 React/Vite 产物装入 Android WebView，永久 application ID 为
`io.github.qziky.immersiveclock`。开发流程保留 Debug APK；正式 GitHub Release 提供由项目长期
发布证书签名的侧载 APK，不发布 AAB 或应用商店包。

## 本地环境

- Node.js 22 或更高版本；
- JDK 21，并设置 `JAVA_HOME`；
- Android SDK Platform 36 与 Build Tools 36.0.0；
- Android Studio（可选，用于真机调试和 Logcat）；
- Android 设备最低 API 24（Android 7.0）。

Debug 构建：

```bash
npm ci
npm run build:android
npm run pack:android
```

输出为 `android/app/build/outputs/apk/debug/app-debug.apk`。Debug APK 使用 Android 默认调试证书，
仅用于开发与 CI Artifact，不作为 GitHub Release 附件。

Release 构建需要在仓库外安全保存的 keystore，并在当前进程提供：

```text
ANDROID_RELEASE_STORE_FILE
ANDROID_RELEASE_KEYSTORE_PASSWORD
ANDROID_RELEASE_KEY_ALIAS
ANDROID_RELEASE_KEY_PASSWORD
```

然后执行 `npm run build:android` 与 `npm run pack:android:release`。Gradle 只在 Release 任务读取这些
字段，缺少任一字段会直接失败；Debug 构建不受影响。密码、keystore、明文凭据和签名属性文件都
不得提交到仓库。

## GitHub Actions

`.github/workflows/android.yml` 在 `main` 的 Android 相关变更或手动触发时构建 Debug APK，供开发
验收使用。Artifact 名为 `immersive-clock-android-debug`，默认保留 14 天。

`.github/workflows/manual-release.yml` 从以下 Secrets 读取正式签名：

- `ANDROID_RELEASE_KEYSTORE_BASE64`
- `ANDROID_RELEASE_KEYSTORE_PASSWORD`
- `ANDROID_RELEASE_KEY_ALIAS`
- `ANDROID_RELEASE_KEY_PASSWORD`

公开变量 `ANDROID_RELEASE_CERT_SHA256` 保存预期证书 SHA-256。工作流解码 keystore、构建 Release
APK、用 `apksigner verify --print-certs` 核对证书指纹，并用 `aapt dump badging` 核对 application ID、
`versionName` 和 `versionCode`，最终发布 `immersive-clock-<version>-android-release.apk`。

同一 application ID 的后续版本必须继续使用同一发布证书，Android 才允许覆盖升级。签名恢复包
必须保持多份离线备份；丢失密钥后无法为现有侧载安装提供可直接升级的新 APK。

## 侧载与真机验收

用户需要允许浏览器或文件管理器“安装未知应用”，并只从项目 GitHub Release 获取 APK。安装前可
使用 `SHA256SUMS.txt` 核对文件。已有同 application ID 的 Debug APK 因签名不同，通常需要先卸载
Debug 版再安装 Release 版；卸载前必须导出需要保留的数据。

首次使用定位或环境监测时，系统会请求位置和麦克风权限。应用仅使用前台
`navigator.geolocation` 与 `getUserMedia`，不进行后台录音。真机验收至少覆盖启动/重开、四种模式、
设置持久化、定位、天气、麦克风设备选择、拒绝权限错误和离线重开。

CI 不启动 Android Emulator。没有连接真机时，只能将构建、清单、版本和签名检查记录为已完成，
不能将真机安装冒烟测试描述为已完成。

## 平台差异

- Android 的小米天气请求通过 `CapacitorHttp` 直连固定 HTTPS 上游；Web 依赖部署代理，Electron
  依赖 `app://local` 协议代理。
- Android 不生成或注册 Service Worker，离线能力来自 APK 内的本地 Web assets。
- 当前没有后台通知、后台环境监测、原生文件分享或商店元数据。应用会检查统一稳定版清单并通过
  Capacitor Browser 打开 Release APK，但安装仍由 Android 系统确认，不执行应用内静默安装。
