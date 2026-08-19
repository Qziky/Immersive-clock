# 时间与自习系统

时间模块包含普通时钟、倒计时、秒表和自习看板。四种模式共用 `ClockPage`、HUD、外观系统
和设置入口，但各自保持独立的刷新策略，避免高频 tick 造成整棵 React 树重渲染。

## 模式切换

模式类型为 `clock | countdown | stopwatch | study`。启动时 `getStartupModeFromSettings()` 从
`AppSettings.general.startup.initialMode` 读取并校验；未知值回退到 `clock`。路由和 Context
双向同步，刷新后仍可恢复到 URL 指定模式。

HUD 默认隐藏，页面交互后显示，8 秒无操作后自动隐藏。输入框、模态框、引导或 HUD 内键盘焦点
会阻止页面级快捷键和自动隐藏。

## 普通时钟

`Clock` 以一秒定时器读取 `getAdjustedDate()`，而不是直接依赖 `new Date()`，因此网络校时和
手动偏移能统一影响时钟、自习时间、日进度、课表判断和天文日期。外观 slot 区分主时间、秒数
和日期，`general.timeDisplay.showClockSeconds` 控制秒数显示。

## 倒计时

状态字段：

- `initialTime`：设置的总秒数；
- `currentTime`：暂停或结束时的稳定剩余秒数；
- `isActive`：运行状态；
- `endTimestamp`：启动时基于 `performance.now()` 建立的绝对结束锚点。

运行时组件每 100ms 使用 `requestAnimationFrame` 重新计算
`ceil((endTimestamp - nowMs()) / 1000)`。页面休眠不会累积 setInterval 漂移；恢复时直接收敛到
真实剩余时间。最后 5 秒播放逐秒提示音，结束时播放终止音并只派发一次 `FINISH_COUNTDOWN`。

倒计时的设置弹窗、开始/暂停/重置 action 保留在 Context，展示刷新留在组件局部。

## 秒表

秒表保存 `elapsedTime` 和 `isActive`。`useAccumulatingTimer()` 以 10ms 间隔计算应补偿的 tick
数量，再通过 `TICK_STOPWATCH_BY` 一次派发，避免页面休眠恢复后循环大量 dispatch。显示格式
由 `formatStopwatch` 统一处理。

## 自习模式

`Study` 是布局编排层，组合：

- 当前时间与日期；
- 快捷事件、单事件或多事件倒计时；
- `StudyStatus` 顶部进度与上下文信息；
- 天气、噪音监测、语录；
- 报告、历史和设置入口。

`AppSettings.study.display` 独立控制天气、噪音、倒计时、语录、时间和日期。自习模式的外观
采用 `AppearanceProvider` 的 `study` scene；旧 `study.style` 和 `study.background` 仅用于迁移与
兼容，当前编辑入口以版本化 appearance 为准。

## 目标倒计时

自习倒计时支持：

- 高考目标年份；
- 单个自定义事件；
- 多事件列表 `CountdownItem[]`，每项带类型、名称、目标日期、顺序和可选视觉覆盖；
- 多事件轮播间隔。

目标日期使用本地日期格式解析，避免把 `YYYY-MM-DD` 当成 UTC 导致跨时区偏移。新增日期逻辑
应复用 `dateTimeLocal.ts`，并测试午夜、闰年和目标已过边界。

## 课表与进度

课表统一存储在 `AppSettings.study.timetable`：`document` 基于 CSES v2，并支持
`rest_count: 1` 的单休兼容扩展；`cycleAnchorDate` 是应用私有的周期首日日期，不参与 YAML 导入导出。旧版 `study.schedule` 和
`study-schedule` / `studySchedule` 会迁移为固定周一锚点的上 5 休 2 工作日课程表。

`studyTimetable.ts` 集中负责：

- CSES v2 YAML 解析和生成，并接受单休兼容扩展与保留 schema 允许的未知扩展字段；
- 课程引用、`HH:mm:ss`、周期 spans 总数和实际启用日课时重叠的严格校验；
- 根据本地日期、周期锚点和 spans 计算第几个上课日；
- 将匹配的日课程表合并为包含稳定 ID、教师和地点的运行时 `StudyPeriod[]`。

`StudyStatus` 每秒从同一校时时刻派生两套进度：

- `day`：当天 24 小时进度；
- `schedule`：当前课时或课间进度。

它监听课程表设置事件和跨标签页 `AppSettings` 变化，避免设置页保存后继续显示旧课表。休息日、
周期开始前或空日课程表不会产生课时进度与自动噪音报告。

## 中央信息轮播

`study.infoCarousel` 最多 20 项，间隔限制为 3–30 秒。来源包括：

- 日进度或课表进度；
- 下一课时（可配置提前量）；
- 分钟级降雨（可配置提前量）；
- 天气预警；
- 自定义文本。

每项绑定一个背景进度快照。运行时将来源转成稳定信号，支持及时信息优先、critical 单次打断、
过期恢复、手动下一条、页面隐藏/悬停/聚焦暂停和 `prefers-reduced-motion`。空队列回退到可用
的进度信号，不应渲染无语义按钮。

## 时间同步

校时提供三种 provider：

| provider   | 平台         | 方式                                                                  |
| ---------- | ------------ | --------------------------------------------------------------------- |
| `httpDate` | Web/Electron | 请求 URL，读取 HTTP `Date` 头。跨域时服务端必须暴露该 header。        |
| `timeApi`  | Web/Electron | 解析 `epochMs`、`epochSeconds`、`unixtime`、`datetime` 等 JSON 字段。 |
| `ntp`      | Electron     | 通过 preload IPC 调用主进程 UDP NTP。                                 |

每次同步默认采样 3 次，按 RTT 排序后取最多 3 个最佳样本的 offset 中位数；有效时间为
`Date.now() + offsetMs + manualOffsetMs`。自动同步定时器监听设置、手动同步事件和跨标签页
设置变化，并保存最近时间、RTT 和错误。

## 测试重点

- 计时器抖动、页面休眠补偿、暂停/重置和结束只触发一次；
- 校时 provider 的解析、超时、NTP IPC 和偏移组合；
- 课表时间解析、排序、重叠、迁移和 Excel 错误行；
- 日进度/课表进度的午夜、课间和空课表；
- 信息轮播的优先级、暂停、减少动态效果和 20 项上限。
