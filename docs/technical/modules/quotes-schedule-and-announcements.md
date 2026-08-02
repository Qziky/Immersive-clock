# 语录、课表内容与公告

本页说明三类“内容型数据”的来源和运行时边界。课表的计时与进度算法见
[Time and study](time-and-study.md)；本页重点是内容注册、持久化和更新方式。

## 语录频道模型

`src/services/quotes/quoteRegistry.ts` 维护内置频道定义：

| 频道         | 类型                   | 默认权重 | 说明                     |
| ------------ | ---------------------- | -------: | ------------------------ |
| 本地励志语录 | local                  |       40 | `src/data/quotes-1.json` |
| 大学校训     | local                  |       40 | `src/data/quotes-2.json` |
| 一言         | remote / `hitokoto`    |       20 | 中文分类可选，默认 d/k/i |
| 今日诗词     | remote / `jinrishici`  |       10 | 中文诗词                 |
| Advice Slip  | remote / `advice-slip` |       10 | 英文建议                 |

用户可以启停、调整权重、修改本地内置频道内容、选择随机/顺序和新增本地自定义频道。设置只
保存 built-in preference 与 custom channel；启动时 `resolveQuoteChannels()` 与当前注册表合并，
因此新增内置频道无需复制整份定义到旧设置。

权重限制为 1–9999；单个频道最多规范化 1000 条非空语录。自定义 ID 不能覆盖内置 ID。

## 获取与故障转移

`QuoteService` 先按权重选择可用频道：

- local：随机或顺序取值，避免当前语录和最近使用内容；
- remote：先立即返回对应提供商缓存、可用本地内容或固定 fallback，再异步刷新；
- 远程失败：按其他启用的远程频道顺序故障转移，最后回退本地；
- 相同 provider 的并发请求共享一个 AbortController 和 Promise；全部订阅者取消时才终止请求。

提供商最短请求间隔：一言 5 秒、今日诗词 10 分钟、Advice Slip 2 秒。运行时存储记录请求时间、
退避、最近使用、顺序游标和最近 7 天缓存；接口失败不会直接清空当前内容。

`MotivationalQuote` 通过 `useQuoteRotation` 处理自动刷新、手动刷新、动画模式、打字速度和退格
效果。保存时 `saveQuoteSettings()` 一次性规范化频道与动画设置，避免跨面板部分写入。

## 提供商适配边界

每个 provider 只负责请求和转换成统一 `Quote`：`id`、`text`、可选 `origin/author`、
`providerId`、`language`、`fetchedAt`。HTTP 错误、格式错误和取消统一转换为可分类错误；
展示组件不解析第三方 JSON。

新增提供商需要：

1. 扩展 `QuoteProviderId` 和 provider adapter；
2. 在服务默认注册表和频道注册表登记；
3. 定义最短请求间隔与失败策略；
4. 增加适配、故障转移、缓存和设置迁移测试；
5. 在用户文档中说明第三方外发和语言。

## 课表内容存储

课表保存在 `AppSettings.study.schedule`。设置 UI 可增删、排序、智能插入和导入 Excel；写入前
统一通过 `validateStudySchedule()`。应用启动会把旧 `study-schedule` / `studySchedule` 迁移到
AppSettings，只有在新结构没有显式课表时才采用 legacy 内容，防止覆盖用户已保存课表。

同标签页保存通过 `SETTINGS_EVENTS.StudyScheduleUpdated` 触发自习状态重读；其他标签页通过
`storage` 事件读取新的 AppSettings。课表是用户内容，重置偏好时保留，删除全部本地数据时清除。

## 公告与更新日志

公告组件固定读取：

- `public/docs/announcement.md`
- `public/docs/changelog.md`

请求路径为 `${import.meta.env.BASE_URL}docs/<filename>`，因此 Web `/` base 和 Electron `./` base
都能工作。Markdown 使用 `marked` 的 GFM 和换行模式渲染；运行时失败显示可重试错误。

公告第三个 tab 是腾讯问卷 iframe，使用受限 sandbox，并提供新窗口 fallback。公告/更新日志在
连续 120 秒无活动后关闭，最后 60 秒显示倒计时；反馈 tab 填写期间暂停自动关闭。

## 公告展示偏好

`AppSettings.general.announcement` 保存：

- `version`：用户勾选隐藏时的应用版本；
- `hideUntil`：一周隐藏截止时间。

版本变化时忽略旧隐藏期并重新显示。首次引导未完成时，`App` 等待 `tour:end` 再打开公告；
引导开始会强制关闭公告。用户仍可点击版本号手动打开。

`public/docs/*` 是应用资产而不是知识库页面。修改文件名、路径或构建复制规则会改变运行时协议，
必须验证 Web、PWA 离线缓存和生产 Electron 三种环境。

## 内容安全与维护

- 内置语录 JSON 不包含 HTML，远程内容作为文本渲染。
- 运行时公告 Markdown 来自仓库受控文件；若未来允许用户输入，必须增加 HTML sanitization。
- 第三方语录、天气和问卷都有独立网络边界，不能用“完全离线”概括整个产品。
- 语录缓存、课表和公告偏好在数据管理中的归属不同，清理缓存不能删除课表，重置偏好不能删除
  用户语录内容。
