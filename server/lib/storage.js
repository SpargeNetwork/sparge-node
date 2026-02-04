const fs = require('fs');
const path = require('path');

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function getFileNameForHeight(height, blocksPerFile) {
  const fileIndex = Math.floor(height / blocksPerFile);
  const padded = String(fileIndex + 1).padStart(6, '0');
  return `blocks_${padded}.json`;
}

function readJsonSafe(filePath, fallback) {
  if (!fs.existsSync(filePath)) return fallback;
  const raw = fs.readFileSync(filePath, 'utf8');
  if (!raw.trim()) return fallback;
  return JSON.parse(raw);
}

function writeJsonAtomic(filePath, data) {
  const tmpPath = `${filePath}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2), 'utf8');
  fs.renameSync(tmpPath, filePath);
}

function loadBlocks(dataDir) {
  ensureDir(dataDir);
  const files = fs.readdirSync(dataDir)
    .filter((name) => name.startsWith('blocks_') && name.endsWith('.json'))
    .sort();

  const blocks = [];
  for (const file of files) {
    const fullPath = path.join(dataDir, file);
    const chunk = readJsonSafe(fullPath, []);
    for (const block of chunk) blocks.push(block);
  }

  return blocks;
}

function appendBlock(dataDir, blocksPerFile, block) {
  ensureDir(dataDir);
  const fileName = getFileNameForHeight(block.height, blocksPerFile);
  const filePath = path.join(dataDir, fileName);
  const chunk = readJsonSafe(filePath, []);
  chunk.push(block);
  writeJsonAtomic(filePath, chunk);
}

function getBlocksPage(dataDir, blocksPerFile, offset, limit) {
  const all = loadBlocks(dataDir);
  const total = all.length;
  const start = Math.max(0, total - offset - limit);
  const end = Math.max(0, total - offset);
  const page = all.slice(start, end).reverse();
  return { total, blocks: page };
}

function getLatestBlock(dataDir, blocksPerFile) {
  const all = loadBlocks(dataDir);
  if (!all.length) return null;
  return all[all.length - 1];
}

module.exports = {
  ensureDir,
  loadBlocks,
  appendBlock,
  getBlocksPage,
  getLatestBlock,
  getFileNameForHeight
};