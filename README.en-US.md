<div align="center">

<img src="public/favicon.svg" width="112" height="112" alt="Immersive Clock logo" />

<h1>Immersive Clock · 沉浸式时钟</h1>

<p><strong>Elegant time management. Deeper focus.</strong></p>
<p>A local-first fullscreen time dashboard for classrooms, study spaces, and personal focus.</p>

<p>
  <a href="https://github.com/Qziky/Immersive-clock/releases/latest"><strong>Download v4.0.1</strong></a>
  ·
  <a href="docs/user-guide/en-us/user-guide.md"><strong>User Guide</strong></a>
  ·
  <a href="CONTRIBUTING.en-US.md"><strong>Contribute</strong></a>
</p>

<p>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-GPL--3.0--only-2fecc6" alt="GPL-3.0-only" /></a>
  <img src="https://img.shields.io/badge/PWA-ready-0f766e?logo=pwa" alt="PWA ready" />
  <a href="https://github.com/Qziky/Immersive-clock/releases"><img src="https://img.shields.io/badge/Platform-Web%20%7C%20Android%20%7C%20Win%20%7C%20Linux-0891b2" alt="Web, Android, Windows, and Linux" /></a>
</p>

<p><a href="README.md">简体中文</a> · English</p>

</div>

## 💡 Overview

Immersive Clock is a fullscreen time dashboard for classroom projection, study spaces, and personal
desktops. Rather than replacing a full productivity suite, it keeps time and the information that
matters right now clear, calm, and easy to read from a distance.

Core timing needs no account, while settings and custom content stay on the current device by
default. Bring up the HUD only when you need controls, so the display stays focused the rest of the
time.

## ✨ Core features at a glance

Four time modes, study information, environmental context, and appearance controls share one
low-distraction interface for everyday timekeeping, event timing, and long-running focus displays.

| Capability         | Best for                                | What it provides                                                                  |
| ------------------ | --------------------------------------- | --------------------------------------------------------------------------------- |
| **Clock**          | Desktops, projection, ambient display   | Large time, date, optional seconds, and an auto-hiding HUD                        |
| **Countdown**      | Exams, talks, Pomodoro sessions         | Quick presets, custom durations, and completion alerts                            |
| **Stopwatch**      | Activities, training, classroom timing  | Start, pause, resume, and reset                                                   |
| **Study**          | Classrooms, study rooms, personal focus | Time, weather, progress, events, quotes, and optional environment monitoring      |
| **Local first**    | Account-free personal use               | Settings, schedules, resources, and history stay on the current device by default |
| **Appearance**     | Projection tuning and personalization   | Fonts, backgrounds, time display, and component-level styling                     |
| **Multi-platform** | Browsers, desktops, and mobile devices  | Web/PWA, Windows/Linux, and a release-signed Android APK                          |

> Local first does not mean every feature is fully offline. Core timers and local content work
> offline; fresh weather, city search, online quotes, external time sync, and feedback pages need a
> network connection.

<a id="preview"></a>

## 🖼️ Interface preview / 界面预览

The screens below use demo data and show no real location, schedule, name, or microphone data.

### 📚 Study dashboard / 自习看板

Weather, daily progress, a milestone, fixed time, and an original demo quote share one restrained
information hierarchy.

![Study dashboard with weather, progress, milestone, and time](docs/marketing/assets/readme/readme-study-dashboard.png)

### ⏱️ Four modes / 四种模式

One visual language covers the clock, a 30-minute countdown, a paused non-zero stopwatch, and study
mode.

![Clock, countdown, stopwatch, and study mode collage](docs/marketing/assets/readme/readme-modes-grid.png)

### 🎨 Appearance settings / 外观设置

The settings center provides a live preview, primary and information fonts, backgrounds, and
per-page appearance controls.

![Immersive Clock appearance settings](docs/marketing/assets/readme/readme-appearance-settings.png)

## 🚀 Quick usage guide

Choose the option that best fits your device and how you use the clock.

### 📱 Option 1: Install as a PWA (recommended)

A PWA installs the web build on your desktop, Start menu, or home screen. It opens like a standalone app and caches core pages and static assets for offline use.

1. Download the Web ZIP from [GitHub Releases](https://github.com/Qziky/Immersive-clock/releases/latest), then deploy it to an HTTPS web server with SPA fallback support.
2. Open the deployed address in Chrome, Edge, or another browser that supports PWAs.
3. Select the address-bar install icon, or choose “Install app” / “Add to Home Screen” from the browser menu, then confirm.

### 🌐 Option 2: Use it directly in a browser

Open a deployed Web build and start using it without installing anything. Use the lower-right HUD to switch among clock, countdown, stopwatch, and study mode.

> For the fullest PWA, offline-cache, and animation experience, use the latest Chrome, Edge, or Safari.

### 💻 Option 3: Download a desktop or mobile build

Windows, Linux, and Android builds are available from [GitHub Releases](https://github.com/Qziky/Immersive-clock/releases/latest). Check the applicable release page for its actual attachments.

- Windows: x64 installer and portable builds;
- Linux: AppImage, deb, and rpm;
- Android: release-signed sideload APK; the system may require allowing installs from unknown apps;
- macOS: no native installer is currently published; use a self-hosted Web/PWA build instead.

> External website deployments are outside the v4.0.1 release scope. This README does not guarantee their current version or availability.

## 🔒 Privacy and capability boundaries

- Core time features require no account, and the project does not provide automatic cloud sync.
- Settings, schedules, countdowns, quotes, custom fonts, and backgrounds stay in the current browser
  or client by default.
- Microphone access is requested only after environment monitoring is enabled; README screenshots
  contain no captured or displayed microphone data.
- The default noise metric is a **0–100 environmental quietness score** for relative comparison on
  the same device under similar conditions. It is not a professional sound level meter.
- Estimated dB(A) requires external reference calibration and still must not be used for enforcement,
  occupational health, equipment acceptance, or scientific conclusions.
- Weather, online quotes, external time sync, feedback surveys, and optional site analytics depend on
  their respective third-party network services.
- Exported backups are plaintext and may contain location, schedules, quotes, or noise activity
  times. Store them carefully.

See [Data and Privacy Principles](docs/product/data-and-privacy-principles.md) and
[Quietness Scoring](docs/technical/modules/quietness-scoring.md) for the full boundaries.

## 📖 Help and documentation

See the [English user guide](docs/user-guide/en-us/user-guide.md) for time modes, settings, weather,
noise monitoring, backups, and troubleshooting.

### 🧭 Detailed usage and permissions

- [English user guide](docs/user-guide/en-us/user-guide.md)
- [Quick start](docs/user-guide/quick-start.md)
- [Time modes and HUD](docs/user-guide/time-modes-and-hud.md)
- [Study mode and schedules](docs/user-guide/study-mode-and-schedule.md)
- [Settings and personalization](docs/user-guide/settings-and-personalization.md)
- [Weather, location, and alerts](docs/user-guide/weather-location-and-alerts.md)
- [Noise monitoring and reports](docs/user-guide/noise-monitoring-and-reports.md)
- [Data backup, privacy, and reset](docs/user-guide/data-backup-privacy-and-reset.md)
- [Installation, offline use, and updates](docs/user-guide/installation-offline-and-updates.md)

### ❓ FAQ

- **Weather or online quotes are unavailable offline?** This is expected; core timing and local
  content continue to work.
- **No PWA install button?** Check HTTPS, browser support, and whether the app is already installed.
- **No noise monitoring data?** Check system and browser microphone permissions, then enable
  environment monitoring in settings.
- **Is there a macOS desktop package?** Not currently; use the Web version or install the PWA.
- **How do I move settings?** Use export and import under System Data, and protect the plaintext
  backup.

More answers are available in the
[English FAQ](docs/user-guide/en-us/faq-and-troubleshooting.md) and the
[full troubleshooting guide](docs/user-guide/faq-and-troubleshooting.md).

## 🤝 Contributing and feedback

- For code, documentation, and translation contributions, read
  [CONTRIBUTING.en-US.md](CONTRIBUTING.en-US.md).
- Feature requests and bug reports:
  [GitHub Issues](https://github.com/Qziky/Immersive-clock/issues).
- QQ community: [965931796](https://qm.qq.com/q/fawykipRhm).
- Experience survey: [Tencent Survey](https://wj.qq.com/s2/25666249/lj9p/).

### 🌟 Community and Star history

<p align="center">
  <img alt="Immersive Clock QQ community QR code" src="public/assets/qq-group-light.png" width="320" />
</p>

- Friendly links: [SECTL](https://sectl.top/) ·
  [LanMountainDesktop](https://github.com/wwiinnddyy/LanMountainDesktop).

<p align="center">
  <a href="https://www.star-history.com/#Qziky/Immersive-clock&type=date&legend=top-left">
    <picture>
      <source
        media="(prefers-color-scheme: dark)"
        srcset="https://api.star-history.com/svg?repos=Qziky/Immersive-clock&type=date&theme=dark&legend=top-left"
      />
      <source
        media="(prefers-color-scheme: light)"
        srcset="https://api.star-history.com/svg?repos=Qziky/Immersive-clock&type=date&legend=top-left"
      />
      <img
        alt="Immersive Clock Star history"
        src="https://api.star-history.com/svg?repos=Qziky/Immersive-clock&type=date&legend=top-left"
      />
    </picture>
  </a>
</p>

## ⚖️ License

This project is licensed under [GPL-3.0-only](LICENSE).

Copyright © 2025–2026 [Qziky](https://github.com/Qziky)
