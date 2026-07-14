const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { SqliteStorage } = require('../server/storage/sqliteStorage');
const { validateHeartbeat, createObserverRegistry } = require('../server/lib/observerRegistry');
const { buildNetworkStatus, buildObserverList, observerStatus } = require('../server/lib/networkStatus');
const { getOrCreateNodeIdentity } = require('../server/lib/observerNodeIdentity');
const { getObserverPrivacySettings, normalizePrivacy } = require('../server/lib/observerPrivacy');
const { createRateLimiter } = require('../server/lib/httpSecurity');
const { computeChainStats, calculateCirculatingSupplyUnits } = require('../server/lib/blockchain');
const { getSoftwareVersion } = require('../server/lib/softwareVersion');

assert.strictEqual(getSoftwareVersion(), require('../package.json').version, 'observer reports the software release version');
assert.notStrictEqual(getSoftwareVersion(), '1.0.0', 'software version is distinct from protocol version');

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'sparge-network-test-'));
}

function config() {
  return {
    observer: {
      publicListingEnabled: false,
      publicAlias: '',
      countryCode: ''
    },
    network: {
      heartbeatIntervalSeconds: 60,
      observerOfflineAfterSeconds: 180,
      observerRetentionDays: 180,
      heartbeatRateLimit: { windowMs: 60000, max: 2 }
    },
    storage: { backend: 'sqlite' }
  };
}

function blockchain(height = 10, hash = 'a'.repeat(64)) {
  return {
    getState() {
      return {
        chainId: 'sparge-mainnet',
        latestHeight: height,
        latestHash: hash,
        latestBlock: { height, hash, timestamp: '2026-01-01T00:00:00.000Z' },
        blockTimeSeconds: 51
      };
    }
  };
}

function heartbeat(overrides = {}) {
  return validateHeartbeat({
    nodeId: 'obs_test_node_0001',
    nodeMode: 'observer',
    version: '1.0.0',
    height: 10,
    latestHash: 'a'.repeat(64),
    publicListingEnabled: false,
    publicAlias: null,
    countryCode: null,
    ...overrides
  });
}

function runLimiter(limiter, ip) {
  return new Promise((resolve) => {
    const req = { ip };
    const res = {
      statusCode: 200,
      headers: {},
      setHeader(k, v) { this.headers[k] = v; },
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(payload) {
        resolve({ statusCode: this.statusCode, payload });
      }
    };
    limiter(req, res, () => resolve({ statusCode: 200 }));
  });
}

function assertValidationField(fn, field, label) {
  assert.throws(fn, (err) => {
    return err
      && err.code === 'VALIDATION_ERROR'
      && Array.isArray(err.details)
      && err.details.some((detail) => detail.field === field);
  }, label);
}

(async () => {
  const metricNow = Date.parse('2026-07-14T12:00:00.000Z');
  const metricStats = computeChainStats([
    { timestamp: '2026-07-13T11:59:59.000Z', mintUnits: '900', transactions: [] },
    { timestamp: '2026-07-13T12:00:00.000Z', mintUnits: '100', transactions: [] },
    { timestamp: '2026-07-14T11:59:59.000Z', payload: { mintUnits: '250' }, transactions: [] },
    { timestamp: '2026-07-14T12:00:01.000Z', mintUnits: '800', transactions: [] }
  ], 9, metricNow);
  assert.strictEqual(metricStats.minted24hMicro, 350n, '24h mint includes the exact rolling window only');
  assert.strictEqual(calculateCirculatingSupplyUnits({ balances: {
    spendable: '1000',
    treasury: '500',
    nodePool: '700',
    holderPool: '300'
  } }, ['nodePool', 'holderPool']), 1500n, 'circulating supply excludes unpaid reward pools');

  const dir = tempDir();
  const store = new SqliteStorage(dir, config());
  const registry = createObserverRegistry(store, config());
  const now = Date.now();

  registry.registerHeartbeat(heartbeat(), '203.0.113.10', now);
  let all = store.getAllObserverNodes();
  assert.strictEqual(all.length, 1, 'first heartbeat registration');
  assert.strictEqual(all[0].nodeId, 'obs_test_node_0001');
  assert.strictEqual(Boolean(all[0].publicListingEnabled), false, 'public listing defaults to false');

  registry.registerHeartbeat(heartbeat({ height: 9 }), '203.0.113.11', now + 1000);
  all = store.getAllObserverNodes();
  assert.strictEqual(all.length, 1, 'duplicate node ID updates existing record');
  assert.strictEqual(all[0].nodeName || '', '', 'hostname/nodeName is not stored as public identity');
  assert.strictEqual(all[0].height, 9, 'existing observer updated');

  const identityA = getOrCreateNodeIdentity(dir, config());
  const identityB = getOrCreateNodeIdentity(dir, config());
  assert.strictEqual(identityA.nodeId, identityB.nodeId, 'stable node identity after restart');
  assert.ok(!identityA.nodeName, 'stable identity does not include hostname fallback');
  const identityPath = path.join(dir, 'observer-node-id.json');
  fs.writeFileSync(identityPath, JSON.stringify({ nodeId: identityA.nodeId, nodeName: 'PC_Michiel', createdAt: identityA.createdAt }), 'utf8');
  const identityC = getOrCreateNodeIdentity(dir, config());
  assert.ok(!identityC.nodeName, 'old identity nodeName is sanitized');
  assert.ok(!JSON.parse(fs.readFileSync(identityPath, 'utf8')).nodeName, 'identity file no longer stores nodeName');
  assert.deepStrictEqual(getObserverPrivacySettings(config(), dir), {
    publicListingEnabled: false,
    publicAlias: '',
    countryCode: ''
  }, 'privacy defaults are private');

  assert.strictEqual(observerStatus({ height: 10, latestHash: 'a'.repeat(64), lastSeen: now }, 10, 'a'.repeat(64), 180000, now), 'fully_synced');
  assert.strictEqual(observerStatus({ height: 8, latestHash: 'b'.repeat(64), lastSeen: now }, 10, 'a'.repeat(64), 180000, now), 'syncing');
  assert.strictEqual(observerStatus({ height: 10, latestHash: 'b'.repeat(64), lastSeen: now }, 10, 'a'.repeat(64), 180000, now), 'mismatch');
  assert.strictEqual(observerStatus({ height: 10, latestHash: 'a'.repeat(64), lastSeen: now - 181000 }, 10, 'a'.repeat(64), 180000, now), 'offline');

  assertValidationField(() => validateHeartbeat({ nodeId: '../bad', nodeMode: 'observer', height: 1, publicListingEnabled: false }), 'nodeId', 'invalid payload rejection');
  assertValidationField(() => heartbeat({ latestHash: 'bad' }), 'latestHash', 'malformed hash rejection');
  assertValidationField(() => heartbeat({ nodeMode: 'producer' }), 'nodeMode', 'unsupported mode rejection');
  assertValidationField(() => heartbeat({ publicListingEnabled: 'yes' }), 'publicListingEnabled', 'listing flag validation');
  assertValidationField(() => heartbeat({ publicListingEnabled: true, publicAlias: '<script>' }), 'publicAlias', 'alias markup rejected');
  assertValidationField(() => heartbeat({ publicListingEnabled: true, publicAlias: 'https://example.com' }), 'publicAlias', 'alias URL rejected');
  assertValidationField(() => heartbeat({ publicListingEnabled: true, countryCode: 'ZZ' }), 'countryCode', 'country validation');
  assert.deepStrictEqual(normalizePrivacy({ publicListingEnabled: true, publicAlias: '  Public Node  ', countryCode: 'be' }), {
    publicListingEnabled: true,
    publicAlias: 'Public Node',
    countryCode: 'BE'
  }, 'alias and country normalization');

  registry.registerHeartbeat(heartbeat({
    nodeId: 'obs_test_node_0002',
    height: 10,
    latestHash: 'a'.repeat(64),
    publicListingEnabled: true,
    publicAlias: 'Public Node',
    countryCode: 'NL'
  }), '198.51.100.8', now);
  registry.registerHeartbeat(heartbeat({
    nodeId: 'obs_test_node_0003',
    height: 7,
    latestHash: 'c'.repeat(64),
    publicListingEnabled: true,
    publicAlias: '',
    countryCode: ''
  }), '198.51.100.9', now);

  const status = buildNetworkStatus(blockchain(10, 'a'.repeat(64)), store, { size: () => 4 }, config(), now);
  assert.strictEqual(status.activeObserverCount, 3, 'private observer contributes to aggregate counts');
  assert.strictEqual(status.publicActiveObserverCount, 2, 'public active count only includes opted-in online observers');
  assert.strictEqual(status.fullySyncedObserverCount, 1, 'fully synced status count');
  assert.strictEqual(status.syncingObserverCount, 2, 'syncing status count');
  assert.strictEqual(status.mempoolSize, 4, 'mempool size included');

  const list = buildObserverList(blockchain(10, 'a'.repeat(64)), store, config(), { page: 1, limit: 10 }, now);
  assert.strictEqual(list.total, 2, 'private observer is absent from public observer list');
  assert.ok(!('remoteIp' in list.observers[0]), 'public API privacy omits raw IP');
  assert.ok(!('nodeId' in list.observers[0]), 'internal node ID is not exposed publicly');
  assert.ok(!('nodeIdShort' in list.observers[0]), 'internal node ID prefix is not exposed publicly');
  assert.ok(!('nodeName' in list.observers[0]), 'hostname/nodeName is not exposed publicly');
  assert.ok(!('latestHash' in list.observers[0]), 'latest hash is not exposed in public observer list');
  assert.strictEqual(list.observers.some((node) => node.publicAlias === 'Public Node'), true, 'opted-in observer appears in public list');
  assert.strictEqual(list.observers.some((node) => node.publicAlias === '' && node.countryCode === ''), true, 'observer without alias/country remains privacy-safe');

  registry.registerHeartbeat(heartbeat({ nodeId: 'obs_test_node_0002', publicListingEnabled: false }), '198.51.100.8', now + 2000);
  const afterDisable = buildObserverList(blockchain(10, 'a'.repeat(64)), store, config(), { page: 1, limit: 10 }, now + 2000);
  assert.strictEqual(afterDisable.total, 1, 'disabling public listing removes observer from public list');

  store.db.prepare(`
    INSERT INTO observer_nodes(nodeId, nodeName, remoteIp, country, publicListingEnabled, publicAlias, countryCode, version, height, latestHash, firstSeen, lastSeen)
    VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run('obs_old_hostname', 'PC_Michiel', '192.0.2.10', 'BE', 1, 'PC_Michiel', 'BE', '1.0.0', 10, 'a'.repeat(64), now, now);

  const restarted = new SqliteStorage(dir, config());
  assert.ok(restarted.getAllObserverNodes().length >= 3, 'producer restart preserves observer records');
  const sanitized = buildObserverList(blockchain(10, 'a'.repeat(64)), restarted, config(), { page: 1, limit: 20 }, now);
  assert.strictEqual(sanitized.observers.some((node) => node.publicAlias === 'PC_Michiel'), false, 'existing hostname-based records are sanitized');
  restarted.close();

  const heartbeatClientSource = fs.readFileSync(path.join(__dirname, '..', 'server/lib/observerHeartbeatClient.js'), 'utf8');
  assert.strictEqual(heartbeatClientSource.includes('hostname'), false, 'hostname is never present in heartbeat client payloads');

  const limiter = createRateLimiter({ windowMs: 60000, max: 2 });
  assert.strictEqual((await runLimiter(limiter, '127.0.0.1')).statusCode, 200);
  assert.strictEqual((await runLimiter(limiter, '127.0.0.1')).statusCode, 200);
  assert.strictEqual((await runLimiter(limiter, '127.0.0.1')).statusCode, 429, 'rate limiting');

  store.close();
  fs.rmSync(dir, { recursive: true, force: true });
  console.log('network tests passed');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
