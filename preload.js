const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('nexoStore', {
  getAll: () => ipcRenderer.invoke('store:getAll'),
  getState: () => ipcRenderer.invoke('store:getAll'),
  setAll: (data) => ipcRenderer.invoke('store:setAll', data),
  patch: (partial) => ipcRenderer.invoke('store:patch', partial),
  backupNow: () => ipcRenderer.invoke('store:backupNow'),
  openDataFolder: () => ipcRenderer.invoke('app:openDataFolder'),
  exportBackup: () => ipcRenderer.invoke('app:exportBackup'),
  importContactsChunk: (payload) => ipcRenderer.invoke('store:importContactsChunk', payload),
  queueDelta: (delta) => ipcRenderer.invoke('store:queueDelta', delta),
  flushDeltas: (reason) => ipcRenderer.invoke('store:flushDeltas', reason || 'manual'),
  asyncSaveRequest: (payload) => ipcRenderer.send('async-save-request', payload || {})
});

// Shadow Logging — telemetría silenciosa de acciones
contextBridge.exposeInMainWorld('telemetry', {
  logActivity: (payload) => ipcRenderer.invoke('store:logActivity', payload || {}),
  logActivityBatch: (payload) => ipcRenderer.invoke('store:logActivityBatch', payload || {})
});

contextBridge.exposeInMainWorld('electronAPI', {
  openExternal: (url) => ipcRenderer.invoke('external:open', url),
  // WhatsApp Web dentro de Electron (ventana dedicada)
  whatsappOpen: (payload) => ipcRenderer.invoke('whatsapp:open', payload || {}),
  whatsappBack: (payload) => ipcRenderer.invoke('whatsapp:back', payload || {}),
  whatsappMinimize: (payload) => ipcRenderer.invoke('whatsapp:minimize', payload || {}),
  whatsappClose: (payload) => ipcRenderer.invoke('whatsapp:close', payload || {}),
  whatsappFocusMain: () => ipcRenderer.invoke('whatsapp:focusMain'),
  whatsappListSessions: () => ipcRenderer.invoke('whatsapp:listSessions'),
  whatsappFocus: (payload) => ipcRenderer.invoke('whatsapp:focus', payload || {}),
  // WhatsApp Hub (tipo Rambox)
  whatsappHubOpen: (payload) => ipcRenderer.invoke('whatsappHub:open', payload || {}),
  whatsappHubList: () => ipcRenderer.invoke('whatsappHub:list'),
  whatsappHubAdd: (payload) => ipcRenderer.invoke('whatsappHub:add', payload || {}),
  whatsappHubSelect: (payload) => ipcRenderer.invoke('whatsappHub:select', payload || {}),
  whatsappHubCloseSession: (payload) => ipcRenderer.invoke('whatsappHub:closeSession', payload || {}),
  whatsappHubReorder: (payload) => ipcRenderer.invoke('whatsappHub:reorder', payload || {}),
  whatsappHubResetSession: (payload) => ipcRenderer.invoke('whatsappHub:resetSession', payload || {}),
  whatsappHubUpdateProfile: (payload) => ipcRenderer.invoke('whatsappHub:updateProfile', payload || {}),
  whatsappHubOpenContact: (payload) => ipcRenderer.invoke('whatsappHub:openContact', payload || {}),
  whatsappHubNavigate: (payload) => ipcRenderer.invoke('whatsappHub:navigate', payload || {}),
  whatsappHubGoBack: (payload) => ipcRenderer.invoke('whatsappHub:goBack', payload || {}),
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
  verifyAdminPassword: (password) => ipcRenderer.invoke('admin:verifyPassword', { password }),
  hasAdminAccess: () => ipcRenderer.invoke('admin:hasAccess'),

  listProfiles: () => ipcRenderer.invoke('profile:list'),
  createProfile: (payload) => ipcRenderer.invoke('profile:create', payload || {}),
  renameProfile: (payload) => ipcRenderer.invoke('profile:rename', payload || {}),
  deleteProfile: (payload) => ipcRenderer.invoke('profile:delete', payload || {}),
  resolveImportMode: () => ipcRenderer.invoke('profile:resolveImportMode'),
  buildExport: (payload) => ipcRenderer.invoke('export:build', payload || {}),
  loadProfile: (payload) => ipcRenderer.invoke('profile:load', payload || {}),
  saveProfile: (payload) => ipcRenderer.invoke('profile:save', payload || {}),
  comparatorScan: () => ipcRenderer.invoke('profile:comparatorScan'),
  backupWriteToDisk: (payload) => ipcRenderer.invoke('backup:writeToDisk', payload || {}),

  metricsSummary24h: (payload) => ipcRenderer.invoke('metrics:summary24h', payload || {}),
  metricsTail: (payload) => ipcRenderer.invoke('metrics:tail', payload || {}),
  metricsGetCompleteHistory: (payload) => ipcRenderer.invoke('metrics:getCompleteHistory', payload || {}),

  // Ops Monthly History — Calendario Operativo
  saveOpsMonthlyHistory: (payload) => ipcRenderer.invoke('ops:saveMonthlyHistory', payload || {}),
  getOpsMonthlyHistory: (payload) => ipcRenderer.invoke('ops:getMonthlyHistory', payload || {}),

  // Ops Raw CSV Uploads — persistencia de archivos crudos para rehidratar al reiniciar
  saveOpsRawUpload: (payload) => ipcRenderer.invoke('ops:saveRawUpload', payload || {}),
  listOpsRawUploads: (payload) => ipcRenderer.invoke('ops:listRawUploads', payload || {}),
  loadOpsRawUpload: (payload) => ipcRenderer.invoke('ops:loadRawUpload', payload || {}),

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

contextBridge.exposeInMainWorld('api', {
  exportDaily: (payload) => ipcRenderer.invoke('export:daily', payload || {}),
  exportBackup: (payload) => ipcRenderer.invoke('export:full', payload || {}),
  exportFull: (payload) => ipcRenderer.invoke('export:full', payload || {}),
  importData: (filePath) => ipcRenderer.invoke('import:data', { filePath })
});
