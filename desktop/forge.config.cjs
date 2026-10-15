const path = require('node:path');

module.exports = {
  packagerConfig: {
    asar: true,
    executableName: 'geo',
    extraResource: [
      path.resolve(__dirname, '../frontend/dist'),
      path.resolve(__dirname, '../backend/dist/geo-backend'),
    ],
  },
  makers: [
    { name: '@electron-forge/maker-zip', platforms: ['darwin', 'linux', 'win32'] },
    { name: '@electron-forge/maker-dmg' },
    { name: '@electron-forge/maker-squirrel', config: { name: 'geo' } },
    { name: '@electron-forge/maker-deb', config: { options: { name: 'geo' } } },
  ],
};
