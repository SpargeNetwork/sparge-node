(function initRewardDistribution(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.SpargeRewardDistribution = api;
}(typeof window !== 'undefined' ? window : globalThis, () => {
  const BPS = 10_000n;

  function asUnits(value) {
    try {
      return BigInt(value ?? '0');
    } catch {
      return 0n;
    }
  }

  function txUnits(transactions, type) {
    return transactions
      .filter((tx) => tx?.type === type)
      .reduce((sum, tx) => sum + asUnits(tx.amountMicro ?? tx.amountBaseUnits), 0n);
  }

  function txAddress(transactions, type) {
    return transactions.find((tx) => tx?.type === type)?.to || '';
  }

  function calculate(block) {
    const transactions = Array.isArray(block?.transactions) ? block.transactions : [];
    const headerPayload = (() => {
      try {
        return block?.header ? JSON.parse(block.header).payload || {} : {};
      } catch {
        return {};
      }
    })();
    const mintUnits = asUnits(block?.mintUnits ?? block?.payload?.mintUnits ?? headerPayload.mintUnits);
    const participantPool = (mintUnits * 1500n) / BPS;
    const nodePool = (mintUnits * 7000n) / BPS;
    let treasuryBase = (mintUnits * 1000n) / BPS;
    const holderPool = (mintUnits * 500n) / BPS;
    treasuryBase += mintUnits - participantPool - nodePool - treasuryBase - holderPool;

    const participantPaid = txUnits(transactions, 'participant_reward');
    const participantRemainder = participantPool > participantPaid ? participantPool - participantPaid : 0n;
    const treasury = treasuryBase + participantRemainder;
    const accounted = participantPaid + nodePool + treasury + holderPool;

    return {
      mintUnits,
      mintRatePpm: asUnits(block?.mintRatePpm ?? block?.payload?.ratePpm ?? headerPayload.ratePpm),
      participantPool,
      participantPaid,
      participantRemainder,
      participantRecipients: transactions.filter((tx) => tx?.type === 'participant_reward').length,
      nodePool,
      treasury,
      holderPool,
      accounted,
      balanced: accounted === mintUnits,
      addresses: {
        nodePool: txAddress(transactions, 'node_pool_accrual'),
        treasury: txAddress(transactions, 'treasury_reward'),
        holderPool: txAddress(transactions, 'holder_pool_accrual')
      }
    };
  }

  return { calculate };
}));
