# 测试覆盖地图

本页提供稳定的“行为 → 测试入口 → 实现入口”映射。新增或移动测试时更新对应行；不要写入
带本机盘符的绝对链接。

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

| 领域               | 主要测试                                                                                                                                                                       | 实现入口                                                                                   |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------ |
| AppContext/reducer | `src/contexts/__tests__/AppContext.test.ts`                                                                                                                                    | `src/contexts/AppContext.tsx`                                                              |
| 外观模型与预览     | `src/utils/__tests__/appearanceModel.test.ts`、`src/contexts/__tests__/AppearanceContext.test.tsx`、`src/components/SettingsPanel/__tests__/AppearanceSettingsPanel.test.tsx`  | `src/utils/appearanceModel.ts`、`src/contexts/AppearanceContext.tsx`                       |
| AppSettings        | `src/utils/__tests__/appSettings.test.ts`                                                                                                                                      | `src/utils/appSettings.ts`                                                                 |
| Storage migration  | `src/utils/__tests__/storageInitializer*.test.ts`                                                                                                                              | `src/utils/storageInitializer.ts`                                                          |
| 数据管理           | `src/services/__tests__/dataManagement.test.ts`                                                                                                                                | `src/services/dataManagement.ts`                                                           |
| 课表               | `src/utils/__tests__/studyScheduleValidation.test.ts`、`src/utils/__tests__/storageInitializer.studyScheduleMigration.test.ts`                                                 | `src/utils/studySchedule*.ts`                                                              |
| 时间同步           | `src/utils/__tests__/timeSync.test.ts`、`src/utils/__tests__/ntpClient.test.ts`                                                                                                | `src/utils/timeSync.ts`、`electron/ntpService/ntpClient.ts`                                |
| 屏幕常亮           | `keepAwakeRuntime*.test.ts`、`keepAwakeController.test.ts`、`BasicSettingsPanel.test.tsx`                                                                                      | `keepAwakeRuntime.ts`、`keepAwakeController.ts`                                            |
| 模式/计时          | `src/components/Clock/__tests__/Clock.test.tsx`、`src/hooks/__tests__/useTimer.test.ts`、`tests/e2e/countdown.e2e.spec.ts`、`stopwatch.e2e.spec.ts`                            | `src/components/Clock`、`Countdown`、`Stopwatch`、`src/hooks/useTimer.ts`                  |
| 自习状态           | `src/components/Study/__tests__/Study.test.tsx`、`StudyStatus/__tests__/StudyStatus.test.tsx`、`studyInfoSignals.test.tsx`                                                     | `src/components/Study`、`StudyStatus`                                                      |
| 天气适配/流程      | `src/services/__tests__/weatherService*.test.ts`、`xiaomiWeatherClient.test.ts`、`capacitorHttpClient.test.ts`                                                                 | `src/services/weatherService.ts`、`xiaomiWeatherClient.ts`、`capacitorHttpClient.ts`       |
| 天气运行时         | `weatherRuntime*.test.ts`、`minutelyWeatherRuntime.test.ts`、`weatherAlertRuntime.test.ts`、`weatherNotificationRuntime.test.ts`                                               | `src/services/weatherRuntime.ts` 等                                                        |
| 天气协调           | `weatherCrossTabLock.test.ts`、`weatherSyncChannel.test.ts`、`weatherRequestGuard.test.ts`、`apiGovernance.test.ts`                                                            | 对应 lock/sync/guard/governance 服务                                                       |
| 天气 UI            | `src/components/Weather/__tests__/Weather*.test.tsx`、`src/components/Weather/__tests__/weatherDisplay.test.ts`                                                                | `src/components/Weather`                                                                   |
| 噪音特征           | `src/services/noise/__tests__/noiseFeatureExtractor.test.ts`、`noiseCaptureRuntime.test.ts`                                                                                    | `src/services/noise/noiseFeatureExtractor.ts`、`noiseCaptureRuntime.ts`                    |
| 噪音协调/存储      | `noiseCoordinator.test.ts`、`noiseFeatureRepository.test.ts`、`noiseFeatureArchiveService.test.ts`、`noiseDataMaintenance.test.ts`                                             | `src/services/noise`、`src/utils/db.ts`                                                    |
| 噪音评分           | `src/utils/__tests__/noiseScoreEngine.test.ts`、`noiseReportAggregation.test.ts`、`noiseSliceService.test.ts`                                                                  | `src/utils/noiseScoreEngine.ts` 等                                                         |
| 噪音设备/健康      | `noiseDeviceProfileService.test.ts`、`noiseSignalHealthMonitor.test.ts`、`noiseInputDeviceService.test.ts`                                                                     | 对应 noise service                                                                         |
| 噪音重算           | `noiseRescoreService.test.ts`                                                                                                                                                  | `src/services/noise/noiseRescoreService.ts`、`noiseRescoreCore.ts`                         |
| 噪音 UI            | `NoiseMonitor.test.tsx`、`NoiseReportModal.test.tsx`、`NoiseSettings/RealTimeNoiseChart.test.tsx`                                                                              | `src/components/Noise*`                                                                    |
| 语录               | `src/services/quotes/__tests__/*.test.ts`、`src/hooks/__tests__/useQuoteRotation.test.ts`、`QuoteChannelManager.test.tsx`、`MotivationalQuote*.test.tsx`                       | `src/services/quotes`、`src/components/MotivationalQuote`                                  |
| 公告/反馈          | `src/components/AnnouncementModal/__tests__/AnnouncementModal.test.tsx`、`src/utils/__tests__/announcementStorage.test.ts`                                                     | `AnnouncementModal`、`announcementStorage.ts`                                              |
| 公共 UI            | `src/ui/components/__tests__/*.test.tsx`、`src/ui/icons/__tests__/AppIcon.test.tsx`、`src/ui/__tests__/uiGovernance.test.ts`                                                   | `src/ui`、`src/pages/DesignSystem/componentCatalog.tsx`                                    |
| 全屏               | `src/hooks/__tests__/useFullscreen.test.ts`                                                                                                                                    | `src/hooks/useFullscreen.ts`                                                               |
| 运行平台/PWA       | `src/utils/__tests__/runtimePlatform.test.ts`、`src/components/SettingsPanel/__tests__/AboutSettingsPanel.test.tsx`、`src/components/AuthorInfo/__tests__/AuthorInfo.test.tsx` | `src/utils/runtimePlatform.ts`、`src/main.tsx`、`AboutSettingsPanel.tsx`、`AuthorInfo.tsx` |

## E2E 映射

| 流程              | 文件                                                                          |
| ----------------- | ----------------------------------------------------------------------------- |
| 首页与时钟        | `tests/e2e/clock.e2e.spec.ts`                                                 |
| 模式切换          | `tests/e2e/mode-switch.e2e.spec.ts`                                           |
| 倒计时/秒表       | `tests/e2e/countdown.e2e.spec.ts`、`stopwatch.e2e.spec.ts`                    |
| 自习 smoke        | `tests/e2e/study-smoke.e2e.spec.ts`                                           |
| 设置持久化/动效   | `tests/e2e/settings-persistence.e2e.spec.ts`、`settings-motion.e2e.spec.ts`   |
| 数据管理          | `tests/e2e/data-management.e2e.spec.ts`                                       |
| 语录              | `tests/e2e/quotes.e2e.spec.ts`                                                |
| 天气协调          | `tests/e2e/weather-coordination.e2e.spec.ts`                                  |
| 噪音多标签页      | `tests/e2e/noise-multitab.e2e.spec.ts`                                        |
| 音频诊断/开发者页 | `tests/e2e/audio-debug.e2e.spec.ts`、`developer-pages.e2e.spec.ts`            |
| UI 视觉           | `tests/e2e/design-system-visual.e2e.spec.ts`、`visual-regression.e2e.spec.ts` |
| 弹层与引导        | `modal-redesign.e2e.spec.ts`、`tour-rapid-click.e2e.spec.ts`                  |

## 维护规则

- 新测试文件使用 `*.test.ts(x)`、`*.e2e.spec.ts` 命名并放在最近的领域目录。
- 测试覆盖的是行为/契约；迁移或模型版本变化要在本页和相应专题同时更新。
- 公共浮层的进入、退出和交互隔离由 `src/ui/components/__tests__/motion.test.tsx` 覆盖。
- 若文件移动，优先更新本页相对路径，不保留失效旧链接或本机绝对链接。
- 视觉基线只提交稳定视口和确定数据，临时截图放在 `output/`，不放入知识库。
