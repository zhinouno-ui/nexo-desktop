const fs = require('fs');
const path = require('path');
const https = require('https');
const pkg = require('../package.json');

const MIN_MB = 10;
const expectedVersion = pkg.version;
const distDir = path.join(__dirname, '..', 'dist');
const latestPath = path.join(distDir, 'latest.yml');

function requestText(url, maxRedirects = 5) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'nexo-update-health-check' } }, (res) => {
      if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
        if (maxRedirects <= 0) return reject(new Error('Too many redirects'));
        res.resume();
        return resolve(requestText(res.headers.location, maxRedirects - 1));
      }
      if (res.statusCode && res.statusCode >= 400) return reject(new Error(`HTTP ${res.statusCode}`));
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

function parseYmlBasics(text) {
  const version = (text.match(/^\s*version:\s*([^\n\r]+)/im) || [])[1]?.trim() || '';
  const pathOrUrl = ((text.match(/^\s*path:\s*([^\n\r]+)/im) || [])[1] || (text.match(/^\s*url:\s*([^\n\r]+)/im) || [])[1] || '').trim();
  const hasSha = /\bsha512:\s*.+/i.test(text);
  return { version, pathOrUrl, hasSha };
}

(async () => {
  try {
    if (!fs.existsSync(latestPath)) throw new Error('Falta dist/latest.yml');
    const localYml = fs.readFileSync(latestPath, 'utf8');
    const local = parseYmlBasics(localYml);
    if (!local.version || !local.pathOrUrl || !local.hasSha) {
      throw new Error(`latest.yml local inválido (version=${local.version || '-'} path/url=${local.pathOrUrl || '-'} sha=${local.hasSha ? 'ok' : 'no'})`);
    }
    if (local.version !== expectedVersion) {
      throw new Error(`latest.yml local version ${local.version} != package.json ${expectedVersion}`);
    }

    const localExe = path.join(distDir, path.basename(local.pathOrUrl));
    if (!fs.existsSync(localExe)) throw new Error(`No existe instalador local: ${path.basename(local.pathOrUrl)}`);
    const sizeMb = fs.statSync(localExe).size / (1024 * 1024);
    if (sizeMb < MIN_MB) throw new Error(`Instalador local demasiado pequeño: ${sizeMb.toFixed(2)}MB`);

    const remoteYmlUrl = process.env.NEXO_REMOTE_YML_URL || 'https://github.com/zhinouno-ui/nexo-desktop/releases/latest/download/latest.yml';
    const remoteYml = await requestText(remoteYmlUrl);
    const remote = parseYmlBasics(remoteYml);
    if (!remote.version || !remote.pathOrUrl || !remote.hasSha) {
      throw new Error(`latest.yml remoto inválido (version=${remote.version || '-'} path/url=${remote.pathOrUrl || '-'} sha=${remote.hasSha ? 'ok' : 'no'})`);
    }

    console.log('[health-check-update] OK');
    console.log(`[health-check-update] local version=${local.version}, installer=${path.basename(local.pathOrUrl)}, sizeMB=${sizeMb.toFixed(2)}`);
    console.log(`[health-check-update] remote version=${remote.version}, installer=${path.basename(remote.pathOrUrl)}`);
  } catch (err) {
    console.error(`[health-check-update] FAIL: ${err.message || err}`);
    process.exit(1);
  }
})();
