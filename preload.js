const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('nexoStore', {
  getAll: () => ipcRenderer.invoke('store:getAll'),
  setAll: (data) => ipcRenderer.invoke('store:setAll', data),
  patch: (partial) => ipcRenderer.invoke('store:patch', partial),
  backupNow: () => ipcRenderer.invoke('store:backupNow'),
  openDataFolder: () => ipcRenderer.invoke('app:openDataFolder'),
  exportBackup: () => ipcRenderer.invoke('app:exportBackup'),
  importContactsChunk: (payload) => ipcRenderer.invoke('store:importContactsChunk', payload)
});

contextBridge.exposeInMainWorld('electronAPI', {
  openExternal: (url) => ipcRenderer.invoke('external:open', url),
  openImportDialog: () => ipcRenderer.invoke('dialog:openImportFiles'),
  readTextFile: (filePath) => ipcRenderer.invoke('file:readText', filePath),
  notify: (payload) => ipcRenderer.invoke('app:notify', payload || {}),
  checkForUpdates: () => ipcRenderer.invoke('updater:check'),
  installUpdate: (options) => ipcRenderer.invoke('updater:install', options || {}),
  rollbackPreviousVersion: () => ipcRenderer.invoke('updater:rollbackPrevious'),
  getUpdaterDiagnostics: () => ipcRenderer.invoke('updater:diagnostics'),
  getAppVersion: () => ipcRenderer.invoke('app:getVersion'),
  getRuntimeHash: () => ipcRenderer.invoke('app:getRuntimeHash'),
  getErrorLogPath: () => ipcRenderer.invoke('app:getErrorLogPath'),
  openErrorLog: () => ipcRenderer.invoke('app:openErrorLog'),
  logError: (payload) => ipcRenderer.invoke('app:logError', payload),
  queueUpload: (payload) => ipcRenderer.invoke('app:queueUpload', payload),
  zoomIn: () => ipcRenderer.invoke('zoom:in'),
  zoomOut: () => ipcRenderer.invoke('zoom:out'),
  zoomReset: () => ipcRenderer.invoke('zoom:reset'),
  onDeepLinkImport: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on('deep-link:import', listener);
    return () => ipcRenderer.removeListener('deep-link:import', listener);
  },
  onUpdaterStatus: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on('updater:status', listener);
    return () => ipcRenderer.removeListener('updater:status', listener);
  }
});
