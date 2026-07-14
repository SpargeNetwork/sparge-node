const assert = require('assert');
const fs = require('fs');
const path = require('path');
const express = require('express');
const { rpcRouter } = require('../server/routes/rpc');
const { validationErrorHandler } = require('../server/lib/validation/errors');
const explorerTx = require('../public/explorer-tx');
const rewardDistribution = require('../public/reward-distribution');

const fullTxid = 'a'.repeat(64);
const shortTxid = 'aaaaaaaa…aaaaaaaa';

function shorten(value) {
  return `${value.slice(0, 8)}…${value.slice(-8)}`;
}

async function testApiContract() {
  let lookups = 0;
  const blockchain = {
    getTxById(txid) {
      lookups += 1;
      return txid === fullTxid ? { txid, blockHeight: 7 } : null;
    }
  };
  const app = express();
  app.use('/api', rpcRouter(blockchain, null, {}));
  app.use(validationErrorHandler);
  const server = await new Promise((resolve) => {
    const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
  });
  try {
    const base = `http://127.0.0.1:${server.address().port}`;
    const valid = await fetch(`${base}${explorerTx.apiPath(fullTxid)}`);
    assert.strictEqual(valid.status, 200, 'full transaction ID loads successfully');
    assert.strictEqual((await valid.json()).txid, fullTxid);

    const short = await fetch(`${base}/api/tx/${'a'.repeat(63)}`);
    const long = await fetch(`${base}/api/tx/${'a'.repeat(65)}`);
    assert.strictEqual(short.status, 400, 'backend rejects short transaction IDs');
    assert.strictEqual(long.status, 400, 'backend rejects long transaction IDs');
    assert.strictEqual(lookups, 1, 'invalid backend IDs never reach transaction lookup');
  } finally {
    await new Promise((resolve, reject) => server.close((err) => err ? reject(err) : resolve()));
  }
}

function testFrontendReferences() {
  const ref = explorerTx.reference(fullTxid, shorten);
  assert.strictEqual(ref.href, `/tx/${fullTxid}`, 'link contains full 64-character transaction ID');
  assert.strictEqual(ref.display, shortTxid, 'visible transaction ID remains shortened');
  assert.strictEqual(ref.copyValue, fullTxid, 'copy value remains the full transaction ID');
  assert.strictEqual(explorerTx.parseTxPath(`/tx/${fullTxid}`), fullTxid, 'full transaction route parses');
  assert.strictEqual(explorerTx.parseTxPath(`/tx/%20${fullTxid}%20`), fullTxid, 'route trims accidental surrounding whitespace');
  assert.strictEqual(explorerTx.apiPath(shortTxid), null, 'shortened display ID produces no API request path');
  assert.strictEqual(explorerTx.parseTxPath(`/tx/${shortTxid}`), null, 'shortened route is rejected in the frontend');
  assert.strictEqual(explorerTx.parseTxPath('/tx/not-a-transaction'), null, 'invalid route is rejected in the frontend');

  const source = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf8');
  for (const functionName of ['renderObserverTxList', 'renderTxList', 'renderAddressTxs', 'renderAddressTxPage', 'renderWalletActivity']) {
    const start = source.indexOf(`function ${functionName}`);
    const next = source.indexOf('\nfunction ', start + 1);
    const body = source.slice(start, next < 0 ? source.length : next);
    assert.ok(start >= 0, `${functionName} exists`);
    assert.ok(body.includes('txLink(') || body.includes('txRowAttribute('), `${functionName} uses canonical transaction references`);
  }
  assert.ok(source.includes("if (!apiPath) return { error: 'invalid-txid' };"), 'fetch is blocked before invalid transaction IDs reach the API');
  assert.ok(source.includes("renderTxPage(null, state, 'Invalid transaction ID.')"), 'invalid transaction page shows a clear message');
  assert.ok(source.includes('txLink(tx.txid, tx.height)'), 'latest synthetic events link to their block');
  assert.ok(source.includes('renderTxDetails({ ...tx, blockHeight: block.height })'), 'block synthetic events render without an API lookup');
  assert.ok(source.includes('txLink(txid, tx.blockHeight)'), 'wallet synthetic events link to their block');

  const blockHtml = fs.readFileSync(path.join(__dirname, '..', 'public', 'block.html'), 'utf8');
  const observerBlockHtml = fs.readFileSync(path.join(__dirname, '..', 'public', 'observer-block.html'), 'utf8');
  assert.ok(blockHtml.includes('/reward-distribution.js'), 'producer block page loads reward distribution logic');
  assert.ok(observerBlockHtml.includes('/reward-distribution.js'), 'observer block page loads reward distribution logic');
  assert.ok(source.includes('Total New Tokens'), 'block detail displays total minting');
  assert.ok(source.includes('Treasury (10% + remainders)'), 'block detail explains treasury remainders');
  assert.ok(source.includes('Allocation Check'), 'block detail reports conservation');
}

function testRewardDistribution() {
  const full = rewardDistribution.calculate({
    mintUnits: '10000',
    mintRatePpm: '50000',
    transactions: [
      { type: 'participant_reward', amountMicro: '750', to: 'spg_participant_1' },
      { type: 'participant_reward', amountMicro: '750', to: 'spg_participant_2' },
      { type: 'node_pool_accrual', amountMicro: '7000', to: 'spg_node_pool' },
      { type: 'treasury_reward', amountMicro: '1000', to: 'spg_treasury' },
      { type: 'holder_pool_accrual', amountMicro: '500', to: 'spg_holder_pool' }
    ]
  });
  assert.strictEqual(full.participantPaid, 1500n);
  assert.strictEqual(full.nodePool, 7000n);
  assert.strictEqual(full.treasury, 1000n);
  assert.strictEqual(full.holderPool, 500n);
  assert.strictEqual(full.participantRecipients, 2);
  assert.strictEqual(full.balanced, true);

  const maturing = rewardDistribution.calculate({
    mintUnits: '10003',
    payload: { ratePpm: '49997' },
    transactions: [
      { type: 'participant_reward', amountMicro: '375' },
      { type: 'node_pool_accrual', amountMicro: '7002', to: 'spg_node_pool' },
      { type: 'treasury_reward', amountMicro: '2126', to: 'spg_treasury' },
      { type: 'holder_pool_accrual', amountMicro: '500', to: 'spg_holder_pool' }
    ]
  });
  assert.strictEqual(maturing.participantPool, 1500n);
  assert.strictEqual(maturing.participantRemainder, 1125n);
  assert.strictEqual(maturing.treasury, 2126n, 'maturity and integer remainders are included in treasury');
  assert.strictEqual(maturing.accounted, 10003n);
  assert.strictEqual(maturing.balanced, true);
}

(async () => {
  testFrontendReferences();
  testRewardDistribution();
  await testApiContract();
  console.log('Explorer transaction link tests passed.');
})().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
