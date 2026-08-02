# 本地数据与持久化

应用采用本地优先策略：偏好和用户内容写入 `localStorage`，二进制资源与噪音历史写入
IndexedDB，网络结果和可重新生成内容作为缓存处理。设置页通过 `src/services/dataManagement.ts`
访问数据域，不直接清理浏览器存储。

## AppSettings

- 主键：`AppSettings`。
- 当前设置版本：`CURRENT_SETTINGS_VERSION = 11`。
- 顶层分区：`appearance`、`general`、`study`、`noiseControl`，并带 `version`、`modifiedAt`。
- 读路径：`getAppSettings()` 解析 JSON 后调用 `normalizeAppSettings()`；缺失字段补默认值，
  非法值被夹取或回退。
- 写路径：`updateAppSettings()` 做分区级深合并，写入当前版本和新的 `modifiedAt`。
- 迁移路径：`initializeStorage()` 先创建/迁移规范结构，再删除已知 legacy 键；高版本或无效
  JSON 会被隔离到 `immersive-clock:quarantine:app-settings`，而不是静默覆盖。

重要设置范围：

| 分区           | 代表字段                                                               |
| -------------- | ---------------------------------------------------------------------- |
| `general`      | 启动模式、时钟秒数、语录频道、天气位置、网络校时、普通背景、公告隐藏期 |
| `study`        | 目标年份/事件、显示项、信息轮播、提醒、课表、字体样式、自习背景        |
| `noiseControl` | 监测与历史开关、输入设备、主指标、分数阈值、报告弹窗和提示音           |
| `appearance`   | 全局/场景/组件样式、背景引用和实例覆盖                                 |

不要直接写 `localStorage.clear()`。新增设置应通过 `appSettings.ts` 的类型、默认值、规范化、
更新函数和迁移测试完成。

## IndexedDB v7

数据库名为 `immersive-clock-db`，当前版本 `7`：

| Store                       | 内容                         | 关键索引/说明                          |
| --------------------------- | ---------------------------- | -------------------------------------- |
| `custom-fonts`              | 自定义字体二进制与旧字体记录 | `id` 主键                              |
| `appearance-assets`         | 背景资源二进制/数据 URL      | `id` 主键                              |
| `appearance-asset-metadata` | 背景和字体的轻量元数据       | `id` 主键                              |
| `noise-capture-sessions`    | 噪音会话元数据               | `startedAt`、`endedAt`                 |
| `noise-feature-chunks`      | 100ms 原始特征列式分块       | `captureSessionId`、`startAt`、`endAt` |
| `noise-score-chunks`        | 当前评分模型的派生窗口       | `captureSessionId`、`end`              |
| `noise-rescore-state`       | 后台重算状态                 | `modelVersion` 主键                    |

升级事务会迁移外观元数据、删除废弃的 `noise-history` Store，并清理非当前模型评分。打开
IndexedDB 设有 5 秒超时；失败时噪音实时评分仍可继续，但不会退回 localStorage 保存原始帧。

## 数据域

`dataDomainRegistry` 的六个域是设置页的唯一清理边界：

| 域             | 包含                                        | 是否进入常规备份 |
| -------------- | ------------------------------------------- | ---------------- |
| `settings`     | AppSettings 与用户配置                      | 是               |
| `assets`       | 背景、字体和元数据                          | 是               |
| `noiseHistory` | 当前模型派生评分，以及会话/原始特征占用统计 | 完整备份时是     |
| `cache`        | 天气、语录、会话和 CacheStorage 可重建内容  | 否               |
| `diagnostics`  | 错误中心记录                                | 否               |
| `deviceState`  | 引导、报告偏好、独立 dB(A) 校准             | 否               |

域接口提供 `inspect/export/validate/replace/clear/migrate`。删除只使用已知键、Store 和
CacheStorage 名称白名单；未知同源数据不属于应用数据域。

当前域 schema 分别为：settings v1、assets v1、noiseHistory v4、cache v1、diagnostics v1、
deviceState v1。域 schema 与 `AppSettings.version`、IndexedDB version 是三套不同版本号，
修改时不能互相替代。

## 备份与恢复

当前 JSON 备份协议为 `immersive-clock-backup`、`backupVersion: 1`，支持：

- `settings-and-assets`：偏好、用户语录/课表和外观资源。
- `full`：上述内容加当前 `spectral-activity-v2` 噪音历史（不含 PCM 和原始 100ms 帧）。

生成备份前会规范设置、校验资源引用、按内容指纹去重并写入 manifest 摘要；总大小上限
150MB，自定义资源合计最多 100MB，单张背景最多 20MB，单个字体最多 50MB。恢复分为解析/预检
和提交两阶段，先校验协议、域版本、资源引用、冲突和容量，再写入资源、噪音和设置；失败时
尝试回滚原数据。大文件可由 `dataBackup.worker.ts` 在 Worker 中解析。

噪音原始特征另有 `.icnoise` v1 二进制归档，详见 [Noise capture and storage](../modules/noise-capture-and-storage.md)。

## 缓存与保留

- 天气缓存键为 `weather-cache`，语录运行时缓存和提供商退避也不进入备份。
- Service Worker CacheStorage 主要缓存字体、图片、音频和运行时 Markdown；清理缓存不影响设置。
- 噪音会话、原始特征和派生评分默认保留 14 天；启动维护会恢复未封存会话并删除过期数据。
- `navigator.storage.persist()` 仅在可用时请求持久存储，不能视为保证；用户仍可能被浏览器回收。

## 重置语义

| 操作             | 行为                                                                                           |
| ---------------- | ---------------------------------------------------------------------------------------------- |
| 重置偏好         | 恢复默认外观/显示/提醒，但保留用户语录、课表、目标事件和自定义内容（自定义信息会被禁用保留）。 |
| 清理噪音历史     | 删除会话、原始特征、评分和重算状态；保留噪音设置和独立校准。                                   |
| 清理缓存         | 删除天气/语录/运行时缓存，不影响用户内容。                                                     |
| 删除未使用资源   | 仅删除未被当前设置引用的背景或字体。                                                           |
| 删除全部本地数据 | 清空六个数据域；操作不可依赖网络恢复。                                                         |

## 隐私边界

PCM 只在 AudioWorklet 当前窗口内用于提取特征，不能持久化、广播或导出。网络天气、远程语录、
可选 Clarity 分析和第三方反馈问卷是独立外发路径；调用前应由配置和权限明确开启，并在用户
文档中说明。更多噪音边界见 [Quietness scoring](../modules/quietness-scoring.md)。
