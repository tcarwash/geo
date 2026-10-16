const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const metadata = require('../package.json');
const config = require('../forge.config.cjs');

async function main() {
  for (const field of ['name', 'productName', 'version', 'description', 'author']) {
    assert.equal(typeof metadata[field], 'string', `package.json needs ${field}`);
    assert(metadata[field].trim(), `package.json ${field} must not be empty`);
  }
  if (process.env.GITHUB_REF?.startsWith('refs/tags/v')) {
    assert.equal(process.env.GITHUB_REF.slice('refs/tags/v'.length), metadata.version,
      'Release tag must match desktop/package.json version');
  }
  // Load the host Node addons here, before building the frontend and Python sidecar.
  // Forge only rebuilds application dependencies, not these maker dependencies.
  if (process.platform === 'darwin') {
    require('fs-xattr');
    require('macos-alias');
    require('electron-installer-dmg');
  }
  if (process.platform === 'win32') {
    const root = path.dirname(require.resolve('electron-winstaller/package.json'));
    for (const file of ['7z.exe', '7z.dll', 'Squirrel.exe', 'nuget.exe']) {
      assert(fs.existsSync(path.join(root, 'vendor', file)), `Missing Squirrel tool: ${file}`);
    }
  }
  for (const entry of config.makers) {
    const { default: Maker } = await import(entry.name);
    const maker = new Maker(entry.config, entry.platforms);
    if (!maker.platforms.includes(process.platform)) continue;
    assert(maker.isSupportedOnCurrentPlatform(), `${entry.name} is not available`);
    maker.ensureExternalBinariesExist();
    console.log(`Ready: ${entry.name} (${process.platform}/${process.arch})`);
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
