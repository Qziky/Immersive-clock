# 测试地图（Testing Map）

## 运行入口

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
  - AppSettings 深合并与局部更新：[appSettings.test.ts](file:///d:/Desktop/Immersive-clock/src/utils/__tests__/appSettings.test.ts) → [appSettings.ts](file:///d:/Desktop/Immersive-clock/src/utils/appSettings.ts)
  - 外观默认值、继承优先级、v1 迁移、非法值规范化与 CSS 编译：`src/utils/__tests__/appearanceModel.test.ts` → `src/utils/appearanceModel.ts`
  - 外观实时预览、取消回滚与单次持久化提交：`src/contexts/__tests__/AppearanceContext.test.tsx` → `src/contexts/AppearanceContext.tsx`
  - 外观应用范围、字体视觉角色与资源目录交互：`src/components/SettingsPanel/__tests__/AppearanceSettingsPanel.test.tsx` → `src/components/SettingsPanel/sections/AppearanceSettingsPanel.tsx`
- 外观“整体样式/时间显示”导航、时间显示分段选择、正式展示层复用、按当前组件区域自适应取景、噪音状态样例、语录 `QuoteReveal` 结构、秒表预览静态可见性、对象与属性恢复、状态样式、倒计时指定事件、背景来源切换与刷新持久化：`src/components/SettingsPanel/__tests__/AppearanceSettingsPanel.test.tsx` + `src/ui/components/__tests__/Tabs.test.tsx` + `tests/e2e/settings-motion.e2e.spec.ts` + `tests/e2e/settings-persistence.e2e.spec.ts` + `tests/e2e/visual-regression.e2e.spec.ts`
  - 启动初始化与通用 legacy 键清理：[storageInitializer.legacyCleanup.test.ts](file:///d:/Desktop/Immersive-clock/src/utils/__tests__/storageInitializer.legacyCleanup.test.ts) → [storageInitializer.ts](file:///d:/Desktop/Immersive-clock/src/utils/storageInitializer.ts)
  - 课程表时间解析、排序、重叠校验与智能新增：[studyScheduleValidation.test.ts](file:///d:/Desktop/Immersive-clock/src/utils/__tests__/studyScheduleValidation.test.ts) → [studyScheduleValidation.ts](file:///d:/Desktop/Immersive-clock/src/utils/studyScheduleValidation.ts)
  - legacy 课程表迁移、已保存课表保护与旧键清理：[storageInitializer.studyScheduleMigration.test.ts](file:///d:/Desktop/Immersive-clock/src/utils/__tests__/storageInitializer.studyScheduleMigration.test.ts) → [storageInitializer.ts](file:///d:/Desktop/Immersive-clock/src/utils/storageInitializer.ts)
  - 自习课时/课间秒级进度、阶段文案、剩余时间与无轨道圆点状态：`src/components/StudyStatus/__tests__/StudyStatus.test.tsx` → `src/components/StudyStatus/StudyStatus.tsx`
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
  - 三种出现动画、自然打字节奏与字素完整性、减少动态效果、设置页选项语义/预览/完整草稿保存、频道草稿保存、一言 12 分类选择和展开控件语义状态：`src/components/MotivationalQuote/__tests__/QuoteReveal.test.tsx` + `src/components/MotivationalQuote/__tests__/MotivationalQuote.test.tsx` + `src/components/SettingsPanel/sections/__tests__/ContentSettingsPanel.test.tsx` + `src/components/QuoteChannelManager/__tests__/QuoteChannelManager.test.tsx` + `tests/e2e/quotes.e2e.spec.ts`
- **天气**
  - 天气服务主流程与多分支回归：[weatherService.flow.test.ts](file:///d:/Desktop/Immersive-clock/src/services/__tests__/weatherService.flow.test.ts) + [weatherService.test.ts](file:///d:/Desktop/Immersive-clock/src/services/__tests__/weatherService.test.ts) → [weatherService.ts](file:///d:/Desktop/Immersive-clock/src/services/weatherService.ts)
  - 天气文本的昼夜图标映射、正式资源地址与单字描述：`src/components/Weather/__tests__/weatherDisplay.test.ts` → `src/components/Weather/weatherDisplay.ts`
  - 天气缓存（TTL/合并/清理）：[weatherStorage.test.ts](file:///d:/Desktop/Immersive-clock/src/utils/__tests__/weatherStorage.test.ts) → [weatherStorage.ts](file:///d:/Desktop/Immersive-clock/src/utils/weatherStorage.ts)
  - 预警筛选逻辑：[weatherAlert.test.ts](file:///d:/Desktop/Immersive-clock/src/utils/__tests__/weatherAlert.test.ts) → [weatherAlert.ts](file:///d:/Desktop/Immersive-clock/src/utils/weatherAlert.ts)
- **时间同步**
  - 时间源测量与中位数聚合：[timeSync.test.ts](file:///d:/Desktop/Immersive-clock/src/utils/__tests__/timeSync.test.ts) → [timeSync.ts](file:///d:/Desktop/Immersive-clock/src/utils/timeSync.ts)
  - NTP 客户端（mock dns/dgram）：[ntpClient.test.ts](file:///d:/Desktop/Immersive-clock/src/utils/__tests__/ntpClient.test.ts) → [ntpClient.ts](file:///d:/Desktop/Immersive-clock/src/utils/ntpClient.ts)
- **噪音**
  - 噪音切片 IndexedDB 幂等迁移、事务失败回退、索引读写、保留期限、原子替换、元数据与事件通知：[noiseSliceService.test.ts](file:///d:/Desktop/Immersive-clock/src/utils/__tests__/noiseSliceService.test.ts) → [noiseSliceService.ts](file:///d:/Desktop/Immersive-clock/src/utils/noiseSliceService.ts) / [db.ts](file:///d:/Desktop/Immersive-clock/src/utils/db.ts)
  - 噪音评分引擎：[noiseScoreEngine.test.ts](file:///d:/Desktop/Immersive-clock/src/utils/__tests__/noiseScoreEngine.test.ts) → [noiseScoreEngine.ts](file:///d:/Desktop/Immersive-clock/src/utils/noiseScoreEngine.ts)
  - 噪音历史构建：[noiseHistoryBuilder.test.ts](file:///d:/Desktop/Immersive-clock/src/utils/__tests__/noiseHistoryBuilder.test.ts) → [noiseHistoryBuilder.ts](file:///d:/Desktop/Immersive-clock/src/utils/noiseHistoryBuilder.ts)
- **公告**
  - 公告隐藏一周逻辑/版本强制显示：[announcementStorage.test.ts](file:///d:/Desktop/Immersive-clock/src/utils/__tests__/announcementStorage.test.ts) → [announcementStorage.ts](file:///d:/Desktop/Immersive-clock/src/utils/announcementStorage.ts)
- **通用**
  - 日志封装：[logger.test.ts](file:///d:/Desktop/Immersive-clock/src/utils/__tests__/logger.test.ts) → [logger.ts](file:///d:/Desktop/Immersive-clock/src/utils/logger.ts)
  - 时间格式化工具：[formatTime.test.ts](file:///d:/Desktop/Immersive-clock/src/utils/__tests__/formatTime.test.ts) → [formatTime.ts](file:///d:/Desktop/Immersive-clock/src/utils/formatTime.ts)
  - Modal Portal UI scope、背景 `inert`、初始焦点、焦点圈定/恢复、`closeOnEscape`、顶层 Escape/遮罩响应与焦点交接、底层 Modal 的 `inert`/`aria-hidden`、嵌套与同级浮层栈、Dropdown 层级和左侧抽屉 placement：[Modal.test.tsx](file:///d:/Desktop/Immersive-clock/src/ui/components/__tests__/Modal.test.tsx) → [Modal.tsx](file:///d:/Desktop/Immersive-clock/src/ui/components/Modal.tsx) / [overlayStack.ts](file:///d:/Desktop/Immersive-clock/src/ui/utils/overlayStack.ts) / [Dropdown.tsx](file:///d:/Desktop/Immersive-clock/src/ui/components/Dropdown.tsx)
  - Tabs 可访问属性、禁用态、roving tabindex、左右键与 Home/End 键盘导航：[Tabs.test.tsx](file:///d:/Desktop/Immersive-clock/src/ui/components/__tests__/Tabs.test.tsx) → [Tabs.tsx](file:///d:/Desktop/Immersive-clock/src/ui/components/Tabs.tsx)
  - Feedback/Toast/Confirm：三条可见队列、Portal scope、悬停/聚焦续时、同 ID 原位更新并重置计时、带操作通知常驻、手动关闭、异步确认结果与安全操作初始焦点：[Feedback.test.tsx](file:///d:/Desktop/Immersive-clock/src/ui/components/__tests__/Feedback.test.tsx) → [Feedback.tsx](file:///d:/Desktop/Immersive-clock/src/ui/components/Feedback.tsx) / [ToastViewport.tsx](file:///d:/Desktop/Immersive-clock/src/ui/components/ToastViewport.tsx) / [ConfirmDialog.tsx](file:///d:/Desktop/Immersive-clock/src/ui/components/ConfirmDialog.tsx)
  - UI 基础契约：`FormSection variant="plain"`、危险 Toast 的 `role="alert"`、通用 Portal UI scope：[Foundation.test.tsx](file:///d:/Desktop/Immersive-clock/src/ui/components/__tests__/Foundation.test.tsx) → [FormComponents.tsx](file:///d:/Desktop/Immersive-clock/src/ui/components/FormComponents.tsx) / [Toast.tsx](file:///d:/Desktop/Immersive-clock/src/ui/components/Toast.tsx) / [Accessibility.tsx](file:///d:/Desktop/Immersive-clock/src/ui/components/Accessibility.tsx)
  - UI presence 保留时长、显式关闭动效、初始及运行时 `prefers-reduced-motion` 响应：[usePresence.test.tsx](file:///d:/Desktop/Immersive-clock/src/ui/utils/__tests__/usePresence.test.tsx) → [usePresence.ts](file:///d:/Desktop/Immersive-clock/src/ui/utils/usePresence.ts)
  - `messagePopup:open/close` 协议到统一 Toast 视口的投递、主题强调色、关闭，以及分钟级降雨手动关闭/超时会话标记：[messagePopupEvents.test.tsx](file:///d:/Desktop/Immersive-clock/src/pages/ClockPage/__tests__/messagePopupEvents.test.tsx) → [ClockPage.tsx](file:///d:/Desktop/Immersive-clock/src/pages/ClockPage/ClockPage.tsx)
  - 旧 `MessagePopup` 适配器的自定义图标、剩余时长续时与带操作常驻：[MessagePopup.test.tsx](file:///d:/Desktop/Immersive-clock/src/components/MessagePopup/__tests__/MessagePopup.test.tsx) → [MessagePopup.tsx](file:///d:/Desktop/Immersive-clock/src/components/MessagePopup/MessagePopup.tsx)
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
- 自习模式入口可见：[study-smoke.e2e.spec.ts](file:///d:/Desktop/Immersive-clock/tests/e2e/study-smoke.e2e.spec.ts)
- 三语录服务拦截、主/备用及跨源切换、全失败/断网本地兜底、频道与显示效果持久化、移动/桌面设置溢出、主界面动画及动态减少动效：`tests/e2e/quotes.e2e.spec.ts`
- 数据中心完整备份下载、缓存白名单清理、无效文件零写入预检，以及 320/390/1440 视口下文件控件与横向溢出：`tests/e2e/data-management.e2e.spec.ts`
- 设置分组导航、遮罩不可关闭、移动全屏纵向紧凑导航与当前项滚动，以及目标年份、错误中心和内联课程表的统一保存/取消：[settings-persistence.e2e.spec.ts](file:///d:/Desktop/Immersive-clock/tests/e2e/settings-persistence.e2e.spec.ts)
- 设置抽屉进出轨迹、页面标题到分组和设置项的入场顺序、条件内容进入、移动子菜单 presence、横向溢出和浏览器减少动效行为：[settings-motion.e2e.spec.ts](file:///d:/Desktop/Immersive-clock/tests/e2e/settings-motion.e2e.spec.ts)
- 公告 320px Tabs/问卷边界/底栏说明，噪音历史折叠与字段错误、报告空态/有数据态、SVG 可访问描述，以及 Toast 右下角定位/底栏避让/Modal 层级：[modal-redesign.e2e.spec.ts](file:///d:/Desktop/Immersive-clock/tests/e2e/modal-redesign.e2e.spec.ts)
- 固定时间、禁用动效的设置与外观编辑器三视口快照，以及默认/纯黑/自定义主背景快照：[visual-regression.e2e.spec.ts](file:///d:/Desktop/Immersive-clock/tests/e2e/visual-regression.e2e.spec.ts)

## 当前缺口（弹层重设计）

- **倒计时步进器**：预设、计时生命周期与小屏几何已有 E2E；尚无三列步进器的键盘连按边界测试。
- **噪音响应式布局**：历史折叠、字段错误和报告空/有数据态已有 E2E；桌面表格到移动条目的 CSS 断点仍主要由人工验收覆盖。
- **课程表高级操作**：真实编辑、保存/取消、校验与迁移已有覆盖；Excel 导入和重置确认尚无浏览器 E2E。
