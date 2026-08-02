<div align="center">

<img src="public/favicon.svg" width="160" height="160" alt="Immersive Clock Logo" />

# 沉浸式时钟 | Immersive Clock ⏰

[![License: GPL-3.0](https://img.shields.io/badge/License-GPL--3.0-blue)](LICENSE)
[![React](https://img.shields.io/badge/React-19-61dafb?logo=react)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178c6?logo=typescript)](https://www.typescriptlang.org/)
[![Vite](https://img.shields.io/badge/Vite-7-9135ff?logo=vite)](https://vite.dev/)
[![Electron](https://img.shields.io/badge/Electron-desktop-9feaf9?logo=electron)](https://www.electronjs.org/)
[![PWA](https://img.shields.io/badge/PWA-ready-5A0FC8?logo=pwa)](https://clock.qqhkx.com)
[![Platform](https://img.shields.io/badge/Platform-Web%20%7C%20PWA%20%7C%20Win%20%7C%20Linux-blue)](https://github.com/QQHKX/immersive-clock/releases)
[![Ask DeepWiki](https://deepwiki.com/badge.svg)](https://deepwiki.com/QQHKX/Immersive-clock)

[🖥️ 在线体验](https://clock.qqhkx.com) | 🇨🇳 简体中文 ｜ [🇺🇸 English](README.en-US.md)

<pre>
让时间管理更优雅，让学习更专注
</pre>

</div>

## 📑 目录

- [项目概述](#-项目概述)
- [界面预览](#-界面预览)
- [快速使用指南](#-快速使用指南)
- [主要功能](#-主要功能)
- [使用说明](#-使用说明)
- [无障碍支持](#-无障碍支持)
- [目录结构](#-目录结构)
- [文档知识库](#-文档知识库)
- [常见问题](#-常见问题)
- [交流与反馈](#-交流与反馈)
- [贡献与开发](#-贡献与开发)
- [许可证与作者](#-许可证与作者)
- [衍生项目](#-衍生项目)
- [友情链接](#-友情链接)
- [Star 历史](#-star-历史)

## 🕒 项目概述

**沉浸式时钟（Immersive Clock）** 是一款面向校园、自习空间与个人专注场景的全屏时间
看板。项目基于 React、TypeScript 与 Vite 构建，同时提供 Web/PWA 和 Electron 桌面形态。

应用支持时钟、倒计时、秒表与自习四种模式，并将课程表、事件倒计时、天气与定位、环境
安静评分、多频道语录和外观定制整合在一个低干扰界面中。

> 主要场景：教室与自习室投屏、备考与专注学习、演示看板、番茄钟和桌面时钟。

产品坚持本地优先、设置可逆和数据表达诚实。噪音监测用于观察学习环境，不是专业声级计；
天气、在线语录和网络校时依赖对应第三方服务。

## 🌠 界面预览

当前界面仍在持续迭代，为避免在 README 中长期保留已经过时的设置页和报告截图，本页暂不
内嵌旧版界面图片。你可以通过[在线体验](https://clock.qqhkx.com)查看当前版本。

界面主要由以下场景组成：

- **极简时钟**：大字时间、日期与自动隐藏 HUD。
- **倒计时与秒表**：适合课堂、考试、演讲和个人专注。
- **自习看板**：集中展示时间、天气、噪音、课表进度、事件和语录。
- **分组设置中心**：按常用工作台、视觉外观、环境提醒、内容语录和系统数据组织功能。
- **环境报告**：提供环境安静评分、有效覆盖、走势和影响因素说明。

宣传截图的制作和维护规则见[截图规范](docs/marketing/assets/screenshot-guidelines.md)。

## 🚀 快速使用指南

### 📱 方式一：安装 PWA（推荐）

PWA 可以像桌面应用一样从图标启动，并在首次成功加载后保留核心时钟界面和本地内容的
离线能力。

1. 使用 Chrome、Edge 或 Safari 等现代浏览器打开[在线版本](https://clock.qqhkx.com)。
2. 使用浏览器的“安装应用”或“添加到主屏幕”功能。
3. 安装后从桌面、开始菜单或主屏幕启动。

天气、在线语录、网络校时和外部反馈仍需要网络连接。

### 🌐 方式二：浏览器直接使用

无需安装，直接访问 [clock.qqhkx.com](https://clock.qqhkx.com)。推荐使用较新的 Chrome、
Edge 或 Safari，以获得完整的 PWA、音频、定位和全屏能力。

### 💻 方式三：Electron 桌面版

在 [GitHub Releases](https://github.com/QQHKX/immersive-clock/releases/latest) 下载桌面包：

- **Windows**：提供 x64 安装版和便携版。
- **Linux**：提供 AppImage、deb 和 rpm 构建。
- **macOS**：当前没有发布原生安装包，请使用 Web/PWA 版本。

## 💡 主要功能

### 🧭 时间管理模式

- **时钟**：显示经过校时设置修正后的当前时间与日期，可选择隐藏秒数。
- **倒计时**：支持自定义时、分、秒、常用预设、暂停、继续、重置和结束提示音。
- **秒表**：支持开始、暂停和重置，适合课堂活动与个人计时。
- **自习模式**：为投屏和长时间展示设计的综合看板。
- **沉浸式 HUD**：点击页面或按 `Space` / `Enter` 唤出，无操作约 8 秒后自动隐藏。

### 📚 自习与学习组织

- **课程表**：添加、排序和校验课时时段，支持 Excel 文件预览后导入。
- **事件倒计时**：支持高考目标、单事件和多事件轮播。
- **信息轮播**：组合全天进度、课时进度、下一课时、短时降雨、天气预警和自定义文字。
- **显示开关**：可控制天气、噪音、事件、日期和语录等辅助组件。

### 🌦️ 环境感知

- **天气与定位**：接入小米天气，支持高精度定位、公共 IP 降级和手动城市选择。
- **天气提醒**：展示实时天气、分钟降水、空气质量、气象预警和日出日落信息。
- **环境安静评分**：以 `0–100` 的相对评分观察同一设备上的环境变化。
- **估算 dB(A)**：完成 10 秒外部声级计参考校准后显示，不作为认证测量结果。
- **历史与报告**：保存有效覆盖、评分走势、影响因素和原始特征归档。

### 🎨 内容与个性化

- **多频道语录**：支持本地内容、一言、今日诗词和 Advice Slip，可配置权重和故障回退。
- **外观系统**：分别调整全局、页面、组件、状态和事件的字体、颜色、背景与效果。
- **本地资源**：支持导入背景图片和 `.ttf`、`.otf`、`.woff`、`.woff2` 字体。
- **减少动态效果**：遵循操作系统的 reduced-motion 偏好。

### 💾 数据与平台能力

- **本地优先**：无需账户，大多数设置和用户内容保存在当前应用配置中。
- **备份与恢复**：提供完整备份、设置与资源备份，以及独立 `.icnoise` 原始特征归档。
- **分类清理**：缓存、历史、诊断和未使用资源可以分别清理。
- **PWA 与桌面构建**：支持离线核心界面、后台更新以及 Windows/Linux 桌面包。

## 📘 使用说明

### 基本操作

- 点击页面空白处或按 `Space` / `Enter` 唤出 HUD。
- 通过 HUD 切换时钟、倒计时、秒表和自习模式。
- 设置按钮位于页面左下角；时钟页的问号按钮可以重新播放新手引导。
- 大部分设置需要点击面板底部的“保存”才会应用，取消会放弃当前草稿。

### 倒计时

1. 进入倒计时模式。
2. 单击中央时间，或从 HUD 选择“设置”。
3. 确认时长后，再从 HUD 点击“开始”。

确认时长不会自动启动计时。最后 5 秒会播放逐秒提示，结束时播放终止音。

### 自习模式

- 在“常用工作台”中配置启动页面、自习显示、事件倒计时和课程表。
- 在“环境提醒”中设置噪音、天气和定位。
- 在“内容语录”中配置刷新、显示效果和语录渠道。
- 在“视觉外观”中设置字体、背景、时间和顶部信息栏样式。
- 在“系统数据”中管理校时、备份、清理和调试信息。

完整操作百科请查看[使用说明](docs/user-guide/README.md)，评分实现见
[环境安静评分算法](docs/technical/modules/quietness-scoring.md)。

## ♿ 无障碍支持

| 操作                | 功能                         |
| ------------------- | ---------------------------- |
| `Space` / `Enter`   | 在主页面唤出 HUD             |
| `Escape`            | 关闭支持该快捷键的弹窗或浮层 |
| `Tab` / `Shift+Tab` | 在可交互控件之间移动键盘焦点 |
| 单击中央倒计时      | 打开倒计时时长设置           |
| 系统减少动态效果    | 减少语录、弹层和界面切换动画 |

应用使用语义 HTML、ARIA 属性、可见焦点和键盘交互，并持续检查桌面与窄屏触控布局。

## 🗂️ 目录结构

```text
immersive-clock/
├── electron/          # Electron 主进程、预加载、IPC 与桌面能力
├── public/            # 运行时静态资源、图标、PWA manifest、公告和更新日志
├── src/
│  ├── components/     # 时钟、HUD、天气、噪音、设置等业务组件
│  ├── contexts/       # 应用状态与外观状态
│  ├── hooks/          # 计时、音频、全屏等共享行为
│  ├── pages/          # 主页面、设计系统和调试页面
│  ├── services/       # 天气、定位、数据管理、噪音和语录服务
│  ├── ui/             # 公共组件、设计令牌和语义图标
│  └── utils/          # 设置、存储、评分、时间与导入工具
├── tests/e2e/         # Playwright 端到端与视觉测试
├── docs/
│  ├── technical/      # 技术架构、模块、测试、发布与排障
│  ├── product/        # 品牌、用户、能力、产品原则与隐私原则
│  ├── user-guide/     # 中文使用百科和英文核心指南
│  └── marketing/      # 宣传文案、素材规范与社区资料
├── scripts/           # 构建后处理与测试辅助脚本
├── vite.config.ts     # Web、PWA 与 Electron 构建配置
└── package.json       # 项目元数据、Node 要求和命令入口
```

## 📚 文档知识库

- [技术知识库](docs/technical/README.md)：架构、数据流、功能实现、测试、部署和排障。
- [产品知识库](docs/product/README.md)：品牌初心、用户、能力地图、原则和产品边界。
- [使用百科](docs/user-guide/README.md)：面向用户的完整操作与常见问题。
- [宣传资料库](docs/marketing/README.md)：标准介绍、渠道文案、素材与发布模板。
- [贡献指南](CONTRIBUTING.md)：本地开发、提交要求和文档维护规则。

## ❓ 常见问题

- **HUD 没有出现？** 确保当前没有打开弹窗，点击页面空白处或按 `Space` / `Enter`。
- **天气城市不准确？** 公共 IP 定位可能受校园网、代理或 VPN 影响，可切换为手动城市。
- **噪音监测无数据？** 检查浏览器和系统的麦克风权限，并在噪音控制页授权刷新设备。
- **倒计时确认后没有开始？** 确认只保存时长，还需要在 HUD 中点击“开始”。
- **换设备后设置不见了？** 数据不会自动云同步，请先创建完整备份再在目标设备恢复。
- **如何查看公告和更新日志？** 点击页面右下角的版本号。

更多解答见[常见问题与故障排查](docs/user-guide/faq-and-troubleshooting.md)。

## 💬 交流与反馈

欢迎分享使用体验、报告 Bug 或提出功能建议。反馈问题时建议附上系统、浏览器、复现步骤和
必要的截图或录屏。

- QQ 群：[965931796](https://qm.qq.com/q/fawykipRhm)
- [GitHub Issues](https://github.com/QQHKX/immersive-clock/issues)
- 应用内反馈：点击右下角版本号，在公告弹窗中切换到“意见反馈”
- [腾讯问卷](https://wj.qq.com/s2/25666249/lj9p/)

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="public/assets/qq-group-dark.png" />
  <source media="(prefers-color-scheme: light)" srcset="public/assets/qq-group-light.png" />
  <img alt="沉浸式时钟 QQ 交流群" src="public/assets/qq-group-light.png" width="400" />
</picture>

## 🤝 贡献与开发

欢迎贡献代码、测试、文档、翻译和宣传素材。开始前请阅读[贡献指南](CONTRIBUTING.md)；更详细
的实现说明位于[技术知识库](docs/technical/README.md)。

## 📄 许可证与作者

- 许可证：[GPL-3.0](LICENSE)
- 作者：[QQHKX](https://github.com/QQHKX)
- 个人网站：[qqhkx.com](https://qqhkx.com)

## 🧬 衍生项目

### 沉浸式噪音监测（Immersive-clock-monitor）

- 项目地址：[QQHKX/Immersive-clock-monitor](https://github.com/QQHKX/Immersive-clock-monitor)

该项目从沉浸式时钟中提取噪音监测相关能力，为环境特征采集和相对安静评分提供独立的开源
实现参考。它同样不应被描述为认证声级计或专业声学仪器。

更多社区与生态信息见[社区与生态](docs/marketing/community-and-ecosystem.md)。

## 🔗 友情链接

- <img src="https://sectl.top/logo.svg" width="16" alt="SECTL" /> [SECTL](https://sectl.top/)
- [阑山桌面](https://github.com/wwiinnddyy/LanMountainDesktop)

## ⭐️ Star 历史

<div align="center">
  <a href="https://www.star-history.com/#QQHKX/Immersive-clock&type=date&legend=top-left">
    <picture>
      <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/svg?repos=QQHKX/Immersive-clock&type=date&theme=dark&legend=top-left" />
      <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/svg?repos=QQHKX/Immersive-clock&type=date&legend=top-left" />
      <img alt="Star History Chart" src="https://api.star-history.com/svg?repos=QQHKX/Immersive-clock&type=date&legend=top-left" />
    </picture>
  </a>
  <p>如果这个项目对你有帮助，欢迎点亮 Star ⭐</p>
</div>
