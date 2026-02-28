const https = require('https');
const path = require('path');
const fs = require('fs/promises');
const fssync = require('fs');
const { autoUpdater } = require('electron-updater');
const { app, dialog, shell } = require('electron');
const log = require('electron-log/main');

const RELEASE_OWNER = 'zhinouno-ui';
const RELEASE_REPO = 'nexo-desktop';
const RELEASE_CHANNEL = 'latest';
const RELEASES_URL = `https://github.com/${RELEASE_OWNER}/${RELEASE_REPO}/releases`;

function getUpdaterLogPath() {
  return path.join(app.getPath('userData'), 'logs', 'updater.log');
}

log.initialize();
log.transports.file.level = 'info';
log.transports.file.resolvePathFn = () => getUpdaterLogPath();
autoUpdater.logger = log;

function githubApi(pathname) {
  return `https://api.github.com/repos/${RELEASE_OWNER}/${RELEASE_REPO}${pathname}`;
}

function requestText(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'nexo-desktop-updater' } }, (res) => {
      if (res.statusCode && res.statusCode >= 400) {
        reject(new Error(`HTTP ${res.statusCode}`));
        return;
      }
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

async function requestJson(url) {
  const text = await requestText(url);
  return JSON.parse(text || '{}');
}

function downloadFile(url, destPath) {
  return new Promise((resolve, reject) => {
    const file = fssync.createWriteStream(destPath);
    https.get(url, { headers: { 'User-Agent': 'nexo-desktop-updater' } }, (res) => {
      if (res.statusCode && res.statusCode >= 400) {
        file.close();
        reject(new Error(`HTTP ${res.statusCode} al descargar instalador`));
        return;
      }
      res.pipe(file);
      file.on('finish', () => {
        file.close();
        resolve(destPath);
      });
    }).on('error', (error) => {
      file.close();
      reject(error);
    });
  });
}

async function openManualReleaseFallback() {
  await shell.openExternal(RELEASES_URL);
}

function getUpdatesCacheDir() {
  return path.join(app.getPath('userData'), 'updates-cache');
}

function normalizeVersion(v) {
  return String(v || '').trim().replace(/^v/, '');
}

function compareVersions(a, b) {
  const ap = normalizeVersion(a).split('.').map((n) => parseInt(n, 10) || 0);
  const bp = normalizeVersion(b).split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < 3; i += 1) {
    if ((ap[i] || 0) > (bp[i] || 0)) return 1;
    if ((ap[i] || 0) < (bp[i] || 0)) return -1;
  }
  return 0;
}

function extractVersionFromName(name) {
  const m = String(name || '').match(/(\d+\.\d+\.\d+)/);
  return m ? m[1] : '0.0.0';
}

async function pruneCachedInstallers(cacheDir = getUpdatesCacheDir(), keep = 3) {
  try {
    await fs.mkdir(cacheDir, { recursive: true });
    const names = await fs.readdir(cacheDir);
    const entries = [];
    for (const name of names) {
      if (!name.toLowerCase().endsWith('.exe')) continue;
      entries.push({
        name,
        full: path.join(cacheDir, name),
        version: extractVersionFromName(name)
      });
    }
    entries.sort((a, b) => compareVersions(b.version, a.version));
    const stale = entries.slice(Math.max(keep, 0));
    for (const item of stale) {
      await fs.unlink(item.full).catch(() => {});
    }
    return { ok: true, kept: entries.length - stale.length, removed: stale.length };
  } catch (error) {
    log.warn('pruneCachedInstallers failed', error?.message || String(error));
    return { ok: false, removed: 0, message: error?.message || String(error) };
  }
}

async function validateLatestReleaseAssets({ currentVersion = app.getVersion(), onStatus = () => {} } = {}) {
  try {
    const release = await requestJson(githubApi('/releases/latest'));
    const version = normalizeVersion(release?.tag_name);
    const assets = Array.isArray(release.assets) ? release.assets : [];
    const latestYml = assets.find((a) => String(a.name || '').toLowerCase() === 'latest.yml');
    const installer = assets.find((a) => String(a.name || '').toLowerCase().endsWith('.exe') && String(a.name || '').includes('-win-'));
    const blockmap = assets.find((a) => String(a.name || '').toLowerCase().endsWith('.exe.blockmap'));

    if (!latestYml || !installer || !blockmap) {
      return { ok: false, version, message: 'Release incompleto: faltan latest.yml, instalador .exe o blockmap.' };
    }

    const ymlText = await requestText(latestYml.browser_download_url);
    const ymlVersion = (ymlText.match(/\bversion:\s*([\w.-]+)/i) || [])[1] || '';
    const ymlPath = (ymlText.match(/\bpath:\s*([^\n\r]+)/i) || [])[1] || '';
    const hasSha512 = /\bsha512:\s*.+/i.test(ymlText);

    if (!hasSha512 || !ymlPath || !ymlVersion) {
      return { ok: false, version, message: 'latest.yml inválido: faltan version/path/sha512.' };
    }

    if (normalizeVersion(ymlVersion) !== normalizeVersion(version)) {
      return { ok: false, version, message: `latest.yml inconsistente: version ${ymlVersion} != tag ${version}` };
    }

    if (compareVersions(version, currentVersion) <= 0) {
      return { ok: false, version, message: `latest.yml no tiene una versión mayor a la actual (${currentVersion}).` };
    }

    if (!String(installer.name || '').includes(String(ymlPath).trim())) {
      onStatus('warning', { message: 'latest.yml path no coincide exactamente con el asset principal.' });
    }

    return { ok: true, version, assets: { latestYml: latestYml.name, installer: installer.name, blockmap: blockmap.name } };
  } catch (error) {
    return { ok: false, message: `No se pudo validar latest.yml: ${error?.message || error}` };
  }
}

async function fallbackUpdate({ onStatus = () => {}, onErrorLog = async () => {} } = {}) {
  try {
    const current = app.getVersion();
    const release = await requestJson(githubApi('/releases/latest'));
    const latest = normalizeVersion(release?.tag_name);

    if (!latest || compareVersions(latest, current) <= 0) {
      onStatus('not-available', { message: 'Ya estás en la última versión (fallback)' });
      return { ok: true, latest, current, updateAvailable: false };
    }

    const assets = Array.isArray(release.assets) ? release.assets : [];
    const asset = assets.find((a) => String(a.name || '').toLowerCase().includes('win-x64') && String(a.name || '').toLowerCase().endsWith('.exe'));

    onStatus('fallback-available', { latest, current, message: `Nueva versión ${latest} detectada por fallback.` });

    const result = await dialog.showMessageBox({
      type: 'info',
      title: 'Nueva versión disponible',
      message: `Hay una nueva versión (${latest}) disponible.`,
      buttons: ['Descargar manual', 'Cerrar'],
      defaultId: 0,
      cancelId: 1
    });

    if (result.response === 0) {
      if (asset?.browser_download_url) await shell.openExternal(asset.browser_download_url);
      else await openManualReleaseFallback();
    }

    return { ok: true, latest, current, updateAvailable: true };
  } catch (error) {
    await onErrorLog('fallbackUpdate', error);
    onStatus('error', { message: `Fallback de update falló: ${error?.message || error}` });
    return { ok: false, message: error?.message || String(error) };
  }
}

async function ensureVersionInstallerCached(version, cacheDir = getUpdatesCacheDir(), { onErrorLog = async () => {} } = {}) {
  try {
    const safeVersion = normalizeVersion(version);
    if (!safeVersion) return null;

    await fs.mkdir(cacheDir, { recursive: true });
    const targetPath = path.join(cacheDir, `Nexo-${safeVersion}.exe`);
    if (fssync.existsSync(targetPath)) {
      await pruneCachedInstallers(cacheDir, 3);
      return targetPath;
    }

    const release = await requestJson(githubApi(`/releases/tags/v${safeVersion}`));
    const assets = Array.isArray(release.assets) ? release.assets : [];
    const asset = assets.find((a) => String(a.name || '').toLowerCase().includes('win-x64') && String(a.name || '').toLowerCase().endsWith('.exe'));
    if (!asset?.browser_download_url) return null;

    await downloadFile(asset.browser_download_url, targetPath);
    await pruneCachedInstallers(cacheDir, 3);
    return targetPath;
  } catch (error) {
    await onErrorLog('ensureVersionInstallerCached', error, { version });
    return null;
  }
}

function initUpdater({ onStatus = () => {}, onErrorLog = async () => {}, onDownloaded = async () => {}, onUpdaterError = async () => {}, feed = {} } = {}) {
  autoUpdater.allowDowngrade = true;
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = false;
  autoUpdater.forceDevUpdateConfig = false;

  autoUpdater.setFeedURL({
    provider: 'github',
    owner: feed.owner || RELEASE_OWNER,
    repo: feed.repo || RELEASE_REPO,
    releaseType: 'release',
    channel: feed.channel || RELEASE_CHANNEL
  });

  autoUpdater.removeAllListeners();
  autoUpdater.on('checking-for-update', () => {
    log.info('checking-for-update');
    onStatus('checking', { message: 'Buscando actualización…' });
  });
  autoUpdater.on('update-available', (info) => {
    log.info('update-available', info?.version || 'unknown');
    onStatus('available', { version: info?.version || '', message: `Nueva versión detectada: ${info?.version || ''}` });
  });
  autoUpdater.on('update-not-available', (info) => {
    log.info('update-not-available', info?.version || app.getVersion());
    onStatus('not-available', { version: info?.version || app.getVersion(), message: 'Ya estás en la última versión' });
  });
  autoUpdater.on('download-progress', (progress) => {
    onStatus('download-progress', { percent: Math.round(progress?.percent || 0) });
  });
  autoUpdater.on('update-downloaded', async (info) => {
    log.info('update-downloaded', info?.version || 'unknown');
    await onDownloaded(info);
  });
  autoUpdater.on('error', async (error) => {
    log.error('autoUpdater error', error?.message || error);
    await onErrorLog('autoUpdater', error);
    await onUpdaterError(error);
    onStatus('error', { message: `Updater oficial falló: ${error?.message || error}. Activando fallback…` });
    await fallbackUpdate({ onStatus, onErrorLog });
  });
}

async function checkForUpdatesWithFallback({ onErrorLog = async () => {}, onStatus = () => {} } = {}) {
  try {
    const rel = await validateLatestReleaseAssets({ currentVersion: app.getVersion(), onStatus });
    if (!rel.ok) {
      log.error('release validation failed', rel.message || 'unknown');
      onStatus('error', { message: rel.message || 'latest.yml inválido en release.' });
      return { ok: false, message: rel.message || 'latest.yml inválido' };
    }
    await autoUpdater.checkForUpdates();
    return { ok: true, latestVersion: rel.version, updateUrl: RELEASES_URL };
  } catch (error) {
    await onErrorLog('checkForUpdatesWithFallback', error);
    return fallbackUpdate({ onStatus, onErrorLog });
  }
}

async function getUpdaterDiagnostics(lastAttempt = {}) {
  const cacheDir = getUpdatesCacheDir();
  let files = [];
  try {
    const names = await fs.readdir(cacheDir);
    files = names.filter((n) => n.toLowerCase().endsWith('.exe'));
  } catch (_) {}

  const latest = await validateLatestReleaseAssets({ currentVersion: app.getVersion() }).catch(() => ({ ok: false, message: 'No disponible' }));
  return {
    version: app.getVersion(),
    latestVersion: latest?.version || '',
    repo: `${RELEASE_OWNER}/${RELEASE_REPO}`,
    channel: RELEASE_CHANNEL,
    updateUrl: RELEASES_URL,
    cacheDir,
    cacheInstallers: files,
    logPath: getUpdaterLogPath(),
    lastUpdateAttempt: lastAttempt
  };
}

module.exports = {
  autoUpdater,
  initUpdater,
  fallbackUpdate,
  checkForUpdatesWithFallback,
  ensureVersionInstallerCached,
  getUpdatesCacheDir,
  pruneCachedInstallers,
  validateLatestReleaseAssets,
  getUpdaterDiagnostics,
  openManualReleaseFallback,
  getUpdaterLogPath,
  RELEASE_OWNER,
  RELEASE_REPO,
  RELEASE_CHANNEL
};
