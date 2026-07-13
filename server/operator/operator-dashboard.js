const els = {
  refresh: document.getElementById('operatorRefreshStatus'),
  alerts: document.getElementById('operatorAlerts'),
  node: document.getElementById('operatorNode'),
  chain: document.getElementById('operatorChain'),
  health: document.getElementById('operatorHealth'),
  database: document.getElementById('operatorDatabase'),
  backups: document.getElementById('operatorBackups'),
  network: document.getElementById('operatorNetwork'),
  http: document.getElementById('operatorHttp'),
  system: document.getElementById('operatorSystem'),
  events: document.getElementById('operatorEvents'),
  copy: document.getElementById('copyOperatorDiagnostics')
};
let lastStatus = null;

function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function fmt(value) {
  if (value === null || value === undefined || value === '') return '-';
  if (typeof value === 'number') return new Intl.NumberFormat('nl-NL').format(value);
  return String(value);
}

function bytes(value) {
  const n = Number(value || 0);
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

function duration(seconds) {
  const s = Number(seconds || 0);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m ${Math.floor(s % 60)}s`;
}

function age(iso) {
  if (!iso) return '-';
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return '-';
  return duration(Math.max(0, Math.floor((Date.now() - t) / 1000)));
}

function tone(value) {
  if (value === true || value === 'ok' || value === 'online' || value === 'active') return 'ok';
  if (value === false || value === 'failed' || value === 'error') return 'bad';
  return 'neutral';
}

function card(label, value, sub = '', state = 'neutral') {
  return `
    <div class="operator-card tone-${state}">
      <span>${esc(label)}</span>
      <strong>${esc(value)}</strong>
      ${sub ? `<small>${esc(sub)}</small>` : ''}
    </div>
  `;
}

function badge(value, state) {
  return `<span class="status-badge ${state}">${esc(value)}</span>`;
}

function renderAlerts(alerts) {
  const list = Array.isArray(alerts) ? alerts : [];
  if (!list.length) {
    els.alerts.innerHTML = `
      <div class="operator-alert tone-ok">
        <strong>${badge('Green', 'ok')} Healthy</strong>
        <span>No issues detected.</span>
      </div>
    `;
    return;
  }
  els.alerts.innerHTML = list.map((alert) => {
    const state = alert.level === 'critical' ? 'bad' : 'warn';
    const label = alert.level === 'critical' ? 'Red' : 'Yellow';
    return `
      <div class="operator-alert tone-${state}">
        <strong>${badge(label, state)} ${esc(alert.label || 'Alert')}</strong>
        <span>${esc(alert.message || 'Issue detected.')}</span>
      </div>
    `;
  }).join('');
}

function render(status) {
  lastStatus = status;
  renderAlerts(status.alerts);
  const n = status.node || {};
  const c = status.chain || {};
  const h = status.health || {};
  const db = status.database || {};
  const backup = status.backup || {};
  const net = status.network || {};
  const http = status.http || {};
  const sys = status.system || {};
  const latest = c.latestBlock || {};

  els.node.innerHTML = [
    card('Healthy', n.healthy ? 'Yes' : 'No', '', tone(n.healthy)),
    card('Producer running', n.producerRunning ? 'Yes' : 'No', '', tone(n.producerRunning)),
    card('Mining', n.miningPaused ? 'Paused' : (n.miningActive ? 'Running' : 'Stopped'), n.miningPaused ? 'Safety pause active' : '', n.miningPaused ? 'bad' : (n.miningActive ? 'ok' : 'warn')),
    card('Version', n.version),
    card('Chain ID', n.chainId),
    card('Protocol', n.protocolVersion),
    card('Economics', n.economicsVersion),
    card('Uptime', duration(n.uptimeSeconds))
  ].join('');

  els.chain.innerHTML = [
    card('Height', fmt(c.height)),
    card('Latest block', latest.height !== undefined ? `#${fmt(latest.height)}` : '-', latest.hashPrefix || ''),
    card('Latest block age', age(latest.timestamp)),
    card('Average block time', `${fmt(c.averageBlockTimeSeconds)}s`),
    card('Blocks today', fmt(c.blocksProducedToday)),
    card('Transactions processed', fmt(c.transactionsProcessed)),
    card('Mempool size', fmt(c.mempoolTransactionCount)),
    card('Mempool bytes', bytes(c.mempoolBytes), `${fmt(c.mempoolUtilizationPercent)}% utilization`)
  ].join('');

  els.health.innerHTML = [
    card('Chain healthy', h.chainHealthy ? 'Yes' : 'No', '', tone(h.chainHealthy)),
    card('Storage healthy', h.storageHealthy ? 'Yes' : 'No', '', tone(h.storageHealthy)),
    card('Mempool healthy', h.mempoolHealthy ? 'Yes' : 'No', '', tone(h.mempoolHealthy)),
    card('Invariants', h.invariantsHealthy ? 'Healthy' : 'Failed', h.invariantStatus, tone(h.invariantsHealthy)),
    card('Last invariant check', h.lastInvariantCheckAt || '-'),
    card('Last invariant failure', h.lastInvariantFailureCode || 'None', '', h.lastInvariantFailureCode ? 'bad' : 'ok'),
    card('Mining paused for safety', h.miningPausedForSafety ? 'Yes' : 'No', '', h.miningPausedForSafety ? 'bad' : 'ok')
  ].join('');

  els.database.innerHTML = [
    card('SQLite status', db.status || 'unknown', db.backend || '', db.integrityStatus === 'failed' ? 'bad' : 'ok'),
    card('Database size', bytes(db.sizeBytes)),
    card('Integrity status', db.integrityStatus || 'unknown', '', tone(db.integrityStatus)),
    card('Last startup audit', db.lastStartupAudit || 'See invariant status')
  ].join('');

  els.backups.innerHTML = [
    card('Last backup time', backup.lastBackupAt || 'Never', '', backup.lastBackupAt ? 'ok' : 'warn'),
    card('Last backup height', backup.lastBackupHeight === null || backup.lastBackupHeight === undefined ? '-' : fmt(backup.lastBackupHeight)),
    card('Backup age', backup.backupAgeSeconds === null || backup.backupAgeSeconds === undefined ? '-' : duration(backup.backupAgeSeconds), '', backup.backupAgeSeconds === null || backup.backupAgeSeconds === undefined ? 'warn' : 'ok')
  ].join('');

  els.network.innerHTML = [
    card('Active observers', fmt(net.activeObservers)),
    card('Fully synced', fmt(net.fullySyncedObservers), '', Number(net.fullySyncedObservers || 0) > 0 ? 'ok' : 'neutral'),
    card('Highest observer height', fmt(net.highestObserverHeight)),
    card('Lowest observer height', fmt(net.lowestObserverHeight)),
    card('Largest observer lag', `${fmt(net.largestObserverLag)} blocks`, '', Number(net.largestObserverLag || 0) > 3 ? 'warn' : 'ok'),
    card('Producer API', net.producerApiStatus || 'unknown', '', tone(net.producerApiStatus))
  ].join('');

  els.http.innerHTML = [
    card('Requests/min', fmt(http.requestsPerMinute)),
    card('Validation failures', fmt(http.validationFailuresPerMinute), 'per minute', Number(http.validationFailuresPerMinute || 0) > 0 ? 'warn' : 'ok'),
    card('Rate limited', fmt(http.rateLimitedRequestsPerMinute), 'per minute', Number(http.rateLimitedRequestsPerMinute || 0) > 0 ? 'warn' : 'ok'),
    card('Oversized rejects', fmt(http.oversizedRequestRejectsPerMinute), 'per minute', Number(http.oversizedRequestRejectsPerMinute || 0) > 0 ? 'warn' : 'ok'),
    card('Active requests', fmt(http.activeRequestCount))
  ].join('');

  els.system.innerHTML = [
    card('RSS', bytes(sys.memoryRssBytes)),
    card('Heap used', bytes(sys.heapUsedBytes), `${bytes(sys.heapTotalBytes)} total`),
    card('Node.js', sys.nodeVersion),
    card('Platform', sys.platform),
    card('CPU count', fmt(sys.cpuCount)),
    card('Process uptime', duration(sys.processUptimeSeconds))
  ].join('');

  const events = Array.isArray(status.recentEvents) ? status.recentEvents : [];
  els.events.innerHTML = events.length
    ? events.map((event) => `
      <div class="operator-event">
        <span class="operator-event-level ${esc(event.level)}">${esc(String(event.level || 'info').toUpperCase())}</span>
        <span>${esc(event.summary || event.event)}</span>
        <small>${esc(age(event.timestamp))} ago</small>
      </div>
    `).join('')
    : '<div class="detail-empty">No recent events captured yet.</div>';

  els.refresh.textContent = `Updated ${new Date(status.generatedAt || Date.now()).toLocaleTimeString()}`;
}

async function refresh() {
  try {
    const res = await fetch('/api/operator/status', { cache: 'no-store' });
    if (!res.ok) throw new Error(`Status ${res.status}`);
    render(await res.json());
  } catch (err) {
    els.refresh.textContent = 'Refresh failed';
    els.alerts.innerHTML = `
      <div class="operator-alert tone-bad">
        <strong>${badge('Red', 'bad')} Critical</strong>
        <span>${esc(err.message || 'Unable to refresh operator status.')}</span>
      </div>
    `;
  }
}

function diagnosticsText() {
  if (!lastStatus) return 'Operator diagnostics unavailable';
  return [
    'Sparge Operator diagnostics',
    `Generated: ${lastStatus.generatedAt || '-'}`,
    `Chain: ${lastStatus.node?.chainId || '-'}`,
    `Height: ${lastStatus.chain?.height ?? '-'}`,
    `Healthy: ${lastStatus.node?.healthy ? 'yes' : 'no'}`,
    `Mining: ${lastStatus.node?.miningPaused ? 'paused' : (lastStatus.node?.miningActive ? 'running' : 'stopped')}`,
    `Invariant: ${lastStatus.health?.invariantStatus || '-'}`,
    `Last failure: ${lastStatus.health?.lastInvariantFailureCode || '-'}`,
    `Active observers: ${lastStatus.network?.activeObservers ?? '-'}`,
    `Largest observer lag: ${lastStatus.network?.largestObserverLag ?? '-'}`
  ].join('\n');
}

if (els.copy) {
  els.copy.addEventListener('click', async () => {
    const text = diagnosticsText();
    if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(text);
    els.copy.textContent = 'Copied';
    setTimeout(() => { els.copy.textContent = 'Copy Diagnostics'; }, 1200);
  });
}

refresh();
setInterval(refresh, 5000);
