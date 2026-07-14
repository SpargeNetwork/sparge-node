const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { createBlockchain } = require('../server/lib/blockchain');
const { createMempool } = require('../server/lib/mempool');
const { deriveAddress, signMessage, createTxId } = require('../server/lib/tx');
const { runReplay } = require('../server/lib/replay');
const { SqliteStorage } = require('../server/storage/sqliteStorage');
const {
  normalizeParticipantRewardRamp,
  normalizeParticipationConfig,
  participantMaturity,
  calculateMaturedParticipantRewards
} = require('../server/lib/participantRewards');

function rampConfig(activationHeight = 0) {
  const config = {
    economics: {
      participantRewardRamp: {
        enabled: true,
        activationHeight,
        stages: [
          { blocks: 5100, multiplier: '0.25' },
          { blocks: 10200, multiplier: '0.60' },
          { blocks: null, multiplier: '1.00' }
        ]
      }
    }
  };
  return normalizeParticipantRewardRamp(config);
}

const ramp = rampConfig();
assert.deepStrictEqual(normalizeParticipationConfig({}), {
  activeWindowBlocks: 5100,
  bondMicro: '50000000',
  maxSponsoredParticipants: 10
}, 'participant thresholds have explicit deterministic defaults');
const original = { registeredHeight: '100', lastSeenHeight: '100' };

assert.strictEqual(participantMaturity(original, 100n, ramp).multiplierBps, 2500, 'new participant receives 25%');
assert.strictEqual(participantMaturity(original, 5200n, ramp).multiplierBps, 2500, '25% stage includes age 5100');
assert.strictEqual(participantMaturity(original, 5201n, ramp).multiplierBps, 6000, 'participant reaches 60% at age 5101');
assert.strictEqual(participantMaturity(original, 10300n, ramp).multiplierBps, 6000, '60% stage includes age 10200');
assert.strictEqual(participantMaturity(original, 10301n, ramp).multiplierBps, 10000, 'participant reaches 100% after age 10200');

const inactiveThenActive = { ...original, lastSeenHeight: '10301' };
assert.strictEqual(
  participantMaturity(inactiveThenActive, 10301n, ramp).multiplierBps,
  participantMaturity(original, 10301n, ramp).multiplierBps,
  'inactivity does not reset maturation'
);
const registeredAgain = { registeredHeight: '10301', lastSeenHeight: '10301' };
assert.strictEqual(participantMaturity(registeredAgain, 10301n, ramp).multiplierBps, 2500, 'unregister and re-register resets maturation');

const participants = {
  spg_a: { registeredHeight: '0' },
  spg_b: { registeredHeight: '6000' },
  spg_c: { registeredHeight: '11000' }
};
const input = {
  participantUnits: 101n,
  activeAddresses: ['spg_c', 'spg_a', 'spg_b'],
  participants,
  height: 12000n,
  ramp
};
const payoutA = calculateMaturedParticipantRewards(input);
const payoutB = calculateMaturedParticipantRewards(input);
assert.deepStrictEqual(payoutA, payoutB, 'reward calculation is deterministic');
assert.deepStrictEqual(payoutA.rewards.map((reward) => [reward.address, reward.amount]), [
  ['spg_a', 33n],
  ['spg_b', 19n],
  ['spg_c', 8n]
], 'maturity multipliers apply to each equal base share with integer flooring');
assert.strictEqual(payoutA.treasuryRemainder, 41n, 'rounding and immature reward remainder go to treasury');
assert.strictEqual(
  payoutA.rewards.reduce((sum, reward) => sum + reward.amount, 0n) + payoutA.treasuryRemainder,
  101n,
  'participant pool remains conserved'
);

const scheduled = rampConfig(1000);
assert.strictEqual(participantMaturity(original, 999n, scheduled).multiplierBps, 10000, 'pre-activation blocks preserve legacy rewards');

assert.throws(
  () => normalizeParticipantRewardRamp({ economics: { participantRewardRamp: { enabled: true, stages: [{ blocks: null, multiplier: '1.1' }] } } }),
  /between 0 and 1/,
  'invalid multiplier is rejected'
);

function wallet() {
  const { privateKey, publicKey } = crypto.generateKeyPairSync('ed25519');
  const privateKeyHex = Buffer.from(privateKey.export({ format: 'jwk' }).d, 'base64url').toString('hex');
  const publicKeyHex = Buffer.from(publicKey.export({ format: 'jwk' }).x, 'base64url').toString('hex');
  return { privateKeyHex, publicKeyHex, address: deriveAddress(publicKeyHex) };
}

async function testChainIntegration() {
  const sponsor = wallet();
  const participant = wallet();
  const dataDir = path.join(__dirname, 'out', 'test-participant-maturation');
  fs.rmSync(dataDir, { recursive: true, force: true });
  fs.mkdirSync(dataDir, { recursive: true });
  const config = {
    chain: {
      name: 'Maturation Test',
      symbol: 'SPRG',
      chainId: 'sparge-maturation-test',
      protocolVersion: '1.0.0',
      economicsVersion: '1.0.0',
      blockTimeSeconds: 31536000,
      genesisCreatedAt: '2026-01-01T00:00:00.000Z'
    },
    token: { decimals: 6, initialSupplyTokens: '1000000000' },
    mining: { proposerAddress: sponsor.address, genesisOperatorAddress: sponsor.address, genesisFreeBlocks: 0 },
    rewards: { treasuryAddress: sponsor.address, nodePoolAddress: sponsor.address, holderPoolAddress: sponsor.address },
    storage: { backend: 'sqlite', blocksPerFile: 100 },
    gas: { blockLimit: 510, targetRatioBps: 8000, baseFeeChangeDenominator: 8, baseFeeInitialMicro: '0', minBaseFeeMicro: '0' },
    tx: { minFeeMicro: '0' },
    mempool: {
      sort: 'fee', maxTransactions: 100, maxBytes: 1000000, maxTransactionsPerSender: 10,
      transactionTtlSeconds: 60, maxFutureNonceGap: 100, minimumFeeMicro: '0'
    },
    invariants: { enabled: true, fastChecksEveryBlock: true, fullAuditOnStartup: true, fullAuditIntervalBlocks: 0, stopMiningOnFailure: true },
    economics: {
      participantRewardRamp: {
        enabled: true,
        activationHeight: 0,
        stages: [
          { blocks: 1, multiplier: '0.25' },
          { blocks: 2, multiplier: '0.60' },
          { blocks: null, multiplier: '1.00' }
        ]
      }
    },
    logging: { level: 'error', format: 'json', directory: 'logs', fileEnabled: false, consoleEnabled: false }
  };
  const storage = new SqliteStorage(dataDir, config);
  const mempool = createMempool(config);
  const chain = createBlockchain(config, mempool, storage, dataDir);
  chain.mineNextBlock();

  const registration = {
    type: 'register_participant',
    chainId: config.chain.chainId,
    from: sponsor.address,
    to: '',
    amountMicro: '0',
    feeMicro: '0',
    nonce: '0',
    publicKeyHex: sponsor.publicKeyHex,
    sponsor: sponsor.address,
    participant: participant.address,
    memo: ''
  };
  registration.signatureHex = signMessage(registration, sponsor.privateKeyHex);
  registration.txid = createTxId(registration);
  const admitted = mempool.addTx({ ...registration, signer: sponsor.address, bondMicro: '50000000' }, {
    ledgerNonce: 0n,
    balance: BigInt(chain.getBalanceUnits(sponsor.address))
  });
  assert.ok(admitted.txid, 'registration enters the test mempool');

  const rewardPercents = [25, 25, 60, 100];
  for (const percent of rewardPercents) {
    const block = chain.mineNextBlock();
    const reward = block.transactions.find((tx) => tx.type === 'participant_reward' && tx.to === participant.address);
    assert.ok(reward, `participant reward exists at ${percent}% maturity`);
    const participantPool = (BigInt(block.mintUnits) * 1500n) / 10000n;
    assert.strictEqual(BigInt(reward.amountMicro), (participantPool * BigInt(percent)) / 100n, `on-chain reward applies ${percent}% maturity`);
  }
  const sponsorStats = chain.getAddressStats(sponsor.address);
  assert.strictEqual(sponsorStats.sponsoredActiveCount, 1, 'active sponsorship count uses the protocol active rule');
  assert.strictEqual(sponsorStats.sponsoredInactiveCount, 0, 'active record is not counted as inactive');
  assert.strictEqual(sponsorStats.availableSponsorSlots, 9, 'available Sponsor slots are calculated from active records');
  assert.strictEqual(sponsorStats.reclaimableBondMicro, null, 'Sponsor reclaim is not falsely exposed');
  assert.strictEqual(sponsorStats.sponsoredParticipants.length, 1, 'public sponsorship record is exposed additively');
  const state = chain.getState();
  storage.close();

  const replay = await runReplay({ dataDir, config, progressEvery: 0 });
  assert.strictEqual(replay.success, true, 'maturation chain replay succeeds');
  assert.strictEqual(replay.replayedTipHash, state.latestHash, 'maturation replay preserves latest hash');
  assert.strictEqual(replay.expectedStateRoot, replay.replayedStateRoot, 'maturation replay preserves state root');
}

(async () => {
  await testChainIntegration();
  console.log('Participant maturation tests passed.');
})().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
