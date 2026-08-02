# 天气与定位系统

天气模块采用“位置解析 → 同源代理请求 → 规范化 → 本地缓存 → 运行时快照 → UI”的分层。
组件不直接请求第三方接口；所有上游请求统一经过小米天气客户端、请求治理和跨标签页锁。

## 数据流

```mermaid
flowchart TD
  A[Weather UI / settings] --> B[weatherRuntime]
  B --> C[resolveWeatherLocation]
  C --> C1[manual city]
  C --> C2[browser geolocation]
  C --> C3[public IP fallback]
  C1 --> D[buildWeatherFlow]
  C2 --> D
  C3 --> D
  D --> E[xiaomiWeatherClient]
  E --> F[/api/xiaomi-weather same-origin proxy]
  F --> G[Xiaomi weather upstream]
  D --> H[normalize current/daily/alerts/AQI/sun/minutely]
  H --> I[weather-cache]
  I --> J[runtime snapshots]
  J --> K[Weather / StudyStatus / notifications]
```

## 位置解析

设置只保存位置模式和手动选择：

- `auto`：优先浏览器 geolocation；失败或不可用时使用公网 IP 定位；必要时复用匹配的缓存位置。
- `manual`：保存搜索文本和结构化 `WeatherCitySelection`；旧经纬度作为 `legacyCoords` 仅用于迁移。

定位服务记录 permission state、耗时、来源和失败原因。浏览器定位缓存约 30 分钟，公网 IP
结果约 6 小时，城市搜索结果约 24 小时；用户“刷新定位”会强制重新解析。

手动城市搜索和坐标反查都通过同一小米位置接口，最后转换为包含城市名、locationKey、经纬度、
解析时间和来源的 `WeatherLocation`。

## 请求客户端与治理

渲染层只请求 `/api/xiaomi-weather/wtr-v3/*`。开发服务器、Vercel、EdgeOne、Nginx 和 Electron
`app://local` 协议各自把它转发到固定上游。

`weatherRequestGuard.ts` 维护每类 endpoint 的最短间隔、小时窗口和 cooldown。HTTP 429 会使用
重试时间或 30 分钟回退，403 进入 2 小时冷却。`weatherCrossTabLock.ts` 优先使用 Web Locks；
不支持时使用 localStorage lease + contender 队列，确保同一 request key 在多个标签页只执行一次。

`apiGovernance.ts` 还提供请求去重、最短间隔和内存缓存，用于减少同页面的重复请求。新增天气
接口应接入现有治理，而不是在组件里直接 `fetch`。

## 完整天气流程

`buildWeatherFlow()` 一次编排当前天气、详情、三日预报、日出日落、空气质量、预警和可用的
分钟级降水。适配层将上游的数值/单位、天气码、风向、AQI 和日期归一到 `src/types/weather.ts`。

完整刷新成功后，`updateWeatherRuntimeBundle()` 原子更新匹配位置的数据，运行时再：

1. ingest 天气预警；
2. 重新计算分钟级降水快照；
3. 处理天气、空气质量、日出日落通知；
4. 广播缓存已更新；
5. 调度下一次刷新。

## 缓存

`weather-cache` 是版本化聚合缓存。主要 TTL：

| 数据                     |     TTL |
| ------------------------ | ------: |
| 坐标、预警去重、日出日落 | 12 小时 |
| 小米位置解析             | 24 小时 |
| 分钟级降水               |  5 分钟 |
| 三日预报、天气详情       |  3 小时 |
| 72 小时逐时、空气质量    |  1 小时 |

TTL 用于判断某个子缓存是否可直接复用；`weatherRuntime` 另外根据前后台和降雨阶段决定主动刷新
频率。缓存损坏时返回空对象并由运行时重新拉取，不应让页面启动失败。

## 运行时调度

完整天气前台每 10 分钟、后台每 30 分钟刷新。分钟级降水：

- 即将下雨或正在下雨：前台每 2 分钟；
- 无雨：前台每 10 分钟；
- 后台：每 30 分钟。

失败退避依次为 1、2、5、10、30 分钟。离线时停止定时器并保留缓存；重新在线或页面恢复
可见时只执行已到期的刷新。`refreshWeather()` 会合并并发刷新，强制定位请求可以排入 pending，
不会并行覆盖状态。

运行时状态：`idle`、`locating`、`loading`、`ready`、`refreshing`、`stale`、`offline`、
`rate_limited`、`error`。UI 应同时显示 freshness；存在匹配旧缓存时，网络失败是 `stale` 而不是
直接清空数据。

## 跨标签页同步

天气写入者在刷新成功后发送 `cache-updated` 消息。优先 BroadcastChannel，localStorage storage
event 作为兼容通道；消息 ID 去重并只保留最近 100 个。Follower 收到消息后重新读取
`weather-cache`，不会信任消息中携带完整天气数据。

## 分钟级降水与预警

`minutelyPrecipLogic.ts` 根据逐分钟时间和降水量计算阶段、预计开始/结束时间、峰值强度和文案。
`minutelyWeatherRuntime` 每 30 秒从缓存重算，区分 fresh/stale/error，不独立发起上游请求。

`weatherAlertRuntime` 对预警按签名、发布时间、严重度和过期时间规范化，只保留当前有效项。
`weatherNotificationRuntime` 通过 `messagePopup:open` 发布：

- 新的天气预警；
- 达到设置阈值的空气质量提醒；
- 当日日出/日落临近提醒。

sessionStorage 去重确保同一会话不重复提醒。非自习模式只显示天气类消息，自习模式由设置开关
决定更细粒度提醒。

## 故障降级

- 浏览器拒绝定位：回退公网 IP 或手动城市，并保留诊断。
- 网络离线/上游失败：展示匹配缓存并标记 stale；无缓存时显示错误。
- 请求频率受限：显示 `rate_limited` 和下一次可请求时间，不能用强制刷新绕过 guard。
- 跨标签页锁不可用：localStorage lease；localStorage 也不可用时只保证当前上下文内去重。
- Electron 代理失败：返回 502，运行时按普通网络失败退避。

## 测试重点

天气测试覆盖客户端参数、代理路径、位置降级、完整流程适配、TTL、request guard、跨标签页锁、
同步消息、运行时边界、分钟降水和通知去重。稳定映射见
[Testing coverage map](../engineering/testing-coverage-map.md)。
