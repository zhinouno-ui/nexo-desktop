const fs = require('fs');
const path = require('path');

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function fail(message) {
  console.error(`[version-verify] ERROR: ${message}`);
  process.exit(1);
}

function main() {
  const root = process.cwd();
  const pkgPath = path.join(root, 'package.json');
  const lockPath = path.join(root, 'package-lock.json');

  if (!fs.existsSync(pkgPath)) fail('No existe package.json');
  if (!fs.existsSync(lockPath)) fail('No existe package-lock.json');

  const pkg = readJson(pkgPath);
  const lock = readJson(lockPath);

  const pkgVersion = String(pkg.version || '').trim();
  const lockVersion = String(lock.version || '').trim();
  const lockRootVersion = String(lock?.packages?.['']?.version || '').trim();

  if (!pkgVersion) fail('package.json no tiene version');
  if (pkgVersion !== lockVersion) {
    fail(`package.json (${pkgVersion}) != package-lock.json (${lockVersion})`);
  }
  if (pkgVersion !== lockRootVersion) {
    fail(`package.json (${pkgVersion}) != package-lock.json packages[""].version (${lockRootVersion})`);
  }

  console.log(`[version-verify] OK: version consistente ${pkgVersion}`);
}

main();
