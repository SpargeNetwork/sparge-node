const path = require('path');
const crypto = require('crypto');
const { toBaseUnits, formatTokens } = require('./units');
const { getBalanceUnits, setBalanceUnits, setStakeUnits, getNonce, setNonce } = require('./ledger');
const { ensureGenesis } = require('./genesis');
const { ACTIVE_WINDOW_BLOCKS, MAX_SPONSORED_PARTICIPANTS, PARTICIPANT_BOND_MICRO } = require('./participants');
const { calculateStateRoot, runFullInvariantAudit, runFastBlockInvariant } = require('./invariants');

const MICRO = 1_000_000n;
const PPM = 1_000_000n;
const BPS_DENOM = 10_000n;
const YEAR_SECONDS = 31_536_000n;

function sha256(input) {
  return crypto.createHash('sha256').update(input).digest('hex');
}

function cloneLedgerSnapshot(ledger) {
  return JSON.parse(JSON.stringify(ledger || {}));
}

function createGenesisBlock(config, genesisHash, genesis) {
  // Genesis block must be deterministic across producer/observer nodes.
  const timestamp = genesis?.createdAt || '1970-01-01T00:00:00.000Z';
  const payload = {
    chain: config.chain.name,
    message: 'Genesis block'
  };
  const header = {
    chainId: config.chain.chainId,
    protocolVersion: config.chain.protocolVersion,
    economicsVersion: config.chain.economicsVersion,
    genesisHash,
    height: 0,
    timestamp,
    prevHash: '0'.repeat(64),
    prevStateRoot: '0'.repeat(64),
    payload,
    nonce: 0
  };
  const headerJson = JSON.stringify(header);
  const hash = sha256(headerJson);

  return {
    height: 0,
    timestamp,
    prevHash: '0'.repeat(64),
    hash,
    nonce: 0,
    chainId: config.chain.chainId,
    genesisHash,
    protocolVersion: config.chain.protocolVersion,
    economicsVersion: config.chain.economicsVersion,
    header: headerJson,
    prevStateRoot: '0'.repeat(64),
    rewardBaseUnits: '0',
    rewardTokens: '0',
    rewardTo: config.mining.proposerAddress,
    transactions: [],
    txCount: 0,
    stateRoot: calculateStateRoot({ balances: {}, stakes: {} }),
    payload
  };
}

function createBlockchain(config, mempool, storage, dataDirOverride) {
  const dataDir = dataDirOverride || path.join(__dirname, '..', 'data');
  const { genesis, genesisHash } = ensureGenesis(dataDir, config);
  const genesisOperatorAddress = genesis.genesisOperatorAddress || config.mining?.genesisOperatorAddress || config.mining?.proposerAddress || '';
  const genesisFreeBlocks = Number(genesis.genesisFreeBlocks ?? config.mining?.genesisFreeBlocks ?? 100);
  const nodePoolAddress = config.rewards?.nodePoolAddress || 'NODE_POOL';
  const holderPoolAddress = config.rewards?.holderPoolAddress || 'HOLDER_POOL';

  const decimals = config.token.decimals;
  const initialSupplyUnits = toBaseUnits(config.token.initialSupplyTokens, decimals);
  const gasBlockLimit = Number(config.gas?.blockLimit ?? 510);
  const targetRatioBps = Number(config.gas?.targetRatioBps ?? 8000);
  const gasTarget = Math.max(1, Math.floor((gasBlockLimit * targetRatioBps) / 10_000));
  const baseFeeChangeDenominator = BigInt(config.gas?.baseFeeChangeDenominator ?? 8);
  const baseFeeInitial = BigInt(config.gas?.baseFeeInitialMicro ?? '0');
  const minBaseFee = BigInt(config.gas?.minBaseFeeMicro ?? '0');

  const blocksPerYear = YEAR_SECONDS / BigInt(config.chain.blockTimeSeconds);
  const blocksPer14Days = BigInt(14 * 24 * 60 * 60) / BigInt(config.chain.blockTimeSeconds);

  if (!storage) {
    throw new Error('Storage backend is required');
  }

  storage.initializeMeta({
    chainId: config.chain.chainId,
    genesisHash,
    protocolVersion: config.chain.protocolVersion,
    economicsVersion: config.chain.economicsVersion
  });

  let meta = storage.loadMeta() || {};
  let blocks = storage.getAllBlocks();
  let ledger = storage.loadLedger();

  validateGenesis(config, genesis, genesisHash, blocks);

  if (!blocks.length) {
    const genesisBlock = createGenesisBlock(config, genesisHash, genesis);
    blocks = [genesisBlock];
    meta = {
      ...meta,
      latestHeight: 0,
      latestHash: genesisBlock.hash,
      totalSupplyUnits: initialSupplyUnits.toString(),
      totalMintedUnits: '0',
      mintAcc: '0',
      baseFeeBaseUnits: baseFeeInitial.toString(),
      nodePoolUnits: '0',
      holderPoolUnits: '0',
      lastPayoutHeight: 0
    };
    storage.putBlock(genesisBlock, meta, ledger);
  }

  if (!ledger.participants) {
    ledger.participants = {};
    storage.saveLedger(ledger);
  }

  if (!meta || Object.keys(meta).length === 0) {
    const latest = blocks[blocks.length - 1];
    meta = {
      latestHeight: latest.height,
      latestHash: latest.hash,
      totalSupplyUnits: initialSupplyUnits.toString(),
      totalMintedUnits: '0',
      mintAcc: '0',
      baseFeeBaseUnits: baseFeeInitial.toString(),
      nodePoolUnits: '0',
      holderPoolUnits: '0',
      lastPayoutHeight: 0
    };
    storage.saveMeta(meta);
  }

  if (!meta.baseFeeBaseUnits) {
    meta.baseFeeBaseUnits = baseFeeInitial.toString();
  }
  if (!meta.mintAcc) meta.mintAcc = '0';
  if (!meta.totalSupplyUnits) meta.totalSupplyUnits = initialSupplyUnits.toString();
  if (!meta.totalMintedUnits) meta.totalMintedUnits = '0';
  if (!meta.nodePoolUnits) meta.nodePoolUnits = '0';
  if (!meta.holderPoolUnits) meta.holderPoolUnits = '0';
  if (meta.lastPayoutHeight === undefined || meta.lastPayoutHeight === null) meta.lastPayoutHeight = 0;
  if (meta.genesisFreeUsed === undefined || meta.genesisFreeUsed === null) meta.genesisFreeUsed = '0';
  storage.saveMeta(meta);

  const nodeMode = config.node?.mode || 'producer';
  const producerUrl = config.node?.producerUrl || '';
  let syncStatus = {
    nodeMode,
    producerUrl,
    syncedHeight: Number(meta.latestHeight || 0),
    producerHeight: nodeMode === 'producer' ? Number(meta.latestHeight || 0) : null,
    lagBlocks: 0,
    syncState: nodeMode === 'observer' ? 'syncing' : 'synced',
    lastSyncError: null,
    lastSyncAt: null
  };
  const invariantConfig = {
    enabled: config.invariants?.enabled !== false,
    fastChecksEveryBlock: config.invariants?.fastChecksEveryBlock !== false,
    fullAuditOnStartup: config.invariants?.fullAuditOnStartup !== false,
    fullAuditIntervalBlocks: Number(config.invariants?.fullAuditIntervalBlocks || 0),
    stopMiningOnFailure: config.invariants?.stopMiningOnFailure !== false
  };
  const invariantHealth = {
    healthy: true,
    chainHealthy: true,
    storageHealthy: true,
    mempoolHealthy: true,
    invariantStatus: 'ok',
    lastFastInvariantHeight: null,
    lastFullAuditHeight: null,
    lastInvariantCheckAt: null,
    lastInvariantFailureCode: null,
    miningPausedForSafety: false,
    details: []
  };
  let lastInvariantLogAt = 0;

  function markInvariantFailure(result, source) {
    const first = result?.issues?.[0] || null;
    invariantHealth.healthy = false;
    invariantHealth.chainHealthy = !result?.issues?.some((item) => ['chain', 'transactions', 'balances', 'supply', 'participants', 'state'].includes(item.category));
    invariantHealth.storageHealthy = !result?.issues?.some((item) => item.category === 'storage');
    invariantHealth.mempoolHealthy = !result?.issues?.some((item) => item.category === 'mempool');
    invariantHealth.invariantStatus = 'failed';
    invariantHealth.lastInvariantCheckAt = result?.checkedAt || new Date().toISOString();
    invariantHealth.lastInvariantFailureCode = first?.code || 'INVARIANT_FAILURE';
    invariantHealth.miningPausedForSafety = Boolean(invariantConfig.stopMiningOnFailure);
    invariantHealth.details = (result?.issues || []).slice(0, 20);
    const now = Date.now();
    if (now - lastInvariantLogAt > 30000) {
      console.error(JSON.stringify({
        timestamp: new Date().toISOString(),
        event: 'invariant_failure',
        source,
        code: invariantHealth.lastInvariantFailureCode,
        height: result?.checkedHeight ?? null,
        category: first?.category || 'unknown',
        protocolVersion: config.chain.protocolVersion,
        economicsVersion: config.chain.economicsVersion,
        miningPaused: invariantHealth.miningPausedForSafety
      }));
      lastInvariantLogAt = now;
    }
  }

  function markInvariantSuccess(result, type) {
    invariantHealth.healthy = true;
    invariantHealth.chainHealthy = true;
    invariantHealth.storageHealthy = true;
    invariantHealth.mempoolHealthy = true;
    invariantHealth.invariantStatus = 'ok';
    invariantHealth.lastInvariantCheckAt = result?.checkedAt || new Date().toISOString();
    invariantHealth.lastInvariantFailureCode = null;
    invariantHealth.miningPausedForSafety = false;
    invariantHealth.details = [];
    if (type === 'fast') invariantHealth.lastFastInvariantHeight = result?.checkedHeight ?? invariantHealth.lastFastInvariantHeight;
    if (type === 'full') invariantHealth.lastFullAuditHeight = result?.checkedHeight ?? invariantHealth.lastFullAuditHeight;
  }

  function runFullAudit(source = 'manual') {
    const result = runFullInvariantAudit({
      blocks: storage.getAllBlocks(),
      ledger,
      meta,
      config,
      genesisHash,
      mempool,
      storage
    });
    if (!result.ok) markInvariantFailure(result, source);
    else markInvariantSuccess(result, 'full');
    return result;
  }

  function getState() {
    const blocks = storage.getAllBlocks();
    const latest = blocks.length ? blocks[blocks.length - 1] : null;
    const stats = computeChainStats(blocks, decimals);
    const addressSet = new Set(stats.addresses || []);
    Object.keys(ledger.balances || {}).forEach((addr) => addressSet.add(addr));
    if (config.rewards?.treasuryAddress) addressSet.add(config.rewards.treasuryAddress);
    if (genesisOperatorAddress) addressSet.add(genesisOperatorAddress);
    if (nodePoolAddress) addressSet.add(nodePoolAddress);
    if (holderPoolAddress) addressSet.add(holderPoolAddress);
    const height = BigInt(meta.latestHeight || 0);
    const activeParticipants = getActiveParticipants(ledger, height, ACTIVE_WINDOW_BLOCKS);
    const totalRegisteredParticipants = Object.keys(ledger.participants || {}).length;
    const lastPayoutHeight = BigInt(meta.lastPayoutHeight || 0);
    const sincePayout = height >= lastPayoutHeight ? height - lastPayoutHeight : 0n;
    const blocksUntilPayout = sincePayout >= blocksPer14Days
      ? 0
      : Number(blocksPer14Days - sincePayout);
    const listenPort = Number(process.env.PORT || 3051);
    const syncedHeight = nodeMode === 'observer'
      ? Number(syncStatus.syncedHeight ?? meta.latestHeight ?? 0)
      : Number(meta.latestHeight ?? 0);
    const producerHeight = nodeMode === 'observer'
      ? (syncStatus.producerHeight ?? null)
      : Number(meta.latestHeight ?? 0);
    const lagBlocks = nodeMode === 'observer' && producerHeight !== null
      ? Math.max(0, Number(producerHeight) - syncedHeight)
      : 0;
    const mempoolStats = mempool && typeof mempool.getStats === 'function'
      ? mempool.getStats()
      : {
        mempoolTransactionCount: 0,
        mempoolBytes: 0,
        mempoolMaxTransactions: 0,
        mempoolMaxBytes: 0,
        mempoolUtilizationPercent: '0.00'
      };
    return {
      chainId: config.chain.chainId,
      protocolVersion: config.chain.protocolVersion,
      economicsVersion: config.chain.economicsVersion,
      genesisHash,
      chain: config.chain.name,
      symbol: config.chain.symbol,
      blockTimeSeconds: config.chain.blockTimeSeconds,
      proposerAddress: config.mining.proposerAddress,
      producerAddress: config.mining.proposerAddress,
      treasuryAddress: config.rewards?.treasuryAddress || '',
      nodePoolAddress,
      holderPoolAddress,
      genesisOperatorAddress,
      genesisFreeBlocks,
      genesisFreeUsed: String(meta.genesisFreeUsed || '0') === '1',
      decimals,
      totalSupplyTokens: formatTokens(BigInt(meta.totalSupplyUnits), decimals),
      totalMintedTokens: formatTokens(BigInt(meta.totalMintedUnits), decimals),
      totalSupplyMicro: meta.totalSupplyUnits,
      totalMintedMicro: meta.totalMintedUnits,
      latestHeight: meta.latestHeight,
      latestHash: meta.latestHash,
      latestBlock: latest
        ? { height: latest.height, hash: latest.hash, timestamp: latest.timestamp, txCount: latest.txCount || 0 }
        : null,
      totalTransactions: stats.totalTransactions,
      averageGasFeeTokens: formatTokens(stats.averageFeeMicro, decimals),
      totalAddresses: addressSet.size,
      baseFeeTokens: formatTokens(BigInt(meta.baseFeeBaseUnits), decimals),
      baseFeeMicro: meta.baseFeeBaseUnits,
      minFeeMicro: (config.tx?.minFeeMicro ?? config.gas?.baseFeeInitialMicro ?? '0').toString(),
      mintMicro: meta.lastMintUnits || '0',
      mintRatePpm: meta.lastMintRatePpm || '0',
      splitMicro: {
        participant: meta.lastParticipantUnits || '0',
        nodePool: meta.lastNodePoolAdd || '0',
        treasury: meta.lastTreasuryUnits || '0',
        holderPool: meta.lastHolderPoolAdd || '0'
      },
      activeParticipantCount: activeParticipants.length,
      totalRegisteredParticipants,
      ACTIVE_WINDOW_BLOCKS,
      avgWindowBlocks: Number(blocksPer14Days),
      avgWindowDays: 14,
      avgEligibilityMicro: (1000n * MICRO).toString(),
      poolsMicro: {
        node: meta.nodePoolUnits || '0',
        holder: meta.holderPoolUnits || '0'
      },
      blocksUntilPayout,
      listenPort,
      nodeMode,
      producerUrl: producerUrl || null,
      syncedHeight,
      producerHeight,
      lagBlocks,
      syncState: nodeMode === 'observer' ? (syncStatus.syncState || 'syncing') : 'synced',
      lastSyncError: nodeMode === 'observer' ? (syncStatus.lastSyncError || null) : null,
      lastSyncAt: nodeMode === 'observer' ? (syncStatus.lastSyncAt || null) : null,
      gasTarget,
      gasBlockLimit,
      healthy: invariantHealth.healthy,
      chainHealthy: invariantHealth.chainHealthy,
      storageHealthy: invariantHealth.storageHealthy,
      mempoolHealthy: invariantHealth.mempoolHealthy,
      invariantStatus: invariantHealth.invariantStatus,
      lastFastInvariantHeight: invariantHealth.lastFastInvariantHeight,
      lastFullAuditHeight: invariantHealth.lastFullAuditHeight,
      lastInvariantCheckAt: invariantHealth.lastInvariantCheckAt,
      lastInvariantFailureCode: invariantHealth.lastInvariantFailureCode,
      miningPausedForSafety: invariantHealth.miningPausedForSafety,
      ...mempoolStats
    };
  }

  function canMint() {
    return !invariantHealth.miningPausedForSafety;
  }

  function mineNextBlock() {
    if (invariantConfig.enabled && invariantHealth.miningPausedForSafety) {
      return null;
    }
    const latest = storage.getLatestBlock();
    const preLedger = cloneLedgerSnapshot(ledger);
    const preMeta = { ...meta };
    const height = latest ? latest.height + 1 : 0;
    const timestamp = new Date().toISOString();

    const prevBaseFee = BigInt(meta.baseFeeBaseUnits || '0');
    const selected = mempool
      ? selectMempoolTxs(mempool, ledger, gasBlockLimit)
      : [];

    const userTxs = applyUserTxs(
      selected,
      ledger,
      meta,
      config.rewards?.treasuryAddress || '',
      genesisOperatorAddress,
      genesisFreeBlocks,
      BigInt(height),
      blocksPer14Days
    );

    const mintContext = mintAndDistribute(
      BigInt(height),
      timestamp,
      config,
      meta,
      ledger,
      blocksPerYear,
      blocksPer14Days,
      nodePoolAddress,
      holderPoolAddress
    );

    const rewardTxs = buildMintTxs(mintContext, timestamp, BigInt(height));

    const payload = {
      mintUnits: mintContext.mintUnits.toString(),
      ratePpm: mintContext.ratePpm.toString()
    };
    const nonce = 0;
    const header = {
      chainId: config.chain.chainId,
      protocolVersion: config.chain.protocolVersion,
      economicsVersion: config.chain.economicsVersion,
      genesisHash,
      height,
      timestamp,
      prevHash: latest.hash,
      prevStateRoot: latest.stateRoot || '0'.repeat(64),
      payload,
      nonce
    };
    const headerJson = JSON.stringify(header);
    const hash = sha256(headerJson);

    const txCount = rewardTxs.length + userTxs.length;
    const gasUsed = userTxs.length;
    const nextBaseFee = calculateNextBaseFee(
      prevBaseFee,
      BigInt(gasUsed),
      BigInt(gasTarget),
      baseFeeChangeDenominator,
      minBaseFee
    );

    const block = {
      height,
      timestamp,
      prevHash: latest.hash,
      hash,
      nonce,
      chainId: config.chain.chainId,
      genesisHash,
      protocolVersion: config.chain.protocolVersion,
      economicsVersion: config.chain.economicsVersion,
      header: headerJson,
      prevStateRoot: latest.stateRoot || '0'.repeat(64),
      rewardBaseUnits: mintContext.participantUnits.toString(),
      rewardTokens: formatTokens(mintContext.participantUnits, decimals),
      rewardTo: config.mining.proposerAddress,
      transactions: [...rewardTxs, ...userTxs],
      txCount,
      gasUsed,
      gasLimit: gasBlockLimit,
      gasTarget,
      baseFeeBaseUnits: prevBaseFee.toString(),
      nextBaseFeeBaseUnits: nextBaseFee.toString(),
      mintUnits: mintContext.mintUnits.toString(),
      mintRatePpm: mintContext.ratePpm.toString(),
      stateRoot: calculateStateRoot(ledger),
      payload
    };

    if (invariantConfig.enabled && invariantConfig.fastChecksEveryBlock) {
      const candidateMeta = {
        ...meta,
        latestHeight: block.height,
        latestHash: block.hash,
        baseFeeBaseUnits: nextBaseFee.toString(),
        totalSupplyUnits: mintContext.totalSupplyUnits.toString(),
        totalMintedUnits: mintContext.totalMintedUnits.toString()
      };
      const fast = runFastBlockInvariant({
        block,
        previousBlock: latest,
        ledger,
        meta: candidateMeta,
        config,
        genesisHash,
        mempool
      });
      if (!fast.ok) {
        ledger = preLedger;
        meta = preMeta;
        markInvariantFailure(fast, 'fast_block');
        return null;
      }
      markInvariantSuccess(fast, 'fast');
    }

    meta.latestHeight = block.height;
    meta.latestHash = block.hash;
    meta.baseFeeBaseUnits = nextBaseFee.toString();
    meta.totalSupplyUnits = mintContext.totalSupplyUnits.toString();
    meta.totalMintedUnits = mintContext.totalMintedUnits.toString();
    meta.mintAcc = mintContext.mintAcc.toString();
    meta.nodePoolUnits = mintContext.nodePoolUnits.toString();
    meta.holderPoolUnits = mintContext.holderPoolUnits.toString();
    meta.lastPayoutHeight = mintContext.lastPayoutHeight;
    meta.lastMintUnits = mintContext.mintUnits.toString();
    meta.lastMintRatePpm = mintContext.ratePpm.toString();
    meta.lastParticipantUnits = mintContext.participantUnits.toString();
    meta.lastParticipantCount = mintContext.participantCount ?? 0;
    meta.lastParticipantToTreasury = (mintContext.participantToTreasury || 0n).toString();
    meta.lastNodePoolAdd = mintContext.nodePoolAdd.toString();
    meta.lastHolderPoolAdd = mintContext.holderPoolAdd.toString();
    meta.lastTreasuryUnits = mintContext.treasuryUnits.toString();
    storage.putBlock(block, meta, ledger);
    if (selected.length && mempool && typeof mempool.removeByIds === 'function') {
      mempool.removeByIds(selected.map((tx) => tx.id));
    }
    if (invariantConfig.enabled && invariantConfig.fullAuditIntervalBlocks > 0 && Number(block.height) % invariantConfig.fullAuditIntervalBlocks === 0) {
      runFullAudit('interval');
    }
    return block;
  }

  function getBlocks(offset, limit) {
    return storage.getBlocksPage(offset, limit);
  }

  function getBlocksFromHeight(startHeight, limit) {
    return storage.getBlocksFromHeight(startHeight, limit);
  }

  function getLatestHeight() {
    return Number(meta.latestHeight || 0);
  }

  function setSyncStatus(update) {
    syncStatus = { ...syncStatus, ...update };
  }

  function applyExternalBlock(block) {
    if (!block) return { ok: false, error: 'missing block' };
    const expectedHeight = Number(meta.latestHeight || 0) + 1;
    if (Number(block.height) !== expectedHeight) {
      return { ok: false, error: `height mismatch (expected ${expectedHeight})`, code: 'CHAIN_HEIGHT_MISMATCH', height: block?.height };
    }
    if (block.chainId !== config.chain.chainId) {
      return { ok: false, error: 'chainId mismatch', code: 'CHAIN_ID_MISMATCH', height: block.height };
    }
    if (block.genesisHash !== genesisHash) {
      return { ok: false, error: 'genesisHash mismatch', code: 'GENESIS_HASH_MISMATCH', height: block.height };
    }
    if (block.protocolVersion !== config.chain.protocolVersion) {
      return { ok: false, error: 'protocolVersion mismatch', code: 'PROTOCOL_VERSION_MISMATCH', height: block.height };
    }
    if (block.economicsVersion !== config.chain.economicsVersion) {
      return { ok: false, error: 'economicsVersion mismatch', code: 'ECONOMICS_VERSION_MISMATCH', height: block.height };
    }
    if (block.prevHash !== meta.latestHash) {
      return { ok: false, error: 'prevHash mismatch', code: 'PREVIOUS_HASH_MISMATCH', height: block.height };
    }

    const currentStateRoot = calculateStateRoot(ledger);
    if (block.prevStateRoot && block.prevStateRoot !== currentStateRoot) {
      return { ok: false, error: 'prevStateRoot mismatch', code: 'STATE_ROOT_MISMATCH', height: block.height };
    }

    if (!block.header) {
      return { ok: false, error: 'missing header' };
    }
    let header;
    try {
      header = JSON.parse(block.header);
    } catch {
      return { ok: false, error: 'invalid header' };
    }
    const computedHash = sha256(block.header);
    if (computedHash !== block.hash) {
      return { ok: false, error: 'block hash mismatch', code: 'BLOCK_HASH_MISMATCH', height: block.height };
    }
    if (header.height !== block.height || header.prevHash !== block.prevHash || header.prevStateRoot !== block.prevStateRoot) {
      return { ok: false, error: 'header fields mismatch' };
    }
    if (header.chainId !== block.chainId || header.protocolVersion !== block.protocolVersion || header.economicsVersion !== block.economicsVersion) {
      return { ok: false, error: 'header chain fields mismatch' };
    }

    const txs = Array.isArray(block.transactions) ? block.transactions : [];
    if (block.txCount !== undefined && Number(block.txCount) !== txs.length) {
      return { ok: false, error: 'txCount mismatch' };
    }

    const userTypes = new Set(['transfer', 'register_participant', 'unregister_participant', 'heartbeat']);
    const userTxs = [];
    const rewardTxs = [];
    for (const tx of txs) {
      if (userTypes.has(tx.type)) {
        userTxs.push(tx);
      } else {
        rewardTxs.push(tx);
      }
    }

    const tempLedger = cloneLedgerSnapshot(ledger);
    const tempMeta = { ...meta };
    const height = BigInt(block.height);
    const applied = applyUserTxs(
      userTxs,
      tempLedger,
      tempMeta,
      config.rewards?.treasuryAddress || '',
      genesisOperatorAddress,
      genesisFreeBlocks,
      height,
      blocksPer14Days
    );
    if (applied.length !== userTxs.length) {
      return { ok: false, error: 'user tx validation failed' };
    }

    const mintContext = mintAndDistribute(
      height,
      block.timestamp,
      config,
      tempMeta,
      tempLedger,
      blocksPerYear,
      blocksPer14Days,
      nodePoolAddress,
      holderPoolAddress
    );

    if (block.mintUnits && block.mintUnits !== mintContext.mintUnits.toString()) {
      return { ok: false, error: 'mintUnits mismatch' };
    }
    if (block.mintRatePpm && block.mintRatePpm !== mintContext.ratePpm.toString()) {
      return { ok: false, error: 'mintRatePpm mismatch' };
    }

    const expectedRewardTxs = buildMintTxs(mintContext, block.timestamp, height);
    const rewardById = new Map();
    for (const tx of rewardTxs) {
      rewardById.set(tx.txid || tx.id, tx);
    }
    if (rewardById.size !== expectedRewardTxs.length) {
      return { ok: false, error: 'reward tx count mismatch' };
    }
    for (const expected of expectedRewardTxs) {
      const id = expected.txid || expected.id;
      const actual = rewardById.get(id);
      if (!actual) return { ok: false, error: `missing reward tx ${id}` };
      if (actual.type !== expected.type) return { ok: false, error: `reward tx type mismatch for ${id}` };
      if ((actual.to || '') !== (expected.to || '')) return { ok: false, error: `reward tx to mismatch for ${id}` };
      const actualAmt = actual.amountMicro ?? actual.amountBaseUnits ?? '0';
      const expectedAmt = expected.amountMicro ?? expected.amountBaseUnits ?? '0';
      if (String(actualAmt) !== String(expectedAmt)) return { ok: false, error: `reward tx amount mismatch for ${id}` };
    }

    const expectedStateRoot = calculateStateRoot(tempLedger);
    if (block.stateRoot !== expectedStateRoot) {
      return { ok: false, error: 'stateRoot mismatch', code: 'STATE_ROOT_MISMATCH', height: block.height };
    }

    const prevBaseFee = BigInt(meta.baseFeeBaseUnits || '0');
    const gasUsed = userTxs.length;
    const nextBaseFee = calculateNextBaseFee(
      prevBaseFee,
      BigInt(gasUsed),
      BigInt(gasTarget),
      baseFeeChangeDenominator,
      minBaseFee
    );

    if (block.baseFeeBaseUnits && block.baseFeeBaseUnits !== prevBaseFee.toString()) {
      return { ok: false, error: 'baseFeeBaseUnits mismatch' };
    }
    if (block.nextBaseFeeBaseUnits && block.nextBaseFeeBaseUnits !== nextBaseFee.toString()) {
      return { ok: false, error: 'nextBaseFeeBaseUnits mismatch' };
    }

    tempMeta.latestHeight = block.height;
    tempMeta.latestHash = block.hash;
    tempMeta.baseFeeBaseUnits = nextBaseFee.toString();
    tempMeta.totalSupplyUnits = mintContext.totalSupplyUnits.toString();
    tempMeta.totalMintedUnits = mintContext.totalMintedUnits.toString();
    tempMeta.mintAcc = mintContext.mintAcc.toString();
    tempMeta.nodePoolUnits = mintContext.nodePoolUnits.toString();
    tempMeta.holderPoolUnits = mintContext.holderPoolUnits.toString();
    tempMeta.lastPayoutHeight = mintContext.lastPayoutHeight;
    tempMeta.lastMintUnits = mintContext.mintUnits.toString();
    tempMeta.lastMintRatePpm = mintContext.ratePpm.toString();
    tempMeta.lastParticipantUnits = mintContext.participantUnits.toString();
    tempMeta.lastParticipantCount = mintContext.participantCount ?? 0;
    tempMeta.lastParticipantToTreasury = (mintContext.participantToTreasury || 0n).toString();
    tempMeta.lastNodePoolAdd = mintContext.nodePoolAdd.toString();
    tempMeta.lastHolderPoolAdd = mintContext.holderPoolAdd.toString();
    tempMeta.lastTreasuryUnits = mintContext.treasuryUnits.toString();

    if (invariantConfig.enabled && invariantConfig.fastChecksEveryBlock) {
      const fast = runFastBlockInvariant({
        block,
        previousBlock: storage.getLatestBlock(),
        ledger: tempLedger,
        meta: tempMeta,
        config,
        genesisHash,
        mempool
      });
      if (!fast.ok) {
        markInvariantFailure(fast, 'observer_fast_block');
        return {
          ok: false,
          error: fast.errors[0] || 'invariant failure',
          code: fast.issues[0]?.code || 'INVARIANT_FAILURE',
          height: block.height
        };
      }
      markInvariantSuccess(fast, 'fast');
    }

    ledger = tempLedger;
    meta = tempMeta;
    storage.putBlock(block, meta, ledger);
    if (invariantConfig.enabled) {
      const audit = runFullAudit('observer_apply');
      if (!audit.ok) {
        return { ok: false, error: audit.errors[0] || 'invariant failure', code: audit.issues[0]?.code || 'INVARIANT_FAILURE', height: block.height };
      }
    }
    return { ok: true };
  }

  if (invariantConfig.enabled && invariantConfig.fullAuditOnStartup) {
    runFullAudit('startup');
  }

  return {
    getState,
    canMint,
    mineNextBlock,
    getGenesisFreeContext() {
      return {
        genesisOperatorAddress,
        genesisFreeBlocks,
        genesisFreeUsed: String(meta.genesisFreeUsed || '0') === '1',
        latestHeight: Number(meta.latestHeight || 0)
      };
    },
    checkInvariants() {
      const audit = runFullAudit('debug');
      return {
        ok: audit.ok,
        errors: audit.errors,
        warnings: [],
        issues: audit.issues,
        status: { ...invariantHealth, details: undefined }
      };
    },
    getInvariantStatus() {
      return { ...invariantHealth, details: undefined };
    },
    getBlocks,
    getBlocksFromHeight,
    getLatestHeight,
    setSyncStatus,
    applyExternalBlock,
    getGenesis() {
      return { ...genesis, genesisHash };
    },
    getBalanceUnits(address) {
      return getBalanceUnits(ledger, address).toString();
    },
    getNonce(address) {
      return getNonce(ledger, address).toString();
    },
    getBlockByHeight(height) {
      return storage.getBlockByHeight(height);
    },
    getTxById(txid) {
      return storage.getTxById(txid);
    },
    getAddressStats(address) {
      const summary = storage.getAddressSummary(address, ACTIVE_WINDOW_BLOCKS) || {};
      const balance = getBalanceUnits(ledger, address).toString();
      const nonce = getNonce(ledger, address).toString();
      const height = BigInt(meta.latestHeight || 0);
      const window = BigInt(blocksPer14Days);
      const startHeight = height >= window && window > 0n ? height - window + 1n : 0n;
      const history = ledger.balanceHistory?.[address] || [];
      const avgBalance = computeAverageBalance(history, BigInt(balance || '0'), startHeight, height);
      const avgEligible = avgBalance >= 1000n * MICRO;
      return {
        address,
        balanceMicro: balance,
        avgBalanceMicro: avgBalance.toString(),
        avgEligible,
        nonce,
        txCount: summary.txCount ?? 0,
        firstSeenHeight: summary.firstSeenHeight ?? null,
        lastSeenHeight: summary.lastSeenHeight ?? null,
        firstSeen: summary.firstSeen ?? null,
        lastSeen: summary.lastSeen ?? null,
        participant: summary.participant ?? null,
        sponsoredActiveCount: summary.sponsoredActiveCount ?? 0
      };
    },
    getAddressTxs(address, limit = 50) {
      return storage.getAddressTxs(address, limit);
    },
    registerParticipant(address, sponsor, height, bondMicro) {
      if (!ledger.participants) ledger.participants = {};
      ledger.participants[address] = {
        sponsor,
        bondMicro: bondMicro.toString(),
        registeredHeight: height.toString(),
        lastSeenHeight: height.toString()
      };
      storage.saveLedger(ledger);
    },
    getParticipantRecord(address) {
      return ledger.participants?.[address] || null;
    },
    getSponsorActiveCount(sponsor) {
      const height = BigInt(meta.latestHeight || 0);
      const active = getActiveParticipants(ledger, height, ACTIVE_WINDOW_BLOCKS);
      return active.filter((address) => {
        const record = ledger.participants?.[address];
        return record && record.sponsor === sponsor;
      }).length;
    },
    setBalanceUnits(address, amountUnits) {
      const height = BigInt(meta.latestHeight || 0);
      setBalanceWithHistory(ledger, address, BigInt(amountUnits), height, blocksPer14Days);
      storage.saveLedger(ledger);
    },
    setStakeUnits(address, amountUnits) {
      setStakeUnits(ledger, address, BigInt(amountUnits));
      storage.saveLedger(ledger);
    }
  };
}

function mintAndDistribute(height, timestamp, config, meta, ledger, blocksPerYear, blocksPer14Days, nodePoolAddress, holderPoolAddress) {
  const totalSupplyUnits = BigInt(meta.totalSupplyUnits || '0');
  const totalMintedUnits = BigInt(meta.totalMintedUnits || '0');
  const mintAcc = BigInt(meta.mintAcc || '0');
  const nodePoolUnits = BigInt(meta.nodePoolUnits || '0');
  const holderPoolUnits = BigInt(meta.holderPoolUnits || '0');

  const ratePpm = getRatePpm(height, blocksPerYear);
  const denom = PPM * blocksPerYear;
  const newMintAcc = mintAcc + totalSupplyUnits * ratePpm;
  const mintUnits = newMintAcc / denom;
  const updatedMintAcc = newMintAcc % denom;

  const updatedTotalSupply = totalSupplyUnits + mintUnits;
  const updatedTotalMinted = totalMintedUnits + mintUnits;

  const participantUnits = (mintUnits * 1500n) / BPS_DENOM;
  const nodePoolAdd = (mintUnits * 7000n) / BPS_DENOM;
  let treasuryUnits = (mintUnits * 1000n) / BPS_DENOM;
  const holderPoolAdd = (mintUnits * 500n) / BPS_DENOM;
  const distributed = participantUnits + nodePoolAdd + treasuryUnits + holderPoolAdd;
  const remainder = mintUnits - distributed;
  treasuryUnits += remainder;

  const proposerAddress = config.mining.proposerAddress;
  const treasuryAddress = config.rewards.treasuryAddress;
  const nodePoolAddr = nodePoolAddress;
  const holderPoolAddr = holderPoolAddress;

  const participantPayout = distributeParticipants(
    ledger,
    participantUnits,
    treasuryAddress,
    BigInt(height),
    ACTIVE_WINDOW_BLOCKS,
    blocksPer14Days
  );
  treasuryUnits += participantPayout.treasuryRemainder;

  creditBalance(ledger, treasuryAddress, treasuryUnits, height, blocksPer14Days);

  let updatedNodePool = nodePoolUnits + nodePoolAdd;
  let updatedHolderPool = holderPoolUnits + holderPoolAdd;

  if (nodePoolAddr && nodePoolAddr !== treasuryAddress) {
    creditBalance(ledger, nodePoolAddr, nodePoolAdd, height, blocksPer14Days);
  }
  if (holderPoolAddr && holderPoolAddr !== treasuryAddress) {
    creditBalance(ledger, holderPoolAddr, holderPoolAdd, height, blocksPer14Days);
  }
  let lastPayoutHeight = Number(meta.lastPayoutHeight || 0);

  const payoutTxs = [];
  if (height - BigInt(lastPayoutHeight) >= blocksPer14Days) {
    const payout = payoutPools(
      ledger,
      updatedNodePool,
      updatedHolderPool,
      treasuryAddress,
      height,
      timestamp,
      blocksPer14Days,
      nodePoolAddr,
      holderPoolAddr,
      proposerAddress
    );
    updatedNodePool = payout.nodePoolRemaining;
    updatedHolderPool = payout.holderPoolRemaining;
    lastPayoutHeight = Number(height);
    payoutTxs.push(...payout.txs);
  }

  return {
    mintUnits,
    ratePpm,
    totalSupplyUnits: updatedTotalSupply,
    totalMintedUnits: updatedTotalMinted,
    mintAcc: updatedMintAcc,
    participantUnits,
    participantShareUnits: participantPayout.participantShareUnits,
    participantRewards: participantPayout.rewards,
    participantCount: participantPayout.activeCount,
    participantToTreasury: participantPayout.treasuryRemainder,
    treasuryUnits,
    nodePoolAdd,
    holderPoolAdd,
    nodePoolUnits: updatedNodePool,
    holderPoolUnits: updatedHolderPool,
    lastPayoutHeight,
    payoutTxs,
    proposerAddress,
    treasuryAddress,
    nodePoolAddress: nodePoolAddr,
    holderPoolAddress: holderPoolAddr
  };
}

function payoutPools(ledger, nodePoolUnits, holderPoolUnits, treasuryAddress, height, timestamp, holderWindowBlocks, nodePoolAddress, holderPoolAddress, proposerAddress) {
  const txs = [];
  let nodeRemaining = nodePoolUnits;
  let holderRemaining = holderPoolUnits;

  const systemAddresses = new Set([treasuryAddress, nodePoolAddress, holderPoolAddress, proposerAddress].filter(Boolean));

  const stakeEntries = Object.entries(ledger.stakes || {})
    .map(([address, value]) => [address, BigInt(value)])
    .sort(([a], [b]) => a.localeCompare(b));
  const totalStake = stakeEntries.reduce((sum, [, value]) => sum + value, 0n);

  if (totalStake > 0n && nodePoolUnits > 0n) {
    let distributed = 0n;
    if (nodePoolAddress && nodePoolAddress !== treasuryAddress) {
      debitBalance(ledger, nodePoolAddress, nodePoolUnits, height, holderWindowBlocks);
    }
    for (const [address, stake] of stakeEntries) {
      if (stake <= 0n) continue;
      const reward = (nodePoolUnits * stake) / totalStake;
      if (reward > 0n) {
        creditBalance(ledger, address, reward, height, holderWindowBlocks);
        distributed += reward;
        txs.push({
          id: `node-${height}-${address}`,
          txid: `node-${height}-${address}`,
          type: 'node_reward',
          from: null,
          to: address,
          amountMicro: reward.toString(),
          feeMicro: '0',
          timestamp
        });
      }
    }
    const leftover = nodePoolUnits - distributed;
    if (leftover > 0n) {
      creditBalance(ledger, treasuryAddress, leftover, height, holderWindowBlocks);
      txs.push({
        id: `node-leftover-${height}`,
        txid: `node-leftover-${height}`,
        type: 'node_leftover',
        from: null,
        to: treasuryAddress,
        amountMicro: leftover.toString(),
        feeMicro: '0',
        timestamp
      });
    }
    nodeRemaining = 0n;
  } else if (nodePoolUnits > 0n) {
    if (nodePoolAddress && nodePoolAddress !== treasuryAddress) {
      debitBalance(ledger, nodePoolAddress, nodePoolUnits, height, holderWindowBlocks);
    }
    creditBalance(ledger, treasuryAddress, nodePoolUnits, height, holderWindowBlocks);
    txs.push({
      id: `node-empty-${height}`,
      txid: `node-empty-${height}`,
      type: 'node_empty',
      from: null,
      to: treasuryAddress,
      amountMicro: nodePoolUnits.toString(),
      feeMicro: '0',
      timestamp
    });
    nodeRemaining = 0n;
  }

  const balanceEntries = Object.entries(ledger.balances || {})
    .map(([address, value]) => [address, BigInt(value)])
    .sort(([a], [b]) => a.localeCompare(b));
  const window = BigInt(holderWindowBlocks || 0);
  const startHeight = height >= window && window > 0n ? height - window + 1n : 0n;
  const eligibleBalances = balanceEntries
    .map(([address, balance]) => {
      const history = ledger.balanceHistory?.[address] || [];
      const avg = computeAverageBalance(history, balance, startHeight, height);
      return [address, avg];
    })
    .filter(([address, avg]) => avg >= 1000n * MICRO && !systemAddresses.has(address));
  const totalBalance = eligibleBalances.reduce((sum, [, avg]) => sum + avg, 0n);

  if (totalBalance > 0n && holderPoolUnits > 0n) {
    let distributed = 0n;
    if (holderPoolAddress && holderPoolAddress !== treasuryAddress) {
      debitBalance(ledger, holderPoolAddress, holderPoolUnits, height, holderWindowBlocks);
    }
    for (const [address, avg] of eligibleBalances) {
      const reward = (holderPoolUnits * avg) / totalBalance;
      if (reward > 0n) {
        creditBalance(ledger, address, reward, height, holderWindowBlocks);
        distributed += reward;
      txs.push({
        id: `holder-${height}-${address}`,
        txid: `holder-${height}-${address}`,
        type: 'holder_reward',
        from: null,
        to: address,
        amountMicro: reward.toString(),
        feeMicro: '0',
        timestamp
      });
    }
    }
    const leftover = holderPoolUnits - distributed;
    if (leftover > 0n) {
      creditBalance(ledger, treasuryAddress, leftover, height, holderWindowBlocks);
    txs.push({
      id: `holder-leftover-${height}`,
      txid: `holder-leftover-${height}`,
      type: 'holder_leftover',
      from: null,
      to: treasuryAddress,
      amountMicro: leftover.toString(),
      feeMicro: '0',
      timestamp
    });
  }
    holderRemaining = 0n;
  } else if (holderPoolUnits > 0n) {
    if (holderPoolAddress && holderPoolAddress !== treasuryAddress) {
      debitBalance(ledger, holderPoolAddress, holderPoolUnits, height, holderWindowBlocks);
    }
    creditBalance(ledger, treasuryAddress, holderPoolUnits, height, holderWindowBlocks);
    txs.push({
      id: `holder-empty-${height}`,
      txid: `holder-empty-${height}`,
      type: 'holder_empty',
      from: null,
      to: treasuryAddress,
      amountMicro: holderPoolUnits.toString(),
      feeMicro: '0',
      timestamp
    });
    holderRemaining = 0n;
  }

  return {
    nodePoolRemaining: nodeRemaining,
    holderPoolRemaining: holderRemaining,
    txs
  };
}

function buildMintTxs(mintContext, timestamp, height) {
  const txs = [];
  if (mintContext.nodePoolAdd && mintContext.nodePoolAdd !== '0' && mintContext.nodePoolAddress) {
    txs.push({
      id: `node-pool-${height}`,
      txid: `node-pool-${height}`,
      type: 'node_pool_accrual',
      from: null,
      to: mintContext.nodePoolAddress,
      amountMicro: mintContext.nodePoolAdd.toString(),
      feeMicro: '0',
      timestamp
    });
  }
  if (mintContext.holderPoolAdd && mintContext.holderPoolAdd !== '0' && mintContext.holderPoolAddress) {
    txs.push({
      id: `holder-pool-${height}`,
      txid: `holder-pool-${height}`,
      type: 'holder_pool_accrual',
      from: null,
      to: mintContext.holderPoolAddress,
      amountMicro: mintContext.holderPoolAdd.toString(),
      feeMicro: '0',
      timestamp
    });
  }
  if (Array.isArray(mintContext.participantRewards) && mintContext.participantRewards.length) {
    for (const reward of mintContext.participantRewards) {
      txs.push({
        id: `participant-${height}-${reward.address}`,
        txid: `participant-${height}-${reward.address}`,
        type: 'participant_reward',
        from: null,
        to: reward.address,
        amountMicro: reward.amount.toString(),
        feeMicro: '0',
        timestamp
      });
    }
  }
  txs.push({
    id: `treasury-${height}`,
    txid: `treasury-${height}`,
    type: 'treasury_reward',
    from: null,
    to: mintContext.treasuryAddress,
    amountMicro: mintContext.treasuryUnits.toString(),
    feeMicro: '0',
    timestamp
  });
  txs.push(...mintContext.payoutTxs);
  return txs;
}

function getRatePpm(height, blocksPerYear) {
  const start = 50_000n;
  const end = 20_000n;
  const spanBlocks = blocksPerYear * 4n;

  if (height >= spanBlocks) return end;

  const delta = start - end;
  const reduction = (delta * height) / spanBlocks;
  return start - reduction;
}

function recordBalanceHistory(ledger, address, balance, height, windowBlocks) {
  if (!address || height === undefined || height === null) return;
  if (!ledger.balanceHistory) ledger.balanceHistory = {};
  const history = ledger.balanceHistory[address] || [];
  const heightStr = height.toString();
  const balanceStr = balance.toString();
  if (history.length && history[history.length - 1].height === heightStr) {
    history[history.length - 1].balanceMicro = balanceStr;
  } else {
    history.push({ height: heightStr, balanceMicro: balanceStr });
  }
  let pruned = history;
  const window = windowBlocks !== undefined && windowBlocks !== null ? BigInt(windowBlocks) : 0n;
  if (window > 0n) {
    const minHeight = height >= window ? height - window + 1n : 0n;
    let lastBefore = null;
    pruned = [];
    for (const entry of history) {
      const entryHeight = BigInt(entry.height || '0');
      if (entryHeight < minHeight) {
        lastBefore = entry;
        continue;
      }
      pruned.push(entry);
    }
    if (lastBefore) {
      if (!pruned.length || BigInt(pruned[0].height || '0') >= minHeight) {
        pruned.unshift(lastBefore);
      }
    }
  }
  ledger.balanceHistory[address] = pruned;
}

function setBalanceWithHistory(ledger, address, value, height, windowBlocks) {
  setBalanceUnits(ledger, address, value);
  recordBalanceHistory(ledger, address, value, height, windowBlocks);
}

function creditBalance(ledger, address, amount, height, windowBlocks) {
  if (!address || amount === 0n) return;
  const current = getBalanceUnits(ledger, address);
  const next = current + amount;
  setBalanceWithHistory(ledger, address, next, height, windowBlocks);
}

function debitBalance(ledger, address, amount, height, windowBlocks) {
  if (!address || amount === 0n) return;
  const current = getBalanceUnits(ledger, address);
  const next = current > amount ? current - amount : 0n;
  setBalanceWithHistory(ledger, address, next, height, windowBlocks);
}

function computeAverageBalance(history, currentBalance, startHeight, endHeight) {
  if (endHeight < startHeight) return 0n;
  const window = endHeight - startHeight + 1n;
  if (!history || history.length === 0) {
    return currentBalance;
  }
  const entries = history
    .map((entry) => ({
      height: BigInt(entry.height || '0'),
      balance: BigInt(entry.balanceMicro ?? entry.balance ?? '0')
    }))
    .sort((a, b) => (a.height < b.height ? -1 : a.height > b.height ? 1 : 0));

  let prevBalance = 0n;
  let cursor = startHeight;
  let idx = 0;
  while (idx < entries.length && entries[idx].height <= startHeight) {
    prevBalance = entries[idx].balance;
    idx += 1;
  }

  let sum = 0n;
  for (; idx < entries.length; idx += 1) {
    const entry = entries[idx];
    if (entry.height > endHeight) break;
    if (entry.height < cursor) {
      prevBalance = entry.balance;
      continue;
    }
    const duration = entry.height - cursor;
    if (duration > 0n) {
      sum += prevBalance * duration;
      cursor = entry.height;
    }
    prevBalance = entry.balance;
  }
  const remaining = endHeight - cursor + 1n;
  if (remaining > 0n) sum += prevBalance * remaining;
  return sum / window;
}

function getActiveParticipants(ledger, height, activeWindow) {
  const participants = ledger.participants || {};
  const minHeight = height > BigInt(activeWindow) ? height - BigInt(activeWindow) : 0n;
  return Object.entries(participants)
    .filter(([, record]) => {
      try {
        return BigInt(record.lastSeenHeight || '0') >= minHeight;
      } catch {
        return false;
      }
    })
    .map(([address]) => address)
    .sort((a, b) => a.localeCompare(b));
}

function distributeParticipants(ledger, participantUnits, treasuryAddress, height, activeWindow, avgWindowBlocks) {
  const active = getActiveParticipants(ledger, height, activeWindow);

  if (!active.length) {
    return { activeCount: 0, rewards: [], participantShareUnits: participantUnits, treasuryRemainder: participantUnits };
  }

  const count = BigInt(active.length);
  const share = participantUnits / count;
  const remainder = participantUnits - share * count;
  const rewards = [];

  for (const address of active) {
    if (share > 0n) {
      creditBalance(ledger, address, share, height, avgWindowBlocks);
      rewards.push({ address, amount: share });
    }
  }

  return {
    activeCount: active.length,
    rewards,
    participantShareUnits: participantUnits,
    treasuryRemainder: remainder
  };
}

function selectMempoolTxs(mempool, ledger, limitCount) {
  if (typeof mempool.cleanupExpired === 'function') mempool.cleanupExpired();
  const pool = mempool.list();
  const grouped = new Map();

  for (const tx of pool) {
    if (!tx.signer) continue;
    if (!grouped.has(tx.signer)) grouped.set(tx.signer, []);
    grouped.get(tx.signer).push(tx);
  }

  const sequences = new Map();

  for (const [from, txs] of grouped.entries()) {
    const byNonce = new Map();
    for (const tx of txs) {
      const nonce = BigInt(tx.nonce || '0');
      const fee = BigInt(tx.feeMicro || '0');
      const id = tx.txid || tx.id;
      const existing = byNonce.get(nonce);
      if (!existing) {
        byNonce.set(nonce, tx);
        continue;
      }
      const existingFee = BigInt(existing.feeMicro || '0');
      const existingId = existing.txid || existing.id;
      if (fee > existingFee || (fee === existingFee && id < existingId)) {
        byNonce.set(nonce, tx);
      }
    }

    const expectedNonce = getNonce(ledger, from);
    const chain = [];
    let cursor = expectedNonce;
    while (byNonce.has(cursor)) {
      const tx = byNonce.get(cursor);
      chain.push(tx);
      cursor += 1n;
    }
    if (chain.length) {
      sequences.set(from, chain);
    }
  }

  const pointers = new Map();
  for (const [from, chain] of sequences.entries()) {
    if (chain.length) pointers.set(from, 0);
  }

  const selected = [];
  while (selected.length < limitCount) {
    let bestFrom = null;
    let bestTx = null;
    for (const [from, index] of pointers.entries()) {
      const chain = sequences.get(from);
      const tx = chain[index];
      if (!tx) continue;
      if (!bestTx) {
        bestTx = tx;
        bestFrom = from;
        continue;
      }
      if (mempool.sortMode === 'fifo') {
        const aTime = Date.parse(tx.timestamp || 0) || 0;
        const bTime = Date.parse(bestTx.timestamp || 0) || 0;
        if (aTime < bTime) {
          bestTx = tx;
          bestFrom = from;
          continue;
        }
        if (aTime === bTime) {
          const aId = tx.txid || tx.id;
          const bId = bestTx.txid || bestTx.id;
          if (aId < bId) {
            bestTx = tx;
            bestFrom = from;
          }
        }
        continue;
      }
      const aFee = BigInt(tx.feeMicro || '0');
      const bFee = BigInt(bestTx.feeMicro || '0');
      if (aFee > bFee) {
        bestTx = tx;
        bestFrom = from;
        continue;
      }
      if (aFee === bFee) {
        const aId = tx.txid || tx.id;
        const bId = bestTx.txid || bestTx.id;
        if (aId < bId) {
          bestTx = tx;
          bestFrom = from;
        }
      }
    }

    if (!bestTx || !bestFrom) break;
    selected.push(bestTx);
    const nextIndex = (pointers.get(bestFrom) || 0) + 1;
    const chain = sequences.get(bestFrom);
    if (nextIndex >= chain.length) {
      pointers.delete(bestFrom);
    } else {
      pointers.set(bestFrom, nextIndex);
    }
  }

  return selected;
}

function applyUserTxs(txs, ledger, meta, feeRecipient, genesisOperatorAddress, genesisFreeBlocks, height, avgWindowBlocks) {
  const applied = [];
  const cachedNonce = new Map();
  const cachedBalance = new Map();
  let genesisFreeUsed = String(meta.genesisFreeUsed || '0') === '1';

  for (const tx of txs) {
    if (!tx.type) continue;
    const amount = BigInt(tx.amountMicro || '0');
    const fee = BigInt(tx.feeMicro || '0');
    if (amount < 0n || fee < 0n) continue;

    const from = tx.from;
    const to = tx.to;
    const signer = tx.signer || tx.from;
    const expectedNonce = cachedNonce.has(signer)
      ? cachedNonce.get(signer)
      : getNonce(ledger, signer);
    const txNonce = BigInt(tx.nonce || '0');
    if (txNonce !== expectedNonce) continue;

    const currentBalance = cachedBalance.has(signer)
      ? cachedBalance.get(signer)
      : getBalanceUnits(ledger, signer);
    let total = amount + fee;
    let bondMicro = 0n;
    let isGenesisFree = false;
    if (tx.type === 'register_participant') {
      const withinFreeWindow = genesisFreeBlocks > 0 && height < BigInt(genesisFreeBlocks);
      if (
        !genesisFreeUsed
        && withinFreeWindow
        && genesisOperatorAddress
        && tx.from === genesisOperatorAddress
        && tx.participant === tx.from
      ) {
        bondMicro = 0n;
        isGenesisFree = true;
      } else {
        bondMicro = PARTICIPANT_BOND_MICRO;
      }
    }
    total += bondMicro;
    if (currentBalance < total) continue;

    const nextBalance = currentBalance - total;
    cachedBalance.set(signer, nextBalance);
    setBalanceWithHistory(ledger, signer, nextBalance, height, avgWindowBlocks);

    if (ledger.participants?.[from]) {
      ledger.participants[from].lastSeenHeight = height.toString();
    }

    if (tx.type === 'transfer') {
      if (!from || !to || amount <= 0n) continue;
      creditBalance(ledger, to, amount, height, avgWindowBlocks);
      if (fee > 0n && feeRecipient) creditBalance(ledger, feeRecipient, fee, height, avgWindowBlocks);
    }

    if (tx.type === 'register_participant') {
      const participant = tx.participant;
      if (!participant) continue;
      if (isGenesisFree && participant !== signer) continue;
      if (ledger.participants?.[participant]) continue;
      const active = getActiveParticipants(ledger, height, ACTIVE_WINDOW_BLOCKS);
      const sponsorActive = active.filter((addr) => {
        const record = ledger.participants?.[addr];
        return record && record.sponsor === signer;
      }).length;
      if (sponsorActive >= MAX_SPONSORED_PARTICIPANTS) continue;
      if (!ledger.participants) ledger.participants = {};
      ledger.participants[participant] = {
        sponsor: signer,
        bondMicro: bondMicro.toString(),
        registeredHeight: height.toString(),
        lastSeenHeight: height.toString()
      };
      if (isGenesisFree) {
        genesisFreeUsed = true;
        meta.genesisFreeUsed = '1';
      }
      if (fee > 0n && feeRecipient) creditBalance(ledger, feeRecipient, fee, height, avgWindowBlocks);
    }

    if (tx.type === 'unregister_participant') {
      if (!from) continue;
      const record = ledger.participants?.[from];
      if (!record) continue;
      const sponsor = record.sponsor;
      const bond = BigInt(record.bondMicro || '0');
      delete ledger.participants[from];
      if (bond > 0n && sponsor) creditBalance(ledger, sponsor, bond, height, avgWindowBlocks);
      if (fee > 0n && feeRecipient) creditBalance(ledger, feeRecipient, fee, height, avgWindowBlocks);
    }

    if (tx.type === 'heartbeat') {
      if (!from) continue;
      if (fee > 0n && feeRecipient) creditBalance(ledger, feeRecipient, fee, height, avgWindowBlocks);
    }

    const nextNonce = expectedNonce + 1n;
    cachedNonce.set(signer, nextNonce);
    setNonce(ledger, signer, nextNonce);

    applied.push({
      id: tx.txid || tx.id,
      txid: tx.txid || tx.id,
      type: tx.type,
      from,
      to,
      amountMicro: amount.toString(),
      feeMicro: fee.toString(),
      bondMicro: bondMicro.toString(),
      nonce: tx.nonce,
      chainId: tx.chainId,
      publicKeyHex: tx.publicKeyHex,
      signatureHex: tx.signatureHex,
      sponsor: tx.sponsor || '',
      participant: tx.participant || '',
      memo: tx.memo || '',
      timestamp: tx.timestamp
    });
  }

  return applied;
}

function getBlockTransactions(block) {
  if (Array.isArray(block.transactions)) {
    return block.transactions.map((tx) => ({
      ...tx,
      amountMicro: tx.amountMicro ?? tx.amountBaseUnits ?? '0',
      feeMicro: tx.feeMicro ?? tx.feeBaseUnits ?? '0'
    }));
  }
  if (block.rewardBaseUnits && block.rewardBaseUnits !== '0') {
    return [{
      id: `legacy-${block.height}`,
      txid: `legacy-${block.height}`,
      type: 'reward',
      from: null,
      to: block.rewardTo || null,
      amountMicro: block.rewardBaseUnits,
      feeMicro: '0',
      timestamp: block.timestamp
    }];
  }
  return [];
}

function calculateNextBaseFee(prevBaseFee, gasUsed, gasTarget, changeDenominator, minBaseFee) {
  if (gasTarget <= 0n) return prevBaseFee;
  if (changeDenominator <= 0n) return prevBaseFee;
  if (prevBaseFee < minBaseFee) prevBaseFee = minBaseFee;

  const delta = gasUsed - gasTarget;
  if (delta === 0n) return prevBaseFee;

  const change = (prevBaseFee * delta) / gasTarget / changeDenominator;
  const next = prevBaseFee + change;
  return next < minBaseFee ? minBaseFee : next;
}

function computeChainStats(blocks, decimals) {
  let totalTransactions = 0;
  let totalFeesMicro = 0n;
  const addresses = new Set();

  for (const block of blocks) {
    const txs = getBlockTransactions(block);
    totalTransactions += txs.length;
    for (const tx of txs) {
      if (tx.from) addresses.add(tx.from);
      if (tx.to) addresses.add(tx.to);
      if (tx.feeMicro) totalFeesMicro += BigInt(tx.feeMicro);
    }
  }

  const averageFeeMicro = totalTransactions
    ? totalFeesMicro / BigInt(totalTransactions)
    : 0n;

  return {
    totalTransactions,
    averageFeeMicro,
    totalAddresses: addresses.size,
    addresses: Array.from(addresses)
  };
}

function validateGenesis(config, genesis, genesisHash, blocks) {
  if (genesis.chainId !== config.chain.chainId) {
    throw new Error('Genesis chainId mismatch.');
  }
  if (genesis.protocolVersion !== config.chain.protocolVersion) {
    throw new Error('Genesis protocolVersion mismatch.');
  }
  if (genesis.economicsVersion !== config.chain.economicsVersion) {
    throw new Error('Genesis economicsVersion mismatch.');
  }
  if (genesis.genesisHash && genesis.genesisHash !== genesisHash) {
    throw new Error('Genesis hash mismatch.');
  }
  if (blocks.length) {
    const first = blocks[0];
    if (first.genesisHash !== genesisHash) {
      throw new Error('Existing chain data has different genesis hash.');
    }
    if (first.chainId !== config.chain.chainId) {
      throw new Error('Existing chain data has different chainId.');
    }
    if (first.protocolVersion !== config.chain.protocolVersion) {
      throw new Error('Existing chain data has different protocolVersion.');
    }
    if (first.economicsVersion !== config.chain.economicsVersion) {
      throw new Error('Existing chain data has different economicsVersion.');
    }
  }
}

module.exports = { createBlockchain };
