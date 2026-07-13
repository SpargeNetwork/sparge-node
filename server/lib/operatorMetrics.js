class RollingCounter {
  constructor(windowMs = 60000) {
    this.windowMs = windowMs;
    this.events = [];
  }

  add(count = 1, now = Date.now()) {
    this.events.push({ at: now, count });
    this.prune(now);
  }

  sum(now = Date.now()) {
    this.prune(now);
    return this.events.reduce((total, event) => total + event.count, 0);
  }

  prune(now = Date.now()) {
    const cutoff = now - this.windowMs;
    while (this.events.length && this.events[0].at < cutoff) this.events.shift();
  }
}

function summarizeLogEvent(record) {
  const height = record.blockHeight !== undefined && record.blockHeight !== null ? ` #${record.blockHeight}` : '';
  const event = record.event || 'event';
  if (event === 'block_mined') return `Block${height} mined`;
  if (event === 'rate_limit_triggered') return 'Rate limit triggered';
  if (event === 'observer_sync_completed') return 'Observer synced';
  if (event === 'observer_sync_progress') return 'Observer sync progress';
  if (event === 'invariant_check_failed') return `Invariant failure${record.errorCode ? `: ${record.errorCode}` : ''}`;
  if (event === 'transaction_rejected') return `Transaction rejected${record.errorCode ? `: ${record.errorCode}` : ''}`;
  if (event === 'transaction_accepted') return 'Transaction accepted';
  if (event === 'request_size_rejected') return 'Oversized request rejected';
  if (event === 'validation_failed') return 'Validation failure';
  return record.message || event;
}

function createOperatorMetrics() {
  const requests = new RollingCounter();
  const validationFailures = new RollingCounter();
  const rateLimited = new RollingCounter();
  const oversizedRequests = new RollingCounter();
  const recentEvents = [];
  let activeRequests = 0;
  const startedAt = Date.now();

  function pushRecent(record) {
    if (!record || !record.event) return;
    recentEvents.unshift({
      timestamp: record.timestamp || new Date().toISOString(),
      level: record.level || 'info',
      event: record.event,
      summary: summarizeLogEvent(record)
    });
    if (recentEvents.length > 25) recentEvents.pop();
  }

  function middleware(req, res, next) {
    activeRequests += 1;
    req.operatorMetrics = api;
    res.once('finish', () => {
      activeRequests = Math.max(0, activeRequests - 1);
      requests.add(1);
    });
    res.once('close', () => {
      if (!res.writableEnded) activeRequests = Math.max(0, activeRequests - 1);
    });
    next();
  }

  const api = {
    middleware,
    recordValidationFailure() { validationFailures.add(1); },
    recordRateLimited() { rateLimited.add(1); },
    recordOversizedRequest() { oversizedRequests.add(1); },
    recordLogEvent: pushRecent,
    snapshot(now = Date.now()) {
      return {
        startedAt: new Date(startedAt).toISOString(),
        uptimeSeconds: Math.floor((now - startedAt) / 1000),
        activeRequests,
        requestsPerMinute: requests.sum(now),
        validationFailuresPerMinute: validationFailures.sum(now),
        rateLimitedRequestsPerMinute: rateLimited.sum(now),
        oversizedRequestsPerMinute: oversizedRequests.sum(now),
        recentEvents: recentEvents.slice(0, 12)
      };
    }
  };

  return api;
}

module.exports = {
  createOperatorMetrics
};
