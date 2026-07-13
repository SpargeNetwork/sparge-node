const fs = require('fs');
const path = require('path');
const YAML = require('yaml');
const { normalizeSecurityConfig } = require('./requestSize');
const { normalizeRateLimitConfig } = require('./httpSecurity');
const { normalizeMempoolConfig } = require('./mempool');

const defaultConfigPath = path.join(__dirname, '..', '..', 'config', 'config.yml');
const configPath = process.env.CONFIG_PATH || defaultConfigPath;

function parseEnvBool(value) {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return null;
}

function parseBoolConfig(value, field, defaultValue) {
  if (value === undefined) return defaultValue;
  if (typeof value === 'boolean') return value;
  throw new Error(`${field} must be boolean`);
}

function parseNonNegativeIntegerConfig(value, field, defaultValue) {
  if (value === undefined) return defaultValue;
  if (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0) return value;
  if (typeof value === 'string' && /^(0|[1-9][0-9]*)$/.test(value.trim())) {
    const parsed = Number(value.trim());
    if (Number.isSafeInteger(parsed) && parsed >= 0) return parsed;
  }
  throw new Error(`${field} must be a non-negative safe integer`);
}

function normalizeInvariantConfig(config) {
  if (!config.invariants) config.invariants = {};
  const src = config.invariants;
  src.enabled = parseBoolConfig(src.enabled, 'invariants.enabled', true);
  src.fastChecksEveryBlock = parseBoolConfig(src.fastChecksEveryBlock, 'invariants.fastChecksEveryBlock', true);
  src.fullAuditOnStartup = parseBoolConfig(src.fullAuditOnStartup, 'invariants.fullAuditOnStartup', true);
  src.fullAuditIntervalBlocks = parseNonNegativeIntegerConfig(src.fullAuditIntervalBlocks, 'invariants.fullAuditIntervalBlocks', 0);
  src.stopMiningOnFailure = parseBoolConfig(src.stopMiningOnFailure, 'invariants.stopMiningOnFailure', true);
  return src;
}

function loadConfig() {
  const raw = fs.readFileSync(configPath, 'utf8');
  const parsed = YAML.parse(raw);

  if (!parsed || !parsed.chain || !parsed.token || !parsed.mining || !parsed.storage) {
    throw new Error('config.yml is missing required sections.');
  }

  if (!parsed.dev) parsed.dev = {};
  if (!parsed.observer) parsed.observer = {};
  if (parsed.observer.publicListingEnabled === undefined) parsed.observer.publicListingEnabled = false;
  if (parsed.observer.publicAlias === undefined) parsed.observer.publicAlias = '';
  if (parsed.observer.countryCode === undefined) parsed.observer.countryCode = '';
  if (!parsed.network) parsed.network = {};
  if (parsed.network.heartbeatIntervalSeconds === undefined) parsed.network.heartbeatIntervalSeconds = 60;
  if (parsed.network.observerOfflineAfterSeconds === undefined) parsed.network.observerOfflineAfterSeconds = 180;
  if (parsed.network.observerRetentionDays === undefined) parsed.network.observerRetentionDays = 180;
  if (parsed.network.publicObserverListEnabled === undefined) parsed.network.publicObserverListEnabled = true;
  if (!parsed.network.heartbeatRateLimit) {
    parsed.network.heartbeatRateLimit = { windowMs: 60000, max: 20 };
  }
  normalizeSecurityConfig(parsed);
  normalizeRateLimitConfig(parsed);
  normalizeMempoolConfig(parsed);
  normalizeInvariantConfig(parsed);
  const enableAdminOverride = parseEnvBool(process.env.DEV_ENABLE_ADMIN);
  if (enableAdminOverride !== null) {
    parsed.dev.enableAdmin = enableAdminOverride;
  }

  return parsed;
}

module.exports = { loadConfig, configPath };
