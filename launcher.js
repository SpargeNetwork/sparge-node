const fs = require('fs');
const path = require('path');
const os = require('os');
const net = require('net');
const express = require('express');
const { exec } = require('child_process');
const { normalizePrivacy, saveObserverPrivacySettings } = require('./server/lib/observerPrivacy');

const APP_NAME = 'SpargeObserver';
const DEFAULT_PRODUCER = 'http://localhost:3051';
const DEFAULT_PORT = 3052;
const SETUP_PORT = 3059;

function appDataDir() {
  const root = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
  return path.join(root, APP_NAME);
}

function getObserverPaths() {
  const baseDir = appDataDir();
  return {
    baseDir,
    dataDir: path.join(baseDir, 'data'),
    logDir: path.join(baseDir, 'logs'),
    configPath: path.join(baseDir, 'config.json'),
    configPathYml: path.join(baseDir, 'config.yml')
  };
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function parsePositiveInt(value, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.floor(parsed);
}

function readJson(filePath) {
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, payload) {
  const tmp = `${filePath}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(payload, null, 2), 'utf8');
  fs.renameSync(tmp, filePath);
}

function loadBundledConfig() {
  const exeDir = path.dirname(process.execPath);
  const candidates = [
    path.join(exeDir, 'config.yml'),
    path.join(__dirname, 'config', 'config.yml'),
    path.join(process.cwd(), 'config', 'config.yml')
  ];
  for (const candidate of candidates) {
    try {
      if (fs.existsSync(candidate)) {
        return fs.readFileSync(candidate, 'utf8');
      }
    } catch {
      // ignore
    }
  }
  return `chain:
  name: Sparge
  symbol: SPRG
  chainId: "sparge-mainnet"
  blockTimeSeconds: 51
  protocolVersion: "1.0.0"
  economicsVersion: "1.0.0"

token:
  decimals: 9
  initialSupplyTokens: "5100000000"

mining:
  proposerAddress: ""
  genesisOperatorAddress: ""
  genesisFreeBlocks: 100

rewards:
  treasuryAddress: ""
  nodePoolAddress: ""
  holderPoolAddress: ""

storage:
  backend: sqlite
  blocksPerFile: 510

gas:
  blockLimit: 510
  targetRatioBps: 8000
  baseFeeInitialMicro: "1000"
  baseFeeChangeDenominator: 8
  minBaseFeeMicro: "0"

mempool:
  sort: fee
  maxTransactions: 10000
  maxBytes: 52428800
  maxTransactionsPerSender: 100
  transactionTtlSeconds: 3600
  maxFutureNonceGap: 100
  minimumFeeMicro: "0"

invariants:
  enabled: true
  fastChecksEveryBlock: true
  fullAuditOnStartup: true
  fullAuditIntervalBlocks: 0
  stopMiningOnFailure: true

logging:
  level: info
  format: pretty
  directory: logs
  fileEnabled: true
  consoleEnabled: true
  maxFileSizeBytes: 10485760
  maxFiles: 10
  redactSensitiveFields: true
  logEmptyBlocks: false

tx:
  minFeeMicro: "1000"

dev:
  enableAdmin: false

operatorDashboard:
  enabled: false
  bindLocalOnly: true

node:
  mode: observer
  producerUrl: "http://localhost:3051"
  sync:
    batchSize: 50
    intervalMs: 2000
    timeoutMs: 5000

observer:
  publicListingEnabled: false
  publicAlias: ""
  countryCode: ""

security:
  trustProxy: false
  maxJsonBodyBytes: 32768
  maxTransactionBodyBytes: 16384
  maxHeartbeatBodyBytes: 4096
  maxObserverSettingsBodyBytes: 4096
  rateLimits:
    enabled: true
    global:
      windowSeconds: 60
      maxRequests: 300
    transaction:
      windowSeconds: 60
      maxRequestsPerIp: 10
      maxConcurrentPerIp: 3
    heartbeat:
      windowSeconds: 60
      maxRequestsPerIp: 10
      maxRequestsPerNodeId: 2
    observerSettings:
      windowSeconds: 60
      maxRequestsPerIp: 10
    addressHistory:
      windowSeconds: 60
      maxRequestsPerIp: 30
    blockAndTxLookup:
      windowSeconds: 60
      maxRequestsPerIp: 60
    publicRead:
      windowSeconds: 60
      maxRequestsPerIp: 120
    operator:
      windowSeconds: 60
      maxRequestsPerIp: 5

network:
  heartbeatIntervalSeconds: 60
  observerOfflineAfterSeconds: 180
  observerRetentionDays: 180
  publicObserverListEnabled: true
  heartbeatRateLimit:
    windowMs: 60000
    max: 20
`;
}

function ensureConfigFile(configPath) {
  if (fs.existsSync(configPath)) return;
  const contents = loadBundledConfig();
  const tmp = `${configPath}.tmp`;
  fs.writeFileSync(tmp, contents, 'utf8');
  fs.renameSync(tmp, configPath);
}

function findAvailablePort(startPort) {
  return new Promise((resolve) => {
    const tryPort = (port) => {
      const server = net.createServer();
      server.unref();
      server.on('error', () => tryPort(port + 1));
      server.listen(port, '127.0.0.1', () => {
        server.close(() => resolve(port));
      });
    };
    tryPort(startPort);
  });
}

function initLogger(logDir) {
  ensureDir(logDir);
  const logPath = path.join(logDir, 'node.log');
  const maxBytes = parsePositiveInt(process.env.OBSERVER_LOG_MAX_BYTES, 10 * 1024 * 1024);
  const maxFiles = parsePositiveInt(process.env.OBSERVER_LOG_MAX_FILES, 7);
  const archivePrefix = 'node-';

  function listArchives() {
    try {
      return fs.readdirSync(logDir)
        .filter((name) => name.startsWith(archivePrefix) && name.endsWith('.log'))
        .map((name) => {
          const filePath = path.join(logDir, name);
          let mtimeMs = 0;
          try {
            mtimeMs = fs.statSync(filePath).mtimeMs || 0;
          } catch {
            mtimeMs = 0;
          }
          return { name, filePath, mtimeMs };
        })
        .sort((a, b) => b.mtimeMs - a.mtimeMs);
    } catch {
      return [];
    }
  }

  function pruneArchives() {
    const keepArchives = Math.max(0, maxFiles - 1);
    const archives = listArchives();
    if (archives.length <= keepArchives) return;
    for (const entry of archives.slice(keepArchives)) {
      try {
        fs.unlinkSync(entry.filePath);
      } catch {
        // best effort
      }
    }
  }

  function rotateIfNeeded() {
    let stat;
    try {
      stat = fs.statSync(logPath);
    } catch {
      return;
    }
    if (!stat.isFile() || stat.size < maxBytes) return;
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const archive = path.join(logDir, `${archivePrefix}${stamp}.log`);
    try {
      fs.renameSync(logPath, archive);
    } catch {
      return;
    }
    pruneArchives();
  }

  rotateIfNeeded();
  pruneArchives();

  const write = (level, args) => {
    rotateIfNeeded();
    const line = `[${new Date().toISOString()}] [${level}] ${args.join(' ')}\n`;
    try {
      fs.appendFileSync(logPath, line, 'utf8');
    } catch {
      // avoid crashing app on logging I/O failure
    }
  };
  const origLog = console.log.bind(console);
  const origError = console.error.bind(console);
  console.log = (...args) => {
    write('info', args.map(String));
    origLog(...args);
  };
  console.error = (...args) => {
    write('error', args.map(String));
    origError(...args);
  };
}

function getBundledPublicDir() {
  const exeDir = path.dirname(process.execPath);
  const candidates = [
    process.env.PUBLIC_DIR,
    path.join(exeDir, 'public'),
    path.join(__dirname, 'public')
  ].filter(Boolean);
  for (const candidate of candidates) {
    try {
      if (fs.existsSync(candidate)) return candidate;
    } catch {
      // ignore
    }
  }
  return path.join(__dirname, 'public');
}

function getBundledSqliteBinding() {
  const exeDir = path.dirname(process.execPath);
  const candidates = [
    process.env.BETTER_SQLITE3_BINDING,
    path.join(exeDir, 'better_sqlite3.node')
  ].filter(Boolean);
  for (const candidate of candidates) {
    try {
      if (fs.existsSync(candidate)) return candidate;
    } catch {
      // ignore
    }
  }
  return null;
}

function setupInlineHtml() {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>Sparge Observer Setup</title>
    <style>
      :root {
        --spg-primary: #1fa37a;
        --spg-accent: #2bb673;
        --bg: #0f1717;
        --panel: #111f1f;
        --text: #e7f4ef;
        --muted: #9fbab2;
        --border: #1f2f2b;
        --radius: 8px;
      }
      * { box-sizing: border-box; font-family: system-ui, -apple-system, Segoe UI, sans-serif; }
      body { margin: 0; background: var(--bg); color: var(--text); }
      .wrap { max-width: 520px; margin: 10vh auto; padding: 24px; }
      .panel { background: var(--panel); border: 1px solid var(--border); border-radius: var(--radius); padding: 24px; }
      h1 { margin: 0 0 8px; font-size: 22px; }
      p { margin: 0 0 20px; color: var(--muted); }
      label { display: block; margin-bottom: 14px; }
      span { display: block; margin-bottom: 6px; color: var(--muted); font-size: 13px; }
      input { width: 100%; padding: 12px 14px; border-radius: 10px; border: 1px solid var(--border); background: #0d1616; color: var(--text); }
      .check { display: flex; gap: 10px; align-items: flex-start; color: var(--muted); }
      .check input { width: auto; margin-top: 3px; }
      .privacy-fields.hidden { display: none; }
      .hint { color: var(--muted); font-size: 12px; margin: -6px 0 14px; }
      .eyebrow { color: var(--spg-accent); font-size: 12px; letter-spacing: .12em; text-transform: uppercase; font-weight: 700; margin: 0 0 6px; }
      .btn { background: var(--spg-primary); border: none; color: #03120e; padding: 12px 16px; border-radius: 8px; font-weight: 600; cursor: pointer; }
      .error { margin-top: 12px; color: #ff7b7b; font-size: 13px; }
    </style>
  </head>
  <body>
    <div class="wrap">
      <div class="panel">
        <div class="eyebrow">First run</div>
        <h1>Set up Sparge Observer</h1>
        <p>Connect this computer to a Sparge producer. Your observer syncs and validates chain data locally without producing blocks.</p>
        <form id="setup-form">
          <label>
            <span>Producer URL</span>
            <input id="producerUrl" type="text" placeholder="http://127.0.0.1:3051" required />
          </label>
          <label>
            <span>Local Port</span>
            <input id="port" type="number" min="1024" max="65535" placeholder="3052" required />
          </label>
          <label class="check">
            <input id="publicListingEnabled" type="checkbox" />
            <span>Show this observer in the public node list</span>
          </label>
          <p class="hint">Your observer will still count toward the total active observer count. When disabled, it will not appear in the public observer list.</p>
          <div class="privacy-fields hidden" id="privacyFields">
            <label>
              <span>Public country</span>
              <input id="countryCode" type="text" maxlength="2" placeholder="BE" />
            </label>
            <label>
              <span>Public node alias (optional)</span>
              <input id="publicAlias" type="text" maxlength="40" placeholder="Observer" />
            </label>
            <p class="hint">Do not enter your computer name, real name, IP address, or other personal information.</p>
          </div>
          <button class="btn" type="submit">Save & Start</button>
          <div id="setup-error" class="error"></div>
        </form>
      </div>
    </div>
    <script>
      const form = document.getElementById('setup-form');
      const errorEl = document.getElementById('setup-error');
      const producerInput = document.getElementById('producerUrl');
      const portInput = document.getElementById('port');
      const listingInput = document.getElementById('publicListingEnabled');
      const privacyFields = document.getElementById('privacyFields');
      const aliasInput = document.getElementById('publicAlias');
      const countryInput = document.getElementById('countryCode');
      fetch('/setup/defaults').then(r => r.json()).then(d => {
        if (d.producerUrl) producerInput.value = d.producerUrl;
        if (d.port) portInput.value = d.port;
        listingInput.checked = d.publicListingEnabled === true;
        aliasInput.value = d.publicAlias || '';
        countryInput.value = d.countryCode || '';
        privacyFields.classList.toggle('hidden', !listingInput.checked);
      }).catch(() => {});
      listingInput.addEventListener('change', () => {
        privacyFields.classList.toggle('hidden', !listingInput.checked);
      });
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        errorEl.textContent = '';
        const producerUrl = producerInput.value.trim();
        const port = Number(portInput.value);
        const publicListingEnabled = listingInput.checked;
        const publicAlias = publicListingEnabled ? aliasInput.value.trim() : '';
        const countryCode = publicListingEnabled ? countryInput.value.trim().toUpperCase() : '';
        if (!producerUrl) { errorEl.textContent = 'Producer URL is required.'; return; }
        if (!Number.isFinite(port) || port < 1024 || port > 65535) { errorEl.textContent = 'Port must be between 1024 and 65535.'; return; }
        try {
          const res = await fetch('/setup/save', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ producerUrl, port, publicListingEnabled, publicAlias, countryCode })
          });
          const data = await res.json();
          if (!res.ok || !data.ok) throw new Error(data.error || 'Failed to save settings.');
          errorEl.textContent = 'Starting observer...';
          if (!data.noBrowser) {
            const target = 'http://127.0.0.1:' + data.port;
            setTimeout(() => { window.location.href = target; }, 600);
          }
        } catch (err) {
          errorEl.textContent = err.message || 'Failed to save settings.';
        }
      });
    </script>
  </body>
</html>`;
}

async function startObserver(config, paths, options = {}) {
  const openBrowser = options.openBrowser !== false;
  const onObserverReady = options.onObserverReady;
  let desiredPort = Number(config.port || DEFAULT_PORT);
  if (!Number.isFinite(desiredPort) || desiredPort < 1024 || desiredPort > 65535) {
    desiredPort = DEFAULT_PORT;
  }
  const port = await findAvailablePort(desiredPort);
  if (port !== desiredPort) {
    config.port = port;
    writeJson(paths.configPath, config);
  }

  process.env.PUBLIC_DIR = getBundledPublicDir();
  const binding = getBundledSqliteBinding();
  if (binding) process.env.BETTER_SQLITE3_BINDING = binding;
  process.env.NODE_MODE = 'observer';
  process.env.PRODUCER_URL = config.producerUrl || DEFAULT_PRODUCER;
  process.env.PORT = String(port);
  process.env.DATA_DIR = paths.dataDir;
  process.env.CONFIG_PATH = paths.configPathYml;
  saveObserverPrivacySettings(paths.dataDir, config);

  require('./server/index.js');

  const appUrl = `http://127.0.0.1:${port}/`;
  console.log(`[observer] app_url=${appUrl}`);
  if (typeof onObserverReady === 'function') onObserverReady(appUrl, port);
  if (openBrowser) exec(`start "" "${appUrl}"`);

  return { appUrl, port };
}

async function startSetup(paths, options = {}) {
  const openBrowser = options.openBrowser !== false;
  const onSetupReady = options.onSetupReady;
  const onObserverReady = options.onObserverReady;

  const app = express();
  app.use(express.json());

  app.get(['/', '/setup'], (req, res) => {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(setupInlineHtml());
  });

  app.get('/setup/defaults', (req, res) => {
    res.json({ producerUrl: DEFAULT_PRODUCER, port: DEFAULT_PORT, publicListingEnabled: false, publicAlias: '', countryCode: '' });
  });

  const forcedSetupPort = Number(process.env.OBSERVER_SETUP_PORT || SETUP_PORT);
  const setupPort = await findAvailablePort(forcedSetupPort);
  const setupUrl = `http://127.0.0.1:${setupPort}/setup`;

  const server = app.listen(setupPort, () => {
    console.log(`[observer] setup_url=${setupUrl}`);
    if (typeof onSetupReady === 'function') onSetupReady(setupUrl, setupPort);
    if (openBrowser) exec(`start "" "${setupUrl}"`);
  });

  app.post('/setup/save', async (req, res) => {
    const producerUrl = String(req.body?.producerUrl || '').trim();
    const port = Number(req.body?.port || DEFAULT_PORT);
    let privacy;
    if (!producerUrl) {
      res.status(400).json({ ok: false, error: 'Producer URL is required.' });
      return;
    }
    if (!Number.isFinite(port) || port < 1024 || port > 65535) {
      res.status(400).json({ ok: false, error: 'Port must be between 1024 and 65535.' });
      return;
    }
    try {
      privacy = normalizePrivacy(req.body || {});
    } catch (err) {
      res.status(400).json({ ok: false, error: err.message || 'Invalid privacy settings.' });
      return;
    }

    const config = { producerUrl, port, ...privacy };
    writeJson(paths.configPath, config);
    res.json({ ok: true, port, noBrowser: !openBrowser });
    server.close(async () => {
      await startObserver(config, paths, { openBrowser, onObserverReady });
    });
  });

  return { setupUrl, setupPort, close: () => server.close() };
}

async function startObserverApp(options = {}) {
  const paths = getObserverPaths();
  ensureDir(paths.baseDir);
  ensureDir(paths.dataDir);
  initLogger(paths.logDir);
  ensureConfigFile(paths.configPathYml);

  const config = readJson(paths.configPath);
  if (!config) {
    return startSetup(paths, options);
  }
  return startObserver(config, paths, options);
}

if (require.main === module) {
  const noBrowser = process.env.OBSERVER_NO_BROWSER === '1';
  startObserverApp({ openBrowser: !noBrowser }).catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

module.exports = {
  APP_NAME,
  DEFAULT_PORT,
  DEFAULT_PRODUCER,
  getObserverPaths,
  startObserverApp
};
