# 测试地图（Testing Map）

## 运行入口

- 类型检查：`npm run typecheck`
- 业务样式边界与硬编码颜色检查：`npm run lint:styles`
- 公共组件与 DesignSystem Catalog 测试：`npm run test:ui`
- UI 完整门禁（类型、ESLint、Stylelint、UI Vitest）：`npm run check:ui`
- 单元测试：`npm run test`
- 单测 + 覆盖率：`npm run test:coverage`
- 端到端测试：`npm run test:e2e`
  - 默认使用系统 Edge（项目：`msedge`），不自动下载 Playwright 浏览器
  - 如需运行 Playwright 自带浏览器：设置 `PW_BUNDLED_BROWSERS=1` 后再运行 `npm run test:e2e`（会执行 `playwright install`）

## Vitest（单元测试）

### 配置

- Vitest 配置：[vitest.config.ts](file:///d:/Desktop/Immersive-clock/vitest.config.ts)
- 统一 setup（jest-dom、cleanup、matchMedia polyfill）：[setupTests.ts](file:///d:/Desktop/Immersive-clock/src/setupTests.ts)

### 覆盖范围（按模块）

- **设置/持久化**
  - AppSettings 深合并、局部更新、v3→v4 进度背景迁移、v4→v5 分钟降水弹窗字段清理且不改轮播配置、v5→v6 天气调度迁移、v6→v7 天气小时请求上限迁移及 `custom`/`safety` 嵌套保存、信息 3–30 秒间隔/重复来源/20 条有效上限/一次性迁移提示、重置时保留自定义消息：[appSettings.test.ts](file:///d:/Desktop/Immersive-clock/src/utils/__tests__/appSettings.test.ts) → [appSettings.ts](file:///d:/Desktop/Immersive-clock/src/utils/appSettings.ts) / [storageInitializer.ts](file:///d:/Desktop/Immersive-clock/src/utils/storageInitializer.ts)
  - 进度与提示信息统一添加、恢复、配置、跨类型排序、逐项背景进度、配置项复用公共 Dropdown、自定义文案删除、自动轮播间隔、统一草稿保存和 20 条上限：`src/components/SettingsPanel/sections/__tests__/BasicSettingsPanel.test.tsx` → `src/components/SettingsPanel/sections/BasicSettingsPanel.tsx`
  - 外观默认值、继承优先级、v1 迁移、非法值规范化与 CSS 编译：`src/utils/__tests__/appearanceModel.test.ts` → `src/utils/appearanceModel.ts`
  - 外观实时预览、取消回滚与单次持久化提交：`src/contexts/__tests__/AppearanceContext.test.tsx` → `src/contexts/AppearanceContext.tsx`
  - 外观应用范围、字体视觉角色、资源目录交互与 SettingsShell 顶层 `FormSection` 的 plain 表面契约：`src/components/SettingsPanel/__tests__/AppearanceSettingsPanel.test.tsx` → `src/components/SettingsPanel/sections/AppearanceSettingsPanel.tsx`
  - 外观“整体样式/时间显示/顶部信息栏”导航、时间与信息栏分段选择、默认今日进度预览及其无障碍名称、正式展示层复用、按当前组件区域自适应取景、栏体四边等距框选、事件倒计时独立框选层与防裁剪、噪音状态样例、语录 `QuoteReveal` 结构、秒表预览静态可见性、对象与属性恢复、状态样式、倒计时指定事件、背景来源切换与刷新持久化：`src/components/SettingsPanel/__tests__/AppearanceSettingsPanel.test.tsx` + `src/ui/components/__tests__/Tabs.test.tsx` + `tests/e2e/settings-motion.e2e.spec.ts` + `tests/e2e/settings-persistence.e2e.spec.ts` + `tests/e2e/visual-regression.e2e.spec.ts`
  - 启动初始化与通用 legacy 键清理：[storageInitializer.legacyCleanup.test.ts](file:///d:/Desktop/Immersive-clock/src/utils/__tests__/storageInitializer.legacyCleanup.test.ts) → [storageInitializer.ts](file:///d:/Desktop/Immersive-clock/src/utils/storageInitializer.ts)
  - 课程表时间解析、排序、重叠校验与智能新增：[studyScheduleValidation.test.ts](file:///d:/Desktop/Immersive-clock/src/utils/__tests__/studyScheduleValidation.test.ts) → [studyScheduleValidation.ts](file:///d:/Desktop/Immersive-clock/src/utils/studyScheduleValidation.ts)
  - legacy 课程表迁移、已保存课表保护与旧键清理：[storageInitializer.studyScheduleMigration.test.ts](file:///d:/Desktop/Immersive-clock/src/utils/__tests__/storageInitializer.studyScheduleMigration.test.ts) → [storageInitializer.ts](file:///d:/Desktop/Immersive-clock/src/utils/storageInitializer.ts)
- 同时解析今日 24 小时与课时/课间进度快照、分时问候、午夜重置、课时空态、信息与背景原子切换及设置保存事件先于持久化时的下一任务重读：`src/components/StudyStatus/__tests__/StudyStatus.test.tsx` → `src/components/StudyStatus/StudyStatus.tsx` / `src/components/StudyStatus/dayGreeting.ts`
  - 下一课时常规显示及 15/5 分钟提级、降雨 120 分钟显示边界与 30/10 分钟优先级、跨开始边界即时切换与阶段播报、20 条信号上限、critical 单次打断后加入完整轮播、多信号轮换/过期恢复、新到 timely 下一条显示、稳定计时器、稳定键切换动画与倒计时不重播、悬停/聚焦/页面隐藏暂停、减少动态效果、手动切换、单条非按钮、空队列和独立 live region：`src/components/StudyStatus/__tests__/studyInfoSignals.test.tsx` → `src/components/StudyStatus/studyInfoSignals.ts` / `src/components/StudyStatus/useStudyInfoCarousel.ts` / `src/components/StudyStatus/StudyStatusPresentation.tsx`
  - 设置分组折叠与记忆、语录子页顺序与焦点、紧凑导航 presence/不可交互退出态、跨分组草稿常驻、访问后懒挂载、统一保存/取消、退出帧内容保持及快速重开草稿重置：[SettingsPanel.test.tsx](file:///d:/Desktop/Immersive-clock/src/components/SettingsPanel/__tests__/SettingsPanel.test.tsx) → [SettingsPanel.tsx](file:///d:/Desktop/Immersive-clock/src/components/SettingsPanel/SettingsPanel.tsx)
  - 项目信息中的版本、授权及服务与隐私说明：[AboutSettingsPanel.test.tsx](file:///d:/Desktop/Immersive-clock/src/components/SettingsPanel/__tests__/AboutSettingsPanel.test.tsx) → [AboutSettingsPanel.tsx](file:///d:/Desktop/Immersive-clock/src/components/SettingsPanel/sections/AboutSettingsPanel.tsx)
  - 数据域检查、完整/精简备份、旧格式迁移与语录动效归一化、预检拒绝、恢复回滚、白名单清理、偏好重置与全部删除边界：`src/services/__tests__/dataManagement.test.ts` → `src/services/dataManagement.ts`
  - 数据概览、默认备份范围、文件预检、选择性恢复、分类清理、失败反馈与刷新请求：`src/components/SettingsPanel/__tests__/DataSettingsPanel.test.tsx` → `src/components/SettingsPanel/sections/DataSettingsPanel.tsx`
- **语录**
  - 三提供商成功、空/坏响应、超时、取消、429、5xx、来源格式化与一言线路切换：`src/services/quotes/__tests__/providers.test.ts` → `src/services/quotes/providers/`
  - 加权选源、手动联网优先、跨服务降级、单飞与本地兜底：`src/services/quotes/__tests__/quoteService.test.ts` → `src/services/quotes/quoteService.ts`
  - 7 天缓存/最近记录、独立冷却、跨源去重、运行时版本迁移与顺序游标：`src/services/quotes/__tests__/runtimeStorage.test.ts` → `src/services/quotes/runtimeStorage.ts`
  - 内置频道注册、偏好覆盖和自定义频道序列化：`src/services/quotes/__tests__/quoteRegistry.test.ts` → `src/services/quotes/quoteRegistry.ts`
  - 首次有效远程替换、配置变化、自动/手动刷新、latest-wins 与卸载取消：`src/hooks/__tests__/useQuoteRotation.test.ts` → `src/hooks/useQuoteRotation.ts`
  - 三种出现动画、自然打字节奏与字素完整性、换句回删和减少动态效果、设置页选项语义/预览/完整草稿保存、频道启停与权重草稿及重载持久化、一言 12 分类选择和展开控件语义状态、1440/720/390 响应式几何与桌面/移动视觉基线：`src/components/MotivationalQuote/__tests__/QuoteReveal.test.tsx` + `src/components/MotivationalQuote/__tests__/MotivationalQuote.test.tsx` + `src/components/SettingsPanel/sections/__tests__/ContentSettingsPanel.test.tsx` + `src/components/QuoteChannelManager/__tests__/QuoteChannelManager.test.tsx` + `tests/e2e/quotes.e2e.spec.ts` + `tests/e2e/visual-regression.e2e.spec.ts`
- **天气**
  - 天气服务主流程、单次 `/weather/all` 请求、当前/指数/AQI/污染物/逐时逐日/昨日/前一小时/预警防御与图片/台风/技术元数据的完整归一化，以及原始响应保留：[weatherService.flow.test.ts](file:///d:/Desktop/Immersive-clock/src/services/__tests__/weatherService.flow.test.ts) + [weatherService.test.ts](file:///d:/Desktop/Immersive-clock/src/services/__tests__/weatherService.test.ts) → [weatherService.ts](file:///d:/Desktop/Immersive-clock/src/services/weatherService.ts)
  - 同设备协调器的单计时器、新鲜度、前后台、离线恢复、单实例并发复用、手动保护期排队、跨标签页缓存重读、内嵌分钟优先/无效回退、降雨间隔及 1/2/5/10 分钟退避：`src/services/__tests__/weatherCoordinator.test.ts` + `src/services/__tests__/weatherSyncChannel.test.ts` → `src/services/weatherCoordinator.ts` / `src/services/weatherSyncChannel.ts`
  - 保守/均衡/高频预设、自定义范围、部署默认值、v5 迁移，以及 Web Locks 优先与本地租约回退的同设备原子请求、全量/分钟/城市解析端点硬间隔、滚动小时上限、429 `Retry-After`、403 冷却、固定同源请求地址和 Electron 正式包上游路径约束：`src/utils/__tests__/weatherSchedule.test.ts` + `src/services/__tests__/weatherRequestGuard.test.ts` + `src/services/__tests__/weatherCrossTabLock.test.ts` + `src/services/__tests__/xiaomiWeatherClient.test.ts` + `src/services/__tests__/xiaomiWeatherProxy.test.ts` + `src/services/__tests__/httpClient.test.ts` → `src/utils/weatherSchedule.ts` / `src/services/weatherRequestGuard.ts` / `src/services/weatherCrossTabLock.ts` / `src/services/xiaomiWeatherClient.ts` / `src/services/httpClient.ts` / `electron/xiaomiWeatherProxy.ts`
  - 分钟降水真实 `fxTime`、供应商间隔/概率/状态/原始响应适配，以及缺失服务端时间时不伪造时间轴：`src/services/__tests__/weatherService.minutely.test.ts` → `src/services/weatherService.ts`
  - 顶部天气与设置页共享刷新、并发单飞、完整详情缓存，以及成功/失败 `weatherRefreshDone` 事件：`src/services/__tests__/weatherRefresh.test.ts` → `src/services/weatherRefresh.ts`
  - 1 分钟与非固定时间槽、正在下雨/雨停/多段降雨/无明确结束点、过期窗口、分钟响应状态与样本有效性：`src/utils/__tests__/minutelyPrecipLogic.test.ts` → `src/utils/minutelyPrecipLogic.ts`
  - 共享分钟天气快照只做 30 秒倒计时和阶段重算且不访问网络，隐藏 Weather 后由 StudyStatus 继续订阅；天气数据七标签、固定空字段、零值、全部预报记录、污染物、预警、原始 JSON、调度档位与嵌套保存、独立刷新、请求保护/冷却/失败使用缓存状态和失败保留旧数据：`src/services/__tests__/minutelyWeatherRuntime.test.ts` + `src/services/__tests__/weatherCoordinator.test.ts` + `src/components/SettingsPanel/sections/__tests__/WeatherSettingsPanel.test.tsx` + `src/components/Weather/__tests__/Weather.test.tsx` + `src/components/StudyStatus/__tests__/StudyStatus.test.tsx` + `tests/e2e/study-smoke.e2e.spec.ts` → `src/services/minutelyWeatherRuntime.ts` / `src/hooks/useMinutelyWeatherSnapshot.ts` / `src/components/SettingsPanel/sections/WeatherSettingsPanel.tsx` / `src/components/SettingsPanel/sections/WeatherLivePanel.tsx`
  - 天气网络调用边界、旧独立请求包装函数不再导出，并确保生产代码只能通过协调器允许的内部调用链访问小米天气接口：`src/services/__tests__/weatherCoordinator.boundary.test.ts` → `src/services/weatherCoordinator.ts` / `src/services/weatherRefresh.ts` / `src/services/weatherService.ts` / `src/services/locationService.ts` / `src/services/xiaomiWeatherClient.ts`
  - 天气文本的昼夜代码映射、原天气图片资源地址、图片节点渲染及单字描述：`src/components/Weather/__tests__/weatherDisplay.test.ts` + `src/components/Weather/__tests__/WeatherPresentation.test.tsx` → `src/components/Weather/weatherDisplay.ts` / `src/components/Weather/WeatherPresentation.tsx`
  - 天气缓存（TTL/合并/清理）、完整详情坐标匹配、旧缓存兼容、分钟原始响应与跨坐标元数据隔离，以及小米 `locationKey` 24 小时复用：[weatherStorage.test.ts](file:///d:/Desktop/Immersive-clock/src/utils/__tests__/weatherStorage.test.ts) → [weatherStorage.ts](file:///d:/Desktop/Immersive-clock/src/utils/weatherStorage.ts)
  - 预警筛选、签名与顶部关键信息提炼（相对时段按发布时间/生效时间换算为绝对结束时刻、缺少锚点时移除相对时间、跨日范围、多区域多量级择取最高风险、局地极值和防范建议回退）：[weatherAlert.test.ts](file:///d:/Desktop/Immersive-clock/src/utils/__tests__/weatherAlert.test.ts) → [weatherAlert.ts](file:///d:/Desktop/Immersive-clock/src/utils/weatherAlert.ts)
  - 共享天气预警快照只接收全量天气注入并做等级/发布时间排序、去重和过期清理，明确不再自行定位或请求；隐藏 Weather 后独立订阅、多预警“标题 + 关键风险摘要”普通轮播与原弹窗站点去重：`src/services/__tests__/weatherAlertRuntime.test.ts` + `src/components/StudyStatus/__tests__/studyInfoSignals.test.tsx` + `src/components/StudyStatus/__tests__/StudyStatus.test.tsx` + `src/components/Weather/__tests__/Weather.test.tsx` + `tests/e2e/study-smoke.e2e.spec.ts` → `src/services/weatherAlertRuntime.ts` / `src/hooks/useWeatherAlertSnapshot.ts` / `src/components/StudyStatus/StudyStatus.tsx` / `src/components/Weather/Weather.tsx`
- **时间同步**
  - 时间源测量与中位数聚合：[timeSync.test.ts](file:///d:/Desktop/Immersive-clock/src/utils/__tests__/timeSync.test.ts) → [timeSync.ts](file:///d:/Desktop/Immersive-clock/src/utils/timeSync.ts)
  - NTP 客户端（mock dns/dgram）：[ntpClient.test.ts](file:///d:/Desktop/Immersive-clock/src/utils/__tests__/ntpClient.test.ts) → [ntpClient.ts](file:///d:/Desktop/Immersive-clock/src/utils/ntpClient.ts)
- **噪音**
  - 实时监控通过公共折线图渲染高频样本、当前值和警戒线：`src/components/NoiseSettings/__tests__/RealTimeNoiseChart.test.tsx` → `src/components/NoiseSettings/RealTimeNoiseChart.tsx`
  - 噪音切片 IndexedDB 幂等迁移、事务失败回退、索引读写、保留期限、原子替换、元数据与事件通知：[noiseSliceService.test.ts](file:///d:/Desktop/Immersive-clock/src/utils/__tests__/noiseSliceService.test.ts) → [noiseSliceService.ts](file:///d:/Desktop/Immersive-clock/src/utils/noiseSliceService.ts) / [db.ts](file:///d:/Desktop/Immersive-clock/src/utils/db.ts)
  - 噪音评分引擎：[noiseScoreEngine.test.ts](file:///d:/Desktop/Immersive-clock/src/utils/__tests__/noiseScoreEngine.test.ts) → [noiseScoreEngine.ts](file:///d:/Desktop/Immersive-clock/src/utils/noiseScoreEngine.ts)
  - 噪音历史构建：[noiseHistoryBuilder.test.ts](file:///d:/Desktop/Immersive-clock/src/utils/__tests__/noiseHistoryBuilder.test.ts) → [noiseHistoryBuilder.ts](file:///d:/Desktop/Immersive-clock/src/utils/noiseHistoryBuilder.ts)
  - 噪音报告单图/三图切换、主图评分与事件叠加层、可访问图表数量和偏好持久化：`src/components/NoiseReportModal/__tests__/NoiseReportModal.test.tsx` → `src/components/NoiseReportModal/NoiseReportModal.tsx`
- **公告**
  - 公告隐藏一周逻辑/版本强制显示：[announcementStorage.test.ts](file:///d:/Desktop/Immersive-clock/src/utils/__tests__/announcementStorage.test.ts) → [announcementStorage.ts](file:///d:/Desktop/Immersive-clock/src/utils/announcementStorage.ts)
- **通用**
  - UI Catalog 的 45 个运行时公共导出精确匹配、登记唯一性、示例 ID、必需状态双向精确覆盖、公开联合类型穷尽映射及非视觉基础设施关系：`src/pages/DesignSystem/__tests__/componentCatalog.test.tsx` → `src/pages/DesignSystem/componentCatalog.tsx` / `src/ui/index.ts`
  - 公共折线图的无障碍名称与描述、阈值、面积、断点、多序列、附加柱层、图例和空态：`src/ui/components/__tests__/Chart.test.tsx` → `src/ui/components/Chart.tsx`
  - 语义图标注册表全量渲染、尺寸令牌、`currentColor`、固定描边和装饰性无障碍属性：`src/ui/icons/__tests__/AppIcon.test.tsx` → `src/ui/icons/AppIcon.tsx` / `src/ui/icons/appIconRegistry.ts`
  - Button/IconButton 语义图标槽、加载态名称、尺寸、危险与极简变体、HUD hover 颜色稳定与柔和放大反馈、透明文字命令及 `aria-pressed`：`src/ui/components/__tests__/Actions.test.tsx` → `src/ui/components/Button.tsx` / `src/ui/components/IconButton.tsx`
  - 日志封装：[logger.test.ts](file:///d:/Desktop/Immersive-clock/src/utils/__tests__/logger.test.ts) → [logger.ts](file:///d:/Desktop/Immersive-clock/src/utils/logger.ts)
  - 时间格式化工具：[formatTime.test.ts](file:///d:/Desktop/Immersive-clock/src/utils/__tests__/formatTime.test.ts) → [formatTime.ts](file:///d:/Desktop/Immersive-clock/src/utils/formatTime.ts)
  - Modal Portal UI scope、背景 `inert`、初始焦点、焦点圈定/恢复、`closeOnEscape`、顶层 Escape/遮罩响应与焦点交接、底层 Modal 的 `inert`/`aria-hidden`、嵌套与同级浮层栈、Dropdown 层级、左侧抽屉 placement，以及正文/底栏密度、分隔线与表面状态：[Modal.test.tsx](file:///d:/Desktop/Immersive-clock/src/ui/components/__tests__/Modal.test.tsx) → [Modal.tsx](file:///d:/Desktop/Immersive-clock/src/ui/components/Modal.tsx) / [overlayStack.ts](file:///d:/Desktop/Immersive-clock/src/ui/utils/overlayStack.ts) / [Dropdown.tsx](file:///d:/Desktop/Immersive-clock/src/ui/components/Dropdown.tsx)
  - Dropdown 的受控/非受控选择、ghost 状态、显式菜单宽度、上下翻转、视口钳制、Escape 焦点恢复及外部点击焦点保留：`src/ui/components/__tests__/Dropdown.test.tsx` → `src/ui/components/Dropdown.tsx`
  - RadioGroup 的受控回写、segmented/list 结构、禁用与错误状态：`src/ui/components/__tests__/RadioGroup.test.tsx` → `src/ui/components/RadioGroup.tsx`
  - Popover/Menu 的上下翻转、四边钳制、动态尺寸重定位，以及 Tooltip 长文本的窄屏水平钳制：`src/ui/components/__tests__/Popover.test.tsx` + `src/ui/components/__tests__/Tooltip.test.tsx` → `src/ui/components/Popover.tsx` / `src/ui/components/Tooltip.tsx`
  - SettingsShell 分组展开、每组最近条目、紧凑 rail/子菜单、遮罩、Escape 焦点恢复、drawer variant 和减少动态效果：`src/ui/components/__tests__/SettingsShell.test.tsx` → `src/ui/components/SettingsShell.tsx`
  - Tabs 可访问属性、禁用态、roving tabindex、左右键与 Home/End 键盘导航，以及 announcement/sticky/static 布局状态：[Tabs.test.tsx](file:///d:/Desktop/Immersive-clock/src/ui/components/__tests__/Tabs.test.tsx) → [Tabs.tsx](file:///d:/Desktop/Immersive-clock/src/ui/components/Tabs.tsx)
  - Feedback/Toast/Confirm：三条可见队列、Portal scope、悬停/聚焦续时、同 ID 原位更新并重置计时、带操作通知常驻、手动关闭、异步确认结果与安全操作初始焦点：[Feedback.test.tsx](file:///d:/Desktop/Immersive-clock/src/ui/components/__tests__/Feedback.test.tsx) → [Feedback.tsx](file:///d:/Desktop/Immersive-clock/src/ui/components/Feedback.tsx) / [ToastViewport.tsx](file:///d:/Desktop/Immersive-clock/src/ui/components/ToastViewport.tsx) / [ConfirmDialog.tsx](file:///d:/Desktop/Immersive-clock/src/ui/components/ConfirmDialog.tsx)
  - UI 基础契约：`FormSection variant="plain"`、`Card` 基础/抬高表面、危险 Toast 的 `role="alert"`、通用 Portal UI scope：[Foundation.test.tsx](file:///d:/Desktop/Immersive-clock/src/ui/components/__tests__/Foundation.test.tsx) → [Card.tsx](file:///d:/Desktop/Immersive-clock/src/ui/components/Card.tsx) / [FormComponents.tsx](file:///d:/Desktop/Immersive-clock/src/ui/components/FormComponents.tsx) / [Toast.tsx](file:///d:/Desktop/Immersive-clock/src/ui/components/Toast.tsx) / [Accessibility.tsx](file:///d:/Desktop/Immersive-clock/src/ui/components/Accessibility.tsx)
  - UI presence 保留时长、显式关闭动效、初始及运行时 `prefers-reduced-motion` 响应：[usePresence.test.tsx](file:///d:/Desktop/Immersive-clock/src/ui/utils/__tests__/usePresence.test.tsx) → [usePresence.ts](file:///d:/Desktop/Immersive-clock/src/ui/utils/usePresence.ts)
  - `messagePopup:open/close` 协议到统一 Toast 视口的投递、主题强调色与关闭：[messagePopupEvents.test.tsx](file:///d:/Desktop/Immersive-clock/src/pages/ClockPage/__tests__/messagePopupEvents.test.tsx) → [ClockPage.tsx](file:///d:/Desktop/Immersive-clock/src/pages/ClockPage/ClockPage.tsx)
  - 旧 `MessagePopup` 适配器的语义图标、降温提醒信息态、剩余时长续时与带操作常驻：[MessagePopup.test.tsx](file:///d:/Desktop/Immersive-clock/src/components/MessagePopup/__tests__/MessagePopup.test.tsx) → [MessagePopup.tsx](file:///d:/Desktop/Immersive-clock/src/components/MessagePopup/MessagePopup.tsx)
  - UI 动效与浮层 presence：[motion.test.tsx](file:///d:/Desktop/Immersive-clock/src/ui/components/__tests__/motion.test.tsx) + [usePresence.test.tsx](file:///d:/Desktop/Immersive-clock/src/ui/utils/__tests__/usePresence.test.tsx) → [Modal.tsx](file:///d:/Desktop/Immersive-clock/src/ui/components/Modal.tsx) / [Dropdown.tsx](file:///d:/Desktop/Immersive-clock/src/ui/components/Dropdown.tsx) / [Popover.tsx](file:///d:/Desktop/Immersive-clock/src/ui/components/Popover.tsx) / [usePresence.ts](file:///d:/Desktop/Immersive-clock/src/ui/utils/usePresence.ts)
  - 新手指引（守卫/完成事件）：[tourGuards.test.ts](file:///d:/Desktop/Immersive-clock/src/utils/__tests__/tourGuards.test.ts) + [tourFocus.test.ts](file:///d:/Desktop/Immersive-clock/src/utils/__tests__/tourFocus.test.ts) → [tour.ts](file:///d:/Desktop/Immersive-clock/src/utils/tour.ts)

## Playwright（端到端测试）

### 配置

- Playwright 配置：[playwright.config.ts](file:///d:/Desktop/Immersive-clock/playwright.config.ts)
- 启动弹窗/新手引导关闭与 HUD 显示工具：[e2eUtils.ts](file:///d:/Desktop/Immersive-clock/tests/e2e/e2eUtils.ts)

### 用例（关键用户路径）

- 首页加载 smoke：[clock.e2e.spec.ts](file:///d:/Desktop/Immersive-clock/tests/e2e/clock.e2e.spec.ts)
- 模式切换回归（四模式可见、URL 同步/直达）：[mode-switch.e2e.spec.ts](file:///d:/Desktop/Immersive-clock/tests/e2e/mode-switch.e2e.spec.ts)
- 倒计时弹窗选择 10 分钟预设、确认、开始/暂停/重置，以及 320×568 末项与固定底栏几何避让：[countdown.e2e.spec.ts](file:///d:/Desktop/Immersive-clock/tests/e2e/countdown.e2e.spec.ts)
- 秒表开始/暂停/重置：[stopwatch.e2e.spec.ts](file:///d:/Desktop/Immersive-clock/tests/e2e/stopwatch.e2e.spec.ts)
- 自习模式入口、顶部进度与信息自定义文案保存即时生效/取消/重载、隐藏天气后的降雨与逐条天气预警、预警不打断、降雨打断后恢复轮播、降雨开始边界秒级切换、正常与减少动态效果下的轮播切换，以及 1440px/390px 长文案省略、三列无重叠、状态栏高度稳定和无横向溢出：[study-smoke.e2e.spec.ts](file:///d:/Desktop/Immersive-clock/tests/e2e/study-smoke.e2e.spec.ts)
- 三语录服务拦截、主/备用及跨源切换、全失败/断网本地兜底、频道启停/权重、显示效果与回删开关持久化、1440/720/390 频道卡控件和展开区不溢出/不重叠、主界面动画及动态减少动效：`tests/e2e/quotes.e2e.spec.ts`
- 数据中心完整备份下载、缓存白名单清理、无效文件零写入预检，以及 320/390/1440 视口下文件控件与横向溢出：`tests/e2e/data-management.e2e.spec.ts`
- 设置分组导航、环境提醒收敛为“噪音监测 / 天气服务 / 定位服务”、三个领域的内容隔离与长页面滚动复位、进度与提示信息统一列表、天气预警独立添加/取消/背景进度持久化、天气独立显示、分钟降水弹窗移除、天气调度档位与七标签实时详情、v4→v6 配置保持、1440×900/390×844/320×568 标签横向滚动、表格局部滚动、无页面溢出与控制台无错误、遮罩不可关闭、移动全屏纵向紧凑导航与当前项滚动，以及目标年份、错误中心和内联课程表的统一保存/取消：[settings-persistence.e2e.spec.ts](file:///d:/Desktop/Immersive-clock/tests/e2e/settings-persistence.e2e.spec.ts)
- 同一浏览器上下文双标签页并发启动时只发出一次 `/weather/all`，复用 24 小时 `locationKey`，不额外请求城市解析或独立分钟接口，并通过跨标签页事件重读共享缓存：`tests/e2e/weather-coordination.e2e.spec.ts`
- 设置抽屉进出轨迹、页面标题到分组和设置项的入场顺序、条件内容进入、移动子菜单 presence、横向溢出和浏览器减少动效行为：[settings-motion.e2e.spec.ts](file:///d:/Desktop/Immersive-clock/tests/e2e/settings-motion.e2e.spec.ts)
- 公告 320px Tabs/问卷边界/底栏说明，噪音历史折叠与字段错误、报告空态/有数据态、SVG 可访问描述，以及 Toast 右下角定位/底栏避让/Modal 层级：[modal-redesign.e2e.spec.ts](file:///d:/Desktop/Immersive-clock/tests/e2e/modal-redesign.e2e.spec.ts)
- 固定时间、禁用动效的设置与外观编辑器三视口快照、语录渠道桌面/移动快照、默认/纯黑/自定义主背景快照，以及主界面和自习页图标在 1440px/390px/320px 的视觉基线、左下角指引按钮视口边界、极简 HUD hover 放大/颜色稳定性与版本号透明 hover 表面：[visual-regression.e2e.spec.ts](file:///d:/Desktop/Immersive-clock/tests/e2e/visual-regression.e2e.spec.ts)
- DesignSystem Catalog 各 section、浮层固定打开态及 `1440×900`、`390×844`、`320×568` 的 Windows Edge 串行视觉基线：`tests/e2e/design-system-visual.e2e.spec.ts`

## UI 治理门禁

- ESLint 禁止全部非测试业务 TSX 新增原生公共控件、直接导入 `lucide-react` 或深层导入任意
  `src/ui/**` 子路径；仅 `src/ui` 实现、测试夹具和 Catalog 对
  `src/ui/icons/appIconRegistry` 的精确导入不受对应限制。
- UI governance 契约测试精确锁定两处带说明的原生按钮例外、唯一 Catalog 深层导入，并用
  ESLint 配置探针覆盖 App、components、contexts、hooks、pages、组件库与测试范围：
  `src/ui/__tests__/uiGovernance.test.ts` → `eslint.config.cjs`。
- Stylelint 禁止业务 CSS 通过 `[data-ui-*]`、`[aria-*]` 或 `[role]` 重绘公共组件，并禁止
  未登记文件新增命名色或其他硬编码颜色。领域数据色与第三方适配例外逐文件记录在
  `stylelint.config.cjs`，路径与原因记录在 `docs/wiki/development.md`。
- CI 的 Linux 门禁先运行类型检查、Stylelint、UI Catalog 测试，再运行常规 ESLint 与全部
  Vitest；独立 Windows job 使用系统 Edge 执行 DesignSystem 视觉测试并在失败时上传诊断。

## 当前缺口（弹层重设计）

- **倒计时步进器**：预设、计时生命周期与小屏几何已有 E2E；尚无三列步进器的键盘连按边界测试。
- **噪音响应式布局**：历史折叠、字段错误和报告空/有数据态已有 E2E；桌面表格到移动条目的 CSS 断点仍主要由人工验收覆盖。
- **课程表高级操作**：真实编辑、保存/取消、校验与迁移已有覆盖；Excel 导入和重置确认尚无浏览器 E2E。
