const { validationDetail } = require('./errors');
const { ISO_COUNTRY_CODES } = require('../countries');

const BASE58_RE = /^[1-9A-HJ-NP-Za-km-z]+$/;
const ADDRESS_RE = /^spg_[1-9A-HJ-NP-Za-km-z]{20,40}$/;
const CHAIN_ID_RE = /^[a-z0-9][a-z0-9-]{2,63}$/;
const HEX_64_RE = /^[0-9a-f]{64}$/;
const HEX_128_RE = /^[0-9a-f]{128}$/;
const NODE_ID_RE = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{7,127}$/;
const VERSION_RE = /^[a-zA-Z0-9._+-]{1,32}$/;
const INTEGER_RE = /^(0|[1-9][0-9]*)$/;
const TX_TYPES = new Set(['transfer', 'register_participant', 'unregister_participant', 'heartbeat']);
const OBSERVER_STATUSES = new Set(['fully_synced', 'syncing', 'mismatch', 'offline']);
const HEARTBEAT_FORBIDDEN_FIELDS = new Set(['hostname', 'computerName', 'deviceName', 'username', 'ip', 'remoteIp']);
const TX_FIELDS = new Set([
  'type',
  'chainId',
  'from',
  'to',
  'amountMicro',
  'feeMicro',
  'nonce',
  'publicKeyHex',
  'signatureHex',
  'sponsor',
  'participant',
  'memo'
]);
const HEARTBEAT_FIELDS = new Set([
  'nodeId',
  'nodeMode',
  'version',
  'height',
  'latestHash',
  'publicListingEnabled',
  'publicAlias',
  'countryCode'
]);
const OBSERVER_SETTINGS_FIELDS = new Set(['publicListingEnabled', 'publicAlias', 'countryCode']);

function pass(value) {
  return { ok: true, value };
}

function fail(field, reason) {
  return { ok: false, details: [validationDetail(field, reason)] };
}

function failMany(details) {
  return { ok: false, details };
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function unknownFieldDetails(input, allowed) {
  return Object.keys(input)
    .filter((key) => !allowed.has(key))
    .map((key) => validationDetail(key, 'Unknown field'));
}

function requirePlainObject(input) {
  if (!isPlainObject(input)) return [validationDetail('request', 'Expected an object')];
  return [];
}

function canonicalIntegerString(value, field, { max = Number.MAX_SAFE_INTEGER, allowZero = true } = {}) {
  if (typeof value !== 'string' || !INTEGER_RE.test(value)) {
    return { detail: validationDetail(field, 'Expected a canonical non-negative integer string') };
  }
  let big;
  try {
    big = BigInt(value);
  } catch (err) {
    return { detail: validationDetail(field, 'Expected a canonical non-negative integer string') };
  }
  if (!allowZero && big === 0n) return { detail: validationDetail(field, 'Expected a value greater than zero') };
  if (big > BigInt(max)) return { detail: validationDetail(field, 'Value is too large') };
  return { value };
}

function integerFromQuery(value, field, { defaultValue, min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
  if (value === undefined) return { value: defaultValue };
  if (typeof value !== 'string' || !INTEGER_RE.test(value)) {
    return { detail: validationDetail(field, 'Expected a canonical base-10 integer') };
  }
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < min || number > max) {
    return { detail: validationDetail(field, `Expected an integer between ${min} and ${max}`) };
  }
  return { value: number };
}

function heightValue(value, field = 'height') {
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value) || value < 0) return { detail: validationDetail(field, 'Expected a non-negative safe integer') };
    return { value };
  }
  return integerFromQuery(value, field, { min: 0, max: Number.MAX_SAFE_INTEGER });
}

function stringField(value, field, { min = 0, max, pattern, allowEmpty = true, reason = 'Invalid value' } = {}) {
  if (typeof value !== 'string') return { detail: validationDetail(field, 'Expected a string') };
  if (!allowEmpty && value.length === 0) return { detail: validationDetail(field, 'Required') };
  if (value.length < min || (max !== undefined && value.length > max)) {
    return { detail: validationDetail(field, `Expected length between ${min} and ${max}`) };
  }
  if (pattern && !pattern.test(value)) return { detail: validationDetail(field, reason) };
  return { value };
}

function utf8Bytes(value) {
  return Buffer.byteLength(value, 'utf8');
}

function byteLimit(value, field, maxBytes) {
  if (utf8Bytes(value) > maxBytes) {
    return validationDetail(field, `Expected UTF-8 length <= ${maxBytes} bytes`);
  }
  return null;
}

function optionalString(value, field, options) {
  if (value === undefined || value === null) return { value: '' };
  return stringField(value, field, options);
}

function address(value, field = 'address', { allowEmpty = false } = {}) {
  if (allowEmpty && value === '') return { value: '' };
  return stringField(value, field, {
    min: 24,
    max: 44,
    pattern: ADDRESS_RE,
    allowEmpty,
    reason: 'Expected a Sparge address'
  });
}

function hash64(value, field) {
  return stringField(value, field, {
    min: 64,
    max: 64,
    pattern: HEX_64_RE,
    allowEmpty: false,
    reason: 'Expected 64 lowercase hex characters'
  });
}

function optionalHash64(value, field) {
  if (value === '') return { value: '' };
  return hash64(value, field);
}

function publicAliasValue(value, field = 'publicAlias') {
  if (value === undefined || value === null || value === '') return { value: '' };
  if (typeof value !== 'string') return { detail: validationDetail(field, 'Expected a string') };
  const trimmed = value.trim();
  if (trimmed.length > 40) return { detail: validationDetail(field, 'Expected length <= 40') };
  const bytes = byteLimit(trimmed, field, 80);
  if (bytes) return { detail: bytes };
  if (/[\x00-\x1f\x7f]/.test(trimmed)) return { detail: validationDetail(field, 'Control characters and line breaks are not allowed') };
  if (/[<>]/.test(trimmed)) return { detail: validationDetail(field, 'Markup is not allowed') };
  if (/(?:https?:\/\/|www\.)/i.test(trimmed)) return { detail: validationDetail(field, 'URLs are not allowed') };
  if (/\bscript\b/i.test(trimmed)) return { detail: validationDetail(field, 'Script-like content is not allowed') };
  return { value: trimmed };
}

function countryCodeValue(value, field = 'countryCode') {
  if (value === undefined || value === null || value === '') return { value: '' };
  if (typeof value !== 'string') return { detail: validationDetail(field, 'Expected a string') };
  const normalized = value.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(normalized) || !ISO_COUNTRY_CODES.has(normalized)) {
    return { detail: validationDetail(field, 'Expected a supported ISO 3166-1 alpha-2 country code') };
  }
  return { value: normalized };
}

function addressParams(input) {
  const base = requirePlainObject(input);
  if (base.length) return failMany(base);
  const parsed = address(input.addr, 'addr');
  if (parsed.detail) return failMany([parsed.detail]);
  return pass({ addr: parsed.value });
}

function heightParams(input) {
  const base = requirePlainObject(input);
  if (base.length) return failMany(base);
  const parsed = heightValue(input.height, 'height');
  if (parsed.detail) return failMany([parsed.detail]);
  return pass({ height: parsed.value });
}

function txidParams(input) {
  const base = requirePlainObject(input);
  if (base.length) return failMany(base);
  const parsed = hash64(input.txid, 'txid');
  if (parsed.detail) return failMany([parsed.detail]);
  return pass({ txid: parsed.value });
}

function addressTxsQuery(input) {
  const base = requirePlainObject(input);
  if (base.length) return failMany(base);
  const unknown = unknownFieldDetails(input, new Set(['limit']));
  const limit = integerFromQuery(input.limit, 'limit', { defaultValue: 50, min: 1, max: 100 });
  const details = [...unknown];
  if (limit.detail) details.push(limit.detail);
  if (details.length) return failMany(details);
  return pass({ limit: limit.value });
}

function blocksQuery(input) {
  const base = requirePlainObject(input);
  if (base.length) return failMany(base);
  const syncMode = input.fromHeight !== undefined;
  const allowed = syncMode ? new Set(['fromHeight', 'limit']) : new Set(['page', 'limit']);
  const details = unknownFieldDetails(input, allowed);
  if (syncMode) {
    const fromHeight = integerFromQuery(input.fromHeight, 'fromHeight', { min: 0, max: Number.MAX_SAFE_INTEGER });
    const limit = integerFromQuery(input.limit, 'limit', { defaultValue: 50, min: 1, max: 200 });
    if (fromHeight.detail) details.push(fromHeight.detail);
    if (limit.detail) details.push(limit.detail);
    if (details.length) return failMany(details);
    return pass({ fromHeight: fromHeight.value, limit: limit.value });
  }
  const page = integerFromQuery(input.page, 'page', { defaultValue: 1, min: 1, max: Number.MAX_SAFE_INTEGER });
  const limit = integerFromQuery(input.limit, 'limit', { defaultValue: 10, min: 1, max: 50 });
  if (page.detail) details.push(page.detail);
  if (limit.detail) details.push(limit.detail);
  if (details.length) return failMany(details);
  return pass({ page: page.value, limit: limit.value });
}

function observerListQuery(input) {
  const base = requirePlainObject(input);
  if (base.length) return failMany(base);
  const details = unknownFieldDetails(input, new Set(['page', 'limit', 'status', 'version', 'country']));
  const page = integerFromQuery(input.page, 'page', { defaultValue: 1, min: 1, max: Number.MAX_SAFE_INTEGER });
  const limit = integerFromQuery(input.limit, 'limit', { defaultValue: 25, min: 1, max: 100 });
  if (page.detail) details.push(page.detail);
  if (limit.detail) details.push(limit.detail);

  let status = '';
  if (input.status !== undefined) {
    if (typeof input.status !== 'string' || !OBSERVER_STATUSES.has(input.status)) details.push(validationDetail('status', 'Unsupported observer status'));
    else status = input.status;
  }

  let version = '';
  if (input.version !== undefined) {
    const parsedVersion = stringField(input.version, 'version', { min: 1, max: 32, pattern: VERSION_RE, allowEmpty: false, reason: 'Invalid version' });
    if (parsedVersion.detail) details.push(parsedVersion.detail);
    else {
      const versionBytes = byteLimit(parsedVersion.value, 'version', 64);
      if (versionBytes) details.push(versionBytes);
      else version = parsedVersion.value;
    }
  }

  let country = '';
  if (input.country !== undefined) {
    const parsedCountry = countryCodeValue(input.country, 'country');
    if (parsedCountry.detail) details.push(parsedCountry.detail);
    else country = parsedCountry.value;
  }

  if (details.length) return failMany(details);
  return pass({ page: page.value, limit: limit.value, status, version, country });
}

function signedTxBody(input) {
  const base = requirePlainObject(input);
  if (base.length) return failMany(base);
  const details = unknownFieldDetails(input, TX_FIELDS);
  const type = stringField(input.type, 'type', { min: 1, max: 32, allowEmpty: false });
  if (type.detail) details.push(type.detail);
  else if (!TX_TYPES.has(type.value)) details.push(validationDetail('type', 'Unsupported transaction type'));

  const chainId = stringField(input.chainId, 'chainId', { min: 3, max: 64, pattern: CHAIN_ID_RE, allowEmpty: false, reason: 'Invalid chain ID' });
  const from = address(input.from, 'from');
  const to = address(input.to, 'to', { allowEmpty: true });
  const amountMicro = canonicalIntegerString(input.amountMicro, 'amountMicro', { max: '999999999999999999999999999999' });
  const feeMicro = canonicalIntegerString(input.feeMicro, 'feeMicro', { max: '999999999999999999999999999999' });
  const nonce = canonicalIntegerString(input.nonce, 'nonce', { max: Number.MAX_SAFE_INTEGER });
  const publicKeyHex = stringField(input.publicKeyHex, 'publicKeyHex', { min: 64, max: 64, pattern: HEX_64_RE, allowEmpty: false, reason: 'Expected 64 lowercase hex characters' });
  const signatureHex = stringField(input.signatureHex, 'signatureHex', { min: 128, max: 128, pattern: HEX_128_RE, allowEmpty: false, reason: 'Expected 128 lowercase hex characters' });
  const sponsor = address(input.sponsor, 'sponsor', { allowEmpty: true });
  const participant = address(input.participant, 'participant', { allowEmpty: true });
  const memo = optionalString(input.memo, 'memo', { min: 0, max: 128, allowEmpty: true });

  for (const parsed of [chainId, from, to, amountMicro, feeMicro, nonce, publicKeyHex, signatureHex, sponsor, participant, memo]) {
    if (parsed.detail) details.push(parsed.detail);
  }
  if (memo.value && /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(memo.value)) {
    details.push(validationDetail('memo', 'Control characters are not allowed'));
  }
  if (memo.value) {
    const memoBytes = byteLimit(memo.value, 'memo', 128);
    if (memoBytes) details.push(memoBytes);
  }

  if (!details.length) {
    const txType = type.value;
    if (txType === 'transfer') {
      if (!to.value) details.push(validationDetail('to', 'Recipient is required for transfer'));
      if (BigInt(amountMicro.value) <= 0n) details.push(validationDetail('amountMicro', 'Expected a value greater than zero for transfer'));
      if (sponsor.value) details.push(validationDetail('sponsor', 'Sponsor is not allowed for transfer'));
      if (participant.value) details.push(validationDetail('participant', 'Participant is not allowed for transfer'));
    } else {
      if (to.value) details.push(validationDetail('to', 'Recipient must be empty for this transaction type'));
      if (BigInt(amountMicro.value) !== 0n) details.push(validationDetail('amountMicro', 'Amount must be zero for this transaction type'));
      if ((txType === 'unregister_participant' || txType === 'heartbeat') && sponsor.value) {
        details.push(validationDetail('sponsor', 'Sponsor must be empty for this transaction type'));
      }
      if ((txType === 'unregister_participant' || txType === 'heartbeat') && participant.value) {
        details.push(validationDetail('participant', 'Participant must be empty for this transaction type'));
      }
      if (txType === 'register_participant' && !participant.value) {
        details.push(validationDetail('participant', 'Participant is required for registration'));
      }
    }
  }

  if (details.length) return failMany(details);
  return pass({
    type: type.value,
    chainId: chainId.value,
    from: from.value,
    to: to.value,
    amountMicro: amountMicro.value,
    feeMicro: feeMicro.value,
    nonce: nonce.value,
    publicKeyHex: publicKeyHex.value,
    signatureHex: signatureHex.value,
    sponsor: sponsor.value,
    participant: participant.value,
    memo: memo.value || ''
  });
}

function heartbeatBody(input) {
  const base = requirePlainObject(input);
  if (base.length) return failMany(base);
  const details = [
    ...unknownFieldDetails(input, HEARTBEAT_FIELDS),
    ...Object.keys(input).filter((key) => HEARTBEAT_FORBIDDEN_FIELDS.has(key)).map((key) => validationDetail(key, 'Hostname or identity fields are not allowed'))
  ];

  const nodeId = stringField(input.nodeId, 'nodeId', { min: 8, max: 128, pattern: NODE_ID_RE, allowEmpty: false, reason: 'Invalid node ID' });
  const nodeMode = stringField(input.nodeMode, 'nodeMode', { min: 1, max: 24, allowEmpty: false });
  const version = optionalString(input.version, 'version', { min: 0, max: 32, pattern: VERSION_RE, allowEmpty: true, reason: 'Invalid version' });
  const height = heightValue(input.height, 'height');
  const latestHash = optionalHash64(input.latestHash ?? '', 'latestHash');
  if (nodeId.detail) details.push(nodeId.detail);
  else {
    const nodeIdBytes = byteLimit(nodeId.value, 'nodeId', 128);
    if (nodeIdBytes) details.push(nodeIdBytes);
  }
  if (nodeMode.detail) details.push(nodeMode.detail);
  else if (nodeMode.value !== 'observer') details.push(validationDetail('nodeMode', 'Unsupported node mode'));
  if (version.detail) details.push(version.detail);
  else if (version.value) {
    const versionBytes = byteLimit(version.value, 'version', 64);
    if (versionBytes) details.push(versionBytes);
  }
  if (height.detail) details.push(height.detail);
  if (latestHash.detail) details.push(latestHash.detail);

  if (typeof input.publicListingEnabled !== 'boolean') {
    details.push(validationDetail('publicListingEnabled', 'Expected a boolean'));
  }
  const alias = publicAliasValue(input.publicAlias);
  const country = countryCodeValue(input.countryCode);
  if (alias.detail) details.push(alias.detail);
  if (country.detail) details.push(country.detail);
  if (details.length) return failMany(details);

  const publicListingEnabled = input.publicListingEnabled === true;
  return pass({
    nodeId: nodeId.value,
    nodeMode: nodeMode.value,
    version: version.value || '',
    height: height.value,
    latestHash: latestHash.value || '',
    publicListingEnabled,
    publicAlias: publicListingEnabled ? alias.value : '',
    countryCode: publicListingEnabled ? country.value : ''
  });
}

function observerSettingsBody(input) {
  const base = requirePlainObject(input);
  if (base.length) return failMany(base);
  const details = unknownFieldDetails(input, OBSERVER_SETTINGS_FIELDS);
  if (typeof input.publicListingEnabled !== 'boolean') details.push(validationDetail('publicListingEnabled', 'Expected a boolean'));
  const alias = publicAliasValue(input.publicAlias);
  const country = countryCodeValue(input.countryCode);
  if (alias.detail) details.push(alias.detail);
  if (country.detail) details.push(country.detail);
  if (details.length) return failMany(details);
  const publicListingEnabled = input.publicListingEnabled === true;
  return pass({
    publicListingEnabled,
    publicAlias: publicListingEnabled ? alias.value : '',
    countryCode: publicListingEnabled ? country.value : ''
  });
}

module.exports = {
  ADDRESS_RE,
  CHAIN_ID_RE,
  HEX_64_RE,
  addressParams,
  heightParams,
  txidParams,
  addressTxsQuery,
  blocksQuery,
  observerListQuery,
  signedTxBody,
  heartbeatBody,
  observerSettingsBody
};
