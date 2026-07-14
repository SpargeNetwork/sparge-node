const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { EventEmitter } = require('events');
const { createUpdateManager } = require('../electron/updateManager');

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
  console.log('Observer updater tests passed.');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
