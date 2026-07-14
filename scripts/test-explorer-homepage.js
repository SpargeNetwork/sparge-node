const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { buildTransactionSeries, recentUserTransactions } = require('../server/lib/transactionMetrics');
const { transactionMetricsQuery } = require('../server/lib/validation/schemas');
const chart = require('../public/transaction-chart');

const root = path.join(__dirname, '..');
const homepage = fs.readFileSync(path.join(root, 'public', 'index.html'), 'utf8');
const economics = fs.readFileSync(path.join(root, 'public', 'economics.html'), 'utf8');
const app = fs.readFileSync(path.join(root, 'public', 'app.js'), 'utf8');

for (const removed of ['networkOverviewPanel', 'statusPanel', 'genesisPanel', 'chainStats']) {
  assert.ok(!homepage.includes(`id="${removed}"`), `homepage removes ${removed}`);
}
assert.ok(!homepage.includes('<th>Reward</th>'), 'homepage block table omits reward data');
assert.ok(homepage.includes('id="homepageStats"'), 'homepage has one concise stats region');
assert.ok(homepage.includes('Latest Transactions'), 'homepage keeps latest transactions');
assert.ok(homepage.includes('id="transactionChartCanvas"'), 'homepage includes the transaction chart');
for (const range of ['24h', '7d', '30d', 'all']) {
  assert.ok(homepage.includes(`data-chart-range="${range}"`), `homepage supports ${range}`);
}

for (const panel of ['economicsDistributionPanel', 'economicsPoolsPanel', 'economicsParticipantsPanel']) {
  assert.ok(economics.includes(`id="${panel}"`), `economics page includes ${panel}`);
}
for (const label of ['Total Transactions', 'Average Transaction Fee', 'Total Addresses', 'Latest Block']) {
  assert.ok(app.includes(`networkCard('${label}'`), `homepage renders ${label}`);
}

const now = Date.parse('2026-01-02T00:00:00.000Z');
const blocks = [
  { height: 1, timestamp: '2026-01-01T01:15:00.000Z', transactions: [{ type: 'participant_reward' }, { type: 'transfer', txid: 'a'.repeat(64) }] },
  { height: 2, timestamp: '2026-01-01T23:30:00.000Z', transactions: [{ type: 'treasury_reward' }, { type: 'heartbeat', txid: 'b'.repeat(64) }, {}] }
];
const day = buildTransactionSeries(blocks, '24h', now);
assert.strictEqual(day.series.length, 24, '24h returns exactly 24 hourly buckets');
assert.strictEqual(day.series.reduce((sum, point) => sum + point.count, 0), 5, 'transaction counts are aggregated');
const all = buildTransactionSeries(blocks, 'all', now);
assert.ok(all.series.length > 0 && all.series.length <= 48, 'short all-time range remains bounded');
const century = buildTransactionSeries([
  { timestamp: '1926-01-01T00:00:00.000Z', txCount: 1 },
  ...blocks
], 'all', now);
assert.ok(century.series.length <= 121, 'long all-time history remains bounded');
const recent = recentUserTransactions(blocks, 5);
assert.deepStrictEqual(recent.map((tx) => tx.type), ['heartbeat', 'transfer'], 'recent activity excludes reward transactions and remains newest-first');

assert.strictEqual(transactionMetricsQuery({ range: '7d' }).ok, true, 'supported range validates');
assert.strictEqual(transactionMetricsQuery({ range: 'year' }).ok, false, 'unsupported range is rejected');
assert.strictEqual(transactionMetricsQuery({ range: '24h', extra: 'no' }).ok, false, 'unknown query fields are rejected');

const geometry = chart.buildChartGeometry(day.series, 640, 320);
assert.strictEqual(geometry.points.length, 24, 'chart geometry preserves every bucket');
assert.strictEqual(chart.nearestPointIndex(geometry.points, geometry.points[5].x), 5, 'tooltip selects the nearest point');
assert.ok(app.includes('data.recentTransactions'), 'homepage consumes bounded server-side recent activity');

console.log('Explorer homepage tests passed.');
