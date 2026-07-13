const path = require('path');

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
    '  npm run replay',
    '  npm run replay -- --data-dir server/data --report replay-report.json',
    '  npm run replay -- --to-height 10000 --progress-every 1000',
    '  npm run replay -- --verify-tip-only'
  ].join('\n'));
}

async function main() {
  if (has('--help') || has('-h')) {
    usage();
    return;
  }
  const repoRoot = path.join(__dirname, '..');
  const configArg = arg('--config', process.env.CONFIG_PATH || path.join(repoRoot, 'config', 'config.yml'));
  process.env.CONFIG_PATH = path.resolve(configArg);

  const { loadConfig } = require('../server/lib/config');
  const { runReplay } = require('../server/lib/replay');
  const config = loadConfig();
  const dataDir = path.resolve(arg('--data-dir', process.env.DATA_DIR || path.join(repoRoot, 'server', 'data')));
  const report = arg('--report', '');
  const fromHeight = Number(arg('--from-height', '0'));
  const toHeightRaw = arg('--to-height', '');
  const progressEvery = Number(arg('--progress-every', '1000'));

  const started = Date.now();
  const result = await runReplay({
    dataDir,
    config,
    fromHeight,
    toHeight: toHeightRaw === '' ? null : Number(toHeightRaw),
    report,
    verifyTipOnly: has('--verify-tip-only'),
    progressEvery,
    onProgress: (progress) => {
      const elapsed = Math.max(0.001, (Date.now() - started) / 1000);
      console.log(`replay height=${progress.height}/${progress.targetHeight} blocksPerSecond=${progress.blocksPerSecond} elapsedSeconds=${elapsed.toFixed(1)}`);
    }
  });

  console.log(JSON.stringify({
    ok: true,
    mode: result.mode,
    blocksVerified: result.blocksVerified,
    transactionsVerified: result.transactionsVerified,
    toHeight: result.toHeight,
    expectedTipHash: result.expectedTipHash,
    replayedTipHash: result.replayedTipHash,
    expectedStateRoot: result.expectedStateRoot,
    replayedStateRoot: result.replayedStateRoot,
    durationMs: result.durationMs,
    report: report ? path.resolve(report) : null
  }, null, 2));
}

main().catch((err) => {
  const report = err.report || null;
  console.error(JSON.stringify({
    ok: false,
    error: err.code || 'REPLAY_STORAGE_ERROR',
    height: err.height ?? null,
    category: err.category || 'chain',
    message: err.message,
    report: report ? {
      toHeight: report.toHeight,
      expectedTipHash: report.expectedTipHash,
      error: report.error
    } : null
  }, null, 2));
  process.exit(1);
});
