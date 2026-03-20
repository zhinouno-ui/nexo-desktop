const { app, BrowserWindow, ipcMain, shell, dialog, Notification } = require('electron');
const fs = require('fs/promises');
const fssync = require('fs');
const path = require('path');
const crypto = require('crypto');
const zlib = require('zlib');
const { promisify } = require('util');
const { autoUpdater } = require('electron-updater');
const { Worker } = require('worker_threads');

app.disableHardwareAcceleration();

const gzipAsync = promisify(zlib.gzip);
const gunzipAsync = promisify(zlib.gunzip);

const MIN_UPDATE_SIZE_BYTES = 10 * 1024 * 1024;
const MAX_UPDATE_SIZE_BYTES = 500 * 1024 * 1024;
const STABLE_TAG = 'v1.1.10';
const RELEASE_OWNER = 'zhinouno-ui';
const RELEASE_REPO = 'nexo-desktop';
const RELEASE_CHANNEL = 'latest';

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
let installOnCloseArmed = false;
let installAttemptInProgress = false;
let pendingImportDeepLink = null;
let lastUpdateAttempt = { at: null, stage: 'idle', ok: null, message: '' };
let isQuitting = false;
const adminUnlockByWebContentsId = new Map();

const singleInstanceLock = app.requestSingleInstanceLock();
if (!singleInstanceLock) {
  app.quit();
}

function getDbPath() {
  return path.join(app.getPath('userData'), 'nexo-db.json');
}

// FASE 2: DATA SHARDING - Funciones para bases de datos por perfil
function getProfileDbPath(profileId = 'default') {
  const safeId = String(profileId || 'default').replace(/[^a-z0-9_-]/gi, '_');
  return path.join(app.getPath('userData'), `nexo-db-${safeId}.json`);
}

async function readProfileDb(profileId = 'default', { force = false } = {}) {
  const profilePath = getProfileDbPath(profileId);
  try {
    const raw = await fs.readFile(profilePath, 'utf8');
    const parsed = JSON.parse(raw);
    
    // FASE 2: MIGRACIÓN LEGACY - Verificar si el perfil está vacío y migrar desde legacy
    if (!Array.isArray(parsed.contactsData) || parsed.contactsData.length === 0) {
      console.log(`[PROFILE] Perfil [${profileId}] vacío, intentando migración desde legacy...`);
      
      try {
        const legacyDb = await readDb();
        
        // Extraer contactos de múltiples posibles estructuras legacy
        let legacyContacts = [];
        
        if (Array.isArray(legacyDb.contactsData) && legacyDb.contactsData.length > 0) {
          legacyContacts = legacyDb.contactsData;
        } else if (Array.isArray(legacyDb.contacts) && legacyDb.contacts.length > 0) {
          legacyContacts = legacyDb.contacts;
        } else if (Array.isArray(legacyDb) && legacyDb.length > 0) {
          legacyContacts = legacyDb;
        } else {
          // Buscar arrays dentro del objeto legacy
          for (const [key, value] of Object.entries(legacyDb || {})) {
            if (Array.isArray(value) && value.length > 0 && 
                (key.toLowerCase().includes('contact') || key.toLowerCase().includes('data'))) {
              legacyContacts = value;
              console.log(`[PROFILE] Encontrados ${legacyContacts.length} contactos en legacy.${key}`);
              break;
            }
          }
        }
        
        if (legacyContacts.length > 0) {
          console.log(`[PROFILE] 🔄 Migrando ${legacyContacts.length} contactos desde legacy al perfil [${profileId}]`);
          
          // Crear nueva base para el perfil con datos del legacy
          const migratedDb = { 
            ...DEFAULT_DB, 
            ...legacyDb, // Heredar todo del legacy
            profileId, 
            contactsData: legacyContacts.map(contact => ({
              ...contact,
              profileId: profileId, // Asegurar que todos los contactos pertenezcan a este perfil
              id: contact.id || `contact_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
            }))
          };
          
          // Guardar en archivo shard del perfil
          await writeProfileDb(profileId, migratedDb);
          console.log(`[PROFILE] ✅ Migración completada para perfil [${profileId}]`);
          return migratedDb;
        } else {
          console.warn(`[PROFILE] ⚠️ No se encontraron contactos en legacy para migrar`);
        }
      } catch (legacyErr) {
        console.error('[PROFILE] ❌ Error en migración legacy:', legacyErr);
      }
    }
    
    return { ...DEFAULT_DB, ...parsed };
  } catch (error) {
    if (error.code === 'ENOENT') {
      // Si no existe, intentar migración desde legacy antes de crear base vacía
      try {
        const legacyDb = await readDb();
        if (Array.isArray(legacyDb.contactsData) && legacyDb.contactsData.length > 0) {
          console.log(`Creando perfil [${profileId}] con ${legacyDb.contactsData.length} contactos desde legacy`);
          
          const migratedDb = { 
            ...DEFAULT_DB, 
            ...legacyDb,
            profileId,
            contactsData: legacyDb.contactsData.map(contact => ({
              ...contact,
              profileId: profileId
            }))
          };
          
          await writeProfileDb(profileId, migratedDb);
          return migratedDb;
        }
      } catch (legacyErr) {
        console.warn('No se pudo migrar desde legacy, creando base vacía:', legacyErr);
      }
      
      // Si no hay legacy o falló, crear base por defecto para este perfil
      const newDb = { ...DEFAULT_DB, profileId };
      await writeProfileDb(profileId, newDb);
      return newDb;
    }
    await appendErrorLog('readProfileDb', error, { profileId });
    throw error;
  }
}

async function writeProfileDb(profileId, data) {
  const profilePath = getProfileDbPath(profileId);
  await fs.mkdir(path.dirname(profilePath), { recursive: true });
  const tmpPath = `${profilePath}.tmp`;
  const normalized = { ...DEFAULT_DB, ...data, profileId };
  const jsonString = JSON.stringify(normalized, null, 2);
  await fs.writeFile(tmpPath, jsonString, 'utf8');
  await fs.rename(tmpPath, profilePath);
  
  // Invalidar cache si es el perfil activo
  if (dbCache && dbCache.profileId === profileId) {
    dbCache = null;
    dbCacheLoadedAt = 0;
  }
}

function getErrorLogPath() {
  return path.join(app.getPath('userData'), 'logs', 'main.log');
}

function getUpdateCacheDir() {
  return path.join(app.getPath('userData'), 'updates-cache');
}

function getCurrentVersionMetaPath() {
  return path.join(app.getPath('userData'), 'current-version.json');
}

function getProfilesMetaPath() {
  return path.join(app.getPath('userData'), 'profiles.json');
}

function getProfilesDir() {
  return path.join(app.getPath('userData'), 'profiles');
}

function getExportsDir() {
  return path.join(app.getPath('downloads'), 'nexo_files');
}

function safeSlug(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/(^-|-$)/g, '')
    .toLowerCase() || 'perfil';
}

async function resolveUniqueProfileFileName(baseName) {
  await fs.mkdir(getProfilesDir(), { recursive: true });
  let candidate = `${baseName}.json`;
  let n = 2;
  while (fssync.existsSync(path.join(getProfilesDir(), candidate))) {
    candidate = `${baseName}-${n}.json`;
    n += 1;
  }
  return candidate;
}

async function ensureProfileStorageFile(profile) {
  if (!profile || !profile.id) return profile;
  await fs.mkdir(getProfilesDir(), { recursive: true });
  if (!profile.fileName) {
    const preferred = `${safeSlug(profile.name)}-${safeSlug(profile.id)}.json`;
    const preferredPath = path.join(getProfilesDir(), preferred);
    profile.fileName = fssync.existsSync(preferredPath)
      ? preferred
      : await resolveUniqueProfileFileName(`${safeSlug(profile.name)}-${safeSlug(profile.id)}`);
  }
  const fullPath = path.join(getProfilesDir(), profile.fileName);
  if (!fssync.existsSync(fullPath)) {
    await fs.writeFile(fullPath, JSON.stringify({ id: profile.id, name: profile.name, createdAt: new Date().toISOString() }, null, 2), 'utf8');
  }
  return profile;
}

async function readProfilesMeta() {
  try {
    const raw = await fs.readFile(getProfilesMetaPath(), 'utf8');
    const parsed = JSON.parse(raw);
    const profiles = Array.isArray(parsed?.profiles) ? parsed.profiles : [];
    const safeProfiles = profiles.length ? profiles : [{ id: 'default', name: 'Base principal' }];
    for (const profile of safeProfiles) {
      await ensureProfileStorageFile(profile);
    }
    return safeProfiles;
  } catch {
    const fallback = [{ id: 'default', name: 'Base principal' }];
    for (const profile of fallback) {
      await ensureProfileStorageFile(profile);
    }
    return fallback;
  }
}

async function writeProfilesMeta(profiles) {
  const safe = Array.isArray(profiles) && profiles.length ? profiles : [{ id: 'default', name: 'Base principal' }];
  for (const profile of safe) {
    await ensureProfileStorageFile(profile);
  }
  await fs.mkdir(path.dirname(getProfilesMetaPath()), { recursive: true });
  await fs.writeFile(getProfilesMetaPath(), JSON.stringify({ profiles: safe }, null, 2), 'utf8');
  return safe;
}

async function writeProfileExportFile(prefix, payloadText, { profileName = 'base' } = {}) {
  await fs.mkdir(getExportsDir(), { recursive: true });
  const stamp = new Date().toISOString().replace(/[:]/g, '-').slice(0, 19);
  const out = path.join(getExportsDir(), `${safeSlug(profileName).toUpperCase()}_${prefix}_${stamp}.nexo`);
  const gz = await gzipAsync(Buffer.from(String(payloadText || '{}'), 'utf8'));
  await fs.writeFile(out, gz);
  return out;
}

async function buildDailyExportFromDb(profileId = 'default') {
  const db = await readDb();
  const allContacts = Array.isArray(db.contactsData) ? db.contactsData : [];
  const allTransitions = Array.isArray(db.extraStorage?.statusTransitions) ? db.extraStorage.statusTransitions : [];
  const contacts = allContacts.filter((c) => String(c?.profileId || 'default') === String(profileId || 'default'));
  const transitions = allTransitions.filter((t) => String(t?.profileId || 'default') === String(profileId || 'default'));
  const profiles = await readProfilesMeta();
  const activeProfile = profiles.find((p) => p.id === profileId) || profiles[0] || { id: 'default', name: 'Base principal' };
  const lastFullAt = activeProfile?.lastFullExportAt ? new Date(activeProfile.lastFullExportAt).getTime() : 0;
  const nowMs = Date.now();
  const changedContacts = contacts.filter((c) => {
    const ts = new Date(c?.lastEditedAt || c?.lastUpdated || c?.createdAt || c?.lastImportedAt || 0).getTime();
    return Number.isFinite(ts) && ts >= Math.max(lastFullAt || 0, nowMs - 24 * 60 * 60 * 1000);
  });
  const deltaTransitions = transitions.filter((t) => {
    const ts = new Date(t?.at || 0).getTime();
    return Number.isFinite(ts) && ts >= Math.max(lastFullAt || 0, nowMs - 24 * 60 * 60 * 1000);
  });
  const workerResult = await runExportWorker({ type: 'daily-log', contacts: changedContacts, transitions: deltaTransitions, nowIso: new Date().toISOString() });
  if (workerResult?.ok && workerResult?.jsonText) {
    const parsed = JSON.parse(workerResult.jsonText);
    parsed.metadata = {
      profileId: activeProfile.id,
      profileName: activeProfile.name,
      timestamp: new Date().toISOString(),
      isFullBackup: false,
      lastFullExportAt: activeProfile.lastFullExportAt || null
    };
    workerResult.jsonText = JSON.stringify(parsed, null, 2);
  }
  return { ...workerResult, profile: activeProfile };
}

async function buildFullExportFromDb(profileId = 'default') {
  const db = await readDb();
  const profiles = await readProfilesMeta();
  const activeProfile = profiles.find((p) => p.id === profileId) || profiles[0] || { id: 'default', name: 'Base principal' };
  const state = {
    ...db,
    contactsData: (Array.isArray(db.contactsData) ? db.contactsData : []).filter((c) => String(c?.profileId || 'default') === String(profileId || 'default'))
  };
  const workerResult = await runExportWorker({ type: 'full', state, nowIso: new Date().toISOString() });
  if (workerResult?.ok && workerResult?.jsonText) {
    const parsed = JSON.parse(workerResult.jsonText);
    parsed.metadata = {
      profileId: activeProfile.id,
      profileName: activeProfile.name,
      timestamp: new Date().toISOString(),
      isFullBackup: true
    };
    workerResult.jsonText = JSON.stringify(parsed, null, 2);
  }
  return { ...workerResult, profile: activeProfile };
}

let midnightExportTimer = null;
function scheduleMidnightDailyExport() {
  if (midnightExportTimer) clearTimeout(midnightExportTimer);
  const now = new Date();
  const next = new Date(now);
  next.setHours(24, 0, 0, 0);
  const delay = Math.max(1000, next.getTime() - now.getTime());
  midnightExportTimer = setTimeout(async () => {
    try {
      const result = await buildDailyExportFromDb('default');
      if (result?.ok && result?.jsonText) {
        const filePath = await writeProfileExportFile('DELTA', result.jsonText, { profileName: result?.profile?.name || 'base' });
        perfLog('export:daily:auto', 'done', { filePath });
      }
    } catch (error) {
      appendErrorLog('export:daily:auto', error).catch(() => {});
    } finally {
      scheduleMidnightDailyExport();
    }
  }, delay);
}

function runExportWorker(payload) {
  return new Promise((resolve, reject) => {
    const workerPath = path.join(__dirname, 'workers', 'export-worker.js');
    const worker = new Worker(workerPath, { workerData: payload });
    worker.once('message', (msg) => resolve(msg));
    worker.once('error', reject);
    worker.once('exit', (code) => {
      if (code !== 0) reject(new Error(`export-worker exited with code ${code}`));
    });
  });
}

function getAdminSecret() {
  return String(process.env.NEXO_ADMIN_PASSWORD || '').trim();
}

function hasAdminAccessForWebContentsId(webContentsId) {
  const until = Number(adminUnlockByWebContentsId.get(Number(webContentsId)) || 0);
  return Number.isFinite(until) && until > Date.now();
}

function safeEqualStrings(a, b) {
  const aa = Buffer.from(String(a || ''), 'utf8');
  const bb = Buffer.from(String(b || ''), 'utf8');
  if (aa.length !== bb.length) return false;
  return crypto.timingSafeEqual(aa, bb);
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
    await fs.mkdir(path.dirname(getErrorLogPath()), { recursive: true });
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



function showOrCreateMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) createWindow();
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

function parseDeepLink(url) {
  try {
    if (!url || typeof url !== 'string' || !url.startsWith('nexo://')) return null;
    const parsed = new URL(url);
    if (parsed.hostname === 'import') {
      const file = parsed.searchParams.get('file') || '';
      return { type: 'import', file };
    }
    return null;
  } catch (_) {
    return null;
  }
}

function applyDeepLinkPayload(payload) {
  if (!payload || payload.type !== 'import') return;
  pendingImportDeepLink = payload;
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('deep-link:import', payload);
    if (payload.file) {
      new Notification({ title: 'Nexo import', body: `Solicitud de importación recibida: ${path.basename(payload.file)}` }).show();
    }
  }
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

let pendingStoreDeltas = [];
let pendingDeltaFlushTimer = null;
let deltaFlushInFlight = false;

async function applyStoreDelta(db, delta) {
  if (!db || typeof db !== 'object') return db;
  if (!delta || typeof delta !== 'object') return db;
  const type = String(delta.type || '').toLowerCase();
  const contacts = Array.isArray(db.contactsData) ? db.contactsData : [];
  const findContact = (id) => contacts.find((c) => c && String(c.id) === String(id));

  if (type === 'contact-status') {
    const id = delta.id;
    if (!id) return db;
    const contact = findContact(id);
    if (!contact) return db;
    contact.status = delta.status || contact.status;
    contact.lastUpdated = delta.lastUpdated || contact.lastUpdated || new Date().toISOString();
    contact.lastEditedAt = delta.lastEditedAt || contact.lastEditedAt || contact.lastUpdated;
    return db;
  }

  if (type === 'contact-delete') {
    const id = delta.id;
    if (!id) return db;
    db.contactsData = contacts.filter((c) => String(c?.id) !== String(id));
    return db;
  }

  if (type === 'contact-touch') {
    const id = delta.id;
    if (!id) return db;
    const contact = findContact(id);
    if (!contact) return db;
    if (delta.lastMessageSentAt) contact.lastMessageSentAt = delta.lastMessageSentAt;
    if (delta.lastEditedAt) contact.lastEditedAt = delta.lastEditedAt;
    if (delta.lastUpdated) contact.lastUpdated = delta.lastUpdated;
    if (delta.lastEditReason) contact.lastEditReason = delta.lastEditReason;
    return db;
  }

  return db;
}

ipcMain.on('async-save-request', (_event, payload) => {
  const safePayload = payload && typeof payload === 'object' ? payload : {};
  queueWrite(safePayload).catch((error) => {
    appendErrorLog('async-save-request', error, {
      keys: Object.keys(safePayload || {})
    }).catch(() => {});
  });
});

async function flushPendingStoreDeltas(reason = 'timer') {
  if (deltaFlushInFlight) return { ok: false, skipped: true };
  if (!pendingStoreDeltas.length) return { ok: true, flushed: 0 };
  deltaFlushInFlight = true;
  try {
    const deltas = pendingStoreDeltas.splice(0, pendingStoreDeltas.length);
    const db = await readDb();
    for (const delta of deltas) {
      await applyStoreDelta(db, delta);
    }
    await queueWrite(db);
    perfLog('store:delta-flush', 'done', { reason, count: deltas.length });
    return { ok: true, flushed: deltas.length };
  } catch (error) {
    await appendErrorLog('store:delta-flush', error, { reason, queued: pendingStoreDeltas.length });
    return { ok: false, message: error?.message || String(error) };
  } finally {
    deltaFlushInFlight = false;
  }
}

function scheduleDeltaFlush(ms = 10000, reason = 'timer') {
  if (pendingDeltaFlushTimer) clearTimeout(pendingDeltaFlushTimer);
  pendingDeltaFlushTimer = setTimeout(() => {
    pendingDeltaFlushTimer = null;
    flushPendingStoreDeltas(reason).catch(() => {});
  }, ms);
}
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
        const lines = [
          `Versión actual: ${diag.version}`,
          `Canal: ${diag.channel}`,
          `Repo: ${diag.repo}`,
          `Release URL: ${diag.updateUrl}`,
          `Último intento: ${diag.lastAttempt?.stage || '-'} ${diag.lastAttempt?.message || ''}`,
          `Cache dir: ${diag.cacheDir}`,
          `Instaladores cache: ${diag.cacheInstallers.length}`
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

  mainWindow.webContents.on('did-finish-load', () => {
    if (pendingImportDeepLink) mainWindow.webContents.send('deep-link:import', pendingImportDeepLink);
  });

  mainWindow.on('close', async (event) => {
    if (isQuitting || process.platform === 'darwin') return;
    if (installOnCloseArmed) {
      event.preventDefault();
      const started = await tryInstallOnClose();
      if (!started) {
        isQuitting = true;
        app.quit();
      }
      return;
    }
    isQuitting = true;
    app.quit();
  });

  mainWindow.on('minimize', () => {
    if (pendingStoreDeltas.length) scheduleDeltaFlush(10000, 'minimized-10s');
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

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
  try {
    await shell.openPath(installerPath);
  } catch (_) {}
  isQuitting = true;
  setTimeout(() => app.quit(), 1500);
}


async function resolveInstallerForInstall() {
  const explicit = downloadedUpdateMeta?.cachedPath || downloadedUpdateMeta?.downloadedFile || '';
  if (explicit && fssync.existsSync(explicit)) {
    return {
      installerPath: explicit,
      version: downloadedUpdateMeta?.version || detectVersionFromName(explicit) || '',
      source: 'downloaded-meta'
    };
  }

  const cached = await getCachedInstallers().catch(() => []);
  const current = app.getVersion();
  const candidate = (cached || []).find((it) => it?.fullPath && fssync.existsSync(it.fullPath) && compareVersions(it.version, current) > 0);
  if (candidate) {
    return { installerPath: candidate.fullPath, version: candidate.version || detectVersionFromName(candidate.fullPath), source: 'cache-fallback' };
  }

  return { installerPath: '', version: '', source: 'none' };
}

async function tryInstallOnClose() {
  if (installAttemptInProgress) return false;
  if (!app.isPackaged) return false;
  if (!installOnCloseArmed) return false;
  if (downloadedUpdateMeta?.suspicious) return false;
  installAttemptInProgress = true;
  try {
    const resolved = await resolveInstallerForInstall();
    if (!resolved.installerPath) return false;
    lastUpdateAttempt = { at: new Date().toISOString(), stage: 'installing-on-close', ok: null, message: resolved.version || '' };
    await appendErrorLog('updater:install-on-close', new Error('Install armed on window close'), {
      installer: resolved.installerPath,
      version: resolved.version,
      source: resolved.source
    });
    isQuitting = true;
    setTimeout(() => {
      try {
        autoUpdater.quitAndInstall(false, true);
      } catch (_) {
        app.quit();
      }
    }, 1200);
    return true;
  } catch (error) {
    await appendErrorLog('updater:install-on-close-failed', error, {});
    return false;
  } finally {
    installAttemptInProgress = false;
  }
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

  installOnCloseArmed = true;
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
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = false;
  if (typeof autoUpdater.setFeedURL === 'function') {
    autoUpdater.setFeedURL({ provider: 'github', owner: RELEASE_OWNER, repo: RELEASE_REPO });
  }

  autoUpdater.removeAllListeners();
  autoUpdater.on('checking-for-update', () => sendUpdaterStatus('checking', { message: 'Comprobando actualizaciones…' }));
  autoUpdater.on('update-available', (info) => sendUpdaterStatus('available', { version: info?.version || '', message: `Nueva versión detectada: ${info?.version || '-'}. Descargando…` }));
  autoUpdater.on('update-not-available', () => sendUpdaterStatus('not-available', { message: 'No hay una actualización nueva disponible en este momento.' }));
  autoUpdater.on('download-progress', (progress) => sendUpdaterStatus('download-progress', { percent: Math.round(progress?.percent || 0) }));
  autoUpdater.on('update-downloaded', (info) => handleUpdateDownloaded(info).catch((e) => appendErrorLog('update-downloaded', e)));
  autoUpdater.on('error', async (error) => {
    lastUpdateAttempt = { at: new Date().toISOString(), stage: 'updater-error', ok: false, message: error?.message || String(error) };
    await appendErrorLog('autoUpdater-error', error);
    sendUpdaterStatus('error', { message: humanUpdaterError(error) });
  });
}

async function checkForUpdatesWithFallback() {
  try {
    const result = await autoUpdater.checkForUpdates();
    return { ok: true, message: result?.updateInfo?.version ? `Update ${result.updateInfo.version}` : 'Check OK' };
  } catch (error) {
    await appendErrorLog('checkForUpdates', error);
    await shell.openExternal(`https://github.com/${RELEASE_OWNER}/${RELEASE_REPO}/releases`);
    return { ok: false, message: error?.message || String(error) };
  }
}

async function ensureVersionInstallerCached(version, cacheDir) {
  try {
    const expected = path.join(cacheDir, `Nexo-${version}.exe`);
    return fssync.existsSync(expected) ? expected : null;
  } catch { return null; }
}

async function pruneCachedInstallers(cacheDir, keep = 3) {
  try {
    const files = (await fs.readdir(cacheDir)).filter((n) => n.toLowerCase().endsWith('.exe'));
    const ordered = files
      .map((name) => ({ name, version: detectVersionFromName(name) }))
      .sort((a, b) => compareVersions(b.version, a.version));
    const toDelete = ordered.slice(Math.max(keep, 0));
    await Promise.all(toDelete.map((x) => fs.unlink(path.join(cacheDir, x.name)).catch(() => {})));
  } catch (_) {}
}

async function getUpdaterDiagnostics(lastAttempt = lastUpdateAttempt) {
  const cacheDir = getUpdateCacheDir();
  let cacheInstallers = [];
  try {
    cacheInstallers = (await fs.readdir(cacheDir)).filter((n) => n.toLowerCase().endsWith('.exe'));
  } catch (_) {}
  return {
    version: app.getVersion(),
    channel: RELEASE_CHANNEL,
    repo: `${RELEASE_OWNER}/${RELEASE_REPO}`,
    updateUrl: `https://github.com/${RELEASE_OWNER}/${RELEASE_REPO}/releases`,
    cacheDir,
    cacheInstallers,
    lastAttempt
  };
}

ipcMain.handle('store:getAll', async () => readDb());

ipcMain.handle('profile:list', async () => ({ profiles: await readProfilesMeta() }));
ipcMain.handle('profile:create', async (_event, payload) => {
  const name = String(payload?.name || '').trim().slice(0, 60);
  if (!name) return { ok: false, message: 'Nombre inválido' };
  const profiles = await readProfilesMeta();
  const id = `pf_${Date.now()}_${Math.floor(Math.random()*9999)}`;
  const profile = { id, name, fileName: await resolveUniqueProfileFileName(`${safeSlug(name)}-${safeSlug(id)}`) };
  profiles.push(profile);
  await writeProfilesMeta(profiles);
  return { ok: true, profile, profiles };
});
ipcMain.handle('profile:rename', async (_event, payload) => {
  const id = String(payload?.id || '');
  const name = String(payload?.name || '').trim().slice(0, 60);
  if (!id || !name) return { ok: false, message: 'Datos inválidos' };
  const profiles = await readProfilesMeta();
  const p = profiles.find((x) => x.id === id);
  if (!p) return { ok: false, message: 'Perfil no encontrado' };
  const oldFileName = p.fileName;
  p.name = name;
  if (oldFileName) {
    const nextFileName = await resolveUniqueProfileFileName(`${safeSlug(name)}-${safeSlug(id)}`);
    const oldPath = path.join(getProfilesDir(), oldFileName);
    const newPath = path.join(getProfilesDir(), nextFileName);
    if (fssync.existsSync(oldPath)) {
      await fs.rename(oldPath, newPath);
    }
    p.fileName = nextFileName;
  }
  await writeProfilesMeta(profiles);
  return { ok: true, profiles };
});
ipcMain.handle('profile:delete', async (_event, payload) => {
  const id = String(payload?.id || '');
  if (!id || id === 'default') return { ok: false, message: 'No permitido' };
  const prev = await readProfilesMeta();
  const target = prev.find((p) => p.id === id);
  const profiles = prev.filter((p) => p.id !== id);
  if (target?.fileName) {
    await fs.unlink(path.join(getProfilesDir(), target.fileName)).catch(() => {});
  }
  await writeProfilesMeta(profiles);
  return { ok: true, profiles };
});
ipcMain.handle('profile:resolveImportMode', async () => {
  const result = await dialog.showMessageBox({
    type: 'question',
    buttons: ['Crear perfil nuevo', 'Importar en perfil actual (pisar)', 'Seleccionar perfil existente', 'Cancelar'],
    defaultId: 0,
    cancelId: 3,
    title: 'Importar archivo',
    message: '¿Cómo querés importar estos datos?'
  });
  const map = ['new-profile', 'current-overwrite', 'select-existing', 'cancel'];
  return { mode: map[result.response] || 'cancel' };
});
ipcMain.handle('export:build', async (_event, payload) => runExportWorker(payload || {}));
ipcMain.handle('export:daily', async (_event, payload) => {
  const profileId = String(payload?.profileId || 'default');
  const result = await buildDailyExportFromDb(profileId);
  if (!result?.ok) return { ok: false, message: result?.message || 'No se pudo exportar diario' };
  const filePath = await writeProfileExportFile('DELTA', result.jsonText || '{}', { profileName: result?.profile?.name || profileId });
  return { ok: true, filePath, csvText: result.csvText || '' };
});
ipcMain.handle('export:full', async (_event, payload) => {
  const profileId = String(payload?.profileId || 'default');
  const result = await buildFullExportFromDb(profileId);
  if (!result?.ok) return { ok: false, message: result?.message || 'No se pudo exportar full' };
  const filePath = await writeProfileExportFile('FULL', result.jsonText || '{}', { profileName: result?.profile?.name || profileId });
  const profiles = await readProfilesMeta();
  const p = profiles.find((x) => x.id === profileId);
  if (p) {
    p.lastFullExportAt = new Date().toISOString();
    await writeProfilesMeta(profiles);
  }
  return { ok: true, filePath };
});
ipcMain.handle('import:data', async (_event, payload) => {
  const filePath = String(payload?.filePath || '').trim();
  if (!filePath) return { ok: false, message: 'Ruta inválida' };
  const rawBuffer = await fs.readFile(filePath);
  let raw = '';
  try {
    raw = (await gunzipAsync(rawBuffer)).toString('utf8');
  } catch {
    raw = rawBuffer.toString('utf8');
  }
  let parsed = null;
  try { parsed = JSON.parse(raw); } catch (_) {}
  const profileName = String(parsed?.metadata?.profileName || parsed?.profileName || '').trim();
  const profiles = await readProfilesMeta();
  const existing = profiles.find((p) => safeSlug(p.name) === safeSlug(profileName));
  if (existing) {
    return { ok: true, filePath, mode: 'merge-existing', targetProfileId: existing.id, parsed, raw, profiles };
  }
  const choice = await dialog.showMessageBox({
    type: 'question',
    buttons: ['Importar en PERFIL ACTUAL', 'Crear NUEVO PERFIL', 'Importar en PERFIL EXISTENTE', 'Cancelar'],
    defaultId: 0,
    cancelId: 3,
    title: 'Importar archivo',
    message: '¿Dónde querés importar los datos?'
  });
  const modes = ['current-overwrite', 'new-profile', 'select-existing', 'cancel'];
  return { ok: true, filePath, mode: modes[choice.response] || 'cancel', parsed, raw, profiles };
});


ipcMain.handle('store:queueDelta', async (_event, payload) => {
  const delta = payload && typeof payload === 'object' ? payload : null;
  if (!delta) return { ok: false, message: 'delta inválido' };
  pendingStoreDeltas.push(delta);
  scheduleDeltaFlush(5000, 'idle-5s');
  return { ok: true, queued: pendingStoreDeltas.length };
});
ipcMain.handle('store:flushDeltas', async (_event, reason = 'manual') => flushPendingStoreDeltas(String(reason || 'manual')));

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
  await fs.mkdir(path.dirname(p), { recursive: true });
  if (!fssync.existsSync(p)) {
    await fs.writeFile(p, '[Nexo] Log de errores inicializado.\nTodavía no hay errores registrados.\n', 'utf8');
  } else {
    const current = await fs.readFile(p, 'utf8').catch(() => '');
    if (!String(current || '').trim()) {
      await fs.writeFile(p, '[Nexo] Log de errores vacío.\nTodavía no hay errores registrados.\n', 'utf8');
    }
  }
  await shell.openPath(p);
  return p;
});
ipcMain.handle('app:logError', async (_event, payload) => {
  const { scope = 'renderer', message = '', stack = '', extra = {} } = payload || {};
  await appendErrorLog(scope, { message, stack, name: payload?.name || 'RendererError', code: payload?.code || '' }, extra);
  return { ok: true };
});
ipcMain.handle('app:exportBackup', async () => {
  const nexoFilesDir = path.join(app.getPath('downloads'), 'nexo_files');
  await fs.mkdir(nexoFilesDir, { recursive: true }).catch(() => {});
  const target = await dialog.showSaveDialog({
    title: 'Exportar backup de Nexo',
    defaultPath: path.join(nexoFilesDir, `nexo-db-${new Date().toISOString().slice(0, 10)}.json`),
    filters: [{ name: 'JSON', extensions: ['json'] }]
  });
  if (target.canceled || !target.filePath) return { canceled: true };
  await fs.copyFile(getDbPath(), target.filePath);
  return { canceled: false, filePath: target.filePath };
});
ipcMain.handle('app:queueUpload', async (_event, payload) => {
  const webContentsId = _event?.sender?.id;
  if (!hasAdminAccessForWebContentsId(webContentsId)) {
    return { ok: false, denied: true, message: 'Sesión admin expirada o no autorizada.' };
  }
  const profileId = String(payload?.profileId || 'default').replace(/[^a-z0-9_-]/gi, '_');
  const label = String(payload?.label || 'report').replace(/[^a-z0-9_-]/gi, '_');
  const raw = String(payload?.payload || '{}');
  const queueDir = path.join(app.getPath('userData'), 'uploads_queue', profileId);
  await fs.mkdir(queueDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:]/g, '-').slice(0, 19);
  const out = path.join(queueDir, `${stamp}_${label}.json`);
  await fs.writeFile(out, raw, 'utf8');
  await appendErrorLog('upload-queue', new Error('queued'), { profileId, label, path: out, bytes: raw.length });
  return { ok: true, path: out };
});

ipcMain.handle('admin:verifyPassword', async (event, payload) => {
  const typed = String(payload?.password || '').trim();
  const configured = getAdminSecret();
  if (!configured) {
    return { ok: false, message: 'NEXO_ADMIN_PASSWORD no configurada en entorno.' };
  }
  const ok = safeEqualStrings(typed, configured);
  const webContentsId = event?.sender?.id;
  if (!ok) return { ok: false, message: 'Clave incorrecta' };
  const expiresAt = Date.now() + (10 * 60 * 1000);
  adminUnlockByWebContentsId.set(Number(webContentsId), expiresAt);
  return { ok: true, expiresAt };
});

ipcMain.handle('admin:hasAccess', async (event) => {
  const webContentsId = event?.sender?.id;
  const until = Number(adminUnlockByWebContentsId.get(Number(webContentsId)) || 0);
  return { ok: hasAdminAccessForWebContentsId(webContentsId), expiresAt: until || 0 };
});
ipcMain.handle('dialog:openImportFiles', async () => {
  const result = await dialog.showOpenDialog({
    title: 'Seleccionar archivos para importar',
    properties: ['openFile', 'multiSelections'],
    filters: [{ name: 'Contactos', extensions: ['csv', 'vcf', 'json'] }]
  });
  return result.canceled ? [] : (result.filePaths || []);
});
ipcMain.handle('file:readText', async (_event, filePath) => {
  if (!filePath || typeof filePath !== 'string') throw new Error('Ruta inválida');
  return fs.readFile(filePath, 'utf8');
});
ipcMain.handle('app:notify', async (_event, payload) => {
  if (!Notification.isSupported()) return { ok: false };
  const title = String(payload?.title || 'Nexo');
  const body = String(payload?.body || '');
  new Notification({ title, body }).show();
  return { ok: true };
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
    if (!result?.ok && /no tiene una versión mayor|ya estás en la última versión/i.test(String(result?.message || ''))) {
      sendUpdaterStatus('not-available', { message: 'No hay una actualización nueva disponible en este momento.' });
      return { ok: false, message: 'No hay una actualización nueva disponible en este momento.' };
    }
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

  try {
    const resolved = await resolveInstallerForInstall();
    if (!resolved.installerPath) {
      return { ok: false, message: 'No se encontró el instalador descargado para actualizar.' };
    }
    lastUpdateAttempt = { at: new Date().toISOString(), stage: 'installing', ok: null, message: resolved.version || '' };
    isQuitting = true;
    setTimeout(() => {
      try { autoUpdater.quitAndInstall(false, true); } catch (_) { app.quit(); }
    }, 500);
    return { ok: true };
  } catch (error) {
    await appendErrorLog('updater:install-assistant', error, { installerPath: downloadedUpdateMeta?.cachedPath || downloadedUpdateMeta?.downloadedFile || '' });
    const candidate = await resolveRollbackInstaller();
    if (candidate) {
      await appendErrorLog('updater:auto-rollback-install-failure', error, { installer: candidate.fullPath, version: candidate.version });
      try {
        await startInstallerAndQuit(candidate.fullPath);
      } catch (_) {}
    }
    return { ok: false, message: `No se pudo ejecutar instalación: ${error?.message || error}` };
  }
});

ipcMain.handle('updater:diagnostics', async () => getUpdaterDiagnostics(lastUpdateAttempt));

ipcMain.handle('updater:rollbackPrevious', async () => {
  try {
    const candidate = await resolveRollbackInstaller();
    if (!candidate) {
      return { ok: false, message: 'No hay una versión anterior disponible para volver atrás en este momento.' };
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
  if (process.platform === 'win32') {
    app.setAppUserModelId('com.nexo.desktop');
    app.setAsDefaultProtocolClient('nexo');
    app.setLoginItemSettings({ openAtLogin: false, path: process.execPath });
  }

  try { await readDb(); } catch (error) { console.warn('No se pudo precalentar cache local:', error?.message || error); }
  createWindow();

  const deepArg = process.argv.find((a) => typeof a === 'string' && a.startsWith('nexo://'));
  if (deepArg) applyDeepLinkPayload(parseDeepLink(deepArg));
  setupAutoUpdater();
  let cachedCurrent = await ensureVersionInstallerCached(app.getVersion(), getUpdateCacheDir(), { onErrorLog: appendErrorLog }).catch(() => null);
  if (!cachedCurrent && app.isPackaged) {
    try {
      const target = path.join(getUpdateCacheDir(), `Nexo-${app.getVersion()}.exe`);
      await fs.mkdir(getUpdateCacheDir(), { recursive: true });
      await fs.copyFile(process.execPath, target);
      cachedCurrent = target;
      await pruneCachedInstallers(getUpdateCacheDir(), 3).catch(() => {});
    } catch (copyErr) {
      await appendErrorLog('cache-current-installer', copyErr);
    }
  }
  await persistCurrentVersionMeta({ reason: 'startup', installer: cachedCurrent ? path.basename(cachedCurrent) : '' });
  scheduleMidnightDailyExport();
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

app.on('second-instance', (_event, argv) => {
  const deepArg = (argv || []).find((a) => typeof a === 'string' && a.startsWith('nexo://'));
  if (deepArg) applyDeepLinkPayload(parseDeepLink(deepArg));
  showOrCreateMainWindow();
});

app.on('open-url', (event, url) => {
  event.preventDefault();
  applyDeepLinkPayload(parseDeepLink(url));
});

app.on('before-quit', () => {
  isQuitting = true;
  if (pendingDeltaFlushTimer) clearTimeout(pendingDeltaFlushTimer);
  flushPendingStoreDeltas('before-quit').catch(() => {});
});

app.on('window-all-closed', () => {
  // mantener proceso vivo para tareas en segundo plano/tray
});
