# 功能模块

本页按业务能力说明主要代码位置和职责边界。新增功能时优先沿用现有模块边界，避免把
UI、存储、网络请求和算法混在同一个组件中。

## 模式与主页面

主页面位于 `src/pages/ClockPage/ClockPage.tsx`，负责根据 `AppContext` 中的 `mode`
选择当前显示的模式。模式切换入口主要来自 HUD 和相关控制组件。

相关模块：

- `src/components/HUD/`：沉浸式控制层，提供模式切换、作者信息、设置入口等。
- `src/components/ModeSelector/`：模式选择 UI。
- `src/contexts/AppContext.tsx`：维护当前模式、HUD 状态和主要计时状态。
- `src/utils/startupMode.ts`：根据设置计算启动模式。

## 时钟

时钟模式展示当前时间和日期，适合全屏或投屏场景。

相关模块：

- `src/components/Clock/`：时钟显示组件。
- `src/utils/formatTime.ts`：时间格式化工具。
- `src/utils/timeSource.ts`：统一时间来源。
- `src/utils/timeSync.ts`：浏览器端时间同步管理。

## 倒计时

倒计时支持预设时间、启动、暂停、重置和结束提示音。倒计时设置通过弹窗进入，运行状态
由全局 reducer 和局部刷新协作维护。

相关模块：

- `src/components/Countdown/`：倒计时展示和交互。
- `src/components/CountdownModal/`：倒计时设置弹窗。
- `src/hooks/useTimer.ts`：计时相关 hook。
- `src/hooks/useAudio.ts`：提示音播放。
- `src/constants/timer.ts`：计时常量。

## 秒表

秒表模式提供启动、暂停、重置和累计时长展示。秒表状态存放在 `AppContext` 的
`stopwatch` 分支中。

相关模块：

- `src/components/Stopwatch/`：秒表 UI。
- `src/contexts/AppContext.tsx`：秒表 action 和 reducer 分支。
- `src/constants/timer.ts`：tick 间隔等常量。

## 自习模式

自习模式是聚合看板，组合大字时间、目标倒计时、天气、噪音、课表、语录、样式配置和
报告弹窗。

相关模块：

- `src/components/Study/`：自习主界面。
- `src/components/StudyStatus/`：顶部进度快照与提示信息轮播。
- `src/components/SettingsPanel/sections/StudySettingsPanel.tsx`：自习相关设置。
- `src/utils/appSettings.ts`：自习设置持久化入口。
- `src/utils/studyBackgroundStorage.ts`、`src/utils/studyFontStorage.ts`：背景和字体设置。
- `src/utils/studyScheduleStorage.ts`、`src/utils/studyScheduleValidation.ts`：课表存储和校验。

## 天气与预警

天气模块提供定位、天气请求、缓存、分钟级降水提示和灾害预警。开发时应保持网络请求、
缓存和 UI 展示分离。

相关模块：

- `src/components/Weather/`：天气展示。
- `src/components/SettingsPanel/sections/WeatherSettingsPanel.tsx`：天气设置。
- `src/services/weatherService.ts`：天气业务流程。
- `src/services/xiaomiWeatherClient.ts`：小米天气客户端。
- `src/services/locationService.ts`：定位服务。
- `src/utils/weatherStorage.ts`：天气缓存。
- `src/utils/weatherAlert.ts`、`src/utils/minutelyPrecipLogic.ts`：预警和降水提示逻辑。

## 噪音监测与报告

噪音模块包含单 Leader 采集、AudioWorklet 特征提取、原始帧持久化、无基线环境安静评分、
后台重算、历史构建和报告展示。算法和采样细节应优先参考专题文档。

相关模块：

- `src/components/NoiseMonitor/`：噪音监测入口。
- `src/components/NoiseSettings/`：实时图表、统计摘要、告警历史。
- `src/components/NoiseReportModal/`、`src/components/NoiseHistoryModal/`：报告和历史弹窗。
- `src/services/noise/`：采集适配器、特征仓库、Leader 协调、重算 Worker、环形缓冲和流服务。
- `src/utils/noiseScoreEngine.ts`：评分引擎。
- `src/utils/noiseSliceService.ts`、`src/utils/noiseHistoryBuilder.ts`：切片存储和历史构建。
- `docs/noise-technical-spec.md`、`docs/noise-scoring.md`：噪音专题文档。

## 课表

课表用于自习场景中的固定时段管理，并支持 Excel 导入。

相关模块：

- `src/components/ScheduleSettings/`：课表设置 UI。
- `src/utils/studyScheduleStorage.ts`：课表持久化。
- `src/utils/studyScheduleValidation.ts`：课表校验。
- `src/utils/studyScheduleExcelImport.ts`：Excel 导入。
- `src/types/studySchedule.ts`：课表类型。

## 语录与频道

语录模块通过统一注册表管理本地频道与一言、今日诗词、Advice Slip 三个在线频道，网络
响应由各服务适配器转换为统一 `Quote` 模型。频道可独立启停和调权重，一言额外支持分类
选择；自动刷新开关和 30 秒至 30 分钟的间隔由设置层持久化。

在线获取由语录服务统一处理请求去重、提供商健康状态、跨源故障转移和最近 7 天的持久
缓存。在线源均失败或处于离线状态时回退到本地数据，展示组件不直接拼装第三方请求。

相关模块：

- `src/components/MotivationalQuote/`：语录展示。
- `src/components/QuoteChannelManager/`：频道管理。
- `src/services/quotes/`：频道注册表、在线服务适配器、获取编排与运行时缓存。
- `src/types/quote.ts`：统一语录、频道和提供商类型。
- `src/data/quotes*.json`：内置语录数据。
- `src/utils/appSettings.ts`：频道偏好和刷新设置的版本化持久化与迁移。
- `src/contexts/AppContext.tsx`：语录频道和刷新设置状态。

## 设置、公告与引导

设置面板按 section 拆分，公告和新手引导通过本地状态控制展示时机。

相关模块：

- `src/components/SettingsPanel/`：设置面板和分区。
- `src/components/AnnouncementModal/`：公告、更新日志和反馈弹窗。
- `src/utils/announcementStorage.ts`：公告展示频率和版本逻辑。
- `src/utils/tour.ts`：新手引导状态和事件。
- `public/docs/announcement.md`、`public/docs/changelog.md`：公告和更新日志内容。

## 通用 UI 与基础设施

- `src/ui/`：通用组件库，包含表单、弹窗、下拉菜单和设置专用组件。
- `src/ui/icons/`：语义图标注册表和唯一 Lucide 入口；业务组件只使用 `AppIconName`。
- [图标系统](icon-system.md)：图标命名、尺寸、颜色、交互和无障碍规范。
- `src/utils/logger.ts`：日志封装，避免直接使用 `console.log`。
- `src/utils/errorCenter.ts`：错误提示模式控制。
