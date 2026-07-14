const assert = require('assert');
const fs = require('fs');
const http = require('http');
const path = require('path');
const express = require('express');
const {
  normalizeObserverDownloadsConfig,
  publicObserverRelease
} = require('../server/lib/observerDownloads');
const { releasesRouter } = require('../server/routes/releases');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'public', 'become-an-observer.html'), 'utf8');
const client = fs.readFileSync(path.join(root, 'public', 'observer-onboarding.js'), 'utf8');
const shell = fs.readFileSync(path.join(root, 'public', 'site-shell.js'), 'utf8');
const serverSource = fs.readFileSync(path.join(root, 'server', 'index.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'public', 'styles.css'), 'utf8');
const copyConfigScript = fs.readFileSync(path.join(root, 'scripts', 'copy-config.js'), 'utf8');

function configuredRelease(overrides = {}) {
  return {
    observerDownloads: {
      enabled: true,
      version: '0.2.0-alpha',
      releaseDate: '2026-07-14',
      windowsInstaller: {
        url: 'https://github.com/SpargeNetwork/sparge-node/releases/download/v0.2.0-alpha/Sparge.Observer.Setup.0.2.0.exe',
        fileName: 'Sparge.Observer.Setup.0.2.0.exe',
        fileSizeBytes: 123456,
        checksumSha256: 'a'.repeat(64),
        ...overrides
      }
    }
  };
}

const unavailable = { observerDownloads: { enabled: false, version: '0.1.0', windowsInstaller: {} } };
normalizeObserverDownloadsConfig(unavailable);
assert.strictEqual(publicObserverRelease(unavailable).available, false);
assert.strictEqual(publicObserverRelease(unavailable).windows.installer, null);

const configured = configuredRelease();
normalizeObserverDownloadsConfig(configured);
const publicRelease = publicObserverRelease(configured);
assert.strictEqual(publicRelease.available, true);
assert.ok(publicRelease.windows.installer.url.includes('/SpargeNetwork/sparge-node/releases/download/'));
assert.strictEqual(publicRelease.windows.installer.checksumSha256.length, 64);

assert.throws(() => normalizeObserverDownloadsConfig(configuredRelease({ url: 'https://example.com/observer.exe' })), /official Sparge GitHub Releases path/);
assert.throws(() => normalizeObserverDownloadsConfig(configuredRelease({ url: 'https://github.com/SpargeNetwork/sparge-node/releases/download/v0.2.0-alpha/notes.txt' })), /Windows \.exe installer/);
assert.throws(() => normalizeObserverDownloadsConfig(configuredRelease({ checksumSha256: 'short' })), /64 hexadecimal/);

const serialized = JSON.stringify(publicRelease).toLowerCase();
for (const privateField of ['nodeid', 'hostname', 'username', 'rawip', 'privatekey']) {
  assert.ok(!serialized.includes(privateField), `release API does not expose ${privateField}`);
}

assert.ok(html.includes('What an Observer does'));
assert.ok(html.includes('Public listing is optional'));
assert.ok(html.includes('No, keep it private'));
assert.ok(html.includes('Only download the Observer client from official Sparge sources'));
assert.ok(html.includes('https://spargenetwork.github.io/sparge-docs/observer/'));
assert.ok(!html.includes('releases/download/'), 'HTML contains no unverified download link');
assert.ok(client.includes("fetch('/api/releases/observer/latest'"));
assert.ok(client.includes("fetch('/api/network/status'"));
assert.ok(client.includes('OFFICIAL_RELEASE_PREFIX'));
assert.ok(shell.includes("const OBSERVER_URL = '/become-an-observer'"));
assert.ok(serverSource.includes("app.get(['/become-an-observer', '/become-an-observer/']"));
assert.ok(css.includes('.observer-onboarding-hero'));
assert.ok(css.includes('.observer-setup-steps'));
assert.ok(copyConfigScript.includes('config.observerDownloads = {'), 'packaged observer excludes producer release metadata');
assert.ok(copyConfigScript.includes("checksumSha256: ''"), 'packaged observer excludes its own checksum');

async function requestJson(server, requestPath) {
  const port = server.address().port;
  return new Promise((resolve, reject) => {
    http.get({ host: '127.0.0.1', port, path: requestPath }, (response) => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => { body += chunk; });
      response.on('end', () => resolve({ status: response.statusCode, body: JSON.parse(body) }));
    }).on('error', reject);
  });
}

async function main() {
  const app = express();
  app.use('/api/releases', releasesRouter(unavailable));
  const server = app.listen(0, '127.0.0.1');
  try {
    await new Promise((resolve, reject) => {
      server.once('listening', resolve);
      server.once('error', reject);
    });
    const response = await requestJson(server, '/api/releases/observer/latest');
    assert.strictEqual(response.status, 200);
    assert.strictEqual(response.body.available, false);
    assert.strictEqual(response.body.windows.installer, null);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
  console.log('Observer onboarding tests passed.');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
