const fs = require('fs');
const path = require('path');

function getLedgerPath(dataDir) {
  return path.join(dataDir, 'ledger.json');
}

function loadLedger(dataDir) {
  const ledgerPath = getLedgerPath(dataDir);
  if (!fs.existsSync(ledgerPath)) {
    return { balances: {}, stakes: {}, nonces: {}, participants: {}, balanceHistory: {} };
  }
  const raw = fs.readFileSync(ledgerPath, 'utf8');
  if (!raw.trim()) return { balances: {}, stakes: {}, nonces: {}, participants: {}, balanceHistory: {} };
  const parsed = JSON.parse(raw);
  const participants = parsed.participants || {};
  const normalizedParticipants = {};
  for (const [address, value] of Object.entries(participants)) {
    if (typeof value === 'string' || typeof value === 'number') {
      normalizedParticipants[address] = {
        sponsor: address,
        bondMicro: '0',
        registeredHeight: '0',
        lastSeenHeight: String(value)
      };
      continue;
    }
    normalizedParticipants[address] = {
      sponsor: value.sponsor || address,
      bondMicro: value.bondMicro || '0',
      registeredHeight: value.registeredHeight || '0',
      lastSeenHeight: value.lastSeenHeight || '0'
    };
  }
  return {
    balances: parsed.balances || {},
    stakes: parsed.stakes || {},
    nonces: parsed.nonces || {},
    participants: normalizedParticipants,
    balanceHistory: parsed.balanceHistory || {}
  };
}

function saveLedger(dataDir, ledger) {
  const ledgerPath = getLedgerPath(dataDir);
  const tmpPath = `${ledgerPath}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(ledger, null, 2), 'utf8');
  fs.renameSync(tmpPath, ledgerPath);
}

function getBalanceUnits(ledger, address) {
  const value = ledger.balances?.[address];
  return BigInt(value || '0');
}

function setBalanceUnits(ledger, address, value) {
  if (!ledger.balances) ledger.balances = {};
  ledger.balances[address] = value.toString();
}

function getStakeUnits(ledger, address) {
  const value = ledger.stakes?.[address];
  return BigInt(value || '0');
}

function getNonce(ledger, address) {
  const value = ledger.nonces?.[address];
  return BigInt(value || '0');
}

function setNonce(ledger, address, value) {
  if (!ledger.nonces) ledger.nonces = {};
  ledger.nonces[address] = value.toString();
}

function setStakeUnits(ledger, address, value) {
  if (!ledger.stakes) ledger.stakes = {};
  ledger.stakes[address] = value.toString();
}

module.exports = {
  loadLedger,
  saveLedger,
  getBalanceUnits,
  setBalanceUnits,
  getStakeUnits,
  setStakeUnits,
  getNonce,
  setNonce
};
