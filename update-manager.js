const https = require('https');
const path = require('path');
const fs = require('fs/promises');
const fssync = require('fs');
const { autoUpdater } = require('electron-updater');
const { app, dialog, shell } = require('electron');

const RELEASE_OWNER = 'zhinouno-ui';
const RELEASE_REPO = 'nexo-desktop';
const RELEASES_URL = `https://github.com/${RELEASE_OWNER}/${RELEASE_REPO}/releases/latest`;

const updaterLogger = {
  info: (...args) => console.log('[updater]', ...args),
  warn: (...args) => console.warn('[updater]', ...args),
  error: (...args) => console.error('[updater]', ...args)
};

autoUpdater.logger = updaterLogger;

function githubApi(pathname) {
  return `https://api.github.com/repos/${RELEASE_OWNER}/${RELEASE_REPO}${pathname}`;
}

function requestJson(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'nexo-desktop-updater' } }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try { resolve(JSON.parse(data || '{}')); } catch (e) { reject(e); }
      });
    }).on('error', reject);
  });
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

async function fallbackUpdate({ onStatus = () => {}, onErrorLog = async () => {} } = {}) {
  try {
    const current = app.getVersion();
    const release = await requestJson(githubApi('/releases/latest'));
    const latestTag = String(release?.tag_name || '').trim();
    const latest = latestTag.replace(/^v/, '');

    if (!latest || latest === current) {
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

function getUpdatesCacheDir() {
  return path.join(app.getPath('userData'), 'updates-cache');
}

async function ensureVersionInstallerCached(version, cacheDir = getUpdatesCacheDir(), { onErrorLog = async () => {} } = {}) {
  try {
    const safeVersion = String(version || '').trim().replace(/^v/, '');
    if (!safeVersion) return null;

    await fs.mkdir(cacheDir, { recursive: true });
    const targetPath = path.join(cacheDir, `Nexo-${safeVersion}.exe`);
    if (fssync.existsSync(targetPath)) return targetPath;

    const release = await requestJson(githubApi(`/releases/tags/v${safeVersion}`));
    const assets = Array.isArray(release.assets) ? release.assets : [];
    const asset = assets.find((a) => String(a.name || '').toLowerCase().includes('win-x64') && String(a.name || '').toLowerCase().endsWith('.exe'));
    if (!asset?.browser_download_url) return null;

    await downloadFile(asset.browser_download_url, targetPath);
    return targetPath;
  } catch (error) {
    await onErrorLog('ensureVersionInstallerCached', error, { version });
    return null;
  }
}

function initUpdater({ onStatus = () => {}, onErrorLog = async () => {}, onDownloaded = async () => {}, feed = {} } = {}) {
  autoUpdater.allowDowngrade = true;
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = false;
  autoUpdater.forceDevUpdateConfig = false;

  autoUpdater.setFeedURL({
    provider: 'github',
    owner: feed.owner || RELEASE_OWNER,
    repo: feed.repo || RELEASE_REPO,
    releaseType: 'release'
  });

  autoUpdater.removeAllListeners();

  autoUpdater.on('checking-for-update', () => {
    updaterLogger.info('checking-for-update');
    onStatus('checking', { message: 'Buscando actualización…' });
  });

  autoUpdater.on('update-available', (info) => {
    updaterLogger.info('update-available', info?.version || 'unknown');
    onStatus('available', { version: info?.version || '', message: `Nueva versión detectada: ${info?.version || ''}` });
  });

  autoUpdater.on('update-not-available', (info) => {
    updaterLogger.info('update-not-available', info?.version || app.getVersion());
    onStatus('not-available', { version: info?.version || app.getVersion(), message: 'Ya estás en la última versión' });
  });

  autoUpdater.on('download-progress', (progress) => {
    onStatus('download-progress', { percent: Math.round(progress?.percent || 0) });
  });

  autoUpdater.on('update-downloaded', async (info) => {
    updaterLogger.info('update-downloaded', info?.version || 'unknown');
    await onDownloaded(info);
  });

  autoUpdater.on('error', async (error) => {
    updaterLogger.error('autoUpdater error', error?.message || error);
    await onErrorLog('autoUpdater', error);
    onStatus('error', { message: `Updater oficial falló: ${error?.message || error}. Activando fallback…` });
    await fallbackUpdate({ onStatus, onErrorLog });
  });
}

async function checkForUpdatesWithFallback({ onErrorLog = async () => {}, onStatus = () => {} } = {}) {
  try {
    await autoUpdater.checkForUpdates();
    return { ok: true };
  } catch (error) {
    await onErrorLog('checkForUpdatesWithFallback', error);
    return fallbackUpdate({ onStatus, onErrorLog });
  }
}

module.exports = {
  autoUpdater,
  initUpdater,
  fallbackUpdate,
  checkForUpdatesWithFallback,
  ensureVersionInstallerCached,
  getUpdatesCacheDir,
  openManualReleaseFallback,
  RELEASE_OWNER,
  RELEASE_REPO
};
