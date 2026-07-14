const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { EventEmitter } = require('events');
const http = require('http');
const net = require('net');
const { createUpdateManager } = require('../electron/updateManager');
const { parseLoopbackUrl, verifyObserverUrl, verifySetupUrl } = require('../electron/localEndpoint');
const { findAvailablePort } = require('../launcher');

class FakeUpdater extends EventEmitter {
  async checkForUpdates() { this.emit('checking-for-update'); }
  async downloadUpdate() { this.downloadCalled = true; }
  quitAndInstall(silent, forceRunAfter) { this.installArgs = [silent, forceRunAfter]; }
}

async function main() {
  const updater = new FakeUpdater();
  const states = [];
  let beforeInstall = false;
  let scheduledCheck = null;
  const manager = createUpdateManager({
    app: { isPackaged: true, getVersion: () => '0.1.2-alpha.0' },
    updater,
    platform: 'win32',
    notify: (state) => states.push(state),
    beforeInstall: () => { beforeInstall = true; },
    setTimer: (callback) => { scheduledCheck = callback; return 1; },
    setRepeatingTimer: () => 2,
    clearRepeatingTimer: () => {}
  });

  assert.strictEqual(updater.autoDownload, false, 'updates never download without user consent');
  assert.strictEqual(updater.autoInstallOnAppQuit, false, 'updates never install implicitly on ordinary quit');
  assert.strictEqual(updater.allowPrerelease, true, 'Public Alpha releases are discoverable');
  manager.start();
  assert.strictEqual(typeof scheduledCheck, 'function', 'automatic startup check is scheduled');
  await manager.check(true);
  assert.strictEqual(manager.getState().status, 'checking');
  updater.emit('update-available', { version: '0.1.3-alpha.0' });
  assert.strictEqual(manager.getState().status, 'available');
  assert.strictEqual(manager.getState().availableVersion, '0.1.3-alpha.0');
  await manager.download();
  assert.strictEqual(updater.downloadCalled, true);
  updater.emit('download-progress', { percent: 48.5 });
  assert.strictEqual(manager.getState().progressPercent, 48.5);
  updater.emit('update-downloaded', { version: '0.1.3-alpha.0' });
  assert.strictEqual(manager.getState().status, 'downloaded');
  assert.strictEqual(manager.install(), true);
  assert.strictEqual(beforeInstall, true, 'backend stop hook runs before installation');
  assert.deepStrictEqual(updater.installArgs, [false, true]);
  assert.ok(states.length >= 5, 'renderer receives updater state changes');

  const root = path.join(__dirname, '..');
  const pkg = require('../package.json');
  const html = fs.readFileSync(path.join(root, 'public', 'observer-index.html'), 'utf8');
  const preload = fs.readFileSync(path.join(root, 'electron', 'preload.js'), 'utf8');
  assert.strictEqual(pkg.build.publish[0].provider, 'github');
  assert.strictEqual(pkg.build.artifactName, 'Sparge-Observer-Setup-${version}.${ext}');
  assert.ok(html.includes('observerCheckUpdateBtn'));
  assert.ok(html.includes('observerDownloadUpdateBtn'));
  assert.ok(html.includes('observerInstallUpdateBtn'));
  for (const channel of ['observer:checkForUpdates', 'observer:downloadUpdate', 'observer:installUpdate']) {
    assert.ok(preload.includes(channel));
  }

  const mainSource = fs.readFileSync(path.join(root, 'electron', 'main.js'), 'utf8');
  const iconSource = fs.readFileSync(path.join(root, 'scripts', 'generate-icon.js'), 'utf8');
  assert.ok(mainSource.includes("assets', 'observer-node.png'"), 'desktop and tray use observer icon');
  assert.ok(mainSource.includes("process.resourcesPath, 'observer-runtime'"), 'packaged app loads its bundled observer icon');
  assert.ok(iconSource.includes("assets', 'observer-node.png'"), 'installer uses observer icon');
  assert.throws(() => parseLoopbackUrl('https://example.com/'), /loopback/);

  const server = http.createServer((req, res) => {
    res.setHeader('Content-Type', 'application/json');
    if (req.url === '/api/status') {
      res.end(JSON.stringify({ nodeMode: 'observer' }));
      return;
    }
    if (req.url === '/setup/defaults') {
      res.end(JSON.stringify({ producerUrl: 'http://localhost:3051', port: 3052 }));
      return;
    }
    res.statusCode = 404;
    res.end(JSON.stringify({ error: 'Not found' }));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const localUrl = `http://127.0.0.1:${server.address().port}/wrong-route`;
  assert.strictEqual(await verifyObserverUrl(localUrl), `http://127.0.0.1:${server.address().port}/`);
  assert.strictEqual(await verifySetupUrl(localUrl), `http://127.0.0.1:${server.address().port}/setup`);
  await new Promise((resolve) => server.close(resolve));

  const notFoundServer = http.createServer((_req, res) => {
    res.statusCode = 404;
    res.end('Not found');
  });
  await new Promise((resolve) => notFoundServer.listen(0, '127.0.0.1', resolve));
  const notFoundUrl = `http://127.0.0.1:${notFoundServer.address().port}/`;
  await assert.rejects(() => verifyObserverUrl(notFoundUrl), /HTTP 404/);
  await assert.rejects(() => verifySetupUrl(notFoundUrl), /HTTP 404/);
  await new Promise((resolve) => notFoundServer.close(resolve));

  const occupied = net.createServer();
  await new Promise((resolve) => occupied.listen(0, resolve));
  const occupiedPort = occupied.address().port;
  assert.notStrictEqual(await findAvailablePort(occupiedPort), occupiedPort, 'wildcard port conflicts select another port');
  await new Promise((resolve) => occupied.close(resolve));
  console.log('Observer updater tests passed.');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
