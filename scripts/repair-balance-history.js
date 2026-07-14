const path = require('path');
const { loadConfig } = require('../server/lib/config');
const { rebuildBalanceHistory } = require('../server/lib/balanceHistoryRepair');

const apply = process.argv.includes('--apply');
const dataArgIndex = process.argv.indexOf('--data-dir');
const dataDir = dataArgIndex >= 0 && process.argv[dataArgIndex + 1]
  ? path.resolve(process.argv[dataArgIndex + 1])
  : path.resolve(__dirname, '..', 'server', 'data');

try {
  const result = rebuildBalanceHistory({ dataDir, config: loadConfig(), apply });
  console.log(JSON.stringify(result, null, 2));
  if (!apply) console.log('Dry run only. Re-run with --apply after stopping the producer and creating a backup.');
} catch (err) {
  console.error(`Balance history repair failed: ${err.message}`);
  process.exitCode = 1;
}
