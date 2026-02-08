const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');
const Database = require('better-sqlite3');
const YAML = require('yaml');
const { deriveAddress, signMessage, createTxId } = require('../server/lib/tx');
const { PARTICIPANT_BOND_MICRO, MAX_SPONSORED_PARTICIPANTS } = require('../server/lib/participants');

const repoRoot = path.resolve(__dirname, '..');
const outDir = path.join(__dirname, 'out');
fs.mkdirSync(outDir, { recursive: true });
const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, '').replace('T', '-');
const logFile = path.join(outDir, `test-economics-${stamp}.log`);

let pass = 0;
let fail = 0;

function log(line) {
  const msg = `[${new Date().toISOString()}] ${line}`;
  console.log(msg);
  fs.appendFileSync(logFile, `${msg}\n`, 'utf8');
}

function assertCheck(condition, message) {
  if (condition) {
    pass += 1;
    log(`PASS: ${message}`);
  } else {
    fail += 1;
    log(`FAIL: ${message}`);
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function walletFromKeypair() {
  const { privateKey, publicKey } = crypto.generateKeyPairSync('ed25519');
  const privJwk = privateKey.export({ format: 'jwk' });
  const pubJwk = publicKey.export({ format: 'jwk' });
  const privateKeyHex = Buffer.from(privJwk.d, 'base64url').toString('hex');
  const publicKeyHex = Buffer.from(pubJwk.x, 'base64url').toString('hex');
  const address = deriveAddress(publicKeyHex);
  return { address, publicKeyHex, privateKeyHex };
}

async function httpJson(baseUrl, p, options = {}) {
  const res = await fetch(`${baseUrl}${p}`, options);
  let body = {};
  try {
    body = await res.json();
  } catch {
    body = {};
  }
  return { status: res.status, body };
}

async function waitFor(checkFn, timeoutMs, label) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      if (await checkFn()) return true;
    } catch {
      // retry
    }
    await sleep(400);
  }
  log(`INFO: timeout waiting for ${label}`);
  return false;
}

function startProducer(env) {
  const child = spawn(process.execPath, ['server/index.js'], {
    cwd: repoRoot,
    env: { ...process.env, ...env },
    stdio: ['ignore', 'ignore', 'ignore']
  });
  return child;
}

async function main() {
  log('Starting anti-abuse economics smoke test');
  log(`Output log: ${logFile}`);

  const producerPort = 3451;
  const baseUrl = `http://127.0.0.1:${producerPort}`;
  const dataDir = path.join(repoRoot, 'server', 'data-economics-test');
  const configPath = path.join(outDir, `test-economics-config-${stamp}.yml`);
  fs.rmSync(dataDir, { recursive: true, force: true });
  fs.mkdirSync(dataDir, { recursive: true });

  const sponsor = walletFromKeypair();
  const outsider = walletFromKeypair();
  const sybils = Array.from({ length: 11 }, () => walletFromKeypair());
  const edgeEligible = walletFromKeypair();
  const edgeNearMiss = walletFromKeypair();

  const rawCfg = fs.readFileSync(path.join(repoRoot, 'config', 'config.yml'), 'utf8');
  const cfg = YAML.parse(rawCfg);
  cfg.chain.blockTimeSeconds = 2;
  cfg.mining.proposerAddress = sponsor.address;
  cfg.mining.genesisOperatorAddress = sponsor.address;
  cfg.rewards.treasuryAddress = sponsor.address;
  cfg.rewards.nodePoolAddress = sponsor.address;
  cfg.rewards.holderPoolAddress = sponsor.address;
  fs.writeFileSync(configPath, YAML.stringify(cfg), 'utf8');

  let server = startProducer({
    NODE_MODE: 'producer',
    PORT: String(producerPort),
    DATA_DIR: dataDir,
    CONFIG_PATH: configPath,
    DEV_ENABLE_ADMIN: 'true',
    DEBUG_INVARIANTS: 'true'
  });

  let localNonce = 0n;
  try {
    const up = await waitFor(async () => {
      const r = await httpJson(baseUrl, '/api/status');
      return r.status === 200;
    }, 30000, 'producer boot');
    assertCheck(up, 'Producer started for economics test');
    if (!up) throw new Error('producer did not boot');

    const mineStart = await httpJson(baseUrl, '/api/mining/start', { method: 'POST' });
    assertCheck(mineStart.status === 200, 'Mining started for economics scenarios');

    // Fund sponsor to cover sponsor cap scenario with 10 bonds.
    const requiredForRegs = (PARTICIPANT_BOND_MICRO + 1000n) * BigInt(MAX_SPONSORED_PARTICIPANTS);
    const funded = await waitFor(async () => {
      const bal = await httpJson(baseUrl, `/api/balance/${sponsor.address}`);
      return BigInt(bal.body.balanceMicro || '0') >= requiredForRegs;
    }, 120000, 'sponsor funding via rewards');
    assertCheck(funded, 'Sponsor balance funded for 10 participant bonds');

    const nonceRes = await httpJson(baseUrl, `/api/nonce/${sponsor.address}`);
    localNonce = BigInt(nonceRes.body.nonce || '0');

    // Register max sponsored participants (sybil simulation setup).
    let acceptedRegs = 0;
    for (let i = 0; i < MAX_SPONSORED_PARTICIPANTS; i += 1) {
      const tx = {
        type: 'register_participant',
        from: sponsor.address,
        to: '',
        amountMicro: '0',
        feeMicro: '1000',
        nonce: localNonce.toString(),
        chainId: cfg.chain.chainId,
        publicKeyHex: sponsor.publicKeyHex,
        sponsor: sponsor.address,
        participant: sybils[i].address,
        memo: ''
      };
      tx.signatureHex = signMessage(tx, sponsor.privateKeyHex);
      const submit = await httpJson(baseUrl, '/api/tx', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...tx, txid: createTxId(tx) })
      });
      if (submit.status === 200) {
        acceptedRegs += 1;
        localNonce += 1n;
      }
    }
    assertCheck(acceptedRegs === MAX_SPONSORED_PARTICIPANTS, 'Sybil simulation registered 10 sponsored participants');
    const mempoolAfterRegs = await httpJson(baseUrl, '/api/mempool');
    log(`INFO: mempool after 10 registrations count=${mempoolAfterRegs.body.count || 0}`);

    const regMined = await waitFor(async () => {
      const n = await httpJson(baseUrl, `/api/nonce/${sponsor.address}`);
      return BigInt(n.body.nonce || '0') >= localNonce;
    }, 60000, 'participant registration mining');
    const nonceAfterWait = await httpJson(baseUrl, `/api/nonce/${sponsor.address}`);
    const mempoolAfterWait = await httpJson(baseUrl, '/api/mempool');
    log(`INFO: nonce after wait=${nonceAfterWait.body.nonce || '0'} target=${localNonce.toString()} mempool=${mempoolAfterWait.body.count || 0}`);
    assertCheck(regMined, 'All sponsored participant registrations were applied on-chain');
    const statusAfterRegs = await httpJson(baseUrl, '/api/status');
    assertCheck(
      Number(statusAfterRegs.body.activeParticipantCount || 0) >= MAX_SPONSORED_PARTICIPANTS,
      'Active participant count reflects sybil simulation set'
    );

    // Sponsor cap adversarial check: 11th registration must fail.
    const nonceAfterRegs = BigInt((await httpJson(baseUrl, `/api/nonce/${sponsor.address}`)).body.nonce || '0');
    const tx11 = {
      type: 'register_participant',
      from: sponsor.address,
      to: '',
      amountMicro: '0',
      feeMicro: '1000',
      nonce: nonceAfterRegs.toString(),
      chainId: cfg.chain.chainId,
      publicKeyHex: sponsor.publicKeyHex,
      sponsor: sponsor.address,
      participant: sybils[10].address,
      memo: ''
    };
    tx11.signatureHex = signMessage(tx11, sponsor.privateKeyHex);
    const reg11 = await httpJson(baseUrl, '/api/tx', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...tx11, txid: createTxId(tx11) })
    });
    assertCheck(
      reg11.status === 400 && /sponsor limit reached/i.test(String(reg11.body.error || '')),
      'Sponsor cap blocks 11th active sponsorship'
    );

    // Sybil reward split observation: equal participant rewards among active participants.
    const beforeHeight = Number((await httpJson(baseUrl, '/api/status')).body.latestHeight || 0);
    const oneMoreBlock = await waitFor(async () => {
      const s = await httpJson(baseUrl, '/api/status');
      return Number(s.body.latestHeight || 0) >= beforeHeight + 1;
    }, 20000, 'next reward block');
    assertCheck(oneMoreBlock, 'Mined a block for participant reward observation');
    const latestHeight = Number((await httpJson(baseUrl, '/api/status')).body.latestHeight || 0);
    const block = await httpJson(baseUrl, `/api/block/${latestHeight}`);
    const pRewards = (block.body.transactions || []).filter((tx) => tx.type === 'participant_reward');
    const rewardAmounts = new Set(pRewards.map((tx) => String(tx.amountMicro || '0')));
    assertCheck(pRewards.length >= MAX_SPONSORED_PARTICIPANTS, 'Sybil simulation receives participant rewards');
    assertCheck(rewardAmounts.size === 1, 'Participant rewards are split equally across active participants');

    // Free-rider checks.
    const outsiderNonce = BigInt((await httpJson(baseUrl, `/api/nonce/${outsider.address}`)).body.nonce || '0');
    const outsiderReg = {
      type: 'register_participant',
      from: outsider.address,
      to: '',
      amountMicro: '0',
      feeMicro: '1000',
      nonce: outsiderNonce.toString(),
      chainId: cfg.chain.chainId,
      publicKeyHex: outsider.publicKeyHex,
      sponsor: outsider.address,
      participant: outsider.address,
      memo: ''
    };
    outsiderReg.signatureHex = signMessage(outsiderReg, outsider.privateKeyHex);
    const outsiderRegRes = await httpJson(baseUrl, '/api/tx', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...outsiderReg, txid: createTxId(outsiderReg) })
    });
    assertCheck(
      outsiderRegRes.status === 400 && /insufficient balance/i.test(String(outsiderRegRes.body.error || '')),
      'Free-rider register attempt fails without bond+fee balance'
    );

    const outsiderHb = {
      type: 'heartbeat',
      from: outsider.address,
      to: '',
      amountMicro: '0',
      feeMicro: '1000',
      nonce: outsiderNonce.toString(),
      chainId: cfg.chain.chainId,
      publicKeyHex: outsider.publicKeyHex,
      sponsor: '',
      participant: '',
      memo: ''
    };
    outsiderHb.signatureHex = signMessage(outsiderHb, outsider.privateKeyHex);
    const outsiderHbRes = await httpJson(baseUrl, '/api/tx', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...outsiderHb, txid: createTxId(outsiderHb) })
    });
    assertCheck(
      outsiderHbRes.status === 400 && /participant not registered/i.test(String(outsiderHbRes.body.error || '')),
      'Free-rider heartbeat rejected for unregistered participant'
    );

    // Holder eligibility edge timing around window via controlled state setup + restart.
    if (server && !server.killed) server.kill('SIGTERM');
    await sleep(500);

    const dbPath = path.join(dataDir, 'state.db');
    const db = new Database(dbPath);
    const latestHeightSynthetic = 700000;
    const avgWindowBlocks = Math.floor((14 * 24 * 60 * 60) / 2); // blockTimeSeconds=2
    const windowStart = latestHeightSynthetic - avgWindowBlocks + 1;
    const thousand = 1000n * 1000000n; // protocol micro-unit threshold

    db.prepare("INSERT INTO meta(key,value) VALUES('latestHeight', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
      .run(String(latestHeightSynthetic));
    db.prepare("DELETE FROM balance_history WHERE addr IN (?, ?)").run(edgeEligible.address, edgeNearMiss.address);
    db.prepare("INSERT INTO state_balances(addr,balanceMicro,nonce,firstSeenHeight,updatedHeight) VALUES(?,?,?,?,?) ON CONFLICT(addr) DO UPDATE SET balanceMicro=excluded.balanceMicro, nonce=excluded.nonce")
      .run(edgeEligible.address, thousand.toString(), 0, null, null);
    db.prepare("INSERT INTO state_balances(addr,balanceMicro,nonce,firstSeenHeight,updatedHeight) VALUES(?,?,?,?,?) ON CONFLICT(addr) DO UPDATE SET balanceMicro=excluded.balanceMicro, nonce=excluded.nonce")
      .run(edgeNearMiss.address, thousand.toString(), 0, null, null);
    db.prepare("INSERT INTO balance_history(addr,height,balanceMicro) VALUES(?,?,?)").run(edgeEligible.address, 0, thousand.toString());
    db.prepare("INSERT INTO balance_history(addr,height,balanceMicro) VALUES(?,?,?)").run(edgeNearMiss.address, 0, '0');
    db.prepare("INSERT INTO balance_history(addr,height,balanceMicro) VALUES(?,?,?)").run(edgeNearMiss.address, windowStart + 1, thousand.toString());
    db.close();

    server = startProducer({
      NODE_MODE: 'producer',
      PORT: String(producerPort),
      DATA_DIR: dataDir,
      CONFIG_PATH: configPath,
      DEV_ENABLE_ADMIN: 'true',
      DEBUG_INVARIANTS: 'true'
    });
    await waitFor(async () => (await httpJson(baseUrl, '/api/status')).status === 200, 30000, 'producer restart after holder edge setup');
    const holderA = await httpJson(baseUrl, `/api/address/${edgeEligible.address}`);
    const holderB = await httpJson(baseUrl, `/api/address/${edgeNearMiss.address}`);
    assertCheck(holderA.body.avgEligible === true, 'Holder window edge: full-window balance at threshold is eligible');
    assertCheck(holderB.body.avgEligible === false, 'Holder window edge: balance added just after window start is not eligible');

    const inv = await httpJson(baseUrl, '/api/debug/invariants');
    assertCheck(inv.status === 200 && inv.body.ok === true, 'Invariants remain OK after economics scenarios');
  } finally {
    if (server && !server.killed) {
      server.kill('SIGTERM');
    }
  }

  log(`TOTAL: ${pass} passed, ${fail} failed`);
  if (fail > 0) {
    log('RESULT: FAIL');
    process.exit(1);
  }
  log('RESULT: PASS');
}

main().catch((err) => {
  fail += 1;
  log(`FAIL: Unhandled error: ${err.message}`);
  log(`TOTAL: ${pass} passed, ${fail} failed`);
  log('RESULT: FAIL');
  process.exit(1);
});
