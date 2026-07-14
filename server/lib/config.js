const fs = require('fs');
const path = require('path');
const YAML = require('yaml');
const { normalizeSecurityConfig } = require('./requestSize');
const { normalizeRateLimitConfig } = require('./httpSecurity');
const { normalizeMempoolConfig } = require('./mempool');
const { normalizeLoggingConfig } = require('./logger');
const { normalizeParticipantRewardRamp, normalizeParticipationConfig } = require('./participantRewards');
const { normalizeCommunityIdentityConfig } = require('../community/config');
const { normalizeObserverDownloadsConfig } = require('./observerDownloads');

const defaultConfigPath = path.join(__dirname, '..', '..', 'config', 'config.yml');
const configPath = process.env.CONFIG_PATH || defaultConfigPath;

function parseEnvBool(value) {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return null;
}

function parseTrustProxyEnv(value) {
  if (typeof value !== 'string' || value.trim() === '') return null;
  const normalized = value.trim().toLowerCase();
  if (/^(0|[1-9][0-9]*)$/.test(normalized)) {
    const parsed = Number(normalized);
    if (Number.isSafeInteger(parsed)) return parsed;
  }
  if (['true', 'yes', 'on'].includes(normalized)) return true;
  if (['false', 'no', 'off'].includes(normalized)) return false;
  return value.trim();
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

function normalizeOperatorDashboardConfig(config) {
  if (!config.operatorDashboard) config.operatorDashboard = {};
  const src = config.operatorDashboard;
  src.enabled = parseBoolConfig(src.enabled, 'operatorDashboard.enabled', false);
  src.bindLocalOnly = parseBoolConfig(src.bindLocalOnly, 'operatorDashboard.bindLocalOnly', true);
  const enabledOverride = parseEnvBool(process.env.OPERATOR_DASHBOARD_ENABLED);
  if (enabledOverride !== null) src.enabled = enabledOverride;
  const localOnlyOverride = parseEnvBool(process.env.OPERATOR_DASHBOARD_LOCAL_ONLY);
  if (localOnlyOverride !== null) src.bindLocalOnly = localOnlyOverride;
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
  normalizeOperatorDashboardConfig(parsed);
  normalizeLoggingConfig(parsed);
  normalizeParticipantRewardRamp(parsed);
  normalizeParticipationConfig(parsed);
  normalizeCommunityIdentityConfig(parsed);
  normalizeObserverDownloadsConfig(parsed);
  const enableAdminOverride = parseEnvBool(process.env.DEV_ENABLE_ADMIN);
  if (enableAdminOverride !== null) {
    parsed.dev.enableAdmin = enableAdminOverride;
  }
  const trustProxyOverride = parseTrustProxyEnv(process.env.SECURITY_TRUST_PROXY);
  if (trustProxyOverride !== null) {
    parsed.security.trustProxy = trustProxyOverride;
  }

  return parsed;
}

module.exports = { loadConfig, configPath };
