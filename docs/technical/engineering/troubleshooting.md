# 开发与运行排障

先确认问题发生在 Web、PWA、Electron 还是测试环境，再按“入口 → 服务快照 → 持久化 → 浏览器
权限/网络”的顺序定位。不要直接删除全部浏览器数据作为第一步。

## 启动白屏或 loading screen 不消失

1. 打开开发者工具查看 `bootstrap` 错误和 `logger` 输出。
2. 检查 `AppSettings` 是否为非法 JSON 或高于当前版本；应用会隔离到
   `immersive-clock:quarantine:app-settings`，可在数据设置中导出隔离记录后再恢复。
3. 检查 IndexedDB `immersive-clock-db` 是否被升级阻塞；关闭其他标签页和旧版本窗口后重试。
4. 若仅 Electron 失败，检查 `dist-electron/preload.cjs`、`app://local/index.html` 和相对资源路径。

## 端口或开发服务器问题

- Vite 默认绑定 `127.0.0.1:3005`；端口被占用时停止旧进程，不要修改 Playwright baseURL 而不更新配置。
- `npm run dev:electron` 依赖 `VITE_DEV_SERVER_URL`，开发 preload 使用 `electron/preload.dev.cjs`。
- E2E 复用已有服务器；需要干净环境时先关闭 Vite，再运行 `npm run test:e2e`。

## 路由深链接 404

- Web：部署必须把无扩展名路径 fallback 到 `/index.html`。
- Electron：`app://local` 协议对无扩展名路径回退 index；扩展名资源必须真实存在。
- 代理和 `/docs/*.md` 不能被 SPA fallback 截获。

## 天气为空、stale 或 rate limited

1. 查看运行时状态、location source、freshness、error 和 nextRefreshAt。
2. 确认 `/api/xiaomi-weather` 同源代理可达；直接从浏览器请求第三方上游通常会遇到 CORS。
3. 检查浏览器定位权限；切换手动城市可验证请求链路是否正常。
4. `rate_limited` 时等待 guard 指定时间，不要用刷新循环绕过请求限制。
5. 多标签页只应有一个刷新者；检查 Web Locks 或 localStorage weather lease 是否残留。
6. 上游失败时有匹配缓存应显示 stale；完全无缓存时才显示 error。

相关测试：`weatherRuntime*.test.ts`、`weatherRequestGuard.test.ts`、`weatherCrossTabLock.test.ts`、
`weatherSyncChannel.test.ts`。

## 定位失败

- 浏览器权限被拒绝：检查站点权限和 HTTPS/localhost 环境；运行时会尝试公网 IP 或手动城市。
- Electron：主进程默认允许 geolocation，但渲染层仍需处理用户系统限制。
- 地理位置异常：查看 `geolocationDiagnostics`，确认纬度/经度合法且缓存未过期。

## 噪音没有数据或分数为 null

1. 检查 `NoiseMonitoringSnapshot.role`：Follower 不会直接访问麦克风，Leader 交接后应出现新会话。
2. 检查 permission denied、track muted/ended、AudioContext suspended 和 `signalHealth`。
3. 首次分数需要完整 60 秒；覆盖不足或有效秒少于 48 时分数必为 null。
4. `historyEnabled` 关闭只禁用持久化，不影响实时评分；IndexedDB 写入失败也不应阻塞实时链路。
5. 若历史缺失，查看 `noise-rescore-state`、会话是否已结束、模型版本/digest 是否匹配。
6. 设备切换或系统处理签名变化会使旧校准不可复用；先清除校准再重新采集。

不要把“分数为 null”解释为安静；先展示覆盖率和信号健康。

## 自定义背景或字体不显示

- 确认资源写入 `appearance-assets`/`custom-fonts`，设置只保存正确 `assetId`。
- 检查 `appearance-asset-metadata` 是否存在，以及 Data URL MIME 和大小是否通过校验。
- 取消预览不会写入资源；保存外观后刷新页面验证 `initializeAppearanceResources()`。
- 清理缓存不会删除 IndexedDB 资源；“删除未使用资源”会根据当前设置引用重新判断。

## 计时器漂移或秒数不一致

- 倒计时依赖 `endTimestamp` 和基于 `performance.now()` 的 `nowMs()`，不要改回逐秒递减。
- 秒表休眠恢复依赖累计 tick；测试应覆盖页面失焦和恢复。
- 时钟/自习使用 `getAdjustedDate()`；检查 `timeSync.enabled`、`offsetMs`、`manualOffsetMs` 和最近错误。
- 修改时间同步设置后应触发 `timeSync:updated`/`settingsSaved`，确认旧定时器已清理。

## Electron 权限、NTP 或天气代理失败

- 麦克风只允许 audio，不允许 video；macOS 需要系统麦克风授权。
- 全屏仅主窗口顶层页面允许；嵌入 iframe 或其他 WebContents 会被拒绝。
- NTP 只能通过 preload `window.electronAPI.timeSync.ntp` 调用，Host 为空、端口非法或超时会拒绝。
- `app://local/api/xiaomi-weather` 非 GET 返回 405，上游错误返回 502；检查协议处理器日志。

## PWA 缓存旧版本

1. 查看 Service Worker 状态和 `docs-cache`/静态资源缓存。
2. 重新加载等待 autoUpdate；开发时可取消注册 Service Worker 后清理缓存。
3. 不要通过修改 query 参数绕过应用版本逻辑；版本由 Vite 注入并由 version cache plugin 管理。
4. 公告更新使用 NetworkFirst；离线时可能继续显示上一份 `public/docs` 内容。

## 测试失败

- Vitest：确认 jsdom setup、fake timers、localStorage/IndexedDB mock 已清理；单独运行目标文件。
- E2E：检查 Vite 端口、系统 Edge 或 `PW_BUNDLED_BROWSERS=1`、测试数据和残留服务 Worker。
- UI Catalog：先运行 `npm run check:ui`，检查公共导出是否登记、`plain`/`soft` 层级和视觉基线。
- 失败若来自网络/设备不稳定，优先改为 fixture 或注入，而不是增加重试掩盖行为问题。

## 数据恢复最后手段

只有确认备份和迁移链路无法恢复时，才在用户明确知情下使用“删除全部本地数据”。操作前先
导出 `settings-and-assets`，如需保留噪音原始特征另行导出 `.icnoise`。删除后无法从网络恢复
本地用户内容、字体、背景、课表或校准。
