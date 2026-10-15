const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { buildLaunchConfig } = require('../runtime.cjs');

test('desktop backend uses the private single-user profile and local adapter defaults', () => {
  const config = buildLaunchConfig({
    isPackaged: true,
    resourcesPath: '/opt/Geo/resources',
    repositoryRoot: '/repo',
    userDataPath: '/home/user/.config/Geo',
    port: 43125,
    platform: 'linux',
    inheritedEnv: {
      GEO_DEPLOYMENT_MODE: 'public',
      GEO_REDIS_URL: 'redis://remote',
      GEO_EDIT_TOKEN: 'not-for-desktop',
      HTTPS_PROXY: 'http://proxy.example',
    },
  });

  assert.equal(config.executable, path.join('/opt/Geo/resources', 'geo-backend', 'geo-backend'));
  assert.equal(config.cwd, path.join('/opt/Geo/resources', 'geo-backend'));
  assert.equal(config.env.GEO_DEPLOYMENT_MODE, 'private');
  assert.equal(config.env.GEO_REDIS_URL, '');
  assert.equal(config.env.GEO_DATABASE_PATH, path.join('/home/user/.config/Geo', 'geo.sqlite3'));
  assert.equal(config.env.GEO_FRONTEND_DIST, path.join('/opt/Geo/resources', 'dist'));
  assert.equal(config.env.GEO_CORS_ORIGINS, 'http://127.0.0.1:43125');
  assert.equal(config.env.GEO_WSJT_X_UDP_HOST, '127.0.0.1');
  assert.equal(config.env.GEO_WSJT_X_UDP_PORT, '2237');
  assert.equal(config.env.GEO_EDIT_TOKEN, undefined);
  assert.equal(config.env.HTTPS_PROXY, 'http://proxy.example');
});

test('desktop development paths reuse the repository builds and allow a local WSJT-X port override', () => {
  const config = buildLaunchConfig({
    isPackaged: false,
    resourcesPath: '/unused',
    repositoryRoot: '/workspace/geo',
    userDataPath: '/tmp/geo-profile',
    port: 43126,
    platform: 'win32',
    inheritedEnv: { GEO_WSJT_X_UDP_PORT: '2240' },
  });

  assert.equal(config.executable, path.join('/workspace/geo', 'backend', 'dist', 'geo-backend', 'geo-backend.exe'));
  assert.equal(config.env.GEO_FRONTEND_DIST, path.join('/workspace/geo', 'frontend', 'dist'));
  assert.equal(config.env.GEO_WSJT_X_UDP_PORT, '2240');
});
