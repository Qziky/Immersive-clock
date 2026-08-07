# FAQ and Troubleshooting

The current UI is primarily Chinese. Exact Chinese labels are included where they help you find a setting.

## Interface and controls

### The HUD is missing or disappears too quickly

Click an empty area or press `Space` / `Enter`. It hides after about eight seconds of inactivity. It remains visible while focus is inside it, and page shortcuts are disabled while a dialog is open.

### I cannot find Settings

The Settings button is in the lower-left corner and becomes visually subdued when idle. Move the pointer or use keyboard focus. It is temporarily hidden while another modal dialog is open.

### My changes did not apply

Most settings are drafts. Select **Save (`保存`)** at the bottom of the Settings panel. Canceling, refreshing, or closing the page discards unsaved changes, even if an appearance preview was visible.

### How do I replay onboarding?

Switch to Clock mode and select the question-mark button in the lower-left corner.

## Timers

### The countdown did not start after I confirmed it

Confirmation only sets the duration. Show the HUD and select **Start (`开始`)**.

### How do I replace a running countdown?

Click the large countdown time once. Confirming a new duration stops and replaces the current timer.

### There is no countdown sound

Interact with the page once to satisfy browser autoplay rules. Then check tab mute, system volume, output device, silent mode, and Do Not Disturb. Mobile browsers may suppress background audio.

### The clock is inaccurate

Check the operating system time zone and clock first. Under **System Data (`系统数据`) → Time Calibration (`时间校准`)**, inspect the last error or switch the source back to Default.

## Study mode and schedule

### The Study page is too crowded

Open **Workspace (`常用工作台`) → Study Display (`自习显示`)** and hide unneeded components. Reduce the Top Progress and Information list. The central time cannot be hidden.

### Schedule progress is wrong

Correct invalid or overlapping session times and select the main Settings Save button. Also check for an unintended manual or network time offset.

### Excel import did not change the schedule

After selecting the file, choose **Replace Current Schedule (`替换当前课表`)** or **Append (`合并追加`)**, resolve any errors, and then select the main Settings **Save** button.

### The automatic noise report did not open

Enable automatic reports, make sure the current time is inside a saved schedule session, and collect valid noise data. The report opens only about one minute before the session ends and will not reopen after you manually dismiss it for that session.

## Weather and location

### Location is stuck or weather fails to load

Check the network and site location permission. Open **Environment Alerts (`环境提醒`) → Location Service (`定位服务`)** and select **Refresh High-Accuracy Location (`刷新高精度定位`)**. If permission was permanently denied, change it in browser or operating-system settings. Use Manual City if needed.

### Automatic location selected the wrong city

Check the source. Public-IP fallback is only a city-level estimate and may be wrong on VPN, proxy, campus, carrier, or corporate networks. Search for and select an exact Manual City result.

### Manual City cannot be saved

After typing a city, select **Search City (`搜索城市`)** and choose one Xiaomi result. Free-form text alone is not a valid selection.

### I hid Weather but still receive alerts

Display and alert settings are independent. Disable alert popups under **Weather Service → Alerts (`提醒`)**. Remove Short-term Rain or Weather Alert from **Study Display → Top Progress and Information** if it still appears in the top bar.

### Weather remains stale

Open the Weather Service Updates tab, review the last success and error, and select **Refresh Weather (`刷新天气`)**. Cached data remains visible during offline or provider failures.

## Noise monitoring

### There is no microphone data

1. Confirm **Enable Environment Monitoring (`启用环境监测`)** is on.
2. Select **Authorize and Refresh (`授权并刷新`)**.
3. Check browser and operating-system microphone permissions.
4. Select an available input device.
5. Close software that has exclusive microphone access and click the Study noise status to retry.

### Device names are missing

Browsers commonly hide names before permission is granted. Select **Authorize and Refresh** first.

### Several tabs say they are connecting

Only one tab captures the microphone. Keep one Study tab open, close extras, and wait briefly. Refresh or re-authorize if leadership does not settle.

### What do “Below range” and “Signal anomaly” mean?

Below range means the app sees a non-zero but very low input. Check distance, mute, and input gain. Signal anomaly may mean sustained zero input or system noise suppression/automatic processing that makes the data unreliable. Try another input or disable processing.

### Why is there a score but no dB(A)?

Browser audio has no universal physical sound-pressure reference. Estimated dB(A) requires a stable 10-second calibration against a colocated sound level meter. It is still not a certified measurement.

### The report says there is no valid score

The selected period has insufficient valid coverage. Monitoring may have been disabled, interrupted, anomalous, not saved, or already removed by the 14-day retention policy. Collect new valid data and try again.

### Why does a Full Backup omit raw monitoring frames?

The JSON Full Backup includes derived noise history only. Export raw feature data separately as `.icnoise` under **Settings Data (`设置数据`) → Raw Monitoring Data (`原始监测数据`)**.

## Quotes

### Online quotes do not load

Check the network and make sure an online channel is enabled. The app then tries another provider, recent cache, and local channels. Keep at least one local channel enabled for offline reliability.

### Quotes switch between Chinese and English

Advice Slip provides English content. Disable it to avoid most English quotes.

### TXT import fails

Use a plain-text file with one non-empty quote per line, no more than 200 characters per quote and no more than 1,000 entries. Select the main Settings Save button after import.

### Channel or animation changes are not visible

The Settings preview is only a draft. Select the main **Save (`保存`)** button.

## Installation, offline use, and updates

### There is no PWA install button

Use HTTPS, wait for the page to finish loading, confirm the browser supports installation, and check whether the app is already installed. On iPhone/iPad use Safari's Share → Add to Home Screen command.

### Weather or online quotes do not work offline

This is expected. Core timers and local content can work offline, but new weather, city search, online quotes, network time, and external feedback require a connection.

### The PWA still shows an old version

Open **System Data → App Updates (`应用更新`)** and select **Check for Updates (`检查更新`)**. If resources are still being prepared, stay online and retry. If the old version remains after **Update Now (`立即更新`)**, close every Immersive Clock tab and PWA window, then reopen. Clear **Temporary Cache (`临时缓存`)** only after that; do not clear all site data until you have created a backup.

### A desktop update cannot be downloaded

Retry from App Updates, then use the Release-page fallback. Portable, deb, and rpm packages intentionally do not replace themselves. Verify that manual downloads come from the project GitHub Release and match `SHA256SUMS.txt`.

### Android does not open the APK download

The app falls back to the GitHub Release page. If that also fails, allow external links and download the release-signed APK manually from the project Release.

### Is there a macOS desktop package?

Not currently. Use the web or PWA version on macOS. Windows and Linux packages are listed in GitHub Releases.

## Data and privacy

### My settings disappeared after changing browser or device

There is no account sync. Create a JSON backup on the old profile and restore it under **System Data → Settings Data** on the new profile. Location and microphone permissions must be granted again.

### Are custom backgrounds and fonts uploaded?

They are stored in the current local app profile and are not sent as part of weather or quote requests. They are embedded in an unencrypted JSON file only when you create a backup. A production deployment may separately enable web usage analytics, so avoid importing sensitive material on shared devices.

### What does Restore Defaults delete?

It resets display, alert, weather, noise, and appearance preferences. It keeps schedules, event countdowns, quote content, history, and custom resources.

### How do I erase everything?

Open **System Data → Settings Data → Dangerous Operations (`危险操作`)** and choose **Delete All Local Data (`删除全部本地数据`)**. This permanently deletes all registered settings, records, resources, and caches for the current app profile. Export anything needed first.

### Backup restore fails

Read the preflight warning. Common causes are corruption, a backup from a newer unsupported version, unsupported old noise history, unsafe resource content, or manual edits that broke the format. Keep the original file and retry with a compatible current or newer app version.

If the issue remains, select the version number in the lower-right corner and open the Feedback tab. Include the app version, browser/OS, reproduction steps, and relevant error/debug summary, but do not publicly attach backups or files containing location, schedule, or noise history.
