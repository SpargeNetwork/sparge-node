const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('observerShell', {
  openLogsFolder: () => ipcRenderer.invoke('observer:openLogs'),
  openDataFolder: () => ipcRenderer.invoke('observer:openData'),
  copyProducerUrl: () => ipcRenderer.invoke('observer:copyProducerUrl'),
  restartObserver: () => ipcRenderer.invoke('observer:restart'),
  stopObserver: () => ipcRenderer.invoke('observer:stop'),
  resetLocalData: (confirmPhrase) => ipcRenderer.invoke('observer:resetLocalData', confirmPhrase),
  getShellSettings: () => ipcRenderer.invoke('observer:getShellSettings'),
  setShellSettings: (settings) => ipcRenderer.invoke('observer:setShellSettings', settings),
  openCommunityIdentity: () => ipcRenderer.invoke('observer:openCommunityIdentity'),
  getUpdateState: () => ipcRenderer.invoke('observer:getUpdateState'),
  checkForUpdates: () => ipcRenderer.invoke('observer:checkForUpdates'),
  downloadUpdate: () => ipcRenderer.invoke('observer:downloadUpdate'),
  installUpdate: () => ipcRenderer.invoke('observer:installUpdate'),
  onUpdateState: (callback) => {
    const listener = (_event, state) => callback(state);
    ipcRenderer.on('observer:updateState', listener);
    return () => ipcRenderer.removeListener('observer:updateState', listener);
  }
});
