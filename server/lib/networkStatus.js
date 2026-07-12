function observerStatus(observer, producerHeight, producerHash, offlineAfterMs, now = Date.now()) {
  const lastSeen = Number(observer.lastSeen || 0);
  if (!lastSeen || now - lastSeen > offlineAfterMs) return 'offline';
  const height = Number(observer.height || 0);
  if (height === Number(producerHeight) && (observer.latestHash || '') !== (producerHash || '')) return 'mismatch';
  if (height === Number(producerHeight)) return 'fully_synced';
  return 'syncing';
}

function publicObserver(observer, status, producerHeight, now = Date.now()) {
  const height = Number(observer.height || 0);
  return {
    publicAlias: observer.publicAlias || '',
    countryCode: observer.countryCode || '',
    version: observer.version || '',
    height,
    lag: Math.max(0, Number(producerHeight || 0) - height),
    lastSeen: observer.lastSeen ? new Date(Number(observer.lastSeen)).toISOString() : null,
    secondsSinceLastSeen: Math.max(0, Math.floor((now - Number(observer.lastSeen || 0)) / 1000)),
    status
  };
}

function averageBlockTimeSeconds(blocks, fallback) {
  if (!Array.isArray(blocks) || blocks.length < 2) return fallback;
  const recent = blocks.slice(-50);
  const times = recent
    .map((block) => new Date(block.timestamp).getTime())
    .filter((time) => Number.isFinite(time))
    .sort((a, b) => a - b);
  if (times.length < 2) return fallback;
  return Math.round((times[times.length - 1] - times[0]) / 1000 / (times.length - 1));
}

function buildNetworkStatus(blockchain, storage, mempool, config, now = Date.now()) {
  const state = blockchain.getState();
  const producerHeight = Number(state.latestHeight || 0);
  const producerHash = state.latestHash || state.latestBlock?.hash || '';
  const offlineAfterMs = Number(config.network?.observerOfflineAfterSeconds ?? 180) * 1000;
  const all = storage.getAllObserverNodes ? storage.getAllObserverNodes() : [];
  const statuses = all.map((observer) => ({
    observer,
    status: observerStatus(observer, producerHeight, producerHash, offlineAfterMs, now)
  }));
  const active = statuses.filter((item) => item.status !== 'offline' && item.status !== 'mismatch');
  const heights = statuses.map((item) => Number(item.observer.height || 0)).filter((height) => Number.isFinite(height));
  const lags = active.map((item) => Math.max(0, producerHeight - Number(item.observer.height || 0)));
  const blocks = storage.getAllBlocks ? storage.getAllBlocks() : [];
  const latestBlock = state.latestBlock || blocks[blocks.length - 1] || null;

  return {
    producer: {
      online: true,
      count: 1,
      chainId: state.chainId,
      height: producerHeight,
      latestHash: producerHash
    },
    producerCount: 1,
    activeObserverCount: active.length,
    fullySyncedObserverCount: statuses.filter((item) => item.status === 'fully_synced').length,
    syncingObserverCount: statuses.filter((item) => item.status === 'syncing').length,
    mismatchObserverCount: statuses.filter((item) => item.status === 'mismatch').length,
    offlineObserverCount: statuses.filter((item) => item.status === 'offline').length,
    totalKnownObserverCount: statuses.length,
    currentHeight: producerHeight,
    highestObserverHeight: heights.length ? Math.max(...heights) : 0,
    lowestObserverHeight: heights.length ? Math.min(...heights) : 0,
    averageObserverLag: lags.length ? Number((lags.reduce((sum, lag) => sum + lag, 0) / lags.length).toFixed(2)) : 0,
    averageBlockTimeSeconds: averageBlockTimeSeconds(blocks, Number(state.blockTimeSeconds || 0)),
    lastBlockTimestamp: latestBlock?.timestamp || null,
    mempoolSize: mempool && typeof mempool.size === 'function' ? mempool.size() : 0,
    heartbeat: {
      intervalSeconds: Number(config.network?.heartbeatIntervalSeconds ?? 60),
      offlineAfterSeconds: Number(config.network?.observerOfflineAfterSeconds ?? 180)
    },
    note: 'Sparge Chain currently uses one official producer. Observer nodes independently sync and validate the chain state.'
  };
}

function buildObserverList(blockchain, storage, config, query, now = Date.now()) {
  const page = query.page;
  const limit = query.limit;
  const offset = (page - 1) * limit;
  const requestedStatus = query.status || '';
  const version = query.version || '';
  const countryCode = query.country || '';
  const state = blockchain.getState();
  const producerHeight = Number(state.latestHeight || 0);
  const producerHash = state.latestHash || state.latestBlock?.hash || '';
  const offlineAfterMs = Number(config.network?.observerOfflineAfterSeconds ?? 180) * 1000;
  const rows = storage.getAllObserverNodes ? storage.getAllObserverNodes() : [];
  let observers = rows
    .filter((observer) => observer.publicListingEnabled === true || observer.publicListingEnabled === 1)
    .map((observer) => {
    const status = observerStatus(observer, producerHeight, producerHash, offlineAfterMs, now);
    return publicObserver(observer, status, producerHeight, now);
  });

  if (requestedStatus) observers = observers.filter((observer) => observer.status === requestedStatus);
  if (version) observers = observers.filter((observer) => observer.version === version);
  if (countryCode) observers = observers.filter((observer) => observer.countryCode === countryCode);

  return {
    page,
    limit,
    total: observers.length,
    observers: observers.slice(offset, offset + limit)
  };
}

module.exports = {
  observerStatus,
  buildNetworkStatus,
  buildObserverList,
  averageBlockTimeSeconds
};
