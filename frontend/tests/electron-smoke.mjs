import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { createSocket } from 'node:dgram';
import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const desktop = path.join(repo, 'desktop');
const executable = path.join(desktop, 'out', 'Geo-linux-x64', 'geo');
const cacheRoot = process.env.XDG_CACHE_HOME || path.join(process.env.HOME || process.cwd(), '.cache');
const scratch = path.join(cacheRoot, 'geo-electron-smoke');
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

async function freeTcpPort() {
  const server = createServer();
  await new Promise((resolve, reject) => server.listen(0, '127.0.0.1', error => error ? reject(error) : resolve()));
  const port = server.address().port;
  await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  return port;
}

async function freeUdpPort() {
  const socket = createSocket('udp4');
  await new Promise(resolve => socket.bind(0, '127.0.0.1', resolve));
  const port = socket.address().port;
  await new Promise(resolve => socket.close(resolve));
  return port;
}

if (!existsSync(executable)) throw new Error(`Build the Linux desktop package before running this smoke test: ${executable}`);
mkdirSync(scratch, { recursive: true });
const debugPort = await freeTcpPort();
const udpPort = await freeUdpPort();
const output = [];
const child = spawn('xvfb-run', ['-a', executable, '--no-sandbox', `--remote-debugging-port=${debugPort}`, `--user-data-dir=${scratch}`], {
  cwd: desktop,
  env: { ...process.env, GEO_WSJT_X_UDP_PORT: String(udpPort) },
  detached: true,
  stdio: ['ignore', 'pipe', 'pipe'],
});
child.stdout.on('data', chunk => output.push(chunk.toString()));
child.stderr.on('data', chunk => output.push(chunk.toString()));
let browser;
const pageErrors = [];
try {
  let endpoint;
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (child.exitCode !== null) throw new Error(`Geo exited early (${child.exitCode}): ${output.join('')}`);
    try {
      const response = await fetch(`http://127.0.0.1:${debugPort}/json/version`);
      if (response.ok) { endpoint = `http://127.0.0.1:${debugPort}`; break; }
    } catch {}
    await delay(250);
  }
  assert(endpoint, `Electron did not expose its local debugging endpoint: ${output.join('')}`);
  browser = await chromium.connectOverCDP(endpoint);
  let page;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    page = browser.contexts().flatMap(context => context.pages()).find(candidate => candidate.url().startsWith('http://127.0.0.1:'));
    if (page) break;
    await delay(250);
  }
  assert(page, 'Electron opened a local Geo window');
  page.on('pageerror', error => pageErrors.push(error.message));
  await page.locator('.country-label').first().waitFor({ timeout: 30000 });
  const runtime = await page.evaluate(async () => (await fetch('/api/v1/runtime')).json());
  assert.equal(runtime.deploymentMode, 'private', 'desktop uses Geo single-user mode');
  assert.equal(runtime.writeEnabled, true, 'local profile retains private-mode editing');
  const wsjtx = await page.evaluate(async () => (await fetch('/api/v1/wsjtx/heard')).json());
  assert.equal(wsjtx.udpPort, udpPort, 'the packaged backend exposes the configured local WSJT-X UDP port');
  assert.equal(wsjtx.error, null, 'the packaged backend bound the WSJT-X listener');

  const context = browser.contexts()[0];
  const clockBefore = await page.locator('.utc').innerText();
  const visibleCountryLabels = await page.locator('.country-label').count();
  await context.setOffline(true);
  await page.waitForFunction(before => document.querySelector('.utc')?.textContent !== before, clockBefore, { timeout: 3000 });
  assert(visibleCountryLabels > 0 && await page.locator('.country-label').count() > 0, 'the bundled political atlas stays visible offline');
  await context.setOffline(false);
  assert.deepEqual(pageErrors, []);
  console.log('PASS packaged Electron smoke: map/clock, private API, local WSJT-X listener, offline map continuity');
} finally {
  if (browser) await browser.close().catch(() => {});
  if (child.exitCode === null) {
    try { process.kill(-child.pid, 'SIGTERM'); } catch { child.kill('SIGTERM'); }
  }
  await Promise.race([new Promise(resolve => child.once('exit', resolve)), delay(5000)]);
}
