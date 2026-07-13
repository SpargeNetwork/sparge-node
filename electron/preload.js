const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('observerShell', {
  openLogsFolder: () => ipcRenderer.invoke('observer:openLogs'),
  openDataFolder: () => ipcRenderer.invoke('observer:openData'),
  copyProducerUrl: () => ipcRenderer.invoke('observer:copyProducerUrl'),
  restartObserver: () => ipcRenderer.invoke('observer:restart'),
  stopObserver: () => ipcRenderer.invoke('observer:stop'),
  resetLocalData: (confirmPhrase) => ipcRenderer.invoke('observer:resetLocalData', confirmPhrase),
  getShellSettings: () => ipcRenderer.invoke('observer:getShellSettings'),
  setShellSettings: (settings) => ipcRenderer.invoke('observer:setShellSettings', settings)
});
