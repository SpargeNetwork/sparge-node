const express = require('express');

const DEFAULT_LIMITS = {
  maxJsonBodyBytes: 32768,
  maxTransactionBodyBytes: 16384,
  maxHeartbeatBodyBytes: 4096,
  maxObserverSettingsBodyBytes: 4096,
  maxCommunityBodyBytes: 8192
};

const MIN_LIMIT_BYTES = 512;
const MAX_LIMIT_BYTES = 1024 * 1024;
const BODY_METHODS = new Set(['POST', 'PUT', 'PATCH']);
let lastOversizedLogAt = 0;

function parsePositiveSafeInteger(value, field) {
  if (typeof value === 'number') {
    if (Number.isSafeInteger(value) && value > 0) return value;
    throw new Error(`${field} must be a positive safe integer`);
  }
  if (typeof value === 'string' && /^(0|[1-9][0-9]*)$/.test(value.trim())) {
    const parsed = Number(value.trim());
    if (Number.isSafeInteger(parsed) && parsed > 0) return parsed;
  }
  throw new Error(`${field} must be a positive safe integer`);
}

function boundedLimit(value, field) {
  const parsed = parsePositiveSafeInteger(value, field);
  if (parsed < MIN_LIMIT_BYTES || parsed > MAX_LIMIT_BYTES) {
    throw new Error(`${field} must be between ${MIN_LIMIT_BYTES} and ${MAX_LIMIT_BYTES} bytes`);
  }
  return parsed;
}

function applyEnvOverride(security, key, envName) {
  if (process.env[envName] !== undefined) {
    security[key] = process.env[envName];
  }
}

function normalizeSecurityConfig(config) {
  if (!config.security) config.security = {};
  const security = config.security;
  applyEnvOverride(security, 'maxJsonBodyBytes', 'MAX_JSON_BODY_BYTES');
  applyEnvOverride(security, 'maxTransactionBodyBytes', 'MAX_TRANSACTION_BODY_BYTES');
  applyEnvOverride(security, 'maxHeartbeatBodyBytes', 'MAX_HEARTBEAT_BODY_BYTES');
  applyEnvOverride(security, 'maxObserverSettingsBodyBytes', 'MAX_OBSERVER_SETTINGS_BODY_BYTES');
  applyEnvOverride(security, 'maxCommunityBodyBytes', 'MAX_COMMUNITY_BODY_BYTES');

  for (const [key, defaultValue] of Object.entries(DEFAULT_LIMITS)) {
    if (security[key] === undefined) security[key] = defaultValue;
    security[key] = boundedLimit(security[key], `security.${key}`);
  }

  if (security.maxTransactionBodyBytes > security.maxJsonBodyBytes) {
    throw new Error('security.maxTransactionBodyBytes must be <= security.maxJsonBodyBytes');
  }
  if (security.maxHeartbeatBodyBytes > security.maxJsonBodyBytes) {
    throw new Error('security.maxHeartbeatBodyBytes must be <= security.maxJsonBodyBytes');
  }
  if (security.maxObserverSettingsBodyBytes > security.maxJsonBodyBytes) {
    throw new Error('security.maxObserverSettingsBodyBytes must be <= security.maxJsonBodyBytes');
  }
  if (security.maxCommunityBodyBytes > security.maxJsonBodyBytes) {
    throw new Error('security.maxCommunityBodyBytes must be <= security.maxJsonBodyBytes');
  }

  return security;
}

function getRequestBodyLimits(config) {
  const security = config?.security || DEFAULT_LIMITS;
  return {
    json: security.maxJsonBodyBytes,
    transaction: security.maxTransactionBodyBytes,
    heartbeat: security.maxHeartbeatBodyBytes,
    observerSettings: security.maxObserverSettingsBodyBytes,
    community: security.maxCommunityBodyBytes
  };
}

function payloadTooLarge(req, res) {
  res.status(413).json({
    error: 'PAYLOAD_TOO_LARGE',
    message: 'Request body exceeds the allowed size',
    requestId: req?.requestId
  });
}

function unsupportedContentType(req, res) {
  res.status(415).json({
    error: 'UNSUPPORTED_MEDIA_TYPE',
    message: 'Content-Type must be application/json',
    requestId: req?.requestId
  });
}

function logOversizedRequest(req, limitBytes, statusCode) {
  const now = Date.now();
  if (now - lastOversizedLogAt < 30000) return;
  lastOversizedLogAt = now;
  const declaredLength = req.headers['content-length'];
  if (req.operatorMetrics) req.operatorMetrics.recordOversizedRequest();
  if (!req.log) return;
  req.log.warn('request_size_rejected', {
    operation: 'request_size',
    route: req.path || req.originalUrl || req.url,
    method: req.method,
    statusCode,
    errorCode: 'PAYLOAD_TOO_LARGE',
    limitBytes,
    contentLength: declaredLength || null
  }, 'Request body rejected by size limit');
}

function logInvalidRequestBody(req, statusCode, errorCode) {
  if (req.operatorMetrics && errorCode === 'INVALID_JSON') req.operatorMetrics.recordValidationFailure();
  if (!req.log) return;
  req.log.warn('request_body_rejected', {
    operation: 'request_size',
    route: req.path || req.originalUrl || req.url,
    method: req.method,
    statusCode,
    errorCode
  }, 'Request body rejected');
}

function createContentLengthPrecheck(limitBytes) {
  return (req, res, next) => {
    if (!BODY_METHODS.has(req.method)) {
      next();
      return;
    }

    const raw = req.headers['content-length'];
    if (raw !== undefined) {
      if (!/^(0|[1-9][0-9]*)$/.test(String(raw))) {
        logInvalidRequestBody(req, 400, 'INVALID_CONTENT_LENGTH');
        res.status(400).json({
          error: 'INVALID_CONTENT_LENGTH',
          message: 'Invalid Content-Length header',
          requestId: req.requestId
        });
        return;
      }
      const declared = Number(raw);
      if (!Number.isSafeInteger(declared)) {
        logOversizedRequest(req, limitBytes, 413);
        payloadTooLarge(req, res);
        return;
      }
      if (declared > limitBytes) {
        logOversizedRequest(req, limitBytes, 413);
        payloadTooLarge(req, res);
        return;
      }
    }

    next();
  };
}

function requireJsonContentType(req, res, next) {
  if (!BODY_METHODS.has(req.method)) {
    next();
    return;
  }
  if (!req.is('application/json')) {
    logInvalidRequestBody(req, 415, 'UNSUPPORTED_MEDIA_TYPE');
    unsupportedContentType(req, res);
    return;
  }
  if (req.headers['content-encoding'] && String(req.headers['content-encoding']).toLowerCase() !== 'identity') {
    logInvalidRequestBody(req, 415, 'UNSUPPORTED_MEDIA_TYPE');
    unsupportedContentType(req, res);
    return;
  }
  next();
}

function createJsonBodyParser(limitBytes) {
  return [
    createContentLengthPrecheck(limitBytes),
    requireJsonContentType,
    express.json({
      limit: `${limitBytes}b`,
      strict: true,
      inflate: false,
      type: 'application/json'
    })
  ];
}

function requestSizeErrorHandler(err, req, res, next) {
  if (!err) {
    next();
    return;
  }
  if (err.type === 'entity.too.large') {
    logOversizedRequest(req, err.limit || null, 413);
    payloadTooLarge(req, res);
    return;
  }
  if (err.type === 'encoding.unsupported' || err.status === 415) {
    logInvalidRequestBody(req, 415, 'UNSUPPORTED_MEDIA_TYPE');
    unsupportedContentType(req, res);
    return;
  }
  if (err.type === 'entity.parse.failed') {
    logInvalidRequestBody(req, 400, 'INVALID_JSON');
    res.status(400).json({
      error: 'INVALID_JSON',
      message: 'Request body must be valid JSON',
      requestId: req.requestId
    });
    return;
  }
  next(err);
}

module.exports = {
  DEFAULT_LIMITS,
  normalizeSecurityConfig,
  getRequestBodyLimits,
  createContentLengthPrecheck,
  createJsonBodyParser,
  requestSizeErrorHandler
};
