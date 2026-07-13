function isLocalRequest(req) {
  const ip = req.ip || req.socket?.remoteAddress || '';
  return ip === '127.0.0.1'
    || ip === '::1'
    || ip === '::ffff:127.0.0.1';
}

const DEFAULT_RATE_LIMITS = {
  enabled: true,
  global: { windowSeconds: 60, maxRequests: 300 },
  transaction: { windowSeconds: 60, maxRequestsPerIp: 10, maxConcurrentPerIp: 3 },
  heartbeat: { windowSeconds: 60, maxRequestsPerIp: 10, maxRequestsPerNodeId: 2 },
  observerSettings: { windowSeconds: 60, maxRequestsPerIp: 10 },
  addressHistory: { windowSeconds: 60, maxRequestsPerIp: 30 },
  blockAndTxLookup: { windowSeconds: 60, maxRequestsPerIp: 60 },
  publicRead: { windowSeconds: 60, maxRequestsPerIp: 120 },
  operator: { windowSeconds: 60, maxRequestsPerIp: 5 }
};

let lastRateLimitLogAt = 0;

function parseAllowedOrigins(config) {
  const envOrigins = (process.env.CORS_ALLOW_ORIGINS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (envOrigins.length > 0) return envOrigins;
  const cfg = config?.http?.corsAllowedOrigins;
  return Array.isArray(cfg) ? cfg.filter(Boolean) : [];
}

function createCorsMiddleware(config) {
  const allowedOrigins = new Set(parseAllowedOrigins(config));
  return (req, res, next) => {
    const origin = req.headers.origin;
    if (!origin) {
      next();
      return;
    }

    const requestOrigin = `${req.protocol}://${req.get('host')}`;
    const isSameOrigin = origin === requestOrigin;

    if (!isSameOrigin && !allowedOrigins.has(origin)) {
      res.status(403).json({ error: 'origin not allowed' });
      return;
    }

    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');

    if (req.method === 'OPTIONS') {
      res.sendStatus(204);
      return;
    }
    next();
  };
}

function asPositiveInteger(value, field, max = 1000000) {
  if (typeof value === 'number' && Number.isSafeInteger(value) && value > 0 && value <= max) return value;
  if (typeof value === 'string' && /^(0|[1-9][0-9]*)$/.test(value.trim())) {
    const parsed = Number(value.trim());
    if (Number.isSafeInteger(parsed) && parsed > 0 && parsed <= max) return parsed;
  }
  throw new Error(`${field} must be a positive safe integer <= ${max}`);
}

function normalizeLimitGroup(input, defaults, name) {
  const src = input && typeof input === 'object' ? input : {};
  const out = {};
  out.windowSeconds = asPositiveInteger(src.windowSeconds ?? defaults.windowSeconds, `security.rateLimits.${name}.windowSeconds`, 86400);
  for (const [key, value] of Object.entries(defaults)) {
    if (key === 'windowSeconds') continue;
    out[key] = asPositiveInteger(src[key] ?? value, `security.rateLimits.${name}.${key}`, 1000000);
  }
  return out;
}

function normalizeRateLimitConfig(config) {
  if (!config.security) config.security = {};
  const src = config.security.rateLimits || {};
  const enabled = src.enabled === undefined ? DEFAULT_RATE_LIMITS.enabled : src.enabled;
  if (typeof enabled !== 'boolean') throw new Error('security.rateLimits.enabled must be boolean');
  const out = { enabled };
  for (const [name, defaults] of Object.entries(DEFAULT_RATE_LIMITS)) {
    if (name === 'enabled') continue;
    out[name] = normalizeLimitGroup(src[name], defaults, name);
  }
  config.security.rateLimits = out;
  if (config.security.trustProxy === undefined) config.security.trustProxy = false;
  const trustProxy = config.security.trustProxy;
  if (!(trustProxy === false || trustProxy === true || Number.isSafeInteger(trustProxy) || typeof trustProxy === 'string')) {
    throw new Error('security.trustProxy must be false, true, a hop count, or a trusted proxy string');
  }
  return out;
}

function rateLimitResponse(res, retryAfter) {
  if (res.req?.operatorMetrics) res.req.operatorMetrics.recordRateLimited();
  res.setHeader('Retry-After', String(retryAfter));
  res.status(429).json({
    error: 'RATE_LIMITED',
    requestId: res.req?.requestId,
    message: 'Too many requests. Please try again later.',
    retryAfterSeconds: retryAfter
  });
}

function logRateLimited(req, group, retryAfter) {
  const now = Date.now();
  if (now - lastRateLimitLogAt < 30000) return;
  lastRateLimitLogAt = now;
  const log = req.log;
  const fields = {
    operation: 'rate_limit',
    method: req.method,
    route: req.path || req.url,
    group,
    statusCode: 429,
    retryAfterSeconds: retryAfter,
    rateLimited: true
  };
  if (log) log.warn('rate_limit_triggered', fields, 'Rate limit triggered');
}

function createRateLimiter(options = {}) {
  if (options.enabled === false) {
    return (req, res, next) => next();
  }
  const windowMs = Math.max(1000, Number(options.windowMs ?? (Number(options.windowSeconds) * 1000)) || 60000);
  const max = Math.max(1, Number(options.max ?? options.maxRequests ?? options.maxRequestsPerIp) || 600);
  const keyFn = options?.keyFn || ((req) => req.ip || 'unknown');
  const skip = options?.skip || (() => false);
  const group = options?.group || 'default';
  const buckets = new Map();
  let lastCleanup = 0;

  return (req, res, next) => {
    if (skip(req)) {
      next();
      return;
    }

    const now = Date.now();
    if (now - lastCleanup > windowMs) {
      for (const [key, record] of buckets.entries()) {
        if (record.expiresAt <= now) buckets.delete(key);
      }
      lastCleanup = now;
    }
    const key = keyFn(req);
    const record = buckets.get(key);
    const resetAt = record && record.expiresAt > now ? record.expiresAt : now + windowMs;
    const retryAfter = Math.max(1, Math.ceil((resetAt - now) / 1000));
    if (!record || record.expiresAt <= now) {
      buckets.set(key, { count: 1, expiresAt: now + windowMs });
      res.setHeader('RateLimit-Limit', String(max));
      res.setHeader('RateLimit-Remaining', String(Math.max(0, max - 1)));
      res.setHeader('RateLimit-Reset', String(Math.ceil((now + windowMs) / 1000)));
      next();
      return;
    }

    record.count += 1;
    if (record.count > max) {
      res.setHeader('RateLimit-Limit', String(max));
      res.setHeader('RateLimit-Remaining', '0');
      res.setHeader('RateLimit-Reset', String(Math.ceil(record.expiresAt / 1000)));
      logRateLimited(req, group, retryAfter);
      rateLimitResponse(res, retryAfter);
      return;
    }
    res.setHeader('RateLimit-Limit', String(max));
    res.setHeader('RateLimit-Remaining', String(Math.max(0, max - record.count)));
    res.setHeader('RateLimit-Reset', String(Math.ceil(record.expiresAt / 1000)));
    next();
  };
}

function createConcurrencyLimiter(options = {}) {
  if (options.enabled === false) return (req, res, next) => next();
  const max = Math.max(1, Number(options.maxConcurrentPerIp) || 3);
  const keyFn = options.keyFn || ((req) => req.ip || 'unknown');
  const skip = options.skip || (() => false);
  const group = options.group || 'concurrency';
  const inFlight = new Map();

  return (req, res, next) => {
    if (skip(req)) {
      next();
      return;
    }
    const key = keyFn(req);
    const current = inFlight.get(key) || 0;
    if (current >= max) {
      logRateLimited(req, group, 1);
      rateLimitResponse(res, 1);
      return;
    }
    inFlight.set(key, current + 1);
    let released = false;
    const release = () => {
      if (released) return;
      released = true;
      const value = inFlight.get(key) || 0;
      if (value <= 1) inFlight.delete(key);
      else inFlight.set(key, value - 1);
    };
    res.once('finish', release);
    res.once('close', release);
    next();
  };
}

module.exports = {
  isLocalRequest,
  createCorsMiddleware,
  createRateLimiter,
  createConcurrencyLimiter,
  normalizeRateLimitConfig,
  DEFAULT_RATE_LIMITS
};
