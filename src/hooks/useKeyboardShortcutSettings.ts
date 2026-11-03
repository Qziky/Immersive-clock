import { useEffect, useState } from "react";

import { APP_SETTINGS_KEY, getAppSettings } from "../utils/appSettings";
import { SETTINGS_EVENTS, subscribeSettingsEvent } from "../utils/settingsEvents";

function readShortcuts() {
  return getAppSettings().general.keyboardShortcuts;
}

export function useKeyboardShortcutSettings() {
  const [shortcuts, setShortcuts] = useState(readShortcuts);
  useEffect(() => {
    const refresh = () => setShortcuts(readShortcuts());
    const onStorage = (event: StorageEvent) => {
      if (event.key === APP_SETTINGS_KEY || event.key === null) refresh();
    };
    const unsubscribe = subscribeSettingsEvent(SETTINGS_EVENTS.SettingsSaved, refresh);
    window.addEventListener("storage", onStorage);
    return () => {
      unsubscribe();
      window.removeEventListener("storage", onStorage);
    };
  }, []);
  return shortcuts;
}
