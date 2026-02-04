const fs = require('fs');
const path = require('path');
const YAML = require('yaml');

const configPath = path.join(__dirname, '..', '..', 'config', 'config.yml');

function loadConfig() {
  const raw = fs.readFileSync(configPath, 'utf8');
  const parsed = YAML.parse(raw);

  if (!parsed || !parsed.chain || !parsed.token || !parsed.mining || !parsed.storage) {
    throw new Error('config.yml is missing required sections.');
  }

  return parsed;
}

module.exports = { loadConfig, configPath };