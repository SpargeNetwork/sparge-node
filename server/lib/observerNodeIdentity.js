const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

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

function getOrCreateNodeIdentity(dataDir, config) {
  const identityPath = path.join(dataDir, 'observer-node-id.json');
  const existing = readJson(identityPath);
  if (existing && typeof existing.nodeId === 'string' && existing.nodeId.length >= 8) {
    const sanitized = {
      nodeId: existing.nodeId,
      createdAt: existing.createdAt || new Date().toISOString()
    };
    if (existing.nodeName !== undefined) writeJsonAtomic(identityPath, sanitized);
    return sanitized;
  }
  const identity = {
    nodeId: `obs_${crypto.randomUUID()}`,
    createdAt: new Date().toISOString()
  };
  writeJsonAtomic(identityPath, identity);
  return identity;
}

module.exports = { getOrCreateNodeIdentity };
