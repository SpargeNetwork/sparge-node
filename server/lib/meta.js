const fs = require('fs');
const path = require('path');

function getMetaPath(dataDir) {
  return path.join(dataDir, 'meta.json');
}

function loadMeta(dataDir) {
  const metaPath = getMetaPath(dataDir);
  if (!fs.existsSync(metaPath)) return null;
  const raw = fs.readFileSync(metaPath, 'utf8');
  if (!raw.trim()) return null;
  return JSON.parse(raw);
}

function saveMeta(dataDir, meta) {
  const metaPath = getMetaPath(dataDir);
  const tmpPath = `${metaPath}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(meta, null, 2), 'utf8');
  fs.renameSync(tmpPath, metaPath);
}

module.exports = { loadMeta, saveMeta };
