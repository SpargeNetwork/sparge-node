function isLocalRequest(req) {
  const ip = req.ip || req.socket?.remoteAddress || '';
  return ip === '127.0.0.1'
    || ip === '::1'
    || ip === '::ffff:127.0.0.1';
}

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

function createRateLimiter(options) {
  const windowMs = Math.max(1000, Number(options?.windowMs) || 60000);
  const max = Math.max(1, Number(options?.max) || 600);
  const keyFn = options?.keyFn || ((req) => req.ip || 'unknown');
  const skip = options?.skip || (() => false);
  const buckets = new Map();

  return (req, res, next) => {
    if (skip(req)) {
      next();
      return;
    }

    const now = Date.now();
    const key = keyFn(req);
    const record = buckets.get(key);
    if (!record || record.expiresAt <= now) {
      buckets.set(key, { count: 1, expiresAt: now + windowMs });
      next();
      return;
    }

    record.count += 1;
    if (record.count > max) {
      const retryAfter = Math.max(1, Math.ceil((record.expiresAt - now) / 1000));
      res.setHeader('Retry-After', String(retryAfter));
      res.status(429).json({ error: 'rate limit exceeded' });
      return;
    }
    next();
  };
}

module.exports = {
  isLocalRequest,
  createCorsMiddleware,
  createRateLimiter
};
