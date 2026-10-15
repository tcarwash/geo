const { app, BrowserWindow, dialog, Menu, shell } = require('electron');
const fs = require('node:fs');
const net = require('node:net');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { buildLaunchConfig } = require('./runtime.cjs');

let backend;
let backendLog;
let quitting = false;
let windowRef;

function choosePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close(error => error ? reject(error) : resolve(port));
    });
  });
}

function pause(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function waitForBackend(child, origin) {
  let lastError;
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (child.exitCode !== null) throw new Error(`Geo backend exited with code ${child.exitCode}.`);
    try {
      const response = await fetch(`${origin}/healthz`, { signal: AbortSignal.timeout(1000) });
      if (response.ok) return;
      lastError = new Error(`Backend health check returned ${response.status}.`);
    } catch (error) {
      lastError = error;
    }
    await pause(250);
  }
  throw new Error(`Geo backend did not become ready: ${lastError?.message || 'timeout'}`);
}

async function startBackend() {
  const port = await choosePort();
  const dataDirectory = app.getPath('userData');
  fs.mkdirSync(dataDirectory, { recursive: true });
  const launch = buildLaunchConfig({
    isPackaged: app.isPackaged,
    resourcesPath: process.resourcesPath,
    repositoryRoot: path.resolve(__dirname, '../'),
    userDataPath: dataDirectory,
    port,
    platform: process.platform,
    inheritedEnv: process.env,
  });
  if (!fs.existsSync(launch.executable)) throw new Error(`Packaged backend is missing: ${launch.executable}`);
  if (!fs.existsSync(path.join(launch.frontendDirectory, 'index.html'))) {
    throw new Error(`Built Geo frontend is missing: ${launch.frontendDirectory}`);
  }
  const logs = app.getPath('logs');
  fs.mkdirSync(logs, { recursive: true });
  backendLog = fs.createWriteStream(path.join(logs, 'backend.log'), { flags: 'a' });

  backend = spawn(launch.executable, [], {
    cwd: launch.cwd,
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: launch.env,
  });
  backend.stdout.pipe(backendLog, { end: false });
  backend.stderr.pipe(backendLog, { end: false });
  backend.once('error', error => {
    if (!quitting) dialog.showErrorBox('Geo backend failed to start', error.message);
  });
  backend.once('exit', code => {
    if (!quitting && app.isReady()) {
      dialog.showErrorBox('Geo backend stopped', `The local Geo service exited with code ${code}.`);
      app.quit();
    }
  });

  await waitForBackend(backend, launch.origin);
  return launch.origin;
}

async function createWindow(origin) {
  windowRef = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 390,
    minHeight: 560,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  windowRef.webContents.setWindowOpenHandler(({ url }) => {
    if (new URL(url).protocol === 'https:') shell.openExternal(url);
    return { action: 'deny' };
  });
  windowRef.webContents.on('will-navigate', (event, url) => {
    if (new URL(url).origin !== origin) event.preventDefault();
  });
  windowRef.once('ready-to-show', () => windowRef.show());
  windowRef.on('closed', () => { windowRef = null; });
  await windowRef.loadURL(`${origin}/`);
}

Menu.setApplicationMenu(null);
app.whenReady().then(async () => {
  try {
    const origin = await startBackend();
    await createWindow(origin);
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow(origin).catch(error => {
        dialog.showErrorBox('Geo could not open', error.message);
      });
    });
  } catch (error) {
    dialog.showErrorBox('Geo could not start', error.message);
    app.quit();
  }
});

app.on('before-quit', () => {
  quitting = true;
  if (backend && backend.exitCode === null) backend.kill();
  backendLog?.end();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
