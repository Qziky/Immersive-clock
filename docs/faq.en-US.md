# FAQ

## Weather location not available?

- Ensure browser location permission is granted. If denied, the app falls back to IP-based location. You can manually refresh weather in Settings.

## No data in noise monitoring?

- Microphone permission is required. Check device support and allow microphone access in browser settings.

## HUD not visible or hides too fast?

- HUD auto-hides in ~8 seconds. Click anywhere or press `Space/Enter` to show again. If a modal is open (e.g., countdown settings), HUD won’t respond.

## No sound in countdown?

- Allow audio playback in the browser and disable system Do Not Disturb. The last 5 seconds play ticks (`public/ding-1.mp3`); end chime uses `public/ding.mp3`.

## How to manage schedules?

- In Study mode, click Settings and use the “Schedule” section to add/edit/delete. Data persists in local storage.

## PWA install fails or offline doesn’t work?

- Use a modern browser with HTTPS. Core assets are cached on first visit; updates auto refresh. If issues persist, clear site data and revisit.

## Can I customize quote sources?

- Yes. Under **Settings** -> **Content Settings**, you can independently enable or disable local channels, Hitokoto, Jinrishici, and Advice Slip, and adjust each channel's weight. Hitokoto also supports Literature, Poetry, and Philosophy categories. Enabling both Chinese providers and the English Advice Slip channel may produce mixed-language quotes.

## What happens when online quotes are unavailable?

- The app tries other enabled and healthy online channels, persisted quotes from the last 7 days, and then local quotes. Local content remains available offline. If every online request fails during a manual refresh, the current quote stays visible. Third-party availability is not guaranteed by this project.

## What should I know before enabling Jinrishici?

- Jinrishici's free service is limited to non-commercial use. It processes your public IP and recommends storing a Token/Cookie on the device for terminal identification. The app persists only normalized quote content, not the raw IP, Token, or warning returned by the service. This project does not guarantee third-party content licensing; review and follow the provider's terms and applicable content licenses.

## How do I reset or move my local data?

- Open **Settings** -> **System Data** -> **Settings Data**. “Restore defaults” resets preferences and appearance while preserving schedules, countdowns, quotes, custom resources, and noise history. Use a full JSON backup to move those data to another browser or device. Backups are unencrypted and may contain location and schedule information, so keep them on trusted devices.
