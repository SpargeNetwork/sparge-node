const fs = require('fs');
const path = require('path');
const YAML = require('yaml');

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
  const enableAdminOverride = parseEnvBool(process.env.DEV_ENABLE_ADMIN);
  if (enableAdminOverride !== null) {
    parsed.dev.enableAdmin = enableAdminOverride;
  }

  return parsed;
}

module.exports = { loadConfig, configPath };
