# Immersive Clock User Guide

Immersive Clock is a full-screen clock, countdown, stopwatch, and study dashboard. The current application interface is primarily in Chinese, so this guide includes the exact Chinese menu labels where they are useful.

## Getting started

The interface intentionally hides most controls. To show the HUD:

- click an empty area of the page; or
- press `Space` or `Enter`.

The HUD hides after about eight seconds of inactivity. It stays visible while keyboard focus remains inside it. Page-level shortcuts are suspended while a settings or countdown dialog is open.

The four modes are:

- **Clock (`时钟`)** — current time and date.
- **Countdown (`倒计时`)** — a one-off hours, minutes, and seconds timer.
- **Stopwatch (`秒表`)** — start, pause, and reset elapsed time.
- **Study (`自习`)** — a projection-friendly dashboard with time, schedule progress, weather, noise status, event countdowns, and quotes.

The HUD also provides full-screen control. The Settings button is in the lower-left corner. On the Clock page, the question-mark button at the bottom also replays the onboarding tour.

## Clock, countdown, and stopwatch

### Clock

The Clock page shows the current adjusted time and full date. To hide seconds, open **Settings (`设置`) → Visual Appearance (`视觉外观`) → Time Display (`时间显示`)**, select Clock, and turn off **Show seconds (`显示秒数`)**.

### Countdown

1. Select Countdown in the HUD.
2. Click the large time display once, or select **Set (`设置`)** in the HUD.
3. Adjust hours, minutes, and seconds, or choose a preset.
4. Select **Confirm (`确认`)**.
5. Show the HUD and select **Start (`开始`)**.

Confirming a duration does not start it automatically. You can pause, continue, reset to the selected duration, or click the time display again to replace the current timer. The final five seconds play tick sounds, followed by an end chime.

### Stopwatch

Use **Start (`开始`)**, **Pause (`暂停`)**, and **Reset (`重置`)** in the HUD. After one hour, the page displays a milestone message. Clock and Study “show seconds” preferences do not remove seconds from the countdown or stopwatch.

## Settings and saving changes

The current Settings navigation has five groups:

| English description | Chinese UI label | Pages                                                               |
| ------------------- | ---------------- | ------------------------------------------------------------------- |
| Workspace           | `常用工作台`     | Startup Page, Study Display, Countdown, Schedule                    |
| Visual Appearance   | `视觉外观`       | Overall Style, Time Display, Quote, Top Information Bar             |
| Environment Alerts  | `环境提醒`       | Noise Monitoring, Weather Service, Location Service                 |
| Content and Quotes  | `内容语录`       | Refresh Strategy, Display Effects, Quote Channels                   |
| System Data         | `系统数据`       | Time Calibration, Project Info, Settings Data, Errors and Debugging |

Most controls edit a draft. Select **Save (`保存`)** at the bottom of the Settings panel to apply them. **Cancel (`取消`)** discards the draft, including the live appearance preview.

Backup, restore, cleanup, reset, and erase operations are immediate data actions. They show a separate confirmation and may reload the application; they do not require a second press of the Settings Save button.

Under **Workspace (`常用工作台`) → Startup Page (`启动页面`)**, **Prevent the screen from turning off (`防止屏幕自动关闭`)** keeps the display awake in Clock, Countdown, Stopwatch, and Study modes while the app is visible. It is off by default and releases the wake lock when the app is minimized, hidden, or closed. Web/PWA support depends on the browser Screen Wake Lock API and a secure context; Electron and Android builds use native system capabilities. If the current environment rejects or does not support the request, the preference remains saved and the app retries when it returns to the foreground. Keeping the screen awake increases power use.

## Study mode

Study mode has three main areas:

- a top bar for weather, noise, progress or alerts, and event countdowns;
- a central clock with an optional date;
- an optional quote below the clock.

Open **Workspace (`常用工作台`) → Study Display (`自习显示`)** to show or hide Weather, Noise Monitoring, Countdown, Motivational Quote, and Date. The central time is always shown.

### Top progress and information

The top information queue can contain:

- 24-hour day progress;
- schedule/session and break progress;
- next-session reminders;
- short-term rain information;
- weather-alert summaries;
- custom text.

Up to 20 items can be enabled. Two or more items rotate automatically in list order, with an interval from 3 to 30 seconds. Hover, keyboard focus, or moving the page to the background pauses rotation. Click the current item, or press `Enter` / `Space`, to move to the next one.

Rain countdowns appear only when the location and weather timestamps are trustworthy. Weather-alert popups and the weather-alert item in this queue are independent settings.

### Study event countdowns

Open **Workspace → Countdown (`倒计时`)**. This controls the event countdown in Study mode, not the separate Countdown page.

- **Gaokao (`高考`)** uses June 7 of the selected year.
- **Single Event (`单事件`)** uses a custom name and date.
- **Multiple Events (`多事件`)** rotates an ordered list of Gaokao and custom events.

### Schedule

Open **Workspace → Schedule (`课程表`)** to add, duplicate, reorder, sort, or delete sessions. Each entry needs a name, start time, and end time. Overlapping or invalid entries must be corrected before Settings can be saved.

Excel import accepts `.xlsx` and `.xls`. Selecting a file only creates a preview. Choose **Replace Current Schedule (`替换当前课表`)** or **Append (`合并追加`)**, fix any conflicts, and then select the main Settings **Save** button.

When automatic noise reports are enabled, Study mode opens the current session report roughly one minute before its scheduled end. Closing it manually prevents the same session from reopening it.

## Appearance and personalization

**Overall Style (`整体样式`)** controls default numeric and information fonts plus the global background. The application default is now dark gray; the previous dark-green appearance remains available as **Dark Green Preset (`深绿预设`)**. Other choices include black, manual dark gray, a custom color, or a local image. Imported fonts can be `.ttf`, `.otf`, `.woff`, or `.woff2`.

Clock, Countdown, Stopwatch, and Study can each use their own page background. Individual text, icons, surfaces, states, and Study countdown events can override the global style. Restore actions change the current draft and still require **Save**.

Local images and fonts are stored in the current application profile. Resources currently referenced by an appearance setting cannot be deleted until they are replaced and the new appearance is saved.

The application respects the operating system's reduced-motion preference. Low text/background contrast warnings should be taken seriously, especially for classroom projection.

## Weather, location, and alerts

Weather and city search use Xiaomi Weather. Full current conditions, minutely precipitation, hourly and daily forecasts, air quality, alerts, sunrise/sunset, and provider data are available under **Environment Alerts → Weather Service (`天气服务`) → Data (`数据`)**.

### Automatic location

Automatic mode first requests high-accuracy browser geolocation. If that fails, it falls back to a public-IP city-level estimate. The Location Status area identifies the source as browser location, public-IP fallback, or manual city and shows browser accuracy when available.

Public-IP location may be wrong on VPNs, proxies, campus networks, or carrier networks. For a stable classroom setup, use manual location:

1. Select **Manual City (`手动城市`)**.
2. Enter a city name and select **Search City (`搜索城市`)**.
3. Choose an exact Xiaomi result.
4. Select the main Settings **Save** button.

Typing a city name without selecting a result cannot be saved.

### Refresh and alerts

Full weather normally refreshes about every 10 minutes in the foreground and every 30 minutes in the background. Minutely precipitation updates faster near or during rain. The Updates tab shows the last success, next scheduled refresh, request count, status, and recent error; **Refresh Weather (`刷新天气`)** forces a new attempt while still respecting request protection.

Weather Alert Popup, Air Pollution Alert, and Sunrise/Sunset Alert are independent switches. Hiding the top Weather component does not disable these alerts, cached weather refreshes, or rain/weather items already added to the Study information queue.

Cached weather may remain visible while offline or after an error. Treat stale data as historical context, not a current forecast.

## Noise monitoring and reports

The primary metric is a `0–100` **quietness score**. Higher is quieter. It does not require sound-level calibration and is intended for day-to-day comparison on the same device, not certified acoustic measurement.

### Start monitoring

1. Open **Environment Alerts → Noise Monitoring (`噪音监测`) → Control (`控制`)**.
2. Select **Authorize and Refresh (`授权并刷新`)** and allow microphone access.
3. Select the system default or a specific input.
4. Turn on **Enable Environment Monitoring (`启用环境监测`)**.
5. Optionally turn on **Save Monitoring Data (`保存监测数据`)** and **Show Live Value (`显示实时数值`)**.
6. Configure the score alert sound and threshold if needed.
7. Select the main Settings **Save** button.

Only one tab captures the microphone. Other open tabs follow the leader's summary. If the preferred input is unavailable, the app temporarily uses the system default while keeping the preference.

“Below range” means there is a non-zero but very low signal. “Signal anomaly” can mean sustained zero input or audio processing that makes the measurement unreliable. Permission, device, or signal failures can be retried by clicking the status text.

### Estimated dB(A)

Estimated dB(A) requires a colocated external sound level meter:

1. Place the meter next to the selected microphone.
2. Open the Calibration tab.
3. Enter a reference from `30–120 dB(A)`.
4. Start calibration and keep the sound field stable for 10 seconds.

The result applies only to the current input and processing configuration. Device or configuration changes invalidate it. Calibration does not change the quietness score, and the displayed dB(A) value is not a certified measurement.

### History and reports

Click the noise status or breathing indicator in Study mode to open history. The app keeps report data for 14 days. Reports include valid coverage, excluded duration, score trend, threshold attainment, actual deduction categories, the lowest record, and a clear warning when coverage is insufficient.

Automatic reports open about one minute before a scheduled session ends. Their auto-close duration can be set from 1 to 60 minutes. Reports opened from history stay open until you close or leave them.

The app stores local feature data and derived scores, not playable PCM recordings. A full JSON backup includes derived noise history but not raw feature frames. Export raw features separately as `.icnoise` under **System Data → Settings Data (`设置数据`) → Raw Monitoring Data (`原始监测数据`)**.

## Quotes and content

Built-in channels are Local Inspirational Quotes, University Mottos, Hitokoto, Jinrishici, and Advice Slip. Each channel can be enabled or disabled and given a weight; a higher weight increases selection probability.

Hitokoto supports 12 categories. Local channels can play sequentially or randomly and can be edited line by line. Importing a `.txt` file creates a custom local channel: one quote per line, up to 200 characters per quote and 1,000 entries.

Automatic rotation can be set from 30 seconds to 30 minutes. Turning it off does not disable manual refresh: click the quote in Study mode. Automatic refresh favors immediately available cached or local content and refreshes online content in the background; manual refresh tries online channels first.

If an online provider fails, the app tries other enabled providers, recent cached quotes, and then local channels. Keep at least one local channel enabled for reliable offline use. Advice Slip is English, so mixed Chinese and English content is expected when it is enabled.

Display modes are Natural Typing, Crossfade, and Immediate. Natural Typing has three speeds and an optional backspace-before-switch effect. Reduced-motion system settings override these animations.

Jinrishici's free service has non-commercial-use restrictions and processes public IP information. Online provider availability and content licensing are not guaranteed by this project; use curated local channels for public or classroom displays.

## Local data, backup, and reset

Immersive Clock has no account or cloud sync. Data stays in the current browser, PWA profile, or desktop application profile unless you export it.

### JSON backup scopes

- **Full Backup (`完整备份`)** — settings, schedules, event countdowns, quote content, custom fonts/backgrounds, and derived noise history.
- **Settings and Assets (`设置与资源`)** — settings, user content, and custom fonts/backgrounds, without noise history.

Neither scope includes raw noise feature frames, temporary caches, diagnostics, or device permissions. Backup files are unencrypted JSON and may contain location, schedule, quote, asset, and noise-activity information.

Restore always performs a local preflight before writing. Review the version, domains, warnings, and optional noise-history checkbox, then select **Restore and Reload (`恢复并刷新`)**. Restored categories replace local categories and discard unsaved Settings drafts.

Use `.icnoise` separately when raw noise features must move to another device. Import preflights file integrity, conflicts, and storage space before writing, then schedules a local score rebuild.

### Cleanup and destructive actions

Category cleanup can remove temporary cache, noise history, diagnostics, or unused appearance resources without touching other domains.

- **Restore Defaults (`恢复默认设置`)** resets display, alert, weather, noise, and appearance preferences but keeps schedules, event countdowns, quote content, history, and custom resources.
- **Delete All Local Data (`删除全部本地数据`)** permanently erases all registered settings, records, resources, caches, diagnostics, and device state for this app profile.

Create the required JSON and `.icnoise` exports before erasing data.

## Installation, offline use, and updates

Download the versioned Web ZIP from [GitHub Releases](https://github.com/Qziky/Immersive-clock/releases), deploy it over HTTPS with SPA fallback and the required weather proxy, or install that deployment as a PWA. External website deployments are outside the GitHub Release scope.

- Chrome/Edge desktop: use the address-bar or browser-menu Install command.
- Android Chrome: use Install App or Add to Home Screen.
- iPhone/iPad Safari: use Share → Add to Home Screen.

Windows and Linux desktop packages and a release-signed Android sideload APK are available from [GitHub Releases](https://github.com/Qziky/Immersive-clock/releases). Install the Android APK only from the project Release and allow “Install unknown apps” when prompted. There is currently no published macOS desktop package; self-host the Web/PWA build on macOS.

After the first successful online load, the PWA normally keeps the core clock interface and local content available offline. New weather, city search, online quotes, network time sources, and external feedback still require a connection.

The PWA checks for updates in the background. A new version normally takes effect after a refresh or reopen. Desktop packages do not currently have an in-app automatic-update publishing channel; install a newer Release manually.

For troubleshooting, see [FAQ and troubleshooting](faq-and-troubleshooting.md).
