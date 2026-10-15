const path = require('node:path');

function buildLaunchConfig({ isPackaged, resourcesPath, repositoryRoot, userDataPath, port, platform, inheritedEnv = {} }) {
  const root = isPackaged ? resourcesPath : repositoryRoot;
  const backendDirectory = isPackaged
    ? path.join(root, 'geo-backend')
    : path.join(root, 'backend', 'dist', 'geo-backend');
  const frontendDirectory = isPackaged
    ? path.join(root, 'dist')
    : path.join(root, 'frontend', 'dist');
  const executable = path.join(
    backendDirectory,
    platform === 'win32' ? 'geo-backend.exe' : 'geo-backend',
  );
  const origin = `http://127.0.0.1:${port}`;
  const env = Object.fromEntries(
    Object.entries(inheritedEnv).filter(([key]) => !key.startsWith('GEO_')),
  );

  Object.assign(env, {
    GEO_DEPLOYMENT_MODE: 'private',
    GEO_DATABASE_PATH: path.join(userDataPath, 'geo.sqlite3'),
    GEO_FRONTEND_DIST: frontendDirectory,
    GEO_DESKTOP_PORT: String(port),
    GEO_CORS_ORIGINS: origin,
    GEO_REDIS_URL: '',
    GEO_WSJT_X_UDP_HOST: '127.0.0.1',
    GEO_WSJT_X_UDP_PORT: inheritedEnv.GEO_WSJT_X_UDP_PORT || '2237',
  });

  return { executable, cwd: backendDirectory, frontendDirectory, env, origin };
}

module.exports = { buildLaunchConfig };
