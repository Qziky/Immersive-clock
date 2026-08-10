# 素材清单

本清单记录当前仓库内可用于 README、网页元数据、安装包和社区传播的权威素材。路径均相对于仓库根目录。

## 当前素材

| 路径                                                          |           尺寸 | 当前用途                           | 状态与注意事项                                              |
| ------------------------------------------------------------- | -------------: | ---------------------------------- | ----------------------------------------------------------- |
| `docs/marketing/assets/readme/readme-study-dashboard.png`     |     1440 × 900 | README 自习看板展示                | 固定演示天气、进度、目标和原创语录；噪音组件已关闭          |
| `docs/marketing/assets/readme/readme-modes-grid.png`          |     1440 × 900 | README 四模式拼图                  | 时钟、30 分钟倒计时、暂停秒表和自习模式                     |
| `docs/marketing/assets/readme/readme-appearance-settings.png` |     1440 × 900 | README 外观设置展示                | 当前设置中心；预览卡日期时间为应用内置样式示例              |
| `docs/marketing/assets/readme/pwa-install-edge.png`           |     1440 × 860 | README 与 Edge 安装指南截图        | Edge 地址栏安装图标及确认弹窗；等比缩放自用户提供截图       |
| `docs/marketing/assets/readme/pwa-install-chrome.png`         |     1440 × 860 | README 与 Chrome 安装指南截图      | Chrome 地址栏安装图标及确认对话框；等比缩放自用户提供截图   |
| `public/docs/assets/pwa-install-edge.webp`                    |      960 × 573 | 网站快速上手 Edge 安装截图         | WebP 压缩副本，在快速上手安装指南中展示                     |
| `public/docs/assets/pwa-install-chrome.webp`                  |      960 × 573 | 网站快速上手 Chrome 安装截图       | WebP 压缩副本，在快速上手安装指南中展示                     |
| `public/og-image.png`                                         |     1200 × 630 | Open Graph、Twitter Card、PWA 截图 | 已在 `index.html` 与 manifest 中引用；更新时保持 1200 × 630 |
| `public/favicon.svg`                                          |         可缩放 | 浏览器首选图标、README 品牌图      | 主图标源，适合网页和矢量场景                                |
| `public/favicon.png`                                          |      256 × 256 | Linux 安装包图标、PNG 兼容         | 保持与 SVG 视觉一致                                         |
| `public/favicon.ico`                                          | 256 × 256 容器 | Windows 安装包与浏览器兼容         | Windows 构建依赖，不要只替换 PNG                            |
| `public/apple-touch-icon.png`                                 |      180 × 180 | Apple 设备添加到主屏幕             | manifest 和页面元数据使用                                   |
| `public/assets/qq-group-light.png`                            |     938 × 1166 | 浅色背景下的 QQ 群二维码           | 仅用于社群入口，发布前验证二维码有效                        |
| `public/assets/qq-group-dark.png`                             |     938 × 1166 | 深色背景下的 QQ 群二维码           | 与浅色版成对维护                                            |

天气图标和字体属于应用运行资源，不作为通用宣传素材登记。运行时公告与更新日志也不是营销图片素材。

## README 原始截图与生成方式

`docs/marketing/assets/readme/source/` 保存 `1440 × 900` 的稳定原始截图：

- `clock.png`：固定时间的时钟模式；
- `countdown.png`：30 分钟倒计时；
- `stopwatch.png`：运行约 8 秒后暂停；
- `study.png`：天气、进度、目标与语录演示数据；
- `appearance-settings.png`：当前外观设置中心。

运行以下命令可重新采集原图并生成三张 README 成品图：

```bash
npm run assets:readme
```

脚本固定使用 `2026-08-05 08:30`（Asia/Shanghai）、`1440 × 900` 视口和本地演示数据，并关闭
公告、引导、动画、调试信息和噪音监测。截图不得加入真实位置、课程、姓名或麦克风数据。

## 已淘汰素材

旧版 `public/assets/readme-hero.png` 以及其他演示截图包含已经变化的设置界面、版本水印或旧噪音
表达，不应继续用于当前 README、发布页或社交传播。这些文件不在新目录保留副本。

如需引用历史界面，应存入明确标注版本和日期的外部归档，而不是混入当前产品素材库。

## 新素材命名

使用英文小写 kebab-case，并把用途而不是中文界面文案写入文件名：

```text
product-hero-dark.png
study-dashboard-weather.png
settings-appearance-overview.png
noise-report-relative-score.png
release-3-x-feature-name.png
```

- 当前长期素材不写版本号；发布专属素材写主要版本或完整版本号。
- 同一画面的深浅色版本使用 `-light`、`-dark` 后缀。
- 移动端与桌面端使用 `-mobile`、`-desktop` 后缀。
- 不使用“最终版”“新版2”“截图1”等不可维护名称。

## 维护流程

1. 按[截图规范](screenshot-guidelines.md)从当前生产构建生成素材；README 图优先运行
   `npm run assets:readme`。
2. 检查画面中的版本、城市、课程、二维码和个人数据。
3. 用新文件替换或新增素材，并更新本清单的尺寸、用途和状态。
4. 全仓库搜索旧路径，确认 README、manifest、元数据和发布模板没有悬空引用。
5. 对会影响网页、PWA 或安装包的图标执行相应构建验证。

## 授权边界

- 产品图标和项目截图按项目许可证及维护者声明使用。
- 用户上传的字体、背景和课程内容不自动成为项目可传播素材。
- 内置天气图标已确认为 Meteocons v2.0.0（MIT），公开分发时须保留来源、版权与许可证。
- 内置 Inter 和 Roboto Mono 字体采用 SIL OFL 1.1，公开分发时须携带对应许可证。
- 品牌标识、友情链接 Logo、二维码以及 `public/ding*.mp3`、favicon 系列文件应在公开分发前确认来源或替换。
- 内置语录、校训及截图中引用的第三方文本需确认传播权限；无法确认时使用原创或公共领域文本。
