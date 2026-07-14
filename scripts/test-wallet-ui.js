const assert = require('assert');
const fs = require('fs');
const path = require('path');
const {
  LEGACY_KEY,
  COLLECTION_KEY,
  SELECTED_KEY,
  createRegistry
} = require('../public/wallet-store');
const { normalizeRequest } = require('../public/wallet-signing');

class MemoryStorage {
  constructor(values = {}) {
    this.values = new Map(Object.entries(values));
  }

  getItem(key) {
    return this.values.has(key) ? this.values.get(key) : null;
  }

  setItem(key, value) {
    this.values.set(key, String(value));
  }

  removeItem(key) {
    this.values.delete(key);
  }
}

function wallet(seed, createdAt = '2026-01-01T00:00:00.000Z') {
  const hex = seed.repeat(64).slice(0, 64);
  return {
    address: `spg_${seed.repeat(24)}`,
    publicKeyHex: hex,
    privateKeyHex: hex,
    createdAt
  };
}

function testLegacyMigration() {
  const legacy = wallet('a');
  const storage = new MemoryStorage({ [LEGACY_KEY]: JSON.stringify(legacy) });
  const registry = createRegistry(storage);
  registry.initialize();
  assert.strictEqual(registry.list().length, 1);
  assert.strictEqual(registry.getSelected().name, 'Wallet 1');
  assert.strictEqual(registry.getSelected().address, legacy.address);
  assert.ok(storage.getItem(COLLECTION_KEY));
  assert.strictEqual(storage.getItem(SELECTED_KEY), legacy.address);
}

function testWalletManagement() {
  const storage = new MemoryStorage();
  const registry = createRegistry(storage);
  registry.initialize();
  const first = registry.add(wallet('b'), 'Savings');
  const second = registry.add(wallet('c'), 'Trading');
  assert.strictEqual(registry.list().length, 2);
  assert.strictEqual(registry.getSelected().id, second.id);
  registry.select(first.id);
  assert.strictEqual(registry.getSelected().name, 'Savings');
  registry.rename(first.id, 'Primary Wallet');
  assert.strictEqual(registry.getSelected().name, 'Primary Wallet');
  registry.remove(first.id);
  assert.strictEqual(registry.getSelected().id, second.id);
  const legacyMirror = JSON.parse(storage.getItem(LEGACY_KEY));
  assert.deepStrictEqual(Object.keys(legacyMirror).sort(), ['address', 'createdAt', 'privateKeyHex', 'publicKeyHex']);
  assert.strictEqual(legacyMirror.address, second.address);
}

function testDuplicateProtectionAndFinalDelete() {
  const storage = new MemoryStorage();
  const registry = createRegistry(storage);
  registry.initialize();
  const item = wallet('d');
  registry.add(item, 'Wallet');
  assert.throws(() => registry.add(item, 'Duplicate'), /already available/);
  registry.remove(item.address);
  assert.strictEqual(registry.getSelected(), null);
  assert.strictEqual(storage.getItem(LEGACY_KEY), null);
  assert.strictEqual(storage.getItem(SELECTED_KEY), null);
}

function testWalletMarkup() {
  const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'wallet.html'), 'utf8');
  const appJs = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf8');
  assert.ok(html.includes('id="walletSelectorBtn"'));
  assert.ok(html.includes('id="walletActionDialog"'));
  assert.ok(html.includes('id="walletBackupDialog"'));
  assert.ok(html.includes('id="signingConfirmationDialog"'));
  assert.ok(html.includes('id="signingMessage"'));
  assert.ok(html.includes('id="signingRawMessage"'));
  assert.ok(html.includes('id="signingHash"'));
  assert.ok(html.includes('Copy Message'));
  assert.ok(html.includes('Copy Hash'));
  assert.ok(html.includes('Heartbeat Reminder'));
  assert.ok(html.includes('id="walletAddressOverview"'));
  assert.ok(html.includes('id="exportPrivateKeyBtn"'));
  assert.ok(!html.includes('Reset Wallet'));
  assert.ok(!html.includes('development wallet'));
  assert.ok(html.indexOf('/wallet-store.js') < html.indexOf('/app.js'));
  assert.ok(html.indexOf('/wallet-signing.js') < html.indexOf('/app.js'));

  for (const functionName of ['handleSendTx', 'registerParticipant', 'sponsorParticipant', 'unregisterParticipant', 'sendHeartbeat']) {
    const start = appJs.indexOf(`async function ${functionName}`);
    const next = appJs.indexOf('\nasync function ', start + 1);
    const body = appJs.slice(start, next < 0 ? appJs.length : next);
    assert.ok(start >= 0, `${functionName} exists`);
    assert.ok(body.includes('requestTransactionSignature({'), `${functionName} uses universal transaction confirmation`);
    assert.ok(!body.includes("fetch('/api/tx'"), `${functionName} cannot broadcast directly`);
    assert.ok(!body.includes('signCanonicalMessage('), `${functionName} cannot sign directly`);
  }
  const autoStart = appJs.indexOf('function maybeAutoHeartbeat');
  const autoEnd = appJs.indexOf('\nasync function ', autoStart);
  const autoBody = appJs.slice(autoStart, autoEnd);
  assert.ok(!autoBody.includes('sendHeartbeat()'), 'heartbeat reminders never sign automatically');
  assert.strictEqual((appJs.match(/fetch\('\/api\/tx'/g) || []).length, 1, 'only the universal transaction gateway broadcasts');
  assert.ok(appJs.includes('requestMessageSignature({'), 'Discord verification uses universal message confirmation');
  assert.ok(!appJs.includes('await signMessage('), 'legacy direct message signing is removed');
}

function testSigningRequestContract() {
  const callback = () => 'signed';
  const message = normalizeRequest({
    kind: 'message',
    type: 'ownership_proof',
    title: 'Verify Wallet',
    description: 'Prove control.',
    wallet: 'spg_1234567890',
    payload: [{ label: 'Purpose', value: 'Login' }],
    rawMessage: 'Sparge login challenge',
    hash: 'ab'.repeat(32),
    onConfirm: callback
  });
  assert.strictEqual(message.kind, 'message');
  assert.strictEqual(message.fee, 'No fee');
  assert.strictEqual(message.rawMessage, 'Sparge login challenge');
  assert.strictEqual(message.onConfirm, callback);

  const transaction = normalizeRequest({
    kind: 'transaction',
    type: 'transfer',
    wallet: 'spg_1234567890',
    fee: '0.001 SPRG',
    payload: [{ label: 'Recipient', value: 'spg_recipient', mono: true }],
    onConfirm: callback
  });
  assert.strictEqual(transaction.kind, 'transaction');
  assert.strictEqual(transaction.fee, '0.001 SPRG');
  assert.strictEqual(transaction.payload[0].mono, true);
  assert.throws(() => normalizeRequest({ kind: 'message', wallet: 'spg_valid' }), /confirmation callback/);
  assert.throws(() => normalizeRequest({ kind: 'unknown', wallet: 'spg_valid', onConfirm: callback }), /message or transaction/);
}

testLegacyMigration();
testWalletManagement();
testDuplicateProtectionAndFinalDelete();
testWalletMarkup();
testSigningRequestContract();
console.log('Wallet UI tests passed.');
