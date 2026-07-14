const assert = require('assert');
const fs = require('fs');
const path = require('path');
const shell = require('../public/site-shell');

const root = path.join(__dirname, '..');
const pages = [
  'index.html',
  'wallet.html',
  'network.html',
  'economics.html',
  'docs.html',
  'address.html',
  'block.html',
  'tx.html',
  'observer-index.html',
  'observer-address.html',
  'observer-block.html',
  'observer-tx.html',
  'become-an-observer.html',
  'setup.html'
];

for (const page of pages) {
  const source = fs.readFileSync(path.join(root, 'public', page), 'utf8');
  assert.ok(source.includes('/site-shell.js'), `${page} loads the shared site shell`);
  assert.ok(source.includes('data-site-header'), `${page} uses the shared navigation component`);
  assert.ok(source.includes('class="page-container') || source.includes('page-container '), `${page} uses the shared page container`);
  assert.ok(source.includes('class="page-title"'), `${page} uses shared page-title typography`);
  assert.ok(!source.includes('class="hero"'), `${page} has no duplicated legacy hero navigation`);
}

assert.strictEqual(shell.activeSection('/'), 'explorer');
assert.strictEqual(shell.activeSection('/block/10'), 'explorer');
assert.strictEqual(shell.activeSection('/tx/abc'), 'explorer');
assert.strictEqual(shell.activeSection('/address/spg_test'), 'explorer');
assert.strictEqual(shell.activeSection('/wallet'), 'wallet');
assert.strictEqual(shell.activeSection('/network'), 'network');
assert.strictEqual(shell.activeSection('/economics'), 'economics');

const markup = shell.headerMarkup('wallet', '<span id="pageAction">Action</span>');
assert.ok(markup.includes('aria-current="page"'));
assert.ok(markup.includes('Socials'));
assert.ok(markup.includes('Discord'));
assert.ok(markup.includes('X (Twitter)'));
assert.ok(markup.includes('Become an Observer'));
assert.ok(markup.includes('href="/become-an-observer"'));
assert.ok(markup.includes('id="pageAction"'), 'page-specific controls use the shared action slot');

const statusMarkup = shell.networkStatusMarkup();
for (const metric of ['network', 'supply', 'minted', 'fee', 'block', 'observers']) {
  assert.ok(statusMarkup.includes(`data-network-metric="${metric}"`), `${metric} is present in the shared status bar`);
}
assert.strictEqual(shell.STATUS_METRICS.length, 6, 'status metrics use one extensible definition');
assert.ok(statusMarkup.includes('Active Observers'), 'status bar labels the privacy-safe aggregate accurately');
assert.strictEqual(shell.activeObserverCount({ activeObserverCount: 1, publicActiveObserverCount: 0 }), 1, 'private observers count in aggregate network health');
assert.strictEqual(shell.activeObserverCount({ publicActiveObserverCount: 2 }), 2, 'public count remains a compatibility fallback');
assert.ok(statusMarkup.includes('href="/economics"'), 'supply and mint metrics link to explorer economics');
assert.strictEqual(shell.formatBaseUnits('5100170311596031159', 9, 2), '5,100,170,311.59');
assert.strictEqual(shell.formatBaseUnits('7', 9, 9), '0.000000007');
assert.deepStrictEqual(shell.deriveNetworkState({ healthy: true, syncState: 'synced' }, { producer: { online: true } }), { label: 'Healthy', tone: 'healthy' });
assert.deepStrictEqual(shell.deriveNetworkState({ healthy: true, syncState: 'syncing' }, {}), { label: 'Syncing', tone: 'syncing' });
assert.deepStrictEqual(shell.deriveNetworkState({ maintenance: true }, {}), { label: 'Maintenance', tone: 'maintenance' });
assert.deepStrictEqual(shell.deriveNetworkState({ healthy: false }, {}), { label: 'Degraded', tone: 'degraded' });

const script = fs.readFileSync(path.join(root, 'public', 'site-shell.js'), 'utf8');
for (const key of ['ArrowDown', 'ArrowUp', 'Home', 'End', 'Escape']) {
  assert.ok(script.includes(`event.key === '${key}'`), `Socials menu supports ${key}`);
}

const css = fs.readFileSync(path.join(root, 'public', 'styles.css'), 'utf8');
for (const token of ['--layout-max-width', '--layout-gutter', '--layout-content-top', '--site-header-height']) {
  assert.ok(css.includes(token), `shared layout defines ${token}`);
}
assert.ok(css.includes('main.page-container'));
assert.ok(css.includes('.site-header-inner'));
assert.ok(css.includes('--network-status-height'));
assert.ok(css.includes('.network-status-track'));
assert.ok(script.includes("fetchStatusJson(view, '/api/status')"), 'status bar reuses the public status endpoint');
assert.ok(script.includes("fetchStatusJson(view, '/api/network/status')"), 'status bar reuses the network status endpoint');

console.log('Shared site layout tests passed.');
