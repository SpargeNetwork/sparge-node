const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('observerShell', {
  openLogsFolder: () => ipcRenderer.invoke('observer:openLogs'),
  openDataFolder: () => ipcRenderer.invoke('observer:openData'),
  copyProducerUrl: () => ipcRenderer.invoke('observer:copyProducerUrl')
});
