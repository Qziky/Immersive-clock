# 测试覆盖地图

本页提供稳定的“行为 → 测试入口 → 实现入口”映射。新增或移动测试时更新对应行；不要写入
带本机盘符的绝对链接。

## 考试模式

| 行为                                                         | 测试入口                                                                  | 实现入口                                                                    |
| ------------------------------------------------------------ | ------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| 九科预设、时间段边界、暂停顺延、休眠跳时、持久化与旧配置补齐 | `src/utils/__tests__/exam.test.ts`                                        | `src/utils/exam.ts`、`src/utils/appSettings.ts`                             |
| 自定义选项、科目输入焦点与时长保留、时长校验、结束时间推算   | `src/components/Exam/__tests__/ExamSettings.test.tsx`                     | `src/components/Exam/ExamSettings.tsx`                                      |
| 暂停冻结、提醒去重、提示音后语音播报、语音不可用回退、提前结束确认 | `src/components/Exam/__tests__/Exam.test.tsx`、`src/hooks/__tests__/useAudio.test.ts` | `src/components/Exam/Exam.tsx`、`src/hooks/useAudio.ts`                     |
| 更多入口导航、公共视口时间舞台与展厅契约                     | `ControlBar.test.tsx`、`TimeStage.test.tsx`、`componentCatalog.test.tsx`  | `ControlBar.tsx`、`src/ui/components/TimeStage.tsx`、`componentCatalog.tsx` |
| 两种考试流程、键盘操作、确认取消、三种视口与主数字稳定       | `tests/e2e/exam.e2e.spec.ts`                                              | `src/components/Exam/`、`ClockPage.tsx`                                     |
| TimeStage 视口布局与考试语义图标视觉基线                     | `tests/e2e/design-system-visual.e2e.spec.ts` 的分区视觉快照               | `/design-system` 的 foundation 分区                                         |
| HUD 按钮主次层级、图标与窄屏布局                             | `Actions.test.tsx`、`design-system-visual.e2e.spec.ts` 的底部操作按钮快照 | `src/ui/components/Button.tsx`、`/design-system` 的 actions 分区            |

## 命令级门禁

| 门禁       | 命令                    | 覆盖                                  |
| ---------- | ----------------------- | ------------------------------------- |
| TypeScript | `npm run typecheck`     | `src/` 类型和声明                     |
| ESLint     | `npm run lint`          | React、Hooks、import 和代码约定       |
| Stylelint  | `npm run lint:styles`   | CSS 令牌、组件所有权和属性选择器边界  |
| UI gate    | `npm run check:ui`      | typecheck + lint + styles + UI Vitest |
| Unit       | `npm run test`          | 全部 Vitest                           |
| Coverage   | `npm run test:coverage` | Vitest 覆盖率报告                     |
| E2E        | `npm run test:e2e`      | Playwright 关键流程                   |

## 单元与组件映射

| 领域               | 主要测试                                                                                                                                                                                                                            | 实现入口                                                                                                                                      |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| AppContext/reducer | `src/contexts/__tests__/AppContext.test.ts`                                                                                                                                                                                         | `src/contexts/AppContext.tsx`                                                                                                                 |
| 外观模型与预览     | `src/utils/__tests__/appearanceModel.test.ts`、`src/contexts/__tests__/AppearanceContext.test.tsx`、`src/components/SettingsPanel/__tests__/AppearanceSettingsPanel.test.tsx`、`tests/e2e/settings-persistence.e2e.spec.ts`         | `src/utils/appearanceModel.ts`、`src/contexts/AppearanceContext.tsx`、`src/components/DynamicBackground`                                      |
| 动态音频会话       | `src/services/__tests__/dynamicBackgroundAudio.test.ts`                                                                                                                                                                             | `src/services/dynamicBackgroundAudio.ts`、`electron/main.ts`                                                                                  |
| Electron 屏幕音频授权 | `src/utils/__tests__/displayCaptureSource.test.ts`（来源选择、取消、无效来源与无名屏幕）                                                                                                                                            | `electron/displayCaptureSource.ts`、`electron/main.ts`                                                                                       |
| 动态视频资源       | `src/utils/__tests__/appearanceAssets.test.ts`、`src/services/__tests__/dataManagement.test.ts`、`tests/e2e/dynamic-background.e2e.spec.ts`（小视频与 160MiB 大视频）                                                               | `src/utils/appearanceAssets.ts`、`src/services/dataManagement.ts`、`src/services/backupWriter.worker.ts`、`src/services/dataBackup.worker.ts` |
| AppSettings        | `src/utils/__tests__/appSettings.test.ts`                                                                                                                                                                                           | `src/utils/appSettings.ts`                                                                                                                    |
| 法律同意与分析     | `src/utils/__tests__/legalConsent.test.ts`、`src/services/__tests__/clarityAnalytics.test.ts`、`src/components/Legal/__tests__/LegalConsentGate.test.tsx`、`AboutSettingsPanel.test.tsx`、`tests/e2e/legal-consent.e2e.spec.ts`     | `src/utils/legalConsent.ts`、`src/components/Legal`、`src/services/clarityAnalytics.ts`                                                       |
| 启动与资源预加载   | `src/App.test.tsx`、`modeLazyLoading.test.tsx`、`resourcePreloading.test.ts`、`src/components/SettingsPanel/__tests__/SettingsPanel.test.tsx`                                                                                       | `main.tsx`、`App.tsx`、`ClockPage/modeComponents.ts`、`SettingsPanel.tsx`                                                                     |
| 权限按需激活       | `src/components/Study/__tests__/Study.test.tsx`、`SettingsPanel.test.tsx`、`StudySettingsPanel.test.tsx`、`WeatherSettingsPanel.test.tsx`、`weatherRuntime.test.ts`                                                                 | `ClockPage.tsx`、`Study.tsx`、`useNoiseStream.ts`、`SettingsPanel.tsx`、`weatherRuntime.ts`                                                   |
| Storage migration  | `src/utils/__tests__/storageInitializer*.test.ts`                                                                                                                                                                                   | `src/utils/storageInitializer.ts`                                                                                                             |
| 数据管理           | `src/services/__tests__/dataManagement.test.ts`                                                                                                                                                                                     | `src/services/dataManagement.ts`                                                                                                              |
| 课表               | `src/utils/__tests__/studyTimetable.test.ts`、`storageInitializer.studyScheduleMigration.test.ts`、`noiseHistoryBuilder.test.ts`、`ScheduleSettings.test.tsx`、`StudyStatus.test.tsx`、`tests/e2e/settings-persistence.e2e.spec.ts` | `src/utils/studyTimetable*.ts`、`src/components/ScheduleSettings`、`StudyStatus`                                                              |
| 时间同步           | `src/utils/__tests__/timeSync.test.ts`、`src/utils/__tests__/ntpClient.test.ts`                                                                                                                                                     | `src/utils/timeSync.ts`、`electron/ntpService/ntpClient.ts`                                                                                   |
| 屏幕常亮           | `keepAwakeRuntime*.test.ts`、`keepAwakeController.test.ts`、`BasicSettingsPanel.test.tsx`                                                                                                                                           | `keepAwakeRuntime.ts`、`keepAwakeController.ts`                                                                                               |
| 模式/计时          | `src/components/Clock/__tests__/Clock.test.tsx`、`src/hooks/__tests__/useTimer.test.ts`、`tests/e2e/countdown.e2e.spec.ts`、`stopwatch.e2e.spec.ts`                                                                                 | `src/components/Clock`、`Countdown`、`Stopwatch`、`src/hooks/useTimer.ts`                                                                     |
| OLED 防烧屏与字号同步 | `src/hooks/__tests__/useOledScreenProtectionController.test.tsx`、`src/components/OledProtection/__tests__/screenSaverMotion.test.ts`、`src/utils/__tests__/appSettings.test.ts`、`src/ui/components/__tests__/TimeStage.test.tsx`、`tests/e2e/oled-screen-protection.e2e.spec.ts` | `src/hooks/useOledScreenProtectionController.ts`、`src/components/OledProtection`、`src/utils/appSettings.ts`                                 |
| 自习状态           | `src/components/Study/__tests__/Study.test.tsx`、`StudyStatus/__tests__/StudyStatus.test.tsx`、`studyInfoSignals.test.tsx`                                                                                                          | `src/components/Study`、`StudyStatus`                                                                                                         |
| 天气适配/流程      | `src/services/__tests__/weatherService*.test.ts`、`xiaomiWeatherClient.test.ts`、`capacitorHttpClient.test.ts`                                                                                                                      | `src/services/weatherService.ts`、`xiaomiWeatherClient.ts`、`capacitorHttpClient.ts`                                                          |
| 天气运行时         | `weatherRuntime*.test.ts`、`minutelyWeatherRuntime.test.ts`、`weatherAlertRuntime.test.ts`、`weatherNotificationRuntime.test.ts`                                                                                                    | `src/services/weatherRuntime.ts` 等                                                                                                           |
| 天气协调           | `weatherCrossTabLock.test.ts`、`weatherSyncChannel.test.ts`、`weatherRequestGuard.test.ts`、`apiGovernance.test.ts`                                                                                                                 | 对应 lock/sync/guard/governance 服务                                                                                                          |
| 天气 UI            | `src/components/Weather/__tests__/Weather*.test.tsx`、`src/components/Weather/__tests__/weatherDisplay.test.ts`                                                                                                                     | `src/components/Weather`                                                                                                                      |
| 噪音特征           | `src/services/noise/__tests__/noiseFeatureExtractor.test.ts`、`noiseCaptureRuntime.test.ts`                                                                                                                                         | `src/services/noise/noiseFeatureExtractor.ts`、`noiseCaptureRuntime.ts`                                                                       |
| 噪音协调/存储      | `noiseCoordinator.test.ts`、`noiseFeatureRepository.test.ts`、`noiseFeatureArchiveService.test.ts`、`noiseDataMaintenance.test.ts`                                                                                                  | `src/services/noise`、`src/utils/db.ts`                                                                                                       |
| 噪音评分           | `src/utils/__tests__/noiseScoreEngine.test.ts`、`noiseReportAggregation.test.ts`、`noiseSliceService.test.ts`                                                                                                                       | `src/utils/noiseScoreEngine.ts` 等                                                                                                            |
| 噪音设备/健康      | `noiseDeviceProfileService.test.ts`、`noiseSignalHealthMonitor.test.ts`、`noiseInputDeviceService.test.ts`                                                                                                                          | 对应 noise service                                                                                                                            |
| 噪音重算           | `noiseRescoreService.test.ts`                                                                                                                                                                                                       | `src/services/noise/noiseRescoreService.ts`、`noiseRescoreCore.ts`                                                                            |
| 噪音 UI            | `NoiseMonitor.test.tsx`、`NoiseReportModal.test.tsx`、`NoiseSettings/RealTimeNoiseChart.test.tsx`                                                                                                                                   | `src/components/Noise*`                                                                                                                       |
| 语录               | `src/services/quotes/__tests__/*.test.ts`、`src/hooks/__tests__/useQuoteRotation.test.ts`、`QuoteChannelManager.test.tsx`、`MotivationalQuote*.test.tsx`、`ContentSettingsPanel.test.tsx`、`appSettings.test.ts` | `src/services/quotes`、`src/components/MotivationalQuote`、`src/components/SettingsPanel/sections/ContentSettingsPanel.tsx`、`src/utils/appSettings.ts` |
| 公告弹窗           | `src/components/AnnouncementModal/__tests__/AnnouncementModal.test.tsx`、`src/utils/__tests__/announcementStorage.test.ts`                                                                                                          | `AnnouncementModal`、`announcementStorage.ts`                                                                                                 |
| 公共 UI            | `src/ui/components/__tests__/*.test.tsx`、`src/ui/icons/__tests__/AppIcon.test.tsx`、`src/ui/__tests__/uiGovernance.test.ts`                                                                                                        | `src/ui`、`src/pages/DesignSystem/componentCatalog.tsx`                                                                                       |
| Clarity 回放可见性 | `src/ui/components/__tests__/SettingsShell.test.tsx`、`src/pages/ClockPage/__tests__/modeLazyLoading.test.tsx`、`src/components/Legal/__tests__/LegalConsentGate.test.tsx`                                                          | `src/ui/components/SettingsShell.tsx`、`src/pages/ClockPage/ClockPage.tsx`、`src/constants/legal.ts`                                          |
| 全屏               | `src/hooks/__tests__/useFullscreen.test.ts`                                                                                                                                                                                         | `src/hooks/useFullscreen.ts`                                                                                                                  |
| 运行平台/PWA       | `src/utils/__tests__/runtimePlatform.test.ts`、`src/components/SettingsPanel/__tests__/AboutSettingsPanel.test.tsx`、`src/components/AuthorInfo/__tests__/AuthorInfo.test.tsx`                                                      | `src/utils/runtimePlatform.ts`、`src/main.tsx`、`AboutSettingsPanel.tsx`、`AuthorInfo.tsx`                                                    |
| SEO/GEO            | `src/utils/seo/__tests__/routeSeo.test.ts`、`src/components/Seo/__tests__/RouteSeo.test.tsx`                                                                                                                                        | `src/utils/seo/routeSeo.ts`、`src/components/Seo/RouteSeo.tsx`、`SeoContent.tsx`                                                              |

应用更新由 `src/__tests__/pwa-register.test.ts`、`src/services/update/__tests__/updateManifest.test.ts`、`updateManifestGeneration.test.ts`、`updateRuntime.test.ts`、
`src/components/UpdateNotice/__tests__/UpdateNotice.test.tsx`、`UpdateSettingsPanel.test.tsx`（含手动检查入口）、
`src/utils/__tests__/electronUpdateManager.test.ts` 和 `appSettings.test.ts` 覆盖；实现入口为
`src/services/update`、`src/components/UpdateNotice`、`UpdateSettingsPanel.tsx`、
`electron/updateManager.ts` 与 `src/utils/appSettings.ts`。

法律同意相关测试同时覆盖静态 HTML 协议正文和法律详情页的按需加载路由。

## E2E 映射

| 流程              | 文件                                                                                          |
| ----------------- | --------------------------------------------------------------------------------------------- |
| 首页与时钟        | `tests/e2e/clock.e2e.spec.ts`                                                                 |
| 动态背景预览/保存 | `tests/e2e/settings-persistence.e2e.spec.ts`（类别切换、取消、刷新恢复及三种窄宽视口）        |
| 动态视频闭环      | `tests/e2e/dynamic-background.e2e.spec.ts`（本地导入、静音/原声、备份恢复、离线播放与大视频） |
| 模式切换          | `tests/e2e/mode-switch.e2e.spec.ts`                                                           |
| 倒计时/秒表       | `tests/e2e/countdown.e2e.spec.ts`、`stopwatch.e2e.spec.ts`                                    |
| OLED 防烧屏与字号同步 | `tests/e2e/oled-screen-protection.e2e.spec.ts`（验证屏保与 150% 中央字号及多视口一致） |
| 自习 smoke        | `tests/e2e/study-smoke.e2e.spec.ts`                                                           |
| 设置持久化/动效   | `tests/e2e/settings-persistence.e2e.spec.ts`、`settings-motion.e2e.spec.ts`                   |
| 数据管理          | `tests/e2e/data-management.e2e.spec.ts`                                                       |
| 语录              | `tests/e2e/quotes.e2e.spec.ts`（在线故障转移、诗泉筛选/署名、设置持久化、三档响应式）         |
| 天气协调          | `tests/e2e/weather-coordination.e2e.spec.ts`（普通首页不启动、自习页按需启动与双标签同步）    |
| 噪音多标签页      | `tests/e2e/noise-multitab.e2e.spec.ts`                                                        |
| 音频诊断/开发者页 | `tests/e2e/audio-debug.e2e.spec.ts`、`developer-pages.e2e.spec.ts`                            |
| UI 视觉           | `tests/e2e/design-system-visual.e2e.spec.ts`、`visual-regression.e2e.spec.ts`                 |
| 弹层与引导        | `modal-redesign.e2e.spec.ts`、`tour-rapid-click.e2e.spec.ts`                                  |
| 公告与发布版本    | `settings-persistence.e2e.spec.ts`、`visual-regression.e2e.spec.ts`                           |
| SEO/GEO           | `tests/e2e/seo.e2e.spec.ts`                                                                   |

## 维护规则

- 新测试文件使用 `*.test.ts(x)`、`*.e2e.spec.ts` 命名并放在最近的领域目录。
- 测试覆盖的是行为/契约；迁移或模型版本变化要在本页和相应专题同时更新。
- 外观背景默认值与预设迁移由 `appearanceModel.test.ts`、`appSettings.test.ts` 和
  `settings-persistence.e2e.spec.ts` 共同覆盖。
- 课程表默认模板及 v17 及更早版本默认值的精准升级由 `studyTimetable.test.ts` 与
  `appSettings.test.ts` 共同覆盖，并验证自定义课表不会被覆盖。
- 单休周期（`rest_count: 1`）的校验、YAML 往返、运行时解析和设置页持久化由
  `studyTimetable.test.ts`、`ScheduleSettings.test.tsx` 与 `settings-persistence.e2e.spec.ts` 覆盖。
- 公共 UI 的 TimeStage 响应式布局、中央时间缩放及 OLED 屏保字号同步由
  `src/ui/components/__tests__/TimeStage.test.tsx` 与 `tests/e2e/oled-screen-protection.e2e.spec.ts` 覆盖。
- 公共浮层的进入、退出和交互隔离由 `src/ui/components/__tests__/motion.test.tsx` 覆盖。
- 倒计时快速设置、自定义时长与持久化由
  `src/components/CountdownModal/__tests__/CountdownModal.test.tsx` 和
  `tests/e2e/countdown.e2e.spec.ts` 覆盖。
- 麦克风异常持续 5 分钟后的显示自动隐藏、设置持久化和运行时同步由
  `NoiseMonitor.test.tsx`、`Study.test.tsx`、`StudySettingsPanel.test.tsx`、
  `noiseControlSettings.test.ts`、`appSettings.test.ts` 与 `noiseStreamService.test.ts` 覆盖。
- 自习倒计时快捷事件由 `BasicSettingsPanel.test.tsx`、`CountdownManagerPanel.test.tsx` 和
  `src/utils/__tests__/countdownEvents.test.ts` 覆盖。
- 若文件移动，优先更新本页相对路径，不保留失效旧链接或本机绝对链接。
- 视觉基线只提交稳定视口和确定数据，临时截图放在 `output/`，不放入知识库。

### 更多模式入口

- `src/components/ControlBar/__tests__/ControlBar.test.tsx`：更多按钮与全屏样式一致、当前模式标记、模式切换回调及关闭后的焦点恢复。
- `src/ui/components/__tests__/Dropdown.test.tsx`：自定义按钮、向上定位、方向键与 Home/End 导航、Escape 关闭。
- 设计系统下拉边界示例提供向上展开的“更多模式”入口。

- 倒计时结束铃声：`CountdownModal.test.tsx` 覆盖固定时长保存、重开持久化、恢复默认的确认/取消，以及无效和超限音频；`appSettings.test.ts` 覆盖旧配置补齐默认铃声字段。

- `design-system-visual.e2e.spec.ts` 紧凑更多菜单：1440×900、390×844、320×568 下的 160px 菜单宽度、紧凑行高、向上定位及视觉基线。
