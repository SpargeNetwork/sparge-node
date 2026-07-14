const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

const RANGE_OPTIONS = Object.freeze({
  '24h': { bucketMs: HOUR_MS, bucketCount: 24 },
  '7d': { bucketMs: DAY_MS, bucketCount: 7 },
  '30d': { bucketMs: DAY_MS, bucketCount: 30 }
});
const USER_TRANSACTION_TYPES = new Set(['transfer', 'register_participant', 'unregister_participant', 'heartbeat']);

function floorTime(value, bucketMs) {
  return Math.floor(value / bucketMs) * bucketMs;
}

function allTimeBucketMs(spanMs) {
  if (spanMs <= 2 * DAY_MS) return HOUR_MS;
  if (spanMs <= 180 * DAY_MS) return DAY_MS;
  if (spanMs <= 2 * 365 * DAY_MS) return 7 * DAY_MS;
  return Math.max(30 * DAY_MS, Math.ceil(spanMs / 120 / DAY_MS) * DAY_MS);
}

function buildTransactionSeries(blocks, range = '24h', nowMs = Date.now()) {
  if (!RANGE_OPTIONS[range] && range !== 'all') throw new Error('Unsupported transaction metrics range');
  const validBlocks = (Array.isArray(blocks) ? blocks : [])
    .map((block) => ({ block, time: new Date(block.timestamp).getTime() }))
    .filter((entry) => Number.isFinite(entry.time));

  let bucketMs;
  let startMs;
  let bucketCount;
  if (range === 'all') {
    const earliest = validBlocks.length ? Math.min(...validBlocks.map((entry) => entry.time)) : nowMs;
    bucketMs = allTimeBucketMs(Math.max(0, nowMs - earliest));
    startMs = floorTime(earliest, bucketMs);
    bucketCount = Math.max(1, Math.ceil((nowMs - startMs + 1) / bucketMs));
  } else {
    ({ bucketMs, bucketCount } = RANGE_OPTIONS[range]);
    const endMs = floorTime(nowMs, bucketMs) + bucketMs;
    startMs = endMs - (bucketCount * bucketMs);
  }

  const counts = Array.from({ length: bucketCount }, () => 0);
  for (const { block, time } of validBlocks) {
    const index = Math.floor((time - startMs) / bucketMs);
    if (index < 0 || index >= counts.length) continue;
    counts[index] += Array.isArray(block.transactions)
      ? block.transactions.length
      : Number(block.txCount || 0);
  }

  return {
    range,
    bucketSeconds: bucketMs / 1000,
    series: counts.map((count, index) => ({
      timestamp: new Date(startMs + (index * bucketMs)).toISOString(),
      count
    }))
  };
}

function recentUserTransactions(blocks, limit = 5) {
  const result = [];
  const ordered = Array.isArray(blocks) ? blocks : [];
  for (let blockIndex = ordered.length - 1; blockIndex >= 0 && result.length < limit; blockIndex -= 1) {
    const block = ordered[blockIndex];
    const transactions = Array.isArray(block.transactions) ? block.transactions : [];
    for (let txIndex = transactions.length - 1; txIndex >= 0 && result.length < limit; txIndex -= 1) {
      const tx = transactions[txIndex];
      if (!USER_TRANSACTION_TYPES.has(tx.type)) continue;
      result.push({
        txid: tx.txid || tx.id || '',
        type: tx.type,
        blockHeight: block.height,
        timestamp: tx.timestamp || block.timestamp
      });
    }
  }
  return result;
}

module.exports = { RANGE_OPTIONS, USER_TRANSACTION_TYPES, buildTransactionSeries, recentUserTransactions };
