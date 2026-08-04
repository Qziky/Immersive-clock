const { contextBridge, ipcRenderer } = require("electron");

const TIME_SYNC_NTP_CHANNEL = "timeSync:ntp";
const KEEP_AWAKE_SET_CHANNEL = "keepAwake:setEnabled";

contextBridge.exposeInMainWorld("electronAPI", {
  platform: process.platform,
  timeSync: {
    ntp: (options) => ipcRenderer.invoke(TIME_SYNC_NTP_CHANNEL, options),
  },
  keepAwake: {
    setEnabled: (enabled) => ipcRenderer.invoke(KEEP_AWAKE_SET_CHANNEL, Boolean(enabled)),
  },
});
