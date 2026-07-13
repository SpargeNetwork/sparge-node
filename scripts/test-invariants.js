const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const {
  calculateStateRoot,
  runFullInvariantAudit,
  runFastBlockInvariant
} = require('../server/lib/invariants');
const { createBlockchain } = require('../server/lib/blockchain');
const { JsonStorage } = require('../server/storage/jsonStorage');
const { createMempool } = require('../server/lib/mempool');

const ADDRESS_A = 'spg_2jCwDGKiH9CdfhkAZWKv6fSiAacn';
const ADDRESS_B = 'spg_3D9sm1pyziUMXCkqYaJML3KJRpPd';
const ZERO_HASH = '0'.repeat(64);

function sha256(input) {
  return crypto.createHash('sha256').update(input).digest('hex');
}

function baseConfig(overrides = {}) {
  return {
    chain: {
      name: 'Sparge Test',
      symbol: 'SPG',
      chainId: 'sparge-test',
      protocolVersion: '1.0.0',
      economicsVersion: '1.0.0',
      blockTimeSeconds: 2,
      genesisCreatedAt: '2026-01-01T00:00:00.000Z'
    },
    token: {
      decimals: 6,
      initialSupplyTokens: '1000'
    },
    mining: {
      proposerAddress: ADDRESS_A,
      genesisOperatorAddress: ADDRESS_A,
      genesisFreeBlocks: 10
    },
    rewards: {
      treasuryAddress: ADDRESS_A,
      nodePoolAddress: 'NODE_POOL',
      holderPoolAddress: 'HOLDER_POOL'
    },
    storage: {
      blocksPerFile: 100
    },
    gas: {
      blockLimit: 510,
      targetRatioBps: 8000,
      baseFeeChangeDenominator: 8,
      baseFeeInitialMicro: '0',
      minBaseFeeMicro: '0'
    },
    tx: {
      minFeeMicro: '0'
    },
    mempool: {
      sort: 'fee',
      maxTransactions: 100,
      maxBytes: 1000000,
      maxTransactionsPerSender: 10,
      transactionTtlSeconds: 60,
      maxFutureNonceGap: 100,
      minimumFeeMicro: '0'
    },
    invariants: {
      enabled: true,
      fastChecksEveryBlock: true,
      fullAuditOnStartup: true,
      fullAuditIntervalBlocks: 0,
      stopMiningOnFailure: true
    },
    ...overrides
  };
}

function makeBlock({ height, previous = null, ledger, config, genesisHash, transactions = [], timestamp = null }) {
  const payload = { mintUnits: '0', ratePpm: '0' };
  const header = {
    chainId: config.chain.chainId,
    protocolVersion: config.chain.protocolVersion,
    economicsVersion: config.chain.economicsVersion,
    genesisHash,
    height,
    timestamp: timestamp || new Date(Date.UTC(2026, 0, 1, 0, 0, height)).toISOString(),
    prevHash: previous ? previous.hash : ZERO_HASH,
    prevStateRoot: previous ? previous.stateRoot : ZERO_HASH,
    payload,
    nonce: 0
  };
  const headerJson = JSON.stringify(header);
  return {
    height,
    timestamp: header.timestamp,
    prevHash: header.prevHash,
    hash: sha256(headerJson),
    nonce: 0,
    chainId: config.chain.chainId,
    genesisHash,
    protocolVersion: config.chain.protocolVersion,
    economicsVersion: config.chain.economicsVersion,
    header: headerJson,
    prevStateRoot: header.prevStateRoot,
    rewardBaseUnits: '0',
    rewardTokens: '0',
    rewardTo: config.mining.proposerAddress,
    transactions,
    txCount: transactions.length,
    stateRoot: calculateStateRoot(ledger),
    payload
  };
}

function validFixture() {
  const config = baseConfig();
  const genesisHash = 'a'.repeat(64);
  const ledger = {
    balances: { [ADDRESS_A]: '10' },
    stakes: {},
    nonces: { [ADDRESS_A]: '1' },
    participants: {
      [ADDRESS_A]: {
        sponsor: ADDRESS_A,
        bondMicro: '0',
        registeredHeight: '1',
        lastSeenHeight: '1'
      }
    },
    balanceHistory: {}
  };
  const genesis = makeBlock({
    height: 0,
    ledger: { balances: {}, stakes: {}, participants: {} },
    config,
    genesisHash,
    timestamp: '2026-01-01T00:00:00.000Z'
  });
  const tx = {
    id: 'tx-1',
    txid: 'tx-1',
    type: 'transfer',
    from: ADDRESS_A,
    to: ADDRESS_B,
    amountMicro: '1',
    feeMicro: '0',
    nonce: '0',
    timestamp: '2026-01-01T00:00:01.000Z'
  };
  const block = makeBlock({
    height: 1,
    previous: genesis,
    ledger,
    config,
    genesisHash,
    transactions: [tx],
    timestamp: '2026-01-01T00:00:02.000Z'
  });
  const meta = {
    latestHeight: 1,
    latestHash: block.hash,
    totalSupplyUnits: '1000000000',
    totalMintedUnits: '0'
  };
  const mempool = { recomputeAccounting: () => ({ ok: true }) };
  return { config, genesisHash, ledger, meta, blocks: [genesis, block], mempool };
}

function assertCode(result, code, label) {
  assert.strictEqual(result.ok, false, label);
  assert.ok(result.issues.some((item) => item.code === code), `${label}: expected ${code}, got ${result.issues.map((item) => item.code).join(', ')}`);
}

(async () => {
  const valid = validFixture();
  let result = runFullInvariantAudit({
    blocks: valid.blocks,
    ledger: valid.ledger,
    meta: valid.meta,
    config: valid.config,
    genesisHash: valid.genesisHash,
    mempool: valid.mempool,
    storage: null
  });
  assert.strictEqual(result.ok, true, `valid fixture should pass: ${result.errors.join('; ')}`);

  const reordered = {
    balances: { [ADDRESS_B]: '2', [ADDRESS_A]: '1' },
    stakes: {},
    participants: {}
  };
  const reorderedAgain = {
    balances: { [ADDRESS_A]: '1', [ADDRESS_B]: '2' },
    stakes: {},
    participants: {}
  };
  assert.strictEqual(calculateStateRoot(reordered), calculateStateRoot(reorderedAgain), 'state root is deterministic across key order');

  const badPrev = validFixture();
  badPrev.blocks[1] = { ...badPrev.blocks[1], prevHash: 'b'.repeat(64) };
  result = runFullInvariantAudit({ ...badPrev, storage: null });
  assertCode(result, 'PREVIOUS_HASH_MISMATCH', 'bad prevHash is detected');

  const badHash = validFixture();
  badHash.blocks[1] = { ...badHash.blocks[1], hash: 'c'.repeat(64) };
  result = runFullInvariantAudit({ ...badHash, storage: null });
  assertCode(result, 'BLOCK_HASH_MISMATCH', 'bad block hash is detected');

  const skippedHeight = validFixture();
  skippedHeight.blocks[1] = { ...skippedHeight.blocks[1], height: 2 };
  result = runFullInvariantAudit({ ...skippedHeight, storage: null });
  assertCode(result, 'CHAIN_HEIGHT_MISMATCH', 'skipped height is detected');

  const badChain = validFixture();
  badChain.blocks[1] = { ...badChain.blocks[1], chainId: 'wrong-chain' };
  result = runFullInvariantAudit({ ...badChain, storage: null });
  assertCode(result, 'CHAIN_ID_MISMATCH', 'wrong chain id is detected');

  const duplicateTx = validFixture();
  duplicateTx.blocks.push(makeBlock({
    height: 2,
    previous: duplicateTx.blocks[1],
    ledger: duplicateTx.ledger,
    config: duplicateTx.config,
    genesisHash: duplicateTx.genesisHash,
    transactions: [{ ...duplicateTx.blocks[1].transactions[0] }],
    timestamp: '2026-01-01T00:00:04.000Z'
  }));
  duplicateTx.meta.latestHeight = 2;
  duplicateTx.meta.latestHash = duplicateTx.blocks[2].hash;
  result = runFullInvariantAudit({ ...duplicateTx, storage: null });
  assertCode(result, 'DUPLICATE_CONFIRMED_TX', 'duplicate confirmed tx is detected');

  const negative = validFixture();
  negative.ledger.balances[ADDRESS_B] = '-1';
  result = runFullInvariantAudit({ ...negative, storage: null });
  assertCode(result, 'NEGATIVE_BALANCE', 'negative balance is detected');

  const supply = validFixture();
  supply.ledger.balances[ADDRESS_B] = '1000000001';
  result = runFullInvariantAudit({ ...supply, storage: null });
  assertCode(result, 'SUPPLY_MISMATCH', 'balance sum above supply is detected');

  const stateRoot = validFixture();
  stateRoot.ledger.balances[ADDRESS_A] = '11';
  result = runFullInvariantAudit({ ...stateRoot, storage: null });
  assertCode(result, 'STATE_ROOT_MISMATCH', 'state root mismatch is detected');

  const mempoolBad = validFixture();
  mempoolBad.mempool = { recomputeAccounting: () => ({ ok: false, errors: ['bad accounting'] }) };
  result = runFullInvariantAudit({ ...mempoolBad, storage: null });
  assertCode(result, 'MEMPOOL_ACCOUNTING_MISMATCH', 'mempool accounting mismatch is detected');

  const fast = validFixture();
  result = runFastBlockInvariant({
    block: fast.blocks[1],
    previousBlock: fast.blocks[0],
    ledger: fast.ledger,
    meta: fast.meta,
    config: fast.config,
    genesisHash: fast.genesisHash,
    mempool: fast.mempool
  });
  assert.strictEqual(result.ok, true, `fast block invariant should pass: ${result.errors.join('; ')}`);

  const dataDir = path.join(__dirname, 'out', 'test-invariants-chain');
  fs.rmSync(dataDir, { recursive: true, force: true });
  const badRuntimeMempool = createMempool(baseConfig());
  badRuntimeMempool.recomputeAccounting = () => ({ ok: false, errors: ['forced failure'] });
  const storage = new JsonStorage(dataDir, baseConfig());
  const chain = createBlockchain(baseConfig(), badRuntimeMempool, storage, dataDir);
  assert.strictEqual(chain.canMint(), false, 'startup invariant failure pauses mining');
  assert.strictEqual(chain.mineNextBlock(), null, 'paused chain refuses to mine');
  assert.strictEqual(chain.getState().miningPausedForSafety, true, 'status exposes safety pause');
  storage.close();

  const okDir = path.join(__dirname, 'out', 'test-invariants-chain-ok');
  fs.rmSync(okDir, { recursive: true, force: true });
  const okStorage = new JsonStorage(okDir, baseConfig());
  const okMempool = createMempool(baseConfig());
  const okChain = createBlockchain(baseConfig(), okMempool, okStorage, okDir);
  const mined = okChain.mineNextBlock();
  assert.ok(mined && mined.height === 1, 'healthy chain mines with invariants enabled');
  assert.strictEqual(okChain.getState().invariantStatus, 'ok', 'healthy chain status remains ok after mining');
  okStorage.close();

  console.log('invariant tests passed');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
