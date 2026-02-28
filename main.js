const { app, BrowserWindow, ipcMain, shell, dialog } = require('electron');
const fs = require('fs/promises');
const fssync = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');
const { autoUpdater, initUpdater, checkForUpdatesWithFallback, ensureVersionInstallerCached, RELEASE_OWNER, RELEASE_REPO, RELEASE_CHANNEL, getUpdatesCacheDir, pruneCachedInstallers, getUpdaterDiagnostics, validateLatestReleaseAssets } = require('./update-manager');

const MIN_UPDATE_SIZE_BYTES = 10 * 1024 * 1024;
const MAX_UPDATE_SIZE_BYTES = 500 * 1024 * 1024;
const STABLE_TAG = 'v1.1.10';

const DEFAULT_DB = {
  contactsData: [],
  contactsHistory: [],
  whatsappTemplate: 'Hola {usuario}, ¿cómo estás? Te escribo por la propuesta que vimos.',
  duplicateMergeMode: 'phone-auto',
  lastExportAt: null,
  backups: {},
  extraStorage: {}
};

let mainWindow = null;
let currentZoomFactor = 1.0;
let dbCache = null;
let dbCacheLoadedAt = 0;
let downloadedUpdateMeta = null;
let lastUpdateAttempt = { at: null, stage: 'idle', ok: null, message: '' };

function getDbPath() {
  return path.join(app.getPath('userData'), 'nexo-db.json');
}

function getErrorLogPath() {
  return path.join(app.getPath('userData'), 'nexo-error.log');
}

function getUpdateCacheDir() {
  return getUpdatesCacheDir();
}

function getCurrentVersionMetaPath() {
  return path.join(app.getPath('userData'), 'current-version.json');
}

async function persistCurrentVersionMeta(extra = {}) {
  try {
    const cacheDir = getUpdateCacheDir();
    await fs.mkdir(cacheDir, { recursive: true });
    const payload = {
      version: app.getVersion(),
      channel: RELEASE_CHANNEL,
      savedAt: new Date().toISOString(),
      ...extra
    };
    await fs.writeFile(getCurrentVersionMetaPath(), JSON.stringify(payload, null, 2), 'utf8');
    return payload;
  } catch (error) {
    await appendErrorLog('persistCurrentVersionMeta', error, extra);
    return null;
  }
}

async function appendErrorLog(scope, error, extra = {}) {
  try {
    const err = normalizeError(error);
    const at = new Date().toISOString();
    const pretty = [
      '============================================================',
      `[${at}] ${scope}`,
      `Mensaje: ${err.message || 'Sin mensaje'}`,
      `Tipo: ${err.name || 'Error'}`,
      `Codigo: ${err.code || '-'}`,
      err.stack ? `Stack:\n${err.stack}` : 'Stack: -',
      `Extra: ${Object.keys(extra || {}).length ? JSON.stringify(extra, null, 2) : '-'}`,
      ''
    ].join('\n');
    await fs.appendFile(getErrorLogPath(), pretty, 'utf8');
  } catch (_e) {
    // best effort log
  }
}

function normalizeError(error) {
  if (!error) return { name: 'Error', message: 'Error vacío', stack: '', code: '' };
  if (typeof error === 'string') return { name: 'Error', message: error, stack: '', code: '' };
  return {
    name: error.name || 'Error',
    message: error.message || String(error),
    stack: error.stack || '',
    code: error.code || ''
  };
}

function perfLog(scope, message, extra = {}) {
  try { console.log(`[nexo:${scope}] ${message}`, extra); } catch (_) {}
}

function humanUpdaterError(error) {
  const normalized = normalizeError(error);
  const raw = `${normalized.code || ''} ${normalized.message || ''}`.toLowerCase();
  if (raw.includes('enetunreach') || raw.includes('econnrefused') || raw.includes('timed out') || raw.includes('network')) {
    return 'Sin conexión de red o el servidor de updates no respondió.';
  }
  if (raw.includes('certificate') || raw.includes('self signed')) {
    return 'Problema de certificado TLS al validar la descarga.';
  }
  if (raw.includes('403') || raw.includes('forbidden')) {
    return 'Acceso denegado al release (403). Revisá permisos del repositorio/release.';
  }
  if (raw.includes('404') || raw.includes('not found') || raw.includes('no published versions')) {
    return 'No se encontró release disponible para este canal/arquitectura (404).';
  }
  if (raw.includes('sha') || raw.includes('checksum') || raw.includes('hash')) {
    return 'La integridad del instalador falló (hash/checksum inválido).';
  }
  if (raw.includes('ebusy') || raw.includes('eperm') || raw.includes('access is denied')) {
    return 'No se pudo escribir/reemplazar archivos (archivo bloqueado o sin permisos).';
  }
  if (raw.includes('enomem') || raw.includes('out of memory')) {
    return 'Memoria insuficiente para procesar la actualización.';
  }
  if (raw.includes('enospc') || raw.includes('no space')) {
    return 'Espacio en disco insuficiente para descargar o instalar la actualización.';
  }
  return normalized.message || 'Falló el actualizador por una causa no clasificada.';
}

async function computeFileSha512(filePath) {
  const hash = crypto.createHash('sha512');
  const file = await fs.open(filePath, 'r');
  try {
    const stream = file.createReadStream();
    await new Promise((resolve, reject) => {
      stream.on('data', (chunk) => hash.update(chunk));
      stream.on('error', reject);
      stream.on('end', resolve);
    });
  } finally {
    await file.close();
  }
  return hash.digest('base64');
}


function getStableReleaseUrl() {
  return `https://github.com/${RELEASE_OWNER}/${RELEASE_REPO}/releases/tag/${STABLE_TAG}`;
}

function parseArgValue(flag) {
  const prefix = `${flag}=`;
  const arg = process.argv.find((x) => typeof x === 'string' && x.startsWith(prefix));
  return arg ? arg.slice(prefix.length) : '';
}

function createUpdateAssistantWindow(meta = {}) {
  const win = new BrowserWindow({
    width: 560,
    height: 420,
    resizable: false,
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: false,
      sandbox: false,
      nodeIntegration: true
    }
  });

  const safeVersion = String(meta.version || '');
  const safeInstaller = String(meta.installerPath || '');
  const encodedInstaller = JSON.stringify(safeInstaller);
  const encodedVersion = JSON.stringify(safeVersion);

  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Asistente de actualización</title>
  <style>body{font-family:Segoe UI,system-ui,sans-serif;background:#0f172a;color:#e2e8f0;padding:18px} .card{background:#1e293b;border-radius:14px;padding:16px;border:1px solid #334155} .bar{height:12px;background:#0b1220;border-radius:999px;overflow:hidden} .fill{height:100%;width:0%;background:linear-gradient(90deg,#3b82f6,#10b981);transition:width .25s ease} button{margin-top:12px;background:#2563eb;color:#fff;border:none;border-radius:8px;padding:10px 14px;cursor:pointer} pre{white-space:pre-wrap;max-height:120px;overflow:auto;background:#0b1220;padding:10px;border-radius:8px} </style></head>
  <body><div class="card"><h2>Asistente de actualización</h2><div id="m">Preparando actualización…</div><div class="bar"><div id="f" class="fill"></div></div><p id="p">0%</p><pre id="l"></pre><button id="open" style="display:none">Abrir Nexo actualizado</button></div>
  <script>
    const { spawn } = require('child_process');
    const installer = ${encodedInstaller};
    const version = ${encodedVersion};
    const msg = document.getElementById('m');
    const fill = document.getElementById('f');
    const pct = document.getElementById('p');
    const log = document.getElementById('l');
    const openBtn = document.getElementById('open');
    const set = (v,t) => { fill.style.width=v+'%'; pct.textContent=v+'%'; if(t) msg.textContent=t; };
    const addLog = (x) => { log.textContent += (x+'\n'); };
    const fake = [12,28,41,63,79,91];
    let i=0;
    const timer = setInterval(()=>{ if(i>=fake.length){clearInterval(timer); return;} set(fake[i], 'Instalando Nexo '+(version||'')); i++; }, 700);
    try {
      addLog('Ejecutando instalador en modo silencioso…');
      const child = spawn(installer, ['/S'], { detached:false, stdio:'ignore', windowsHide:true });
      child.on('exit', (code) => {
        set(100, code === 0 ? 'Actualización finalizada' : 'Actualización terminó con advertencia');
        addLog('Proceso instalador cerrado. Código: '+code);
        openBtn.style.display = 'inline-block';
      });
      child.on('error', (e) => {
        addLog('Error al ejecutar instalador: '+(e.message||e));
        msg.textContent = 'Falló la actualización';
      });
    } catch (e) {
      addLog('Error crítico: '+(e.message||e));
      msg.textContent = 'Falló la actualización';
    }
    openBtn.onclick = () => {
      try { spawn(process.execPath, [], { detached:true, stdio:'ignore', windowsHide:true }).unref(); } catch(_) {}
      window.close();
    };
  </script></body></html>`;

  win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
}

function sendUpdaterStatus(status, payload = {}) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send('updater:status', { status, ...payload });
}

async function readDb({ force = false } = {}) {
  if (!force && dbCache) return JSON.parse(JSON.stringify(dbCache));
  const dbPath = getDbPath();
  try {
    const raw = await fs.readFile(dbPath, 'utf8');
    const parsed = JSON.parse(raw);
    dbCache = {
      ...DEFAULT_DB,
      ...(parsed && typeof parsed === 'object' ? parsed : {}),
      backups: parsed?.backups && typeof parsed.backups === 'object' ? parsed.backups : {},
      extraStorage: parsed?.extraStorage && typeof parsed.extraStorage === 'object' ? parsed.extraStorage : {}
    };
    dbCacheLoadedAt = Date.now();
    return JSON.parse(JSON.stringify(dbCache));
  } catch (error) {
    if (error.code === 'ENOENT') {
      dbCache = { ...DEFAULT_DB };
      dbCacheLoadedAt = Date.now();
      return JSON.parse(JSON.stringify(dbCache));
    }
    await appendErrorLog('readDb', error);
    throw error;
  }
}

function setDbCache(data) {
  dbCache = {
    ...DEFAULT_DB,
    ...(data && typeof data === 'object' ? data : {}),
    backups: data?.backups && typeof data.backups === 'object' ? data.backups : {},
    extraStorage: data?.extraStorage && typeof data.extraStorage === 'object' ? data.extraStorage : {}
  };
  dbCacheLoadedAt = Date.now();
}

async function writeDb(data) {
  const dbPath = getDbPath();
  await fs.mkdir(path.dirname(dbPath), { recursive: true });
  const tmpPath = `${dbPath}.tmp`;
  const normalized = { ...DEFAULT_DB, ...data };
  setDbCache(normalized);
  const payload = JSON.stringify(normalized, null, 2);
  await fs.writeFile(tmpPath, payload, 'utf8');
  await fs.rename(tmpPath, dbPath);
}

let writeQueue = Promise.resolve();
function queueWrite(data) {
  const started = Date.now();
  writeQueue = writeQueue.then(async () => {
    await writeDb(data);
    perfLog('store', 'write ok', { ms: Date.now() - started });
  }).catch(async (error) => {
    perfLog('store', 'write error', { ms: Date.now() - started, message: error?.message || String(error) });
    await appendErrorLog('queueWrite', error);
    throw error;
  });
  return writeQueue;
}

function clampZoom(value) {
  return Math.min(3, Math.max(0.5, value));
}

function applyZoomDelta(delta) {
  if (!mainWindow || mainWindow.isDestroyed()) return currentZoomFactor;
  currentZoomFactor = clampZoom((mainWindow.webContents.getZoomFactor?.() || currentZoomFactor) + delta);
  mainWindow.webContents.setZoomFactor(currentZoomFactor);
  return currentZoomFactor;
}

function applyZoomReset() {
  if (!mainWindow || mainWindow.isDestroyed()) return 1;
  currentZoomFactor = 1;
  mainWindow.webContents.setZoomFactor(1);
  return currentZoomFactor;
}


async function handleInternalUrl(url) {
  if (!url || typeof url !== 'string') return false;
  if (url.startsWith('nexo://rollback-previous')) {
    try {
      const candidate = await resolveRollbackInstaller();
      if (!candidate) {
        sendUpdaterStatus('error', { message: 'No hay versión anterior en cache para rollback.' });
        return true;
      }
      await startInstallerAndQuit(candidate.fullPath);
      return true;
    } catch (error) {
      await appendErrorLog('internal-url-rollback', error, { url });
      sendUpdaterStatus('error', { message: `No se pudo iniciar rollback: ${error?.message || error}` });
      return true;
    }
  }
  if (url.startsWith('nexo://open-stable-110')) {
    await shell.openExternal(getStableReleaseUrl());
    return true;
  }
  return false;
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/whatsapp\.com|wa\.me/i.test(url)) {
      shell.openExternal(url);
      return { action: 'deny' };
    }
    if (url.startsWith('nexo://')) {
      handleInternalUrl(url).catch((e) => appendErrorLog('windowOpenHandler', e, { url }));
      return { action: 'deny' };
    }
    return { action: 'allow' };
  });

  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (/whatsapp\.com|wa\.me/i.test(url)) {
      event.preventDefault();
      shell.openExternal(url);
      return;
    }
    if (url.startsWith('nexo://')) {
      event.preventDefault();
      handleInternalUrl(url).catch((e) => appendErrorLog('will-navigate', e, { url }));
    }
  });

  mainWindow.webContents.on('render-process-gone', async (_event, details) => {
    await appendErrorLog('renderer-gone', new Error('Renderer process gone'), details || {});
  });

  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (!input.control) return;
    if (input.type !== 'keyDown') return;
    const key = String(input.key || '').toLowerCase();
    if (input.shift && key === 'u') {
      event.preventDefault();
      getUpdaterDiagnostics().then(async (diag) => {
        const latest = await validateLatestReleaseAssets().catch(() => ({ ok: false, message: 'No disponible' }));
        const lines = [
          `Versión actual: ${diag.version}`,
          `Canal: ${diag.channel}`,
          `Repo: ${diag.repo}`,
          `Release URL: ${diag.updateUrl}`,
          `latest.yml: ${latest.ok ? `ok (${latest.version || '-'})` : `error (${latest.message || '-'})`}`,
          `Cache dir: ${diag.cacheDir}`,
          `Instaladores cache: ${diag.cacheInstallers.length}`,
          `Log updater: ${diag.logPath}`
        ];
        await dialog.showMessageBox({ type: 'info', title: 'Diagnóstico updater', message: lines.join('\n') });
      }).catch((e) => appendErrorLog('updater-diagnostics-shortcut', e));
      return;
    }
    if (['+', '=', 'plus', 'numadd'].includes(key)) {
      event.preventDefault();
      applyZoomDelta(0.1);
      return;
    }
    if (['-', '_', 'minus', 'numsub'].includes(key)) {
      event.preventDefault();
      applyZoomDelta(-0.1);
      return;
    }
    if (key === '0' || key === 'num0') {
      event.preventDefault();
      applyZoomReset();
    }
  });

  mainWindow.webContents.on('zoom-changed', (_event, zoomDirection) => {
    if (zoomDirection === 'in') applyZoomDelta(0.1);
    else if (zoomDirection === 'out') applyZoomDelta(-0.1);
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'nexo.html'));
}

function versionToParts(version) {
  return String(version || '0.0.0').split('.').map((n) => parseInt(n, 10) || 0);
}

function compareVersions(a, b) {
  const ap = versionToParts(a);
  const bp = versionToParts(b);
  for (let i = 0; i < 3; i++) {
    if ((ap[i] || 0) > (bp[i] || 0)) return 1;
    if ((ap[i] || 0) < (bp[i] || 0)) return -1;
  }
  return 0;
}

function detectVersionFromName(filePath) {
  const base = path.basename(filePath || '');
  const match = base.match(/(\d+\.\d+\.\d+)/);
  return match ? match[1] : '0.0.0';
}

async function cacheDownloadedInstaller(installerPath, version) {
  try {
    if (!installerPath) return null;
    const cacheDir = getUpdateCacheDir();
    await fs.mkdir(cacheDir, { recursive: true });
    const safeVersion = String(version || detectVersionFromName(installerPath) || 'unknown').replace(/[^\d.]/g, '') || 'unknown';
    const ext = path.extname(installerPath) || '.exe';
    const target = path.join(cacheDir, `Nexo-${safeVersion}${ext}`);
    await fs.copyFile(installerPath, target);
    return target;
  } catch (error) {
    await appendErrorLog('cacheDownloadedInstaller', error, { installerPath, version });
    return null;
  }
}

async function resolveRollbackInstaller() {
  const cacheDir = getUpdateCacheDir();
  const currentVersion = app.getVersion();
  let files = [];
  try {
    files = await fs.readdir(cacheDir);
  } catch {
    return null;
  }
  const candidates = files
    .filter((name) => name.toLowerCase().endsWith('.exe'))
    .map((name) => {
      const fullPath = path.join(cacheDir, name);
      const version = detectVersionFromName(name);
      return { name, fullPath, version };
    })
    .filter((x) => compareVersions(x.version, currentVersion) < 0)
    .sort((a, b) => compareVersions(b.version, a.version));

  return candidates[0] || null;
}

async function startInstallerAndQuit(installerPath) {
  const child = spawn(installerPath, ['/S'], {
    detached: true,
    stdio: 'ignore',
    windowsHide: true
  });
  child.unref();
  setTimeout(() => app.quit(), 100);
}

async function handleUpdateDownloaded(info) {
  const downloadedFile = info?.downloadedFile || '';
  const version = info?.version || detectVersionFromName(downloadedFile) || '';
  let sizeBytes = 0;
  let suspicious = false;
  let suspicionReason = '';
  let downloadedSha512 = '';
  const expectedSha512 = info?.files?.[0]?.sha512 || info?.sha512 || '';

  try {
    if (downloadedFile) {
      const stat = await fs.stat(downloadedFile);
      sizeBytes = stat.size || 0;
    }
  } catch (error) {
    suspicious = true;
    suspicionReason = `No se pudo verificar tamaño del instalador: ${error?.message || error}`;
    await appendErrorLog('update-downloaded-stat', error, { downloadedFile, version });
  }

  if (!suspicious) {
    if (sizeBytes < MIN_UPDATE_SIZE_BYTES) {
      suspicious = true;
      suspicionReason = `Instalador demasiado pequeño (${Math.round(sizeBytes / (1024 * 1024))}MB).`;
    }
    if (sizeBytes > MAX_UPDATE_SIZE_BYTES) {
      suspicious = true;
      suspicionReason = `Instalador demasiado grande (${Math.round(sizeBytes / (1024 * 1024))}MB).`;
    }
  }

  try {
    if (downloadedFile) downloadedSha512 = await computeFileSha512(downloadedFile);
  } catch (error) {
    suspicious = true;
    suspicionReason = `No se pudo calcular hash SHA512: ${error?.message || error}`;
    await appendErrorLog('update-downloaded-hash', error, { downloadedFile, version });
  }

  if (!suspicious && expectedSha512 && downloadedSha512 && expectedSha512 !== downloadedSha512) {
    suspicious = true;
    suspicionReason = 'Hash SHA512 distinto al publicado en metadata del release.';
  }

  const cachedPath = await cacheDownloadedInstaller(downloadedFile, version);
  if (!cachedPath) {
    suspicious = true;
    suspicionReason = 'No se pudo guardar instalador en cache local.';
  }

  if (!suspicious && cachedPath) {
    try {
      downloadedSha512 = await computeFileSha512(cachedPath);
      if (expectedSha512 && expectedSha512 !== downloadedSha512) {
        suspicious = true;
        suspicionReason = 'Hash SHA512 no coincide al validar desde cache local.';
      }
    } catch (error) {
      suspicious = true;
      suspicionReason = `No se pudo recalcular hash desde cache: ${error?.message || error}`;
      await appendErrorLog('update-downloaded-cached-hash', error, { cachedPath, version });
    }
  }

  await pruneCachedInstallers(getUpdateCacheDir(), 3).catch(() => {});

  downloadedUpdateMeta = {
    version,
    downloadedFile: cachedPath || downloadedFile,
    sizeBytes,
    suspicious,
    suspicionReason,
    cachedPath,
    expectedSha512,
    downloadedSha512
  };

  if (suspicious) {
    sendUpdaterStatus('suspicious-update', {
      version,
      sizeBytes,
      expectedSha512,
      downloadedSha512,
      message: `⚠️ Update sospechosa: ${suspicionReason}`
    });
    await appendErrorLog('update-suspicious', new Error('Suspicious update package'), downloadedUpdateMeta);
  }

  sendUpdaterStatus('downloaded', {
    version,
    sizeBytes,
    suspicious,
    expectedSha512,
    downloadedSha512,
    message: suspicious ? 'Update descargada con advertencia. Revisá antes de instalar.' : 'Actualización lista. Reiniciar ahora'
  });
}

function setupAutoUpdater() {
  initUpdater({
    feed: { owner: RELEASE_OWNER, repo: RELEASE_REPO, channel: RELEASE_CHANNEL },
    onStatus: (status, payload = {}) => sendUpdaterStatus(status, payload),
    onErrorLog: async (scope, error, extra = {}) => {
      const readable = humanUpdaterError(error);
      await appendErrorLog(scope, error, { classifiedMessage: readable, ...extra });
    },
    onDownloaded: async (info) => {
      await handleUpdateDownloaded(info);
    },
    onUpdaterError: async (error) => {
      const wasInstalling = lastUpdateAttempt?.stage === 'installing';
      lastUpdateAttempt = { at: new Date().toISOString(), stage: 'updater-error', ok: false, message: error?.message || String(error) };
      const candidate = await resolveRollbackInstaller();
      if (candidate) {
        await appendErrorLog('updater:auto-rollback-candidate', error, { installer: candidate.fullPath, version: candidate.version, wasInstalling });
        sendUpdaterStatus('warning', { message: `Updater falló. Hay rollback disponible: ${candidate.version}` });
        if (wasInstalling) {
          try {
            await startInstallerAndQuit(candidate.fullPath);
          } catch (rollbackError) {
            await appendErrorLog('updater:auto-rollback-exec', rollbackError, { installer: candidate.fullPath, version: candidate.version });
          }
        }
      }
    }
  });
}

ipcMain.handle('store:getAll', async () => readDb());
ipcMain.handle('store:getCacheMeta', async () => ({ cached: !!dbCache, loadedAt: dbCacheLoadedAt || null }));
ipcMain.handle('store:setAll', async (_event, data) => {
  const started = Date.now();
  try {
    perfLog('store:setAll', 'start');
    await queueWrite(data && typeof data === 'object' ? data : {});
    const db = await readDb();
    perfLog('store:setAll', 'done', { ms: Date.now() - started });
    return db;
  } catch (error) {
    await appendErrorLog('store:setAll', error);
    throw new Error(`store:setAll failed: ${error?.message || String(error)}`);
  }
});
ipcMain.handle('store:patch', async (_event, partial) => {
  const started = Date.now();
  try {
    perfLog('store:patch', 'start');
    const current = await readDb();
    const next = { ...current, ...(partial && typeof partial === 'object' ? partial : {}) };
    await queueWrite(next);
    const db = await readDb();
    perfLog('store:patch', 'done', { ms: Date.now() - started });
    return db;
  } catch (error) {
    await appendErrorLog('store:patch', error);
    throw new Error(`store:patch failed: ${error?.message || String(error)}`);
  }
});
ipcMain.handle('store:importContactsChunk', async (_event, payload) => {
  const started = Date.now();
  try {
    const chunk = Array.isArray(payload?.chunk) ? payload.chunk : [];
    const reset = !!payload?.reset;
    perfLog('store:importChunk', 'start', { reset, size: chunk.length });
    const current = await readDb();
    const prev = Array.isArray(current.contactsData) ? current.contactsData : [];
    current.contactsData = reset ? chunk : prev.concat(chunk);
    await queueWrite(current);
    perfLog('store:importChunk', 'done', { ms: Date.now() - started, total: current.contactsData.length });
    return { ok: true, total: current.contactsData.length };
  } catch (error) {
    await appendErrorLog('store:importContactsChunk', error, { payloadMeta: { reset: !!payload?.reset, size: payload?.chunk?.length || 0 } });
    throw new Error(`store:importContactsChunk failed: ${error?.message || String(error)}`);
  }
});
ipcMain.handle('store:backupNow', async () => {
  const current = await readDb();
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const key = `manual_${stamp}`;
  current.backups = { ...(current.backups || {}), [key]: current.contactsData || [] };
  await queueWrite(current);
  return key;
});
ipcMain.handle('app:openDataFolder', async () => shell.openPath(app.getPath('userData')));
ipcMain.handle('app:getVersion', async () => app.getVersion());
ipcMain.handle('app:getRuntimeHash', async () => {
  try {
    if (!app.isPackaged) return { hash: '', note: 'dev-mode' };
    const hash = await computeFileSha512(process.execPath);
    return { hash };
  } catch (error) {
    await appendErrorLog('app:getRuntimeHash', error);
    return { hash: '', error: error?.message || String(error) };
  }
});
ipcMain.handle('app:getErrorLogPath', async () => getErrorLogPath());
ipcMain.handle('app:openErrorLog', async () => {
  const p = getErrorLogPath();
  if (!fssync.existsSync(p)) await fs.writeFile(p, '', 'utf8');
  await shell.openPath(p);
  return p;
});
ipcMain.handle('app:logError', async (_event, payload) => {
  const { scope = 'renderer', message = '', stack = '', extra = {} } = payload || {};
  await appendErrorLog(scope, { message, stack, name: payload?.name || 'RendererError', code: payload?.code || '' }, extra);
  return { ok: true };
});
ipcMain.handle('app:exportBackup', async () => {
  const target = await dialog.showSaveDialog({
    title: 'Exportar backup de Nexo',
    defaultPath: `nexo-db-${new Date().toISOString().slice(0, 10)}.json`,
    filters: [{ name: 'JSON', extensions: ['json'] }]
  });
  if (target.canceled || !target.filePath) return { canceled: true };
  await fs.copyFile(getDbPath(), target.filePath);
  return { canceled: false, filePath: target.filePath };
});
ipcMain.handle('external:open', async (_event, url) => {
  if (!url || typeof url !== 'string') throw new Error('URL inválida');
  await shell.openExternal(url);
  return true;
});
ipcMain.handle('zoom:in', async () => ({ zoomFactor: applyZoomDelta(0.1) }));
ipcMain.handle('zoom:out', async () => ({ zoomFactor: applyZoomDelta(-0.1) }));
ipcMain.handle('zoom:reset', async () => ({ zoomFactor: applyZoomReset() }));
ipcMain.handle('updater:check', async () => {
  lastUpdateAttempt = { at: new Date().toISOString(), stage: 'check', ok: null, message: 'checking' };
  if (!app.isPackaged) {
    sendUpdaterStatus('error', { message: 'Auto-update solo funciona en app instalada (NSIS), no en modo desarrollo.' });
    return { ok: false, message: 'Not packaged' };
  }
  try {
    const result = await checkForUpdatesWithFallback({
      onErrorLog: async (scope, error, extra = {}) => appendErrorLog(scope, error, extra),
      onStatus: (status, payload = {}) => sendUpdaterStatus(status, payload)
    });
    lastUpdateAttempt = { at: new Date().toISOString(), stage: 'check', ok: !!result?.ok, message: result?.message || '' };
    return result?.ok ? { ok: true } : { ok: false, message: result?.message || 'Fallback sin éxito' };
  } catch (error) {
    const message = error?.message || String(error);
    await appendErrorLog('updater:check', error);
    sendUpdaterStatus('error', { message: `Error de actualización: ${message}` });
    lastUpdateAttempt = { at: new Date().toISOString(), stage: 'check', ok: false, message };
    return { ok: false, message };
  }
});

ipcMain.handle('updater:install', async (_event, payload) => {
  const force = !!payload?.force;
  if (downloadedUpdateMeta?.suspicious && !force) {
    return {
      ok: false,
      requiresForce: true,
      message: downloadedUpdateMeta.suspicionReason || 'Update sospechosa detectada'
    };
  }

  const installerPath = downloadedUpdateMeta?.cachedPath || downloadedUpdateMeta?.downloadedFile || '';
  if (!installerPath || !fssync.existsSync(installerPath)) {
    return { ok: false, message: 'No se encontró el instalador descargado para actualizar.' };
  }

  try {
    lastUpdateAttempt = { at: new Date().toISOString(), stage: 'installing', ok: null, message: downloadedUpdateMeta?.version || '' };
    const detached = spawn(process.execPath, [
      '--update-assistant',
      `--installer=${installerPath}`,
      `--version=${downloadedUpdateMeta?.version || ''}`
    ], {
      detached: true,
      stdio: 'ignore',
      windowsHide: false
    });
    detached.unref();
    await persistCurrentVersionMeta({ reason: 'before-install', targetVersion: downloadedUpdateMeta?.version || '' });
    setTimeout(() => app.quit(), 120);
    return { ok: true };
  } catch (error) {
    await appendErrorLog('updater:install-assistant', error, { installerPath });
    const candidate = await resolveRollbackInstaller();
    if (candidate) {
      await appendErrorLog('updater:auto-rollback-install-failure', error, { installer: candidate.fullPath, version: candidate.version });
      try {
        await startInstallerAndQuit(candidate.fullPath);
      } catch (_) {}
    }
    return { ok: false, message: `No se pudo abrir asistente de actualización: ${error?.message || error}` };
  }
});

ipcMain.handle('updater:diagnostics', async () => getUpdaterDiagnostics(lastUpdateAttempt));

ipcMain.handle('updater:rollbackPrevious', async () => {
  try {
    const candidate = await resolveRollbackInstaller();
    if (!candidate) {
      return { ok: false, message: 'No hay instalador anterior en cache para rollback.' };
    }
    await appendErrorLog('rollback', new Error('Rollback requested'), { targetVersion: candidate.version, installer: candidate.fullPath });
    await startInstallerAndQuit(candidate.fullPath);
    return { ok: true, version: candidate.version };
  } catch (error) {
    await appendErrorLog('rollback', error);
    return { ok: false, message: error?.message || String(error) };
  }
});

app.whenReady().then(async () => {
  const installerArg = parseArgValue('--installer');
  const versionArg = parseArgValue('--version');
  const updateAssistantMode = process.argv.includes('--update-assistant');

  if (updateAssistantMode) {
    createUpdateAssistantWindow({ installerPath: installerArg, version: versionArg });
    return;
  }

  try { await readDb(); } catch (error) { console.warn('No se pudo precalentar cache local:', error?.message || error); }
  createWindow();
  setupAutoUpdater();
  const cachedCurrent = await ensureVersionInstallerCached(app.getVersion(), getUpdateCacheDir(), { onErrorLog: appendErrorLog }).catch(() => null);
  await persistCurrentVersionMeta({ reason: 'startup', installer: cachedCurrent ? path.basename(cachedCurrent) : '' });
  if (!app.isPackaged) {
    sendUpdaterStatus('not-available', { message: 'Modo desarrollo: auto-update desactivado.' });
  } else {
    try {
      await checkForUpdatesWithFallback({
        onErrorLog: async (scope, error, extra = {}) => appendErrorLog(scope, error, extra),
        onStatus: (status, payload = {}) => sendUpdaterStatus(status, payload)
      });
    } catch (error) {
      await appendErrorLog('autoUpdater-initial-check', error);
      sendUpdaterStatus('error', { message: `Error de actualización: ${error?.message || error}` });
    }
  }
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

process.on('uncaughtException', (error) => {
  appendErrorLog('process-uncaughtException', error).catch(() => {});
});
process.on('unhandledRejection', (reason) => {
  appendErrorLog('process-unhandledRejection', reason).catch(() => {});
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
