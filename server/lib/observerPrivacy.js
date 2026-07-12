const fs = require('fs');
const path = require('path');
const { isValidCountryCode } = require('./countries');

function parseEnvBool(value) {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return null;
}

function privacyPath(dataDir) {
  return path.join(dataDir, 'observer-privacy.json');
}

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function writeJsonAtomic(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmpPath = `${filePath}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(payload, null, 2), 'utf8');
  fs.renameSync(tmpPath, filePath);
}

function sanitizeAlias(value) {
  if (value === null || value === undefined || value === '') return '';
  if (typeof value !== 'string') throw new Error('publicAlias must be a string');
  const alias = value.trim();
  if (alias.length > 40) throw new Error('publicAlias must be <= 40 characters');
  if (Buffer.byteLength(alias, 'utf8') > 80) throw new Error('publicAlias must be <= 80 UTF-8 bytes');
  if (/[\x00-\x1F\x7F]/.test(alias)) throw new Error('publicAlias cannot contain control characters');
  if (/[<>]/.test(alias)) throw new Error('publicAlias cannot contain markup');
  if (/https?:\/\//i.test(alias) || /\bwww\./i.test(alias)) throw new Error('publicAlias cannot contain URLs');
  return alias;
}

function normalizePrivacy(input) {
  const src = input && typeof input === 'object' ? input : {};
  if (src.publicListingEnabled !== undefined && typeof src.publicListingEnabled !== 'boolean') {
    throw new Error('publicListingEnabled must be boolean');
  }
  const publicListingEnabled = src.publicListingEnabled === true;
  let publicAlias = '';
  let countryCode = '';
  if (publicListingEnabled) {
    publicAlias = sanitizeAlias(src.publicAlias || '');
    countryCode = typeof src.countryCode === 'string' ? src.countryCode.trim().toUpperCase() : '';
    if (countryCode && !isValidCountryCode(countryCode)) throw new Error('countryCode must be a supported ISO 3166-1 alpha-2 code');
  }
  return { publicListingEnabled, publicAlias, countryCode };
}

function getObserverPrivacySettings(config, dataDir) {
  const fileSettings = readJson(privacyPath(dataDir)) || {};
  const configured = {
    ...(config.observer || {}),
    ...fileSettings
  };

  const envEnabled = parseEnvBool(process.env.OBSERVER_PUBLIC_LISTING_ENABLED);
  if (envEnabled !== null) configured.publicListingEnabled = envEnabled;
  if (process.env.OBSERVER_PUBLIC_ALIAS !== undefined) configured.publicAlias = process.env.OBSERVER_PUBLIC_ALIAS;
  if (process.env.OBSERVER_COUNTRY_CODE !== undefined) configured.countryCode = process.env.OBSERVER_COUNTRY_CODE;

  return normalizePrivacy(configured);
}

function saveObserverPrivacySettings(dataDir, input) {
  const settings = normalizePrivacy(input);
  writeJsonAtomic(privacyPath(dataDir), settings);
  return settings;
}

module.exports = {
  normalizePrivacy,
  sanitizeAlias,
  getObserverPrivacySettings,
  saveObserverPrivacySettings
};
