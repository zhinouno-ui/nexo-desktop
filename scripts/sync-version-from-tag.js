const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

function normalizeTagVersion(tag) {
  const match = String(tag || '').trim().match(/^v(\d+\.\d+\.\d+)$/);
  return match ? match[1] : '';
}

function getHeadTagVersion() {
  try {
    const raw = execSync('git tag --points-at HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString('utf8');
    const tags = raw.split(/\r?\n/).map((x) => x.trim()).filter(Boolean);
    for (const tag of tags) {
      const v = normalizeTagVersion(tag);
      if (v) return v;
    }
    return '';
  } catch {
    return '';
  }
}

function main() {
  const repoRoot = process.cwd();
  const packagePath = path.join(repoRoot, 'package.json');
  const lockPath = path.join(repoRoot, 'package-lock.json');

  const pkg = readJson(packagePath);
  const currentVersion = String(pkg.version || '').trim();
  const tagVersion = getHeadTagVersion();

  if (!tagVersion) {
    console.log(`[version-sync] Sin tag semver en HEAD. Se mantiene version ${currentVersion}.`);
    return;
  }

  if (tagVersion === currentVersion) {
    console.log(`[version-sync] Version ya alineada con tag: ${currentVersion}.`);
    return;
  }

  pkg.version = tagVersion;
  writeJson(packagePath, pkg);

  if (fs.existsSync(lockPath)) {
    const lock = readJson(lockPath);
    lock.version = tagVersion;
    if (lock.packages && lock.packages['']) {
      lock.packages[''].version = tagVersion;
    }
    writeJson(lockPath, lock);
  }

  console.log(`[version-sync] Actualizada version desde tag HEAD: ${currentVersion} -> ${tagVersion}`);
}

main();
