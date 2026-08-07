const { contextBridge, ipcRenderer } = require("electron");

const TIME_SYNC_NTP_CHANNEL = "timeSync:ntp";
const KEEP_AWAKE_SET_CHANNEL = "keepAwake:setEnabled";
const UPDATE_GET_STATE_CHANNEL = "updates:getState";
const UPDATE_CHECK_CHANNEL = "updates:check";
const UPDATE_INSTALL_CHANNEL = "updates:install";
const UPDATE_OPEN_RELEASE_CHANNEL = "updates:openRelease";
const UPDATE_STATE_CHANNEL = "updates:state";

contextBridge.exposeInMainWorld("electronAPI", {
  platform: process.platform,
  timeSync: {
    ntp: (options) => ipcRenderer.invoke(TIME_SYNC_NTP_CHANNEL, options),
  },
  keepAwake: {
    setEnabled: (enabled) => ipcRenderer.invoke(KEEP_AWAKE_SET_CHANNEL, Boolean(enabled)),
  },
  updates: {
    getState: () => ipcRenderer.invoke(UPDATE_GET_STATE_CHANNEL),
    check: () => ipcRenderer.invoke(UPDATE_CHECK_CHANNEL),
    install: () => ipcRenderer.invoke(UPDATE_INSTALL_CHANNEL),
    openRelease: () => ipcRenderer.invoke(UPDATE_OPEN_RELEASE_CHANNEL),
    subscribe: (listener) => {
      const handler = (_event, state) => listener(state);
      ipcRenderer.on(UPDATE_STATE_CHANNEL, handler);
      return () => ipcRenderer.removeListener(UPDATE_STATE_CHANNEL, handler);
    },
  },
});
