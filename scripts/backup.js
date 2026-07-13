const path = require('path');
const { configPath } = require('../server/lib/config');
const {
  createBackup,
  restoreBackup,
  verifyBackupArchive
} = require('../server/lib/backup');

function arg(name, fallback = '') {
  const index = process.argv.indexOf(name);
  if (index === -1 || index + 1 >= process.argv.length) return fallback;
  return process.argv[index + 1];
}

function has(name) {
  return process.argv.includes(name);
}

function usage() {
  console.log([
    'Usage:',
    '  npm run backup',
    '  npm run backup -- --data-dir <dir> --out-dir <dir>',
    '  npm run restore -- <backup.zip> --target <dir> [--force] [--chain-id <chainId>]',
    '  npm run backup:verify -- <backup.zip>'
  ].join('\n'));
}

async function main() {
  const command = process.argv[2] || 'create';
  const repoRoot = path.join(__dirname, '..');
  const dataDir = arg('--data-dir', process.env.DATA_DIR || path.join(repoRoot, 'server', 'data'));
  const outDir = arg('--out-dir', path.join(repoRoot, 'backups'));

  if (command === 'create') {
    const result = await createBackup({
      dataDir,
      configPath: arg('--config', process.env.CONFIG_PATH || configPath),
      outDir
    });
    console.log(JSON.stringify({
      ok: true,
      backup: result.zipPath,
      blockHeight: result.metadata.blockHeight,
      latestBlockHash: result.metadata.latestBlockHash,
      stateRoot: result.metadata.stateRoot
    }, null, 2));
    return;
  }

  if (command === 'restore') {
    const zip = process.argv[3];
    if (!zip || zip.startsWith('--')) {
      usage();
      process.exit(1);
    }
    const targetDir = arg('--target', dataDir);
    const result = restoreBackup({
      zipPath: path.resolve(zip),
      targetDir: path.resolve(targetDir),
      force: has('--force'),
      expectedChainId: arg('--chain-id', '')
    });
    console.log(JSON.stringify({
      ok: true,
      restoredTo: result.targetDir,
      blockHeight: result.metadata.blockHeight,
      latestBlockHash: result.metadata.latestBlockHash,
      stateRoot: result.metadata.stateRoot
    }, null, 2));
    return;
  }

  if (command === 'verify') {
    const zip = process.argv[3];
    if (!zip || zip.startsWith('--')) {
      usage();
      process.exit(1);
    }
    const result = verifyBackupArchive(path.resolve(zip));
    if (!result.ok) {
      console.error(JSON.stringify({ ok: false, errors: result.errors }, null, 2));
      process.exit(1);
    }
    console.log(JSON.stringify({
      ok: true,
      blockHeight: result.metadata.blockHeight,
      latestBlockHash: result.metadata.latestBlockHash,
      stateRoot: result.metadata.stateRoot
    }, null, 2));
    return;
  }

  usage();
  process.exit(1);
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
