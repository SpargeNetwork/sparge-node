const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function getGenesisPath(dataDir) {
  return path.join(dataDir, 'genesis.json');
}

function computeGenesisHash(genesis) {
  const canonical = JSON.stringify(genesis);
  return crypto.createHash('sha256').update(canonical).digest('hex');
}

function ensureGenesis(dataDir, config) {
  const genesisPath = getGenesisPath(dataDir);
  if (fs.existsSync(genesisPath)) {
    const raw = fs.readFileSync(genesisPath, 'utf8');
    const parsed = JSON.parse(raw);
    const hash = parsed.genesisHash || computeGenesisHash(parsed);
    return { genesis: parsed, genesisHash: hash };
  }

  const deterministicCreatedAt = config.chain?.genesisCreatedAt || '2026-01-01T00:00:00.000Z';
  const genesis = {
    chainId: config.chain.chainId,
    chainName: config.chain.name,
    symbol: config.chain.symbol,
    blockTimeSeconds: config.chain.blockTimeSeconds,
    protocolVersion: config.chain.protocolVersion,
    economicsVersion: config.chain.economicsVersion,
    genesisOperatorAddress: config.mining?.genesisOperatorAddress || config.mining?.proposerAddress || '',
    genesisFreeBlocks: Number(config.mining?.genesisFreeBlocks ?? 100),
    createdAt: deterministicCreatedAt
  };
  const genesisHash = computeGenesisHash(genesis);
  const payload = { ...genesis, genesisHash };

  const tmpPath = `${genesisPath}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(payload, null, 2), 'utf8');
  fs.renameSync(tmpPath, genesisPath);

  return { genesis: payload, genesisHash };
}

module.exports = { ensureGenesis, computeGenesisHash };
