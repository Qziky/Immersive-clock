# 技术知识库

这里是 Immersive Clock 面向开发者的技术知识库。根目录的
[CONTRIBUTING.md](../../CONTRIBUTING.md) 只保留协作入口；需要了解实现细节时，从本页进入对应专题。

## 阅读路径

### 架构

- [应用架构](architecture/application-architecture.md)：启动链路、Provider、路由和页面编排。
- [状态与数据流](architecture/state-and-data-flow.md)：`AppContext`、外观草稿、事件和跨标签页同步。
- [模块地图](architecture/module-map.md)：目录职责、依赖方向和模块边界。
- [本地数据与持久化](architecture/local-data-and-persistence.md)：`AppSettings`、IndexedDB、缓存、备份与迁移。
- [Web、PWA 与 Electron](architecture/web-pwa-and-electron.md)：构建模式、Service Worker、协议和桌面能力。

### 功能模块

- [时间与自习](modules/time-and-study.md)：四种模式、计时器、时间同步和课表。
- [天气与定位](modules/weather-and-location.md)：定位、天气运行时、降水和预警。
- [噪音采集与存储](modules/noise-capture-and-storage.md)：AudioWorklet、Leader、原始特征帧和历史数据。
- [环境安静评分](modules/quietness-scoring.md)：`spectral-activity-v2` 评分模型与重算规则。
- [语录、课表内容与公告](modules/quotes-schedule-and-announcements.md)：内容来源、持久化和运行时公告。

### 工程实践

- [开发指南](engineering/development-guidelines.md)：环境、脚本、代码和文档约定。
- [UI 组件与图标](engineering/ui-components-and-icons.md)：`src/ui`、令牌、语义图标和无障碍规则。
- [测试策略](engineering/testing-strategy.md)：Vitest、Playwright、Browser 验证和选择测试范围。
- [测试覆盖地图](engineering/testing-coverage-map.md)：代码与测试的稳定映射。
- [构建、发布与部署](engineering/build-release-and-deployment.md)：Web、PWA、Electron、Docker 和发布流水线。
- [排障指南](engineering/troubleshooting.md)：本地开发、存储、网络、噪音和打包故障排查。

## 文档边界

- 本目录描述当前代码和配置，不承诺未来版本的实现。
- 用户操作说明放在 `docs/user-guide/`；产品方向放在 `docs/product/`；宣传素材放在
  `docs/marketing/`。
- `public/docs/announcement.md` 与 `public/docs/changelog.md` 是应用运行时加载的内容，
  不属于本知识库的技术事实源。
- 涉及数据格式、缓存名称、IPC 通道或模型参数的改动必须同时更新相关专题和测试。

## 快速定位

| 问题                               | 先看                                                                     |
| ---------------------------------- | ------------------------------------------------------------------------ |
| 页面为什么按当前模式渲染           | [Application architecture](architecture/application-architecture.md)     |
| 设置保存在哪里、如何迁移           | [Local data and persistence](architecture/local-data-and-persistence.md) |
| 天气多久请求一次、如何跨标签页协调 | [Weather and location](modules/weather-and-location.md)                  |
| 噪音分数如何计算                   | [Quietness scoring](modules/quietness-scoring.md)                        |
| 修改公共按钮或图标需要做什么       | [UI components and icons](engineering/ui-components-and-icons.md)        |
| 该运行哪组测试                     | [Testing strategy](engineering/testing-strategy.md)                      |
