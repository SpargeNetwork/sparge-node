const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const LEVELS = ['debug', 'info', 'warn', 'error', 'fatal'];
const LEVEL_WEIGHT = Object.fromEntries(LEVELS.map((level, index) => [level, index]));
const FORMATS = new Set(['json', 'pretty']);
const SAFE_REQUEST_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/;
const REDACTED = '[REDACTED]';
const DEFAULT_LOGGING_CONFIG = {
  level: 'info',
  format: 'pretty',
  directory: 'logs',
  fileEnabled: true,
  consoleEnabled: true,
  maxFileSizeBytes: 10 * 1024 * 1024,
  maxFiles: 10,
  redactSensitiveFields: true,
  logEmptyBlocks: false,
  includeStack: false
};
const SENSITIVE_FIELD_RE = /(privatekey|seed|mnemonic|password|secret|token|authorization|cookie|signature|rawtransaction|requestbody|hostname|computername|username|remoteaddress|^ip$|^nodeid$)/i;

function parseBool(value, field, defaultValue) {
  if (value === undefined || value === null || value === '') return defaultValue;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
    if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  }
  throw new Error(`${field} must be boolean`);
}

function parsePositiveInteger(value, field, defaultValue, max = Number.MAX_SAFE_INTEGER) {
  if (value === undefined || value === null || value === '') return defaultValue;
  const parsed = typeof value === 'number' ? value : Number(String(value).trim());
  if (Number.isSafeInteger(parsed) && parsed > 0 && parsed <= max) return parsed;
  throw new Error(`${field} must be a positive safe integer <= ${max}`);
}

function parseNonEmptyString(value, field, defaultValue) {
  if (value === undefined || value === null || value === '') return defaultValue;
  if (typeof value !== 'string') throw new Error(`${field} must be a string`);
  const trimmed = value.trim();
  if (!trimmed) throw new Error(`${field} must not be empty`);
  return trimmed;
}

function normalizeLoggingConfig(config) {
  if (!config.logging) config.logging = {};
  const src = config.logging;
  const out = {};
  out.level = parseNonEmptyString(process.env.LOG_LEVEL, 'LOG_LEVEL', src.level || DEFAULT_LOGGING_CONFIG.level).toLowerCase();
  if (!LEVELS.includes(out.level)) throw new Error('logging.level must be debug, info, warn, error, or fatal');
  out.format = parseNonEmptyString(process.env.LOG_FORMAT, 'LOG_FORMAT', src.format || DEFAULT_LOGGING_CONFIG.format).toLowerCase();
  if (!FORMATS.has(out.format)) throw new Error('logging.format must be json or pretty');
  out.directory = parseNonEmptyString(process.env.LOG_DIRECTORY, 'LOG_DIRECTORY', src.directory || DEFAULT_LOGGING_CONFIG.directory);
  if (path.isAbsolute(out.directory)) throw new Error('logging.directory must be relative to the data directory or process cwd');
  const normalizedDir = path.normalize(out.directory);
  if (normalizedDir.startsWith('..') || normalizedDir.includes(`..${path.sep}`)) {
    throw new Error('logging.directory must not contain path traversal');
  }
  out.directory = normalizedDir;
  out.fileEnabled = parseBool(process.env.LOG_FILE_ENABLED, 'LOG_FILE_ENABLED', parseBool(src.fileEnabled, 'logging.fileEnabled', DEFAULT_LOGGING_CONFIG.fileEnabled));
  out.consoleEnabled = parseBool(process.env.LOG_CONSOLE_ENABLED, 'LOG_CONSOLE_ENABLED', parseBool(src.consoleEnabled, 'logging.consoleEnabled', DEFAULT_LOGGING_CONFIG.consoleEnabled));
  out.maxFileSizeBytes = parsePositiveInteger(src.maxFileSizeBytes, 'logging.maxFileSizeBytes', DEFAULT_LOGGING_CONFIG.maxFileSizeBytes, 1024 * 1024 * 1024);
  out.maxFiles = parsePositiveInteger(src.maxFiles, 'logging.maxFiles', DEFAULT_LOGGING_CONFIG.maxFiles, 1000);
  out.redactSensitiveFields = parseBool(src.redactSensitiveFields, 'logging.redactSensitiveFields', DEFAULT_LOGGING_CONFIG.redactSensitiveFields);
  out.logEmptyBlocks = parseBool(src.logEmptyBlocks, 'logging.logEmptyBlocks', DEFAULT_LOGGING_CONFIG.logEmptyBlocks);
  out.includeStack = parseBool(src.includeStack, 'logging.includeStack', DEFAULT_LOGGING_CONFIG.includeStack);
  config.logging = out;
  return out;
}

function safeHashPrefix(value, length = 12) {
  if (!value) return '';
  return String(value).slice(0, length);
}

function generateRequestId() {
  return `req_${crypto.randomBytes(12).toString('hex')}`;
}

function safeRequestId(value) {
  if (typeof value !== 'string') return '';
  const trimmed = value.trim();
  return SAFE_REQUEST_ID_RE.test(trimmed) ? trimmed : '';
}

function serializeError(err, includeStack = false) {
  if (!err) return null;
  return {
    name: err.name || 'Error',
    message: err.message || String(err),
    code: err.code || err.errorCode || undefined,
    stack: includeStack ? err.stack : undefined,
    cause: err.cause ? serializeError(err.cause, false) : undefined
  };
}

function truncateValue(value, max = 512) {
  if (typeof value !== 'string') return value;
  if (value.length <= max) return value;
  return `${value.slice(0, max)}...`;
}

function redact(value, depth = 0, redactSensitiveFields = true) {
  if (!redactSensitiveFields) return value;
  if (depth > 6) return '[MAX_DEPTH]';
  if (value === null || value === undefined) return value;
  if (value instanceof Error) return serializeError(value, false);
  if (Array.isArray(value)) return value.slice(0, 50).map((item) => redact(item, depth + 1, redactSensitiveFields));
  if (typeof value !== 'object') return truncateValue(value);
  const out = {};
  for (const [key, item] of Object.entries(value).slice(0, 100)) {
    if (SENSITIVE_FIELD_RE.test(key)) {
      out[key] = REDACTED;
    } else {
      out[key] = redact(item, depth + 1, redactSensitiveFields);
    }
  }
  return out;
}

function formatPretty(record) {
  const parts = [
    record.timestamp,
    record.level.toUpperCase().padEnd(5),
    record.event ? `[${record.event}]` : '',
    record.message || ''
  ].filter(Boolean);
  const known = new Set(['timestamp', 'level', 'service', 'message', 'event']);
  const rest = Object.entries(record)
    .filter(([key, value]) => !known.has(key) && value !== undefined)
    .map(([key, value]) => `${key}=${typeof value === 'object' ? JSON.stringify(value) : value}`);
  return `${parts.join(' ')}${rest.length ? ` ${rest.join(' ')}` : ''}`;
}

class FileSink {
  constructor({ directory, filename = 'sparge-node.log', maxFileSizeBytes, maxFiles, cwd = process.cwd() }) {
    this.directory = path.resolve(cwd, directory);
    this.filename = filename;
    this.maxFileSizeBytes = maxFileSizeBytes;
    this.maxFiles = maxFiles;
    this.failures = 0;
    fs.mkdirSync(this.directory, { recursive: true, mode: 0o700 });
    this.filePath = path.join(this.directory, this.filename);
  }

  rotateIfNeeded() {
    try {
      const stat = fs.existsSync(this.filePath) ? fs.statSync(this.filePath) : null;
      if (!stat || stat.size < this.maxFileSizeBytes) return;
      for (let i = this.maxFiles - 1; i >= 1; i -= 1) {
        const src = `${this.filePath}.${i}`;
        const dest = `${this.filePath}.${i + 1}`;
        if (fs.existsSync(dest)) fs.rmSync(dest, { force: true });
        if (fs.existsSync(src)) fs.renameSync(src, dest);
      }
      const first = `${this.filePath}.1`;
      if (fs.existsSync(first)) fs.rmSync(first, { force: true });
      fs.renameSync(this.filePath, first);
      const extra = `${this.filePath}.${this.maxFiles + 1}`;
      if (fs.existsSync(extra)) fs.rmSync(extra, { force: true });
    } catch {
      this.failures += 1;
    }
  }

  write(line) {
    try {
      this.rotateIfNeeded();
      fs.appendFileSync(this.filePath, `${line}\n`, { encoding: 'utf8', mode: 0o600 });
      this.failures = 0;
    } catch {
      this.failures += 1;
    }
  }
}

function createLogger(config = {}, context = {}, options = {}) {
  const logging = config.logging || DEFAULT_LOGGING_CONFIG;
  const level = logging.level || DEFAULT_LOGGING_CONFIG.level;
  const format = logging.format || DEFAULT_LOGGING_CONFIG.format;
  const consoleEnabled = logging.consoleEnabled !== false;
  const fileEnabled = logging.fileEnabled === true;
  const fileSink = options.fileSink || (fileEnabled
    ? new FileSink({
        directory: logging.directory || DEFAULT_LOGGING_CONFIG.directory,
        maxFileSizeBytes: logging.maxFileSizeBytes || DEFAULT_LOGGING_CONFIG.maxFileSizeBytes,
        maxFiles: logging.maxFiles || DEFAULT_LOGGING_CONFIG.maxFiles,
        cwd: options.cwd || process.cwd()
      })
    : null);
  const baseContext = {
    service: 'sparge-node',
    ...context
  };
  const records = options.records || null;

  function shouldLog(entryLevel) {
    return LEVEL_WEIGHT[entryLevel] >= LEVEL_WEIGHT[level];
  }

  function write(entryLevel, event, fields = {}, message = '') {
    if (!shouldLog(entryLevel)) return;
    const err = fields.error instanceof Error ? fields.error : null;
    const record = redact({
      timestamp: new Date().toISOString(),
      level: entryLevel,
      ...baseContext,
      ...fields,
      event,
      message: message || fields.message || event,
      error: err ? serializeError(err, logging.includeStack === true) : fields.error
    }, 0, logging.redactSensitiveFields !== false);
    const json = JSON.stringify(record);
    const line = format === 'json' ? json : formatPretty(record);
    if (records) records.push(record);
    if (typeof options.eventSink === 'function') {
      try {
        options.eventSink(record);
      } catch {
        // Observability hooks must never change node behavior.
      }
    }
    if (consoleEnabled) {
      const writer = entryLevel === 'fatal' || entryLevel === 'error'
        ? console.error
        : entryLevel === 'warn'
          ? console.warn
          : console.log;
      writer(line);
    }
    if (fileSink) {
      try {
        fileSink.write(json);
      } catch {
        // Logging must never change node behavior.
      }
    }
  }

  const logger = {
    child(extra = {}) {
      return createLogger({ logging }, { ...baseContext, ...extra }, { ...options, fileSink, records });
    },
    debug(event, fields = {}, message = '') { write('debug', event, fields, message); },
    info(event, fields = {}, message = '') { write('info', event, fields, message); },
    warn(event, fields = {}, message = '') { write('warn', event, fields, message); },
    error(event, fields = {}, message = '') { write('error', event, fields, message); },
    fatal(event, fields = {}, message = '') { write('fatal', event, fields, message); },
    level,
    format,
    fileSink
  };
  return logger;
}

function createRequestIdMiddleware(logger) {
  return (req, res, next) => {
    const incoming = req.get('X-Request-ID') || req.get('X-Correlation-ID') || '';
    const requestId = safeRequestId(incoming) || generateRequestId();
    req.requestId = requestId;
    req.log = logger.child({ requestId });
    res.setHeader('X-Request-ID', requestId);
    next();
  };
}

function createHttpRequestLogger(logger) {
  return (req, res, next) => {
    const start = process.hrtime.bigint();
    const route = req.path || req.url || '';
    res.on('finish', () => {
      const durationMs = Number(process.hrtime.bigint() - start) / 1e6;
      const statusCode = res.statusCode;
      const responseSize = Number(res.getHeader('Content-Length') || 0) || undefined;
      const rateLimited = statusCode === 429;
      const level = statusCode >= 500 ? 'error' : statusCode >= 400 ? 'warn' : 'info';
      const log = req.log || logger;
      log[level]('http_request_completed', {
        operation: 'http_request',
        method: req.method,
        route,
        statusCode,
        durationMs: Number(durationMs.toFixed(2)),
        responseSize,
        rateLimited
      }, 'HTTP request completed');
    });
    next();
  };
}

module.exports = {
  LEVELS,
  SAFE_REQUEST_ID_RE,
  DEFAULT_LOGGING_CONFIG,
  normalizeLoggingConfig,
  createLogger,
  createRequestIdMiddleware,
  createHttpRequestLogger,
  safeRequestId,
  generateRequestId,
  serializeError,
  redact,
  safeHashPrefix,
  FileSink
};
