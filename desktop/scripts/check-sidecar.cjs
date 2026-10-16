const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const dgram = require('node:dgram');
const fs = require('node:fs');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const { setTimeout: delay } = require('node:timers/promises');
const { buildLaunchConfig } = require('../runtime.cjs');

async function main() {
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const port = server.address().port;
  await new Promise(resolve => server.close(resolve));
  const socket = dgram.createSocket('udp4');
  await new Promise((resolve, reject) => {
    socket.once('error', reject);
    socket.bind(0, '127.0.0.1', resolve);
  });
  const udpPort = socket.address().port;
  await new Promise(resolve => socket.close(resolve));
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'geo-sidecar-'));
  let child;
  let output = '';
  try {
    const launch = buildLaunchConfig({
      isPackaged: false,
      repositoryRoot: path.resolve(__dirname, '../..'),
      userDataPath: scratch,
      port,
      platform: process.platform,
      inheritedEnv: process.env,
    });
    launch.env.GEO_WSJT_X_UDP_PORT = String(udpPort);
    child = spawn(launch.executable, [], {
      cwd: launch.cwd, env: launch.env, windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let spawnError;
    child.once('error', error => { spawnError = error; });
    child.stdout.on('data', chunk => { output += chunk; });
    child.stderr.on('data', chunk => { output += chunk; });
    let ready = false;
    for (let attempt = 0; attempt < 120; attempt += 1) {
      if (spawnError) throw spawnError;
      assert(child.exitCode === null && child.signalCode === null,
        `Frozen backend exited (${child.exitCode ?? child.signalCode})`);
      try {
        const response = await fetch(`${launch.origin}/healthz`, {
          signal: AbortSignal.timeout(1000),
        });
        if (response.ok) { ready = true; break; }
      } catch {}
      await delay(250);
    }
    assert(ready, 'Frozen backend did not become healthy');
    const runtime = await fetch(`${launch.origin}/api/v1/runtime`).then(r => r.json());
    assert.equal(runtime.deploymentMode, 'private');
    assert.equal(runtime.writeEnabled, true);
    const wsjtx = await fetch(`${launch.origin}/api/v1/wsjtx/heard`).then(r => r.json());
    assert.equal(wsjtx.udpPort, udpPort);
    assert.equal(wsjtx.error, null);
    const page = await fetch(`${launch.origin}/`);
    assert.equal(page.status, 200);
    assert.match(await page.text(), /<html/i);
    console.log(`PASS frozen sidecar: health, private API, frontend (${process.platform}/${process.arch})`);
  } catch (error) {
    console.error(output);
    throw error;
  } finally {
    if (child?.pid && child.exitCode === null && child.signalCode === null) {
      const exited = new Promise(resolve => child.once('exit', resolve));
      child.kill();
      await Promise.race([exited, delay(5000)]);
      if (child.exitCode === null && child.signalCode === null) {
        child.kill('SIGKILL');
        await exited;
      }
    }
    fs.rmSync(scratch, { recursive: true, force: true });
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
