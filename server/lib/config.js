const fs = require('fs');
const path = require('path');
const YAML = require('yaml');
const { normalizeSecurityConfig } = require('./requestSize');
const { normalizeRateLimitConfig } = require('./httpSecurity');

const defaultConfigPath = path.join(__dirname, '..', '..', 'config', 'config.yml');
const configPath = process.env.CONFIG_PATH || defaultConfigPath;

function parseEnvBool(value) {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return null;
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
  const enableAdminOverride = parseEnvBool(process.env.DEV_ENABLE_ADMIN);
  if (enableAdminOverride !== null) {
    parsed.dev.enableAdmin = enableAdminOverride;
  }

  return parsed;
}

module.exports = { loadConfig, configPath };
