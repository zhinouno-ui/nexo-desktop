const { execSync } = require('child_process');
const pkg = require('../package.json');

const version = pkg.version;

execSync('npm run dist:win', { stdio: 'inherit' });
execSync(`git tag v${version}`, { stdio: 'inherit' });
execSync('git push', { stdio: 'inherit' });
execSync(`git push origin v${version}`, { stdio: 'inherit' });
execSync(`gh release create v${version} dist/* --generate-notes`, { stdio: 'inherit' });
