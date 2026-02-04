const path = require('path');
const crypto = require('crypto');
const fs = require('fs');
const { appendBlock, loadBlocks, getLatestBlock, ensureDir, getBlocksPage } = require('./storage');
const { toBaseUnits, formatTokens } = require('./units');
const { loadLedger, saveLedger, getBalanceUnits, setBalanceUnits, setStakeUnits, getNonce, setNonce } = require('./ledger');
const { ensureGenesis } = require('./genesis');
const { ACTIVE_WINDOW_BLOCKS, MAX_SPONSORED_PARTICIPANTS, PARTICIPANT_BOND_MICRO } = require('./participants');

const MICRO = 1_000_000n;
const PPM = 1_000_000n;
const BPS_DENOM = 10_000n;
const YEAR_SECONDS = 31_536_000n;

function sha256(input) {
  return crypto.createHash('sha256').update(input).digest('hex');
}

function getMetaPath(dataDir) {
  return path.join(dataDir, 'meta.json');
}

function loadMeta(dataDir) {
  const metaPath = getMetaPath(dataDir);
  if (!fs.existsSync(metaPath)) return null;
  const raw = fs.readFileSync(metaPath, 'utf8');
  if (!raw.trim()) return null;
  return JSON.parse(raw);
}

function saveMeta(dataDir, meta) {
  const metaPath = getMetaPath(dataDir);
  const tmpPath = `${metaPath}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(meta, null, 2), 'utf8');
  fs.renameSync(tmpPath, metaPath);
}

function createGenesisBlock(config, genesisHash) {
  const timestamp = new Date().toISOString();
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

function createBlockchain(config, mempool) {
  const dataDir = path.join(__dirname, '..', 'data');
  ensureDir(dataDir);
  const { genesis, genesisHash } = ensureGenesis(dataDir, config);

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

  let meta = loadMeta(dataDir);
  let blocks = loadBlocks(dataDir);
  let ledger = loadLedger(dataDir);

  validateGenesis(config, genesis, genesisHash, blocks);

  if (!blocks.length) {
    const genesis = createGenesisBlock(config, genesisHash);
    appendBlock(dataDir, config.storage.blocksPerFile, genesis);
    blocks = [genesis];
    meta = {
      latestHeight: 0,
      latestHash: genesis.hash,
      totalSupplyUnits: initialSupplyUnits.toString(),
      totalMintedUnits: '0',
      mintAcc: '0',
      baseFeeBaseUnits: baseFeeInitial.toString(),
      nodePoolUnits: '0',
      holderPoolUnits: '0',
      lastPayoutHeight: 0
    };
    saveMeta(dataDir, meta);
  }

  if (!ledger.participants || Object.keys(ledger.participants).length === 0) {
    const genesisParticipant = config.mining.proposerAddress;
    if (!ledger.participants) ledger.participants = {};
    ledger.participants[genesisParticipant] = {
      sponsor: genesisParticipant,
      bondMicro: '0',
      registeredHeight: '0',
      lastSeenHeight: '0'
    };
    saveLedger(dataDir, ledger);
  }

  if (!meta) {
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
    saveMeta(dataDir, meta);
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
  saveMeta(dataDir, meta);

  function getState() {
    const blocks = loadBlocks(dataDir);
    const latest = blocks.length ? blocks[blocks.length - 1] : null;
    const stats = computeChainStats(blocks, decimals);
    const height = BigInt(meta.latestHeight || 0);
    const activeParticipants = getActiveParticipants(ledger, height, ACTIVE_WINDOW_BLOCKS);
    const totalRegisteredParticipants = Object.keys(ledger.participants || {}).length;
    const lastPayoutHeight = BigInt(meta.lastPayoutHeight || 0);
    const sincePayout = height >= lastPayoutHeight ? height - lastPayoutHeight : 0n;
    const blocksUntilPayout = sincePayout >= blocksPer14Days
      ? 0
      : Number(blocksPer14Days - sincePayout);
    return {
      chainId: config.chain.chainId,
      protocolVersion: config.chain.protocolVersion,
      economicsVersion: config.chain.economicsVersion,
      genesisHash,
      chain: config.chain.name,
      symbol: config.chain.symbol,
      blockTimeSeconds: config.chain.blockTimeSeconds,
      proposerAddress: config.mining.proposerAddress,
      treasuryAddress: config.rewards?.treasuryAddress || '',
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
      totalAddresses: stats.totalAddresses,
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
      gasTarget,
      gasBlockLimit
    };
  }

  function canMint() {
    return true;
  }

  function mineNextBlock() {
    const latest = getLatestBlock(dataDir, config.storage.blocksPerFile);
    const height = latest ? latest.height + 1 : 0;
    const timestamp = new Date().toISOString();

    const prevBaseFee = BigInt(meta.baseFeeBaseUnits || '0');
    const selected = mempool
      ? selectMempoolTxs(mempool, ledger, gasBlockLimit)
      : [];

    const userTxs = applyUserTxs(selected, ledger, config.mining.proposerAddress, BigInt(height), blocksPer14Days);

    const mintContext = mintAndDistribute(
      BigInt(height),
      timestamp,
      config,
      meta,
      ledger,
      blocksPerYear,
      blocksPer14Days
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

    appendBlock(dataDir, config.storage.blocksPerFile, block);

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

    saveMeta(dataDir, meta);
    saveLedger(dataDir, ledger);
    return block;
  }

  function getBlocks(offset, limit) {
    return getBlocksPage(dataDir, config.storage.blocksPerFile, offset, limit);
  }

  return {
    getState,
    canMint,
    mineNextBlock,
    checkInvariants() {
      const errors = [];
      const warnings = [];
      const blocks = loadBlocks(dataDir);
      const participants = {};
      const genesisParticipant = config.mining.proposerAddress;
      participants[genesisParticipant] = {
        sponsor: genesisParticipant,
        bondMicro: '0',
        registeredHeight: '0',
        lastSeenHeight: '0'
      };
      const lastNonce = new Map();

      for (const block of blocks) {
        const height = BigInt(block.height || 0);
        const txs = getBlockTransactions(block);
        const mintUnits = BigInt(block.mintUnits || '0');
        const participantUnits = (mintUnits * 1500n) / BPS_DENOM;
        const nodePoolAdd = (mintUnits * 7000n) / BPS_DENOM;
        let treasuryUnits = (mintUnits * 1000n) / BPS_DENOM;
        const holderPoolAdd = (mintUnits * 500n) / BPS_DENOM;
        const distributed = participantUnits + nodePoolAdd + treasuryUnits + holderPoolAdd;
        const remainder = mintUnits - distributed;
        treasuryUnits += remainder;

        const active = getActiveParticipants({ participants }, height, ACTIVE_WINDOW_BLOCKS);
        const activeSorted = active.slice().sort((a, b) => a.localeCompare(b));
        if (active.join('|') !== activeSorted.join('|')) {
          errors.push(`height ${block.height}: active participants not sorted`);
        }

        const sponsorCounts = new Map();
        for (const address of active) {
          const sponsor = participants[address]?.sponsor || '';
          sponsorCounts.set(sponsor, (sponsorCounts.get(sponsor) || 0) + 1);
        }
        for (const [sponsor, count] of sponsorCounts.entries()) {
          if (count > MAX_SPONSORED_PARTICIPANTS) {
            errors.push(`height ${block.height}: sponsor cap exceeded for ${sponsor} (${count})`);
          }
        }

        const participantRewards = txs.filter((tx) => tx.type === 'participant_reward');
        const participantSum = participantRewards.reduce((sum, tx) => sum + BigInt(tx.amountMicro || '0'), 0n);
        const expectedShare = active.length ? participantUnits / BigInt(active.length) : 0n;
        const expectedSum = expectedShare * BigInt(active.length);
        const participantRemainder = participantUnits - expectedSum;
        if (participantSum !== expectedSum) {
          errors.push(`height ${block.height}: participant rewards sum mismatch`);
        }
        treasuryUnits += participantRemainder;

        const treasuryTx = txs.find((tx) => tx.type === 'treasury_reward');
        if (treasuryUnits > 0n) {
          if (!treasuryTx) {
            errors.push(`height ${block.height}: missing treasury reward`);
          } else if (BigInt(treasuryTx.amountMicro || '0') !== treasuryUnits) {
            errors.push(`height ${block.height}: treasury reward mismatch`);
          }
        }

        for (const tx of txs) {
          if (tx.amountMicro && BigInt(tx.amountMicro) < 0n) {
            errors.push(`height ${block.height}: negative amount`);
          }
          if (tx.feeMicro && BigInt(tx.feeMicro) < 0n) {
            errors.push(`height ${block.height}: negative fee`);
          }
          if (tx.from && tx.nonce !== undefined && tx.nonce !== null) {
            const nonce = BigInt(tx.nonce || '0');
            const prev = lastNonce.get(tx.from);
            if (prev !== undefined && nonce !== prev + 1n) {
              errors.push(`height ${block.height}: nonce jump for ${tx.from} (got ${nonce}, expected ${prev + 1n})`);
            }
            lastNonce.set(tx.from, nonce);
          }
          if (tx.type === 'register_participant') {
            const participant = tx.participant || '';
            if (participant) {
              participants[participant] = {
                sponsor: tx.from,
                bondMicro: String(PARTICIPANT_BOND_MICRO),
                registeredHeight: String(height),
                lastSeenHeight: String(height)
              };
            }
          }
          if (tx.type === 'unregister_participant') {
            delete participants[tx.from];
          }
          if (tx.type === 'heartbeat' || tx.type === 'transfer') {
            if (participants[tx.from]) {
              participants[tx.from].lastSeenHeight = String(height);
            }
          }
        }
      }

      for (const [address, value] of Object.entries(ledger.balances || {})) {
        if (BigInt(value) < 0n) {
          errors.push(`negative balance for ${address}`);
        }
      }

      return {
        ok: errors.length === 0,
        errors,
        warnings
      };
    },
    getBlocks,
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
      const all = loadBlocks(dataDir);
      return all.find((block) => block.height === height) || null;
    },
    getTxById(txid) {
      const all = loadBlocks(dataDir);
      for (const block of all) {
        if (!Array.isArray(block.transactions)) continue;
        const found = block.transactions.find((tx) => tx.id === txid || tx.txid === txid);
        if (found) return { ...found, blockHeight: block.height };
      }
      return null;
    },
    getAddressStats(address) {
      const balance = getBalanceUnits(ledger, address).toString();
      const nonce = getNonce(ledger, address).toString();
      const height = BigInt(meta.latestHeight || 0);
      const window = BigInt(blocksPer14Days);
      const startHeight = height >= window && window > 0n ? height - window + 1n : 0n;
      const history = ledger.balanceHistory?.[address] || [];
      const avgBalance = computeAverageBalance(history, BigInt(balance || '0'), startHeight, height);
      const avgEligible = avgBalance >= 1000n * MICRO;
      const participantRecord = ledger.participants?.[address] || null;
      let participant = null;
      if (participantRecord) {
        const lastSeen = BigInt(participantRecord.lastSeenHeight || '0');
        const isActive = height >= lastSeen
          ? height - lastSeen <= BigInt(ACTIVE_WINDOW_BLOCKS)
          : false;
        participant = {
          sponsor: participantRecord.sponsor || '',
          bondMicro: participantRecord.bondMicro || '0',
          lastSeenHeight: participantRecord.lastSeenHeight || '0',
          registeredHeight: participantRecord.registeredHeight || '0',
          status: isActive ? 'active' : 'inactive'
        };
      }
      const sponsored = Object.values(ledger.participants || {}).filter((record) => record.sponsor === address);
      const sponsoredActiveCount = sponsored.filter((record) => {
        try {
          const lastSeen = BigInt(record.lastSeenHeight || '0');
          return height >= lastSeen && height - lastSeen <= BigInt(ACTIVE_WINDOW_BLOCKS);
        } catch {
          return false;
        }
      }).length;
      const all = loadBlocks(dataDir);
      let txCount = 0;
      let firstSeen = null;
      let lastSeen = null;
      for (const block of all) {
        const txs = getBlockTransactions(block);
        for (const tx of txs) {
          if (tx.from === address || tx.to === address) {
            txCount += 1;
            if (!firstSeen) firstSeen = block.timestamp;
            lastSeen = block.timestamp;
          }
        }
      }
      return {
        address,
        balanceMicro: balance,
        avgBalanceMicro: avgBalance.toString(),
        avgEligible,
        nonce,
        txCount,
        firstSeen,
        lastSeen,
        participant,
        sponsoredActiveCount
      };
    },
    getAddressTxs(address, limit = 50) {
      const all = loadBlocks(dataDir);
      const items = [];
      for (let i = all.length - 1; i >= 0; i -= 1) {
        const block = all[i];
        const txs = getBlockTransactions(block);
        for (const tx of txs) {
          if (tx.from !== address && tx.to !== address) continue;
          items.push({
            txid: tx.txid ?? tx.id,
            from: tx.from || null,
            to: tx.to || null,
            amountMicro: tx.amountMicro ?? tx.amountBaseUnits ?? '0',
            feeMicro: tx.feeMicro ?? tx.feeBaseUnits ?? '0',
            timestamp: tx.timestamp || block.timestamp,
            blockHeight: block.height
          });
          if (items.length >= limit) return items;
        }
      }
      return items;
    },
    registerParticipant(address, sponsor, height, bondMicro) {
      if (!ledger.participants) ledger.participants = {};
      ledger.participants[address] = {
        sponsor,
        bondMicro: bondMicro.toString(),
        registeredHeight: height.toString(),
        lastSeenHeight: height.toString()
      };
      saveLedger(dataDir, ledger);
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
      saveLedger(dataDir, ledger);
    },
    setStakeUnits(address, amountUnits) {
      setStakeUnits(ledger, address, BigInt(amountUnits));
      saveLedger(dataDir, ledger);
    }
  };
}

function mintAndDistribute(height, timestamp, config, meta, ledger, blocksPerYear, blocksPer14Days) {
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
      blocksPer14Days
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
    treasuryAddress
  };
}

function payoutPools(ledger, nodePoolUnits, holderPoolUnits, treasuryAddress, height, timestamp, holderWindowBlocks) {
  const txs = [];
  let nodeRemaining = nodePoolUnits;
  let holderRemaining = holderPoolUnits;

  const stakeEntries = Object.entries(ledger.stakes || {})
    .map(([address, value]) => [address, BigInt(value)])
    .sort(([a], [b]) => a.localeCompare(b));
  const totalStake = stakeEntries.reduce((sum, [, value]) => sum + value, 0n);

  if (totalStake > 0n && nodePoolUnits > 0n) {
    let distributed = 0n;
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
    .filter(([, avg]) => avg >= 1000n * MICRO);
  const totalBalance = eligibleBalances.reduce((sum, [, avg]) => sum + avg, 0n);

  if (totalBalance > 0n && holderPoolUnits > 0n) {
    let distributed = 0n;
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
  if (!address) return;
  const current = getBalanceUnits(ledger, address);
  const next = current + amount;
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
      balance: BigInt(entry.balanceMicro || '0')
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

  if (selected.length) {
    mempool.removeByIds(selected.map((tx) => tx.id));
  }
  return selected;
}

function applyUserTxs(txs, ledger, feeRecipient, height, avgWindowBlocks) {
  const applied = [];
  const cachedNonce = new Map();
  const cachedBalance = new Map();

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
    const bondMicro = tx.type === 'register_participant' ? PARTICIPANT_BOND_MICRO : 0n;
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
    totalAddresses: addresses.size
  };
}

function calculateStateRoot(ledger) {
  const balances = Object.entries(ledger.balances || {})
    .map(([address, value]) => [address, BigInt(value)])
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([address, value]) => `${address}:${value.toString()}`);
  const stakes = Object.entries(ledger.stakes || {})
    .map(([address, value]) => [address, BigInt(value)])
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([address, value]) => `${address}:${value.toString()}`);
  const participants = Object.entries(ledger.participants || {})
    .map(([address, record]) => {
      const sponsor = record.sponsor || '';
      const bond = record.bondMicro || '0';
      const registered = record.registeredHeight || '0';
      const lastSeen = record.lastSeenHeight || '0';
      return `${address}:${sponsor}:${bond}:${registered}:${lastSeen}`;
    })
    .sort((a, b) => a.localeCompare(b));
  const canonical = `balances|${balances.join('|')}|stakes|${stakes.join('|')}|participants|${participants.join('|')}`;
  return sha256(canonical);
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
