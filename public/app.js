const LIMIT = 10;
let currentPage = 1;
let totalBlocks = 0;
let refreshTimer = null;
let viewMode = 'basic';
let latestState = null;
let latestGenesis = null;
let latestChainState = null;
let selectedHeight = null;
let loadingBlockHeight = null;
let blockRequestId = 0;
let currentTxId = null;
let walletState = null;
let walletRefreshTimer = null;
let lastAutoHeartbeatHeight = null;
let walletActivityEntries = [];
let walletActivityPage = 1;
let addressTxEntries = [];
let addressTxLimit = 25;
let addressTxFilter = 'all';
let participantPending = false;
let latestBlocks = [];
let observerLogEntries = [];
let observerStartMs = Date.now();
let observerLastHeight = null;
let observerLastSyncState = null;
let observerLastError = null;
let latestNetworkStatus = null;
let observerNodesPage = 1;

const blocksTable = document.getElementById('blocksTable');
const pagerTop = document.getElementById('pagerTop');
const pagerBottom = document.getElementById('pagerBottom');
const chainStats = document.getElementById('chainStats');
const miningStatus = document.getElementById('miningStatus');
const statusPanel = document.getElementById('statusPanel');
const genesisPanel = document.getElementById('genesisPanel');
const blockDetailsBody = document.getElementById('blockDetailsBody');
const blockTxList = document.getElementById('blockTxList');
const txDetailsBody = document.getElementById('txDetailsBody');
const txSummaryEl = document.getElementById('txSummary');
const txPartiesEl = document.getElementById('txParties');
const txAmountsEl = document.getElementById('txAmounts');
const txParticipationEl = document.getElementById('txParticipation');
const txParticipationCard = document.getElementById('txParticipationCard');
const txTechnicalBodyEl = document.getElementById('txTechnicalBody');
const txBackLinkEl = document.getElementById('txBackLink');
const copyToast = document.getElementById('copyToast');
const addressDetailsBody = document.getElementById('addressDetailsBody');
const addressTxList = document.getElementById('addressTxList');
const addressHeaderEl = document.getElementById('addressHeader');
const addressOverviewEl = document.getElementById('addressOverview');
const addressParticipationEl = document.getElementById('addressParticipation');
const addressParticipationCard = document.getElementById('addressParticipationCard');
const addressDetailsEl = document.getElementById('addressDetails');
const addressTxListPage = document.getElementById('addressTxListPage');
const addressTxPager = document.getElementById('addressTxPager');
const addressLoadMoreBtn = document.getElementById('addressLoadMore');
const addressFilterTabs = document.querySelectorAll('.address-tabs .tab-btn');
const addressCopyToast = document.getElementById('addressCopyToast');
const observerSyncPanel = document.getElementById('observerSyncPanel');
const observerTxList = document.getElementById('observerTxList');
const observerStatusBadgeEl = document.getElementById('observerStatusBadge');
const observerSyncedHeightEl = document.getElementById('observerSyncedHeight');
const observerProducerHeightEl = document.getElementById('observerProducerHeight');
const observerLagBlocksEl = document.getElementById('observerLagBlocks');
const observerProducerUrlEl = document.getElementById('observerProducerUrl');
const observerStatePanel = document.getElementById('observerStatePanel');
const observerLogFeed = document.getElementById('observerLogFeed');
const devWalletPanel = document.getElementById('devWalletPanel');
const devWalletStatus = document.getElementById('devWalletStatus');
const createWalletBtn = document.getElementById('createWalletBtn');
const clearWalletBtn = document.getElementById('clearWalletBtn');
const exportWalletBtn = document.getElementById('exportWalletBtn');
const importWalletBtn = document.getElementById('importWalletBtn');
const importWalletFile = document.getElementById('importWalletFile');
const walletAddressEl = document.getElementById('walletAddress');
const walletPublicKeyEl = document.getElementById('walletPublicKey');
const walletPrivateKeyEl = document.getElementById('walletPrivateKey');
const togglePublicKeyBtn = document.getElementById('togglePublicKey');
const togglePrivateKeyBtn = document.getElementById('togglePrivateKey');
const walletAddressReceiveEl = document.getElementById('walletAddressReceive');
const walletBalanceOverviewEl = document.getElementById('walletBalanceOverview');
const walletActivityOverview = document.getElementById('walletActivityOverview');
const copyAddressBtn = document.getElementById('copyAddressBtn');
const walletActivityPager = document.getElementById('walletActivityPager');
const SPRG_ICON = '/assets/SPRG.png';
const PARTICIPATION_ICON = '/assets/participation.png';
const LOYAL_ICON = '/assets/loyal.png';
const TX_ICON = '/assets/tx.png';
const walletBalanceEl = document.getElementById('walletBalance');
const walletBalanceHintEl = document.getElementById('walletBalanceHint');
const walletNonceEl = document.getElementById('walletNonce');
const sendTxForm = document.getElementById('sendTxForm');
const sendTxBtn = document.getElementById('sendTxBtn');
const sendTxStatus = document.getElementById('sendTxStatus');
const txToInput = document.getElementById('txTo');
const txAmountInput = document.getElementById('txAmount');
const txFeeInput = document.getElementById('txFee');
const txMemoInput = document.getElementById('txMemo');
const walletActivity = document.getElementById('walletActivity');
const registerParticipantBtn = document.getElementById('registerParticipantBtn');
const unregisterParticipantBtn = document.getElementById('unregisterParticipantBtn');
const heartbeatBtn = document.getElementById('heartbeatBtn');
const autoHeartbeatToggle = document.getElementById('autoHeartbeatToggle');
const txFeeHint = document.getElementById('txFeeHint');
const participantStatusEl = document.getElementById('participantStatus');
const participantBondEl = document.getElementById('participantBond');
const participantSponsorEl = document.getElementById('participantSponsor');
const participantNextEl = document.getElementById('participantNext');
const participantBadgeEl = document.getElementById('participantBadge');
const participantNextShortEl = document.getElementById('participantNextShort');
const participationTabBtn = document.getElementById('participationTabBtn');
const walletTabButtons = document.querySelectorAll('.wallet-tabs .tab-btn');
const walletTabPanels = document.querySelectorAll('.wallet-tab-panel');
const walletActivityLink = document.getElementById('walletActivityLink');
const sponsorAddressInput = document.getElementById('sponsorAddressInput');
const sponsorParticipantBtn = document.getElementById('sponsorParticipantBtn');
const searchForm = document.getElementById('searchForm');
const searchInput = document.getElementById('searchInput');
const startMiningBtn = document.getElementById('startMining');
const stopMiningBtn = document.getElementById('stopMining');
const viewBasicBtn = document.getElementById('viewBasic');
const viewAdvancedBtn = document.getElementById('viewAdvanced');
const blockTabButtons = document.querySelectorAll('.block-tabs .tab-btn');
const blockTabPanels = document.querySelectorAll('.block-tab-panel');
const networkOverviewPanel = document.getElementById('networkOverviewPanel');
const networkHealthPanel = document.getElementById('networkHealthPanel');
const observerNodesList = document.getElementById('observerNodesList');
const observerPager = document.getElementById('observerPager');
const observerFilters = document.getElementById('observerFilters');
const observerStatusFilter = document.getElementById('observerStatusFilter');
const observerCountryFilter = document.getElementById('observerCountryFilter');
const observerVersionFilter = document.getElementById('observerVersionFilter');
const observerPrivacyForm = document.getElementById('observerPrivacyForm');
const observerPublicListingEnabled = document.getElementById('observerPublicListingEnabled');
const observerPrivacyFields = document.getElementById('observerPrivacyFields');
const observerCountryCode = document.getElementById('observerCountryCode');
const observerPublicAlias = document.getElementById('observerPublicAlias');
const observerPrivacyStatus = document.getElementById('observerPrivacyStatus');

function shortHash(hash) {
  if (!hash) return '-';
  return `${hash.slice(0, 8)}…${hash.slice(-8)}`;
}

function shortAddress(address) {
  if (!address) return '-';
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function addressLink(address, label) {
  if (!address) return '-';
  const text = label || shortAddress(address);
  return `<a class="addr-link" href="/address/${address}" data-address="${address}">${text}</a>`;
}

function formatNumber(value) {
  return new Intl.NumberFormat('nl-NL').format(value);
}

function formatBigIntString(value) {
  try {
    return new Intl.NumberFormat('nl-NL').format(BigInt(value || '0'));
  } catch {
    return value ?? '0';
  }
}

function formatTokenAmount(microValue, decimals, maxDecimals = 4) {
  try {
    const v = BigInt(microValue || '0');
    const base = 10n ** BigInt(decimals);
    const whole = v / base;
    const frac = v % base;
    const fracStr = frac.toString().padStart(decimals, '0').slice(0, maxDecimals).replace(/0+$/, '');
    return fracStr ? `${whole.toString()}.${fracStr}` : whole.toString();
  } catch {
    return '0';
  }
}

function walletAmountHtml(microValue, decimals) {
  const amount = formatTokenAmount(microValue, decimals, 6);
  return `<span class="sprg-amount"><img src="${SPRG_ICON}" alt="" class="sprg-icon" />${amount}</span>`;
}

function activityMeta(tx) {
  if (tx.type === 'participant_reward') {
    return { icon: PARTICIPATION_ICON, label: 'Participation reward' };
  }
  if (tx.type === 'holder_reward') {
    return { icon: LOYAL_ICON, label: 'Holder reward' };
  }
  return { icon: TX_ICON, label: tx.from === walletState.address ? 'Sent' : 'Received' };
}

function parseTokenToMicro(value, decimals) {
  if (!value || !/^\d+(\.\d+)?$/.test(value)) {
    throw new Error('Invalid amount format');
  }
  const [whole, fraction = ''] = value.split('.');
  if (fraction.length > decimals) {
    throw new Error('Too many decimal places');
  }
  const padded = (fraction + '0'.repeat(decimals)).slice(0, decimals);
  const digits = `${whole}${padded}`.replace(/^0+(?=\d)/, '');
  return BigInt(digits || '0').toString();
}

function bytesToHex(bytes) {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

function hexToBytes(hex) {
  if (!hex || hex.length % 2 !== 0) return new Uint8Array();
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i += 1) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

function base64UrlToBytes(value) {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/');
  const padLen = (4 - (padded.length % 4)) % 4;
  const base64 = padded + '='.repeat(padLen);
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function bytesToBase64Url(bytes) {
  let binary = '';
  bytes.forEach((b) => {
    binary += String.fromCharCode(b);
  });
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

function base58Encode(bytes) {
  if (!bytes.length) return '';
  let zeros = 0;
  while (zeros < bytes.length && bytes[zeros] === 0) zeros += 1;
  const digits = [];
  for (let i = zeros; i < bytes.length; i += 1) {
    let carry = bytes[i];
    for (let j = 0; j < digits.length; j += 1) {
      const val = digits[j] * 256 + carry;
      digits[j] = val % 58;
      carry = Math.floor(val / 58);
    }
    while (carry > 0) {
      digits.push(carry % 58);
      carry = Math.floor(carry / 58);
    }
  }
  let result = '1'.repeat(zeros);
  for (let i = digits.length - 1; i >= 0; i -= 1) {
    result += BASE58_ALPHABET[digits[i]];
  }
  return result;
}

async function sha256Bytes(data) {
  const buffer = await crypto.subtle.digest('SHA-256', data);
  return new Uint8Array(buffer);
}

async function deriveAddress(publicKeyHex) {
  const pubKeyBytes = hexToBytes(publicKeyHex);
  const hash = await sha256Bytes(pubKeyBytes);
  const addressBytes = hash.slice(0, 20);
  return `spg_${base58Encode(addressBytes)}`;
}

function normalizeTxList(block) {
  if (!block) return [];
  if (Array.isArray(block.transactions)) {
    return block.transactions.map((tx) => ({
      ...tx,
      txid: tx.txid ?? tx.id,
      amountMicro: tx.amountMicro ?? tx.amountBaseUnits ?? '0',
      feeMicro: tx.feeMicro ?? tx.feeBaseUnits ?? '0'
    }));
  }
  if (block.rewardBaseUnits && block.rewardBaseUnits !== '0') {
    return [{
      id: `legacy-${block.height}`,
      txid: `legacy-${block.height}`,
      type: 'reward',
      from: null,
      to: block.rewardTo || null,
      amountMicro: block.rewardBaseUnits,
      feeMicro: '0',
      timestamp: block.timestamp
    }];
  }
  return [];
}

function toDays(blocks, blockTimeSeconds) {
  const seconds = Number(blocks) * Number(blockTimeSeconds || 51);
  const days = seconds / 86400;
  return `${days.toFixed(1)} days`;
}

function formatRelativeTime(iso) {
  if (!iso) return '-';
  const then = new Date(iso).getTime();
  const now = Date.now();
  if (!Number.isFinite(then)) return '-';
  const diff = Math.max(0, now - then);
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function copyToClipboard(text) {
  if (!text) return;
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text);
    return;
  }
  const area = document.createElement('textarea');
  area.value = text;
  document.body.appendChild(area);
  area.select();
  document.execCommand('copy');
  area.remove();
}

function tooltip(label, text) {
  return `${label}<span class="tooltip" title="${text}">i</span>`;
}

function panelRow(label, value) {
  return `<div class="panel-row"><span>${label}</span><span>${value}</span></div>`;
}

async function fetchState() {
  const res = await fetch('/api/blocks/state');
  return res.json();
}

async function fetchStatus() {
  const res = await fetch('/api/status');
  return res.json();
}

async function fetchGenesis() {
  const res = await fetch('/api/genesis');
  return res.json();
}

async function fetchBlocks(page) {
  const res = await fetch(`/api/blocks?page=${page}&limit=${LIMIT}`);
  return res.json();
}

async function fetchBlockByHeight(height) {
  const res = await fetch(`/api/block/${height}`);
  if (!res.ok) return { error: res.status };
  try {
    return await res.json();
  } catch {
    return { error: 'invalid' };
  }
}

async function fetchTxById(txid) {
  const res = await fetch(`/api/tx/${txid}`);
  if (!res.ok) return { error: res.status };
  try {
    return await res.json();
  } catch {
    return { error: 'invalid' };
  }
}

async function fetchAddressStats(address) {
  const res = await fetch(`/api/address/${address}`);
  if (!res.ok) return { error: res.status };
  return res.json();
}

async function fetchAddressTxs(address, limit = 50) {
  const res = await fetch(`/api/address/${address}/txs?limit=${limit}`);
  if (!res.ok) return { error: res.status };
  return res.json();
}

async function fetchMiningStatus() {
  const res = await fetch('/api/mining/status');
  return res.json();
}

async function fetchMempool() {
  const res = await fetch('/api/mempool');
  if (!res.ok) return { count: 0, transactions: [] };
  return res.json();
}

async function fetchNetworkStatus() {
  const res = await fetch('/api/network/status');
  if (!res.ok) return null;
  return res.json();
}

async function fetchObserverNodes(page = 1) {
  const params = new URLSearchParams();
  params.set('page', String(page));
  params.set('limit', '12');
  if (observerStatusFilter?.value) params.set('status', observerStatusFilter.value);
  if (observerCountryFilter?.value) params.set('country', observerCountryFilter.value.trim().toUpperCase());
  if (observerVersionFilter?.value) params.set('version', observerVersionFilter.value.trim());
  const res = await fetch(`/api/network/observers?${params.toString()}`);
  if (!res.ok) return { page, limit: 12, total: 0, observers: [] };
  return res.json();
}

async function fetchObserverSettings() {
  const res = await fetch('/api/observer/settings');
  if (!res.ok) return null;
  return res.json();
}

async function saveObserverSettings(settings) {
  const res = await fetch('/api/observer/settings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(settings)
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Unable to save privacy settings.');
  return data.settings;
}

async function setMining(active) {
  await fetch(`/api/mining/${active ? 'start' : 'stop'}`, { method: 'POST' });
  updateMiningStatus();
}

function formatSecondsAgo(seconds) {
  const s = Number(seconds);
  if (!Number.isFinite(s)) return '-';
  if (s < 60) return `${Math.max(0, Math.floor(s))} seconds ago`;
  const mins = Math.floor(s / 60);
  if (mins < 60) return `${mins} minutes ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} hours ago`;
  return `${Math.floor(hours / 24)} days ago`;
}

function networkCard(label, value, sub = '') {
  return `
    <div class="network-card">
      <div class="stat-label">${label}</div>
      <div class="stat-value">${value}</div>
      ${sub ? `<div class="stat-sub">${sub}</div>` : ''}
    </div>
  `;
}

function formatDateTime(iso) {
  if (!iso) return '-';
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return '-';
  return date.toLocaleString('nl-NL', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });
}

function renderNetworkOverview(network) {
  if (!network) return;
  const lastBlock = network.lastBlockTimestamp ? formatDateTime(network.lastBlockTimestamp) : '-';
  const lastBlockRelative = network.lastBlockTimestamp ? formatRelativeTime(network.lastBlockTimestamp) : '';
  const pending = formatNumber(network.mempoolSize ?? 0);
  const html = [
    networkCard('Official Producers', formatNumber(network.producerCount ?? 1), network.producer?.online ? 'Producer online' : 'Producer offline'),
    networkCard('Active Observer Nodes', formatNumber(network.activeObserverCount ?? 0), 'Recent heartbeat, healthy status'),
    networkCard('Fully Synced Observers', formatNumber(network.fullySyncedObserverCount ?? 0)),
    networkCard('Syncing Observers', formatNumber(network.syncingObserverCount ?? 0)),
    networkCard('Current Chain Height', formatNumber(network.currentHeight ?? 0)),
    networkCard('Last Block Time', lastBlock, lastBlockRelative),
    networkCard('Average Block Time', `${formatNumber(network.averageBlockTimeSeconds ?? 0)} sec`),
    networkCard('Pending Transactions', pending)
  ].join('');
  if (networkOverviewPanel) networkOverviewPanel.innerHTML = html;
}

function renderNetworkHealth(network) {
  if (!networkHealthPanel || !network) return;
  networkHealthPanel.innerHTML = [
    networkCard('Producer Online', network.producer?.online ? 'Yes' : 'No'),
    networkCard('Active Observers', formatNumber(network.activeObserverCount ?? 0)),
    networkCard('Fully Synced', formatNumber(network.fullySyncedObserverCount ?? 0)),
    networkCard('Syncing', formatNumber(network.syncingObserverCount ?? 0)),
    networkCard('Mismatch', formatNumber(network.mismatchObserverCount ?? 0)),
    networkCard('Highest Height', formatNumber(network.highestObserverHeight ?? 0)),
    networkCard('Lowest Height', formatNumber(network.lowestObserverHeight ?? 0)),
    networkCard('Average Lag', `${formatNumber(network.averageObserverLag ?? 0)} blocks`)
  ].join('');
}

function observerStatusLabel(status) {
  if (status === 'fully_synced') return 'Fully Synced';
  if (status === 'syncing') return 'Syncing';
  if (status === 'mismatch') return 'Mismatch';
  if (status === 'offline') return 'Offline';
  return status || '-';
}

function countryFlag(code) {
  if (!/^[A-Z]{2}$/.test(code || '')) return '';
  return Array.from(code).map((ch) => String.fromCodePoint(ch.charCodeAt(0) + 127397)).join('');
}

function countryName(code) {
  if (!/^[A-Z]{2}$/.test(code || '')) return 'Location not shared';
  try {
    if (Intl.DisplayNames) {
      const names = new Intl.DisplayNames(['en'], { type: 'region' });
      return names.of(code) || code;
    }
  } catch {
    // fall back to code
  }
  return code;
}

function sharedLocationLabel(code) {
  if (!/^[A-Z]{2}$/.test(code || '')) return 'Location not shared';
  return `${countryFlag(code)} ${countryName(code)}`;
}

function renderObserverNodes(data) {
  if (!observerNodesList) return;
  const observers = Array.isArray(data?.observers) ? data.observers : [];
  if (!observers.length) {
    observerNodesList.innerHTML = '<div class="detail-empty">No observer nodes found.</div>';
  } else {
    observerNodesList.innerHTML = observers.map((node) => `
      <article class="observer-node-card ${escapeHtml(node.status)}">
        <div class="observer-node-country">${escapeHtml(sharedLocationLabel(node.countryCode || ''))}</div>
        <div class="observer-node-title">${escapeHtml(node.publicAlias || 'Observer')}</div>
        <div><span class="observer-status ${escapeHtml(node.status)}">${observerStatusLabel(node.status)}</span></div>
        <div class="observer-node-meta">
          <span>Height: <strong>${formatNumber(node.height ?? 0)}</strong></span>
          <span>Lag: <strong>${formatNumber(node.lag ?? 0)} blocks</strong></span>
          <span>Version: <strong>${escapeHtml(node.version || '-')}</strong></span>
          <span>Last Seen: <strong>${formatSecondsAgo(node.secondsSinceLastSeen)}</strong></span>
        </div>
      </article>
    `).join('');
  }

  if (!observerPager) return;
  const page = Number(data?.page || observerNodesPage);
  const limit = Number(data?.limit || 12);
  const total = Number(data?.total || 0);
  const totalPages = Math.max(1, Math.ceil(total / limit));
  observerPager.innerHTML = `
    <div class="pager">
      <button data-observer-page="prev" ${page <= 1 ? 'disabled' : ''}>Prev</button>
      <span>Page ${formatNumber(page)} / ${formatNumber(totalPages)}</span>
      <button data-observer-page="next" ${page >= totalPages ? 'disabled' : ''}>Next</button>
    </div>
  `;
  observerPager.querySelectorAll('button[data-observer-page]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const action = btn.dataset.observerPage;
      if (action === 'prev' && observerNodesPage > 1) observerNodesPage -= 1;
      if (action === 'next' && observerNodesPage < totalPages) observerNodesPage += 1;
      refreshNetworkPage();
    });
  });
}

function renderObserverPrivacySettings(settings) {
  if (!observerPrivacyForm || !settings) return;
  observerPublicListingEnabled.checked = settings.publicListingEnabled === true;
  observerPublicAlias.value = settings.publicAlias || '';
  observerCountryCode.value = settings.countryCode || '';
  observerPrivacyFields.classList.toggle('hidden', !observerPublicListingEnabled.checked);
}

function renderPanels() {
  if (!latestState || !statusPanel) return;
  const baseFee = viewMode === 'advanced'
    ? `${formatBigIntString(latestState.baseFeeMicro)} micro`
    : `${formatTokenAmount(latestState.baseFeeMicro, latestState.decimals)} ${latestState.symbol}`;

  statusPanel.innerHTML = [
    panelRow('Chain ID', latestState.chainId ?? '-'),
    panelRow('Protocol', latestState.protocolVersion ?? '-'),
    panelRow('Economics', latestState.economicsVersion ?? '-'),
    panelRow('Height', formatNumber(latestState.latestHeight ?? 0)),
    panelRow('Base Fee', baseFee),
    panelRow('Next Payout', `~${toDays(latestState.blocksUntilPayout ?? 0, latestState.blockTimeSeconds)} (${formatNumber(latestState.blocksUntilPayout ?? 0)} blocks)`)
  ].join('');

  if (latestGenesis && genesisPanel) {
    genesisPanel.innerHTML = [
      panelRow('Chain ID', latestGenesis.chainId ?? '-'),
      panelRow('Protocol', latestGenesis.protocolVersion ?? '-'),
      panelRow('Economics', latestGenesis.economicsVersion ?? '-'),
      panelRow('Genesis Hash', shortHash(latestGenesis.genesisHash ?? ''))
    ].join('');
  }
}

function renderStats(state) {
  if (!chainStats) return;
  const latestHeight = state.latestBlock?.height ?? state.latestHeight ?? 0;
  const avgGas = `${state.averageGasFeeTokens ?? '0'} ${state.symbol}`;

  if (viewMode === 'advanced') {
    const sectionA = [
      { label: 'Latest Block', value: formatNumber(latestHeight) },
      { label: 'Latest Block Txs', value: formatNumber(state.latestBlock?.txCount ?? 0) },
      { label: 'Active Participants', value: formatNumber(state.activeParticipantCount ?? 0) },
      { label: 'Mint (micro)', value: formatBigIntString(state.mintMicro) },
      {
        label: 'Mint Split (micro)',
        value: `P ${formatBigIntString(state.splitMicro?.participant)} | N ${formatBigIntString(state.splitMicro?.nodePool)} | T ${formatBigIntString(state.splitMicro?.treasury)} | H ${formatBigIntString(state.splitMicro?.holderPool)}`
      }
    ];
    const sectionB = [
      { label: 'Registered Participants', value: formatNumber(state.totalRegisteredParticipants ?? 0) },
      {
        label: 'Total Transactions',
        value: formatNumber(state.totalTransactions ?? 0),
        sub: `Avg. Gas: ${avgGas} (${formatBigIntString(state.baseFeeMicro)} micro/weight)`
      },
      { label: 'Total Addresses', value: formatNumber(state.totalAddresses ?? 0) }
    ];
    const sectionC = [
      {
        label: 'Pools (micro)',
        value: `Node ${formatBigIntString(state.poolsMicro?.node)} | Holder ${formatBigIntString(state.poolsMicro?.holder)}`
      },
      {
        label: 'Holder Avg Window',
        value: `${formatNumber(state.avgWindowBlocks ?? 0)} blocks`,
        sub: `Eligibility: >= ${formatTokenAmount(state.avgEligibilityMicro ?? '0', state.decimals ?? 6, 6)} ${state.symbol}`
      },
      { label: 'Blocks Until Payout', value: formatNumber(state.blocksUntilPayout ?? 0) }
    ];
    const renderSection = (title, items, muted = false) => `
      <div class="stats-section ${muted ? 'muted-section' : ''}">
        <div class="section-header">${title}</div>
        <div class="stats-grid">
          ${items.map((item) => `
            <div class="stat">
              <div class="stat-label">${item.label}</div>
              <div class="stat-value">${item.value}</div>
              ${item.sub ? `<div class="stat-sub">${item.sub}</div>` : ''}
            </div>
          `).join('')}
        </div>
      </div>
    `;
    chainStats.innerHTML = [
      renderSection('This Block', sectionA),
      renderSection('Network Overview', sectionB),
      renderSection('Reward Cycle', sectionC, true)
    ].join('');
    return;
  }

  const decimals = state.decimals ?? 6;
  const mintTokens = formatTokenAmount(state.mintMicro, decimals, 4);
  const split = {
    producer: formatTokenAmount(state.splitMicro?.participant, decimals, 4),
    node: formatTokenAmount(state.splitMicro?.nodePool, decimals, 4),
    treasury: formatTokenAmount(state.splitMicro?.treasury, decimals, 4),
    holder: formatTokenAmount(state.splitMicro?.holderPool, decimals, 4)
  };
  const pools = {
    node: formatTokenAmount(state.poolsMicro?.node, decimals, 4),
    holder: formatTokenAmount(state.poolsMicro?.holder, decimals, 4)
  };

  const sectionA = [
    {
      label: 'Latest Block',
      value: formatNumber(latestHeight),
      sub: `Latest block transactions: ${formatNumber(state.latestBlock?.txCount ?? 0)}`
    },
    {
      label: tooltip('New Tokens This Block', 'New tokens created this block (inflation).'),
      value: `${mintTokens} ${state.symbol}`
    },
    {
      label: tooltip('Reward Distribution (This Block)', 'How the new tokens are split this block.'),
      value: `${mintTokens} ${state.symbol}`,
      sub: 'Based on 14-day rolling average (>= 1,000 SPRG)',
      list: [
        ['Participants', `${split.producer} ${state.symbol}`],
        ['Node Holders', `${split.node} ${state.symbol}`],
        ['Treasury', `${split.treasury} ${state.symbol}`],
        ['Eligible Holders', `${split.holder} ${state.symbol}`]
      ]
    },
    {
      label: 'Active Participants',
      value: formatNumber(state.activeParticipantCount ?? 0),
      sub: `Window: last ${formatNumber(state.ACTIVE_WINDOW_BLOCKS ?? 0)} blocks`
    }
  ];
  const sectionB = [
    {
      label: 'Registered Participants',
      value: formatNumber(state.totalRegisteredParticipants ?? 0)
    },
    {
      label: tooltip('Average Transaction Fee', 'Fees adjust automatically with network activity.'),
      value: `${avgGas}`
    },
    {
      label: 'Total Transactions',
      value: formatNumber(state.totalTransactions ?? 0)
    },
    {
      label: 'Total Addresses',
      value: formatNumber(state.totalAddresses ?? 0)
    }
  ];
  const sectionC = [
    {
      label: tooltip('Accumulated Rewards (Not Yet Paid)', 'Pools that accumulate until the 14-day payout.'),
      value: `${pools.node} ${state.symbol}`,
      sub: `Holders pool: ${pools.holder} ${state.symbol}`
    },
    {
      label: tooltip('Next Rewards Payout', 'Rewards are paid out every 14 days to reduce on-chain noise.'),
      value: `~${toDays(state.blocksUntilPayout ?? 0, state.blockTimeSeconds)} (${formatNumber(state.blocksUntilPayout ?? 0)} blocks)`
    }
  ];
  const renderSection = (title, items, muted = false) => `
    <div class="stats-section ${muted ? 'muted-section' : ''}">
      <div class="section-header">${title}</div>
      <div class="stats-grid">
        ${items.map((item) => `
          <div class="stat">
            <div class="stat-label">${item.label}</div>
            <div class="stat-value">${item.value}</div>
            ${item.sub ? `<div class="stat-sub">${item.sub}</div>` : ''}
            ${item.list ? `<div class="stat-list">${item.list.map(([k, v]) => `<span><strong>${k}</strong><span>${v}</span></span>`).join('')}</div>` : ''}
          </div>
        `).join('')}
      </div>
    </div>
  `;
  chainStats.innerHTML = [
    renderSection('This Block', sectionA),
    renderSection('Network Overview', sectionB),
    renderSection('Reward Cycle', sectionC, true)
  ].join('');
}

function shortenUrl(url) {
  if (!url) return '-';
  if (url.length <= 38) return url;
  return `${url.slice(0, 24)}...${url.slice(-10)}`;
}

function formatObserverUptime(ms) {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

function observerStateRow(label, value) {
  return `<div class="observer-state-row"><span class="k">${label}</span><span class="v">${value}</span></div>`;
}

function pushObserverLog(level, message) {
  if (!observerLogFeed || !message) return;
  const ts = new Date().toLocaleTimeString('nl-NL', { hour12: false });
  observerLogEntries.push({ level, message, ts });
  if (observerLogEntries.length > 240) observerLogEntries = observerLogEntries.slice(-240);
  observerLogFeed.innerHTML = observerLogEntries.map((entry) => {
    const cls = entry.level === 'error' ? 'err' : entry.level === 'warn' ? 'warn' : 'ok';
    return `<span class="observer-log-line ${cls}">[${entry.ts}] ${entry.message}</span>`;
  }).join('');
  observerLogFeed.scrollTop = observerLogFeed.scrollHeight;
}

function renderObserverNodeDashboard(state) {
  if (!state) return;
  const statusHeight = Number(state.syncedHeight ?? 0);
  const chainHeight = Number(latestChainState?.latestHeight ?? 0);
  const blockHeight = Number(latestBlocks?.[0]?.height ?? 0);
  const syncedHeight = Math.max(statusHeight, chainHeight, blockHeight);
  const rawProducerHeight = state.producerHeight === null || state.producerHeight === undefined
    ? syncedHeight
    : Number(state.producerHeight ?? 0);
  const producerHeight = Number.isFinite(rawProducerHeight) ? formatNumber(rawProducerHeight) : '-';
  const lagBlocks = Number(state.lagBlocks ?? 0);
  let syncState = state.syncState || 'syncing';
  if (!state.lastSyncError && lagBlocks === 0 && syncedHeight > 0) {
    syncState = 'synced';
  }
  const syncClass = syncState === 'synced' ? 'synced' : syncState === 'error' ? 'error' : 'syncing';
  const producerUrl = state.producerUrl || '-';
  const lastSyncAt = state.lastSyncAt ? new Date(state.lastSyncAt).toLocaleString() : '-';
  const stateRootCandidate = latestBlocks?.[0]?.stateRoot || '-';
  const dbPath = '%APPDATA%\\SpargeObserver\\data\\state.db';

  if (observerStatusBadgeEl) {
    observerStatusBadgeEl.textContent = syncState.toUpperCase();
    observerStatusBadgeEl.className = `observer-pill ${syncClass}`;
  }
  if (observerSyncedHeightEl) observerSyncedHeightEl.textContent = formatNumber(syncedHeight);
  if (observerProducerHeightEl) observerProducerHeightEl.textContent = producerHeight;
  if (observerLagBlocksEl) observerLagBlocksEl.textContent = formatNumber(lagBlocks);
  if (observerProducerUrlEl) {
    observerProducerUrlEl.textContent = shortenUrl(producerUrl);
    observerProducerUrlEl.title = producerUrl;
  }

  if (observerStatePanel) {
    observerStatePanel.innerHTML = [
      observerStateRow('Node mode', state.nodeMode || 'observer'),
      observerStateRow('Uptime', formatObserverUptime(Date.now() - observerStartMs)),
      observerStateRow('Current height', formatNumber(syncedHeight)),
      observerStateRow('State root', shortHash(stateRootCandidate)),
      observerStateRow('Database path', dbPath),
      observerStateRow('Last sync time', lastSyncAt)
    ].join('');
  }

  if (observerLogEntries.length === 0) {
    pushObserverLog('warn', `Observer connected to ${producerUrl}`);
  }

  if (observerLastSyncState !== syncState) {
    pushObserverLog(syncState === 'error' ? 'error' : syncState === 'synced' ? 'ok' : 'warn', `Sync state changed to ${syncState.toUpperCase()}`);
    observerLastSyncState = syncState;
  }
  if (observerLastHeight === null) {
    observerLastHeight = syncedHeight;
    if (syncedHeight > 0) pushObserverLog('ok', `Validated block #${syncedHeight}`);
  } else if (syncedHeight > observerLastHeight) {
    if (syncedHeight - observerLastHeight > 1) {
      pushObserverLog('warn', `Sync batch ${observerLastHeight + 1}-${syncedHeight}`);
    }
    pushObserverLog('ok', `Validated block #${syncedHeight}`);
    pushObserverLog('ok', 'StateRoot OK');
    observerLastHeight = syncedHeight;
  }
  if (state.lastSyncError && state.lastSyncError !== observerLastError) {
    pushObserverLog('error', state.lastSyncError);
    observerLastError = state.lastSyncError;
  }
}

function renderObserverSync(state) {
  const hasObserverConsole = Boolean(observerStatusBadgeEl || observerLogFeed || observerStatePanel);
  const isObserverLike = state && (state.nodeMode === 'observer' || hasObserverConsole);

  if (!isObserverLike) {
    if (observerSyncPanel) observerSyncPanel.innerHTML = '<div class="detail-empty">Observer mode inactive.</div>';
    return;
  }
  const syncState = state.syncState || 'syncing';
  const badgeClass = syncState === 'synced' ? 'badge success' : syncState === 'error' ? 'badge error' : 'badge warning';
  const lastSyncAt = state.lastSyncAt ? new Date(state.lastSyncAt).toLocaleString() : '-';
  if (observerSyncPanel) {
    observerSyncPanel.innerHTML = [
      panelRow('State', `<span class="${badgeClass}">${syncState}</span>`),
      panelRow('Synced Height', formatNumber(state.syncedHeight ?? 0)),
      panelRow('Producer Height', state.producerHeight === null ? '-' : formatNumber(state.producerHeight)),
      panelRow('Lag Blocks', formatNumber(state.lagBlocks ?? 0)),
      panelRow('Producer URL', state.producerUrl || '-'),
      panelRow('Last Sync', lastSyncAt),
      state.lastSyncError ? panelRow('Last Error', `<span class="muted">${state.lastSyncError}</span>`) : ''
    ].filter(Boolean).join('');
  }

  renderObserverNodeDashboard(state);
}

function renderObserverTxList(state) {
  if (!observerTxList) return;
  const decimals = Number(state?.decimals ?? 6);
  const rows = [];
  for (const block of latestBlocks || []) {
    const txs = normalizeTxList(block);
    for (const tx of txs) {
      rows.push({
        txid: tx.txid || tx.id,
        height: block.height,
        type: tx.type || 'transfer',
        amount: tx.amountMicro ?? '0',
        timestamp: tx.timestamp || block.timestamp
      });
    }
    if (rows.length >= 10) break;
  }
  const list = rows.slice(0, 10);
  if (!list.length) {
    observerTxList.innerHTML = '<div class="detail-empty">No transactions yet.</div>';
    return;
  }
  observerTxList.innerHTML = `
    <table class="tx-table">
      <thead>
        <tr>
          <th>Txid</th>
          <th>Height</th>
          <th>Type</th>
          <th>Amount</th>
        </tr>
      </thead>
      <tbody>
        ${list.map((tx) => `
          <tr data-txid="${tx.txid}">
            <td>${shortHash(tx.txid)}</td>
            <td>${tx.height}</td>
            <td>${tx.type}</td>
            <td>${formatTokenAmount(tx.amount, decimals)} ${state?.symbol ?? ''}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
  observerTxList.querySelectorAll('tr[data-txid]').forEach((row) => {
    row.addEventListener('click', () => {
      const txid = row.dataset.txid;
      if (txid) window.location.href = `/tx/${txid}`;
    });
  });
}

function renderBlockDetails(block) {
  if (!blockDetailsBody) return;
  if (!block) {
    blockDetailsBody.innerHTML = '<div class="detail-empty">Selecteer een block om details te bekijken.</div>';
    if (blockTxList) {
      blockTxList.innerHTML = '<div class="detail-empty">Selecteer een block om transacties te bekijken.</div>';
    }
    return;
  }

  let header = {};
  if (block.header) {
    try {
      header = JSON.parse(block.header);
    } catch {
      header = {};
    }
  }

  const heightRow = `
    <div class="detail-row">
      <span>Height</span>
      <span class="detail-actions">
        <span>${formatNumber(block.height)}</span>
        <button class="copy-link" data-height="${block.height}">Copy link</button>
      </span>
    </div>
  `;

  const txs = normalizeTxList(block);
  const participantRewards = txs.filter((tx) => tx.type === 'participant_reward');
  const participantTotal = participantRewards.reduce((sum, tx) => {
    try {
      return sum + BigInt(tx.amountMicro || '0');
    } catch {
      return sum;
    }
  }, 0n);
  const participantSummary = `${participantRewards.length} recipients · ${walletAmountHtml(participantTotal.toString(), latestChainState?.decimals ?? 6)}`;

  blockDetailsBody.innerHTML = [
    heightRow,
    ['Hash', block.hash],
    ['Prev Hash', block.prevHash],
    ['Prev State Root', block.prevStateRoot ?? '-'],
    ['State Root', block.stateRoot ?? '-'],
    ['Producer', addressLink(block.rewardTo || latestChainState?.proposerAddress)],
    ['Participant Rewards', participantSummary],
    ['Chain ID', header.chainId ?? block.chainId ?? '-'],
    ['Protocol Version', header.protocolVersion ?? block.protocolVersion ?? '-'],
    ['Economics Version', header.economicsVersion ?? block.economicsVersion ?? '-']
  ].map((item) => {
    if (typeof item === 'string') return item;
    const [label, value] = item;
    return `<div class="detail-row"><span>${label}</span><span>${value}</span></div>`;
  }).join('');

  const copyBtn = blockDetailsBody.querySelector('.copy-link');
  if (copyBtn) {
    copyBtn.addEventListener('click', () => copyBlockLink(block.height));
  }
}

function renderTxList(block) {
  if (!blockTxList) return;
  const txs = normalizeTxList(block);
  if (!txs.length) {
    blockTxList.innerHTML = '<div class="detail-empty">Geen transacties in dit block.</div>';
    return;
  }
  const decimals = latestChainState?.decimals ?? 6;
  const symbol = latestChainState?.symbol ?? '';
  blockTxList.innerHTML = `
    <table class="tx-table">
      <thead>
        <tr>
          <th>TxID</th>
          <th>Type</th>
          <th>From</th>
          <th>To</th>
          <th>Amount</th>
          <th>Fee</th>
        </tr>
      </thead>
      <tbody>
        ${txs.map((tx) => `
          <tr data-txid="${tx.txid || tx.id}" class="${currentTxId && (tx.txid || tx.id) === currentTxId ? 'selected' : ''}">
            <td title="${tx.txid || tx.id}"><a class="tx-link" href="/tx/${tx.txid || tx.id}">${shortHash(tx.txid || tx.id)}</a></td>
            <td>${tx.type ?? 'transfer'}</td>
            <td>${addressLink(tx.from, tx.from ? shortAddress(tx.from) : '-')}</td>
            <td>${addressLink(tx.to, tx.to ? shortAddress(tx.to) : '-')}</td>
            <td>${formatTokenAmount(tx.amountMicro, decimals, 6)} ${symbol}</td>
            <td>${formatTokenAmount(tx.feeMicro, decimals, 6)} ${symbol}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;

  blockTxList.querySelectorAll('tr[data-txid]').forEach((row) => {
    row.addEventListener('click', (event) => {
      if (event.target && event.target.tagName === 'A') {
        event.preventDefault();
      }
      const txid = row.dataset.txid;
      window.location.href = `/tx/${txid}`;
    });
  });
}

function renderBlockLoading(height) {
  if (!blockDetailsBody) return;
  blockDetailsBody.classList.add('loading');
  blockDetailsBody.innerHTML = `<div class="detail-empty">Loading block ${height}…</div>`;
}

function renderBlockError(height, message) {
  if (!blockDetailsBody) return;
  blockDetailsBody.classList.remove('loading');
  blockDetailsBody.innerHTML = `<div class="detail-empty">${message.replace('{height}', height)}</div>`;
}

function renderTxDetails(tx, errorMessage) {
  if (!txDetailsBody) return;
  if (errorMessage) {
    txDetailsBody.innerHTML = `<div class="detail-empty">${errorMessage}</div>`;
    return;
  }
  if (!tx) {
    txDetailsBody.innerHTML = '<div class="detail-empty">Selecteer een transactie om details te bekijken.</div>';
    return;
  }
  const decimals = latestChainState?.decimals ?? 6;
  const symbol = latestChainState?.symbol ?? '';
  const blockLink = tx.blockHeight !== undefined && tx.blockHeight !== null
    ? `<a class="tx-link" href="/block/${tx.blockHeight}">${tx.blockHeight}</a>`
    : '-';
  txDetailsBody.innerHTML = [
    ['TxID', tx.txid ?? tx.id ?? '-'],
    ['Type', tx.type ?? 'transfer'],
    ['Chain ID', tx.chainId ?? '-'],
    ['From', addressLink(tx.from, tx.from ?? '-')],
    ['To', addressLink(tx.to, tx.to ?? '-')],
    ['Amount', `${formatTokenAmount(tx.amountMicro ?? tx.amountBaseUnits ?? '0', decimals, 6)} ${symbol}`],
    ['Fee', `${formatTokenAmount(tx.feeMicro ?? tx.feeBaseUnits ?? '0', decimals, 6)} ${symbol}`],
    ['Nonce', tx.nonce ?? '-'],
    ['Public Key', tx.publicKeyHex ?? '-'],
    ['Signature', tx.signatureHex ?? '-'],
    ['Sponsor', tx.sponsor ?? '-'],
    ['Participant', tx.participant ?? '-'],
    ['Memo', tx.memo ? tx.memo : '-'],
    ['Block', blockLink],
    ['Timestamp', tx.timestamp ? new Date(tx.timestamp).toLocaleString('nl-NL') : '-']
  ].map(([label, value]) => `<div class="detail-row"><span>${label}</span><span>${value}</span></div>`).join('');
}

function renderTxPage(tx, state, errorMessage) {
  if (!txSummaryEl || !txPartiesEl || !txAmountsEl || !txTechnicalBodyEl) return;
  if (errorMessage) {
    txSummaryEl.innerHTML = `<div class="detail-empty">${errorMessage}</div>`;
    txPartiesEl.innerHTML = '';
    txAmountsEl.innerHTML = '';
    if (txParticipationEl) txParticipationEl.innerHTML = '';
    if (txParticipationCard) txParticipationCard.style.display = 'none';
    txTechnicalBodyEl.innerHTML = '';
    return;
  }
  if (!tx) {
    txSummaryEl.innerHTML = '<div class="detail-empty">Transaction not found.</div>';
    txPartiesEl.innerHTML = '';
    txAmountsEl.innerHTML = '';
    if (txParticipationEl) txParticipationEl.innerHTML = '';
    if (txParticipationCard) txParticipationCard.style.display = 'none';
    txTechnicalBodyEl.innerHTML = '';
    return;
  }

  const decimals = state?.decimals ?? 6;
  const symbol = state?.symbol ?? '';
  const type = (tx.type || 'transfer').toLowerCase();
  const confirmed = tx.blockHeight !== undefined && tx.blockHeight !== null;
  const statusLabel = confirmed ? 'Confirmed' : 'Pending';
  const typeLabel = [
    'transfer',
    'register_participant',
    'unregister_participant',
    'heartbeat',
    'participant_reward',
    'holder_reward',
    'node_reward',
    'treasury_reward',
    'node_pool_accrual',
    'holder_pool_accrual',
    'node_leftover',
    'holder_leftover',
    'node_empty',
    'holder_empty'
  ].includes(type)
    ? type
    : 'unknown';
  const blockHeight = confirmed ? tx.blockHeight : null;
  const currentHeight = Number(state?.latestHeight ?? 0);
  const confirmations = confirmed ? Math.max(currentHeight - Number(blockHeight), 0) : '-';
  const timeAbs = tx.timestamp ? new Date(tx.timestamp).toLocaleString('nl-NL') : '-';
  const timeRel = tx.timestamp ? formatRelativeTime(tx.timestamp) : '-';
  const blockLink = confirmed ? `<a class="tx-link" href="/block/${blockHeight}">${blockHeight}</a>` : 'Pending';

  if (txBackLinkEl) {
    txBackLinkEl.href = confirmed ? `/block/${blockHeight}` : '/';
    txBackLinkEl.textContent = confirmed ? 'Back to Block' : 'Back to Explorer';
  }

  const txidValue = tx.txid ?? tx.id ?? '-';
  const txidRow = `
    <div class="detail-row">
      <span>TxID</span>
      <span class="detail-actions">
        <span class="mono">${txidValue}</span>
        <button class="copy-link" data-copy="${txidValue}">Copy</button>
      </span>
    </div>
  `;

  txSummaryEl.innerHTML = [
    ['Status', `<span class="badge ${confirmed ? 'active' : 'inactive'}">${statusLabel}</span>`],
    ['Type', `<span class="badge">${typeLabel}</span>`],
    txidRow,
    ['Block Height', blockLink],
    ['Confirmations', confirmations],
    ['Timestamp', `${timeAbs} · ${timeRel}`],
    ['Tx Index', tx.txIndex ?? tx.index ?? '-']
  ].map((item) => {
    if (typeof item === 'string') return item;
    const [label, value] = item;
    return `<div class="detail-row"><span>${label}</span><span>${value}</span></div>`;
  }).join('');

  const parties = [];
  const partyRow = (label, address) => `
    <div class="detail-row">
      <span>${label}</span>
      <span class="detail-actions">
        ${addressLink(address, shortAddress(address))}
        <button class="copy-link" data-copy="${address}">Copy</button>
      </span>
    </div>
  `;
  if (tx.from) parties.push(partyRow('From', tx.from));
  if (tx.to) parties.push(partyRow('To', tx.to));
  if (tx.participant) parties.push(partyRow('Participant', tx.participant));
  if (tx.sponsor) parties.push(partyRow('Sponsor', tx.sponsor));
  txPartiesEl.innerHTML = parties.length
    ? parties.join('')
    : '<div class="detail-empty">No parties recorded.</div>';

  const amount = `${formatTokenAmount(tx.amountMicro ?? '0', decimals, 6)} ${symbol}`.trim();
  const fee = `${formatTokenAmount(tx.feeMicro ?? '0', decimals, 6)} ${symbol}`.trim();
  const amountRows = [];
  if (type === 'transfer') {
    amountRows.push(['Amount', amount]);
    amountRows.push(['Fee paid', fee]);
    try {
      const total = BigInt(tx.amountMicro || '0') + BigInt(tx.feeMicro || '0');
      amountRows.push(['Total debited', `${formatTokenAmount(total.toString(), decimals, 6)} ${symbol}`.trim()]);
    } catch {
      amountRows.push(['Total debited', '-']);
    }
  } else if (type.endsWith('_reward')) {
    amountRows.push(['Reward amount', amount]);
    const source = type === 'participant_reward'
      ? 'Participation pool'
      : type === 'holder_reward'
        ? 'Holder pool'
        : type === 'node_reward'
          ? 'Node pool'
          : 'Treasury';
    amountRows.push(['Reward source', source]);
  } else if (type.endsWith('_accrual')) {
    amountRows.push(['Pool accrual', amount]);
    const source = type === 'node_pool_accrual'
      ? 'Node pool'
      : 'Holder pool';
    amountRows.push(['Pool target', source]);
  } else {
    amountRows.push(['Amount', amount]);
    amountRows.push(['Fee paid', fee]);
  }
  txAmountsEl.innerHTML = amountRows.map(([label, value]) => `<div class="detail-row"><span>${label}</span><span>${value}</span></div>`).join('');

  if (txParticipationEl) {
    const participationRows = [];
    if (type === 'register_participant') {
      if (tx.bondMicro !== undefined && tx.bondMicro !== null) {
        participationRows.push(['Bond locked', `${formatTokenAmount(tx.bondMicro, decimals, 6)} ${symbol}`.trim()]);
      } else {
        participationRows.push(['Bond locked', `${formatTokenAmount('50000000000', decimals, 6)} ${symbol}`.trim()]);
      }
    }
    if (type === 'unregister_participant') {
      participationRows.push(['Bond released', 'Yes']);
    }
    if (type === 'heartbeat' || type === 'register_participant' || type === 'unregister_participant') {
      participationRows.push(['LastSeen update', 'Yes']);
    }
    if (participationRows.length) {
      txParticipationEl.innerHTML = participationRows.map(([label, value]) => `<div class="detail-row"><span>${label}</span><span>${value}</span></div>`).join('');
      if (txParticipationCard) txParticipationCard.style.display = '';
    } else {
      txParticipationEl.innerHTML = '<div class="detail-empty">No participation impact.</div>';
      if (txParticipationCard) txParticipationCard.style.display = 'none';
    }
  }

  txTechnicalBodyEl.innerHTML = [
    ['Nonce', tx.nonce ?? '-'],
    ['Chain ID', tx.chainId ?? state?.chainId ?? '-'],
    ['Protocol Version', state?.protocolVersion ?? '-'],
    ['Economics Version', state?.economicsVersion ?? '-'],
    ['Memo', tx.memo ? tx.memo : '-'],
    ['Signature present', tx.signatureHex ? 'Yes' : 'No']
  ].map(([label, value]) => `<div class="detail-row"><span>${label}</span><span>${value}</span></div>`).join('');

  document.querySelectorAll('[data-copy]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const value = btn.getAttribute('data-copy');
      copyToClipboard(value);
      btn.textContent = 'Copied';
      setTimeout(() => {
        btn.textContent = 'Copy';
      }, 1200);
    });
  });
}

async function loadTxDetails(txid, updateUrl = false) {
  if (!txid) {
    renderTxDetails(null);
    return;
  }
  currentTxId = txid;
  if (updateUrl) {
    updateUrlWithTx(txid);
  }
  const tx = await fetchTxById(txid);
  if (!tx || tx.error === 404) {
    renderTxDetails(null, 'Transactie niet gevonden.');
    return;
  }
  if (tx.error) {
    renderTxDetails(null, 'Kon transactie niet laden.');
    return;
  }
  renderTxDetails(tx);
  if (tx.blockHeight !== undefined && tx.blockHeight !== null) {
    const blockLink = document.querySelector(`[data-height="${tx.blockHeight}"]`);
    if (!blockLink) {
      loadBlockDetails(tx.blockHeight);
    }
  }
}

function renderAddressDetails(data, errorMessage) {
  if (!addressDetailsBody) return;
  if (errorMessage) {
    addressDetailsBody.innerHTML = `<div class="detail-empty">${errorMessage}</div>`;
    return;
  }
  if (!data) {
    addressDetailsBody.innerHTML = '<div class="detail-empty">Selecteer een address om details te bekijken.</div>';
    return;
  }
  const decimals = latestChainState?.decimals ?? 6;
  const symbol = latestChainState?.symbol ?? '';
  const badges = [];
  if (latestChainState?.treasuryAddress && data.address === latestChainState.treasuryAddress) {
    badges.push('<span class="badge">Treasury</span>');
  }
  if (latestChainState?.proposerAddress && data.address === latestChainState.proposerAddress) {
    badges.push('<span class="badge">Producer</span>');
  }
  const balanceDisplay = `${formatTokenAmount(data.balanceMicro ?? '0', decimals, 6)} ${symbol}`;
  const avgBalanceDisplay = `${formatTokenAmount(data.avgBalanceMicro ?? '0', decimals, 6)} ${symbol}`;
  const avgEligibleDisplay = data.avgEligible ? 'Yes' : 'No';
  const copyButton = `<button class="copy-link" id="copyAddressLink" data-address="${data.address}">Copy link</button>`;
  addressDetailsBody.innerHTML = [
    `<div class="detail-row"><span>Address</span><span>${data.address} ${badges.join(' ')} ${copyButton}</span></div>`,
    ['Balance', balanceDisplay],
    ['14-day Avg Balance', avgBalanceDisplay],
    ['Holder Eligible', avgEligibleDisplay],
    ['Nonce', data.nonce ?? '0'],
    ['Total Txs', data.txCount ?? 0],
    ['Participant', data.participant ? data.participant.status : '-'],
    ['Bond Locked', data.participant ? `${formatTokenAmount(data.participant.bondMicro || '0', decimals, 2)} ${symbol}` : '-'],
    ['Sponsor', data.participant ? addressLink(data.participant.sponsor, data.participant.sponsor ? shortAddress(data.participant.sponsor) : '-') : '-'],
    ['Sponsored Participants', `${data.sponsoredActiveCount ?? 0} / 10`],
    ['First Seen', data.firstSeen ? new Date(data.firstSeen).toLocaleString('nl-NL') : '-'],
    ['Last Seen', data.lastSeen ? new Date(data.lastSeen).toLocaleString('nl-NL') : '-']
  ].map((item) => {
    if (typeof item === 'string') return item;
    const [label, value] = item;
    return `<div class="detail-row"><span>${label}</span><span>${value}</span></div>`;
  }).join('');

  const copyBtn = document.getElementById('copyAddressLink');
  if (copyBtn) {
    copyBtn.addEventListener('click', () => copyAddressLink(data.address));
  }
}

function renderAddressTxs(address, list) {
  if (!addressTxList) return;
  if (!list || !list.length) {
    addressTxList.innerHTML = '<div class="detail-empty">Geen transacties beschikbaar.</div>';
    return;
  }
  const decimals = latestChainState?.decimals ?? 6;
  const symbol = latestChainState?.symbol ?? '';
  addressTxList.innerHTML = `
    <table class="tx-table">
      <thead>
        <tr>
          <th>TxID</th>
          <th>Direction</th>
          <th>Counterparty</th>
          <th>Amount</th>
          <th>Fee</th>
          <th>Block</th>
          <th>Time</th>
        </tr>
      </thead>
      <tbody>
        ${list.map((tx) => {
          const dir = tx.to === address ? 'IN' : 'OUT';
          const counterparty = tx.to === address ? tx.from : tx.to;
          return `
            <tr>
              <td><a class="tx-link" href="/tx/${tx.txid}">${shortHash(tx.txid)}</a></td>
              <td>${dir}</td>
              <td>${addressLink(counterparty, counterparty ? shortAddress(counterparty) : '-')}</td>
              <td>${formatTokenAmount(tx.amountMicro, decimals, 6)} ${symbol}</td>
              <td>${formatTokenAmount(tx.feeMicro, decimals, 6)} ${symbol}</td>
              <td>${tx.blockHeight}</td>
              <td>${new Date(tx.timestamp).toLocaleString('nl-NL')}</td>
            </tr>
          `;
        }).join('')}
      </tbody>
    </table>
  `;
}

function renderAddressPage(address, stats, txs, state) {
  if (!addressHeaderEl || !addressOverviewEl || !addressDetailsEl) return;
  const decimals = state?.decimals ?? 6;
  const symbol = state?.symbol ?? '';
  const shortAddr = shortAddress(address);
  const badges = [];
  if (state?.treasuryAddress && address === state.treasuryAddress) badges.push('<span class="badge">Treasury</span>');
  if (state?.proposerAddress && address === state.proposerAddress) badges.push('<span class="badge">Producer</span>');
  const participantStatus = stats.participant ? stats.participant.status : 'Not registered';
  const participantBadgeClass = participantStatus === 'active'
    ? 'badge active'
    : participantStatus === 'inactive'
      ? 'badge inactive'
      : 'badge';
  badges.push(`<span class="${participantBadgeClass}">Participant: ${participantStatus}</span>`);

  addressHeaderEl.innerHTML = `
    <div class="detail-row">
      <span>Address</span>
      <span class="detail-actions">
        <span class="mono" title="${address}">${shortAddr}</span>
        <button class="copy-link" data-copy="${address}">Copy</button>
        ${badges.join(' ')}
      </span>
    </div>
  `;

  const balanceDisplay = `${formatTokenAmount(stats.balanceMicro ?? '0', decimals, 6)} ${symbol}`.trim();
  const txCount = stats.txCount ?? 0;
  const firstSeen = stats.firstSeen ? new Date(stats.firstSeen) : null;
  const lastSeen = stats.lastSeen ? new Date(stats.lastSeen) : null;
  const firstSeenLabel = firstSeen ? `${firstSeen.toLocaleString('nl-NL')} · ${formatRelativeTime(stats.firstSeen)}` : '-';
  const lastSeenLabel = lastSeen ? `${lastSeen.toLocaleString('nl-NL')} · ${formatRelativeTime(stats.lastSeen)}` : '-';
  const nonce = stats.nonce ?? '0';
  const avgBalanceDisplay = `${formatTokenAmount(stats.avgBalanceMicro ?? '0', decimals, 6)} ${symbol}`.trim();
  const avgEligible = stats.avgEligible ? 'Yes' : 'No';

  addressOverviewEl.innerHTML = [
    { label: 'Balance', value: balanceDisplay },
    { label: 'Total Transactions', value: formatNumber(txCount) },
    { label: 'On-chain since', value: firstSeenLabel },
    { label: 'Last seen', value: lastSeenLabel },
    { label: 'Nonce', value: nonce },
    { label: '14-day avg balance', value: avgBalanceDisplay },
    { label: 'Eligible holder', value: avgEligible }
  ].map((item) => `
    <div class="stat">
      <div class="stat-label">${item.label}</div>
      <div class="stat-value">${item.value}</div>
    </div>
  `).join('');

  if (addressParticipationCard && addressParticipationEl) {
    if (stats.participant) {
      const lastSeen = Number(stats.participant.lastSeenHeight ?? 0);
      const latestHeight = Number(state?.latestHeight ?? 0);
      const windowBlocks = Number(state?.ACTIVE_WINDOW_BLOCKS ?? 5100);
      const remaining = Math.max(0, windowBlocks - (latestHeight - lastSeen));
      const days = ((remaining * Number(state?.blockTimeSeconds ?? 51)) / 86400).toFixed(1);
      addressParticipationEl.innerHTML = [
        ['Participant status', stats.participant.status],
        ['Bond locked', `${formatTokenAmount(stats.participant.bondMicro || '0', decimals, 2)} ${symbol}`],
        ['Sponsor', stats.participant.sponsor ? addressLink(stats.participant.sponsor, shortAddress(stats.participant.sponsor)) : '-'],
        ['Sponsored participants', `${stats.sponsoredActiveCount ?? 0} / 10`],
        ['Next activity due', `${remaining} blocks (~${days} days)`]
      ].map(([label, value]) => `<div class="detail-row"><span>${label}</span><span>${value}</span></div>`).join('');
      addressParticipationCard.style.display = '';
    } else {
      addressParticipationEl.innerHTML = '<div class="detail-empty">Not registered.</div>';
      addressParticipationCard.style.display = '';
    }
  }

  addressDetailsEl.innerHTML = [
    ['Full address', address],
    ['Chain ID', state?.chainId ?? '-']
  ].map(([label, value]) => `<div class="detail-row"><span>${label}</span><span>${value}</span></div>`).join('');

  document.querySelectorAll('[data-copy]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const value = btn.getAttribute('data-copy');
      copyToClipboard(value);
      btn.textContent = 'Copied';
      setTimeout(() => {
        btn.textContent = 'Copy';
      }, 1200);
    });
  });

  renderAddressTxPage(address, txs, state);
}

function filterAddressTxs(list, address) {
  if (addressTxFilter === 'all') return list;
  if (addressTxFilter === 'transfer') return list.filter((tx) => tx.type === 'transfer');
  if (addressTxFilter === 'reward') return list.filter((tx) => tx.type && tx.type.endsWith('_reward'));
  if (addressTxFilter === 'participation') {
    return list.filter((tx) => ['register_participant', 'unregister_participant', 'heartbeat'].includes(tx.type));
  }
  return list;
}

function renderAddressTxPage(address, list, state) {
  if (!addressTxListPage) return;
  const filtered = filterAddressTxs(list, address);
  if (!filtered.length) {
    addressTxListPage.innerHTML = '<div class="detail-empty">No transactions yet.</div>';
    return;
  }
  const decimals = state?.decimals ?? 6;
  const symbol = state?.symbol ?? '';
  addressTxListPage.innerHTML = `
    <table class="tx-table">
      <thead>
        <tr>
          <th>Block</th>
          <th>Time</th>
          <th>Type</th>
          <th>Direction</th>
          <th>Counterparty</th>
          <th>Amount</th>
          <th>Fee</th>
        </tr>
      </thead>
      <tbody>
        ${filtered.map((tx) => {
          const dir = tx.type === 'transfer'
            ? (tx.to === address ? 'Received' : 'Sent')
            : '-';
          const counterparty = tx.type === 'transfer'
            ? (tx.to === address ? tx.from : tx.to)
            : '-';
          return `
            <tr data-txid="${tx.txid}">
              <td><a class="block-link" href="/block/${tx.blockHeight}">${tx.blockHeight}</a></td>
              <td>${formatRelativeTime(tx.timestamp)}</td>
              <td><span class="badge">${tx.type ?? 'transfer'}</span></td>
              <td>${dir}</td>
              <td>${counterparty && counterparty !== '-' ? addressLink(counterparty, shortAddress(counterparty)) : '-'}</td>
              <td>${formatTokenAmount(tx.amountMicro, decimals, 6)} ${symbol}</td>
              <td>${formatTokenAmount(tx.feeMicro, decimals, 6)} ${symbol}</td>
            </tr>
          `;
        }).join('')}
      </tbody>
    </table>
  `;

  addressTxListPage.querySelectorAll('tr[data-txid]').forEach((row) => {
    row.addEventListener('click', () => {
      const txid = row.dataset.txid;
      if (txid) window.location.href = `/tx/${txid}`;
    });
  });
  addressTxListPage.querySelectorAll('a').forEach((link) => {
    link.addEventListener('click', (event) => event.stopPropagation());
  });
}

async function loadAddressDetails(address, updateUrl = false) {
  if (!address) {
    renderAddressDetails(null);
    if (addressTxList) addressTxList.innerHTML = '<div class="detail-empty">Geen transacties beschikbaar.</div>';
    return;
  }
  if (updateUrl) {
    updateUrlWithAddress(address);
  }
  const stats = await fetchAddressStats(address);
  if (stats.error) {
    renderAddressDetails(null, 'Address not found.');
    return;
  }
  renderAddressDetails(stats);
  const txsRes = await fetchAddressTxs(address, 50);
  if (txsRes.error) {
    renderAddressTxs(address, []);
    return;
  }
  renderAddressTxs(address, txsRes.txs || []);
}

function renderBlocks(blocks) {
  if (!blocksTable) return;
  blocksTable.innerHTML = blocks.map((block) => `
    <tr data-height="${block.height}" class="${Number(block.height) === Number(selectedHeight) ? 'selected' : ''}">
      <td>${formatNumber(block.height)}</td>
      <td>${block.txCount ?? (block.transactions ? block.transactions.length : (block.rewardBaseUnits && block.rewardBaseUnits !== '0' ? 1 : 0))}</td>
      <td>${new Date(block.timestamp).toLocaleString('nl-NL')}</td>
      <td title="${block.hash}">${shortHash(block.hash)}</td>
      <td title="${block.prevHash}">${shortHash(block.prevHash)}</td>
      <td title="${block.stateRoot ?? ''}">${shortHash(block.stateRoot ?? '')}</td>
      <td>${block.rewardTokens ?? block.rewardBaseUnits}</td>
    </tr>
  `).join('');

  blocksTable.querySelectorAll('tr').forEach((row) => {
    row.addEventListener('click', () => {
      const height = Number(row.dataset.height);
      window.location.href = `/block/${height}`;
    });
  });
}

async function loadBlockDetails(height) {
  if (loadingBlockHeight === height) return;
  loadingBlockHeight = height;
  selectedHeight = height;
  updateUrlWithBlock(height);
  highlightSelectedRow();
  renderBlockLoading(height);

  const requestId = ++blockRequestId;
  const block = await fetchBlockByHeight(height);
  if (requestId !== blockRequestId) return;

  loadingBlockHeight = null;

  if (!block || block.error === 404) {
    renderBlockError(height, 'Block {height} not found.');
    return;
  }
  if (block.error) {
    renderBlockError(height, 'Unable to load block details. Please try again.');
    return;
  }

  if (height > 0) {
    const prev = await fetchBlockByHeight(height - 1);
    if (prev && !prev.error && prev.header) {
      try {
        const prevHeader = JSON.parse(prev.header);
        const currHeader = block.header ? JSON.parse(block.header) : {};
        block.__upgradeActivated =
          prevHeader.protocolVersion !== currHeader.protocolVersion ||
          prevHeader.economicsVersion !== currHeader.economicsVersion;
      } catch {
        block.__upgradeActivated = false;
      }
    }
  }

  if (blockDetailsBody) {
    blockDetailsBody.classList.remove('loading');
  }
  renderBlockDetails(block);
  renderTxList(block);
}

function renderPager() {
  if (!pagerTop || !pagerBottom) return;
  const totalPages = Math.max(1, Math.ceil(totalBlocks / LIMIT));
  const prevDisabled = currentPage <= 1;
  const nextDisabled = currentPage >= totalPages;
  const label = `${currentPage} / ${totalPages}`;
  const markup = `
    <button ${prevDisabled ? 'disabled' : ''} data-action="prev">Vorige</button>
    <span>${label}</span>
    <button ${nextDisabled ? 'disabled' : ''} data-action="next">Volgende</button>
  `;

  pagerTop.innerHTML = markup;
  pagerBottom.innerHTML = markup;

  [pagerTop, pagerBottom].forEach((pager) => {
    pager.querySelectorAll('button').forEach((btn) => {
      btn.addEventListener('click', () => {
        const action = btn.dataset.action;
        if (action === 'prev' && currentPage > 1) {
          currentPage -= 1;
          refreshBlocks();
        }
        if (action === 'next' && currentPage < totalPages) {
          currentPage += 1;
          refreshBlocks();
        }
      });
    });
  });
}

async function refreshBlocks() {
  if (!blocksTable) return;
  const data = await fetchBlocks(currentPage);
  totalBlocks = data.total;
  latestBlocks = Array.isArray(data.blocks) ? data.blocks : [];
  renderBlocks(data.blocks);
  renderPager();
  highlightSelectedRow();
}

async function updateMiningStatus() {
  if (!miningStatus) return;
  const status = await fetchMiningStatus();
  miningStatus.textContent = status.active ? 'Status: mining actief' : 'Status: mining gestopt';
}

async function refreshAll() {
  if (blocksTable || chainStats || statusPanel) {
    const [state, status, genesis, network] = await Promise.all([fetchState(), fetchStatus(), fetchGenesis(), fetchNetworkStatus()]);
    latestState = status;
    latestGenesis = genesis;
    latestChainState = state;
    latestNetworkStatus = network;
    renderPanels();
    renderStats(state);
    renderNetworkOverview(network);
    await refreshBlocks();
    renderObserverSync(status);
    renderObserverTxList(state);
    await updateMiningStatus();

    const txid = getTxIdFromPath();
    if (txid) {
      await loadTxDetails(txid);
    } else {
      renderTxDetails(null);
    }
    const address = getAddressFromQuery();
    if (address) {
      await loadAddressDetails(address);
    } else {
      renderAddressDetails(null);
      if (addressTxList) addressTxList.innerHTML = '<div class="detail-empty">Geen transacties beschikbaar.</div>';
    }
  }

  if (devWalletPanel) {
    await refreshWalletContext();
    if (!walletState) walletState = loadWalletFromStorage();
    renderWallet();
    refreshWalletState();
    renderWalletActivity();
  }
}

async function refreshNetworkPage() {
  if (!networkHealthPanel && !observerNodesList) return;
  const [network, observers] = await Promise.all([
    fetchNetworkStatus(),
    fetchObserverNodes(observerNodesPage)
  ]);
  latestNetworkStatus = network;
  renderNetworkHealth(network);
  renderObserverNodes(observers);
}

function startAutoRefresh() {
  if (refreshTimer) clearInterval(refreshTimer);
  refreshTimer = setInterval(() => {
    if (networkHealthPanel || observerNodesList) {
      refreshNetworkPage();
      return;
    }
    refreshAll();
  }, 5000);
}

function setView(mode) {
  viewMode = mode;
  if (viewBasicBtn) viewBasicBtn.classList.toggle('active', mode === 'basic');
  if (viewAdvancedBtn) viewAdvancedBtn.classList.toggle('active', mode === 'advanced');
  renderPanels();
  renderStats(latestChainState || {});
}

function handleSearch(query) {
  const value = (query || '').trim();
  if (!value) return;
  if (/^\d+$/.test(value)) {
    const height = Number(value);
    if (Number.isFinite(height)) {
      window.location.href = `/block/${height}`;
      return;
    }
  }
  if (value.startsWith('spg_')) {
    window.location.href = `/address/${value}`;
    return;
  }
  updateUrlWithTx(value);
  loadTxDetails(value, true);
}

async function refreshWalletContext() {
  const status = await fetchStatus();
  latestChainState = status;
  if (!devWalletPanel) return;
  const decimals = latestChainState.decimals ?? 6;
  const baseFeeMicro = BigInt(status.baseFeeMicro ?? '0');
  const minFeeMicro = BigInt(status.minFeeMicro ?? '0');
  const initialFeeMicro = baseFeeMicro > minFeeMicro ? baseFeeMicro : minFeeMicro;
  const initialFeeTokens = formatTokenAmount(initialFeeMicro.toString(), decimals, 6);
  const freeEligible = walletState
    && status.genesisOperatorAddress
    && walletState.address === status.genesisOperatorAddress
    && !status.genesisFreeUsed
    && Number(status.latestHeight ?? 0) < Number(status.genesisFreeBlocks ?? 0);
  if (txFeeInput) {
    if (freeEligible && (!txFeeInput.value || txFeeInput.value === initialFeeTokens)) {
      txFeeInput.value = '0';
    } else if (!txFeeInput.value) {
      txFeeInput.value = initialFeeTokens;
    }
  }
  if (txFeeHint) {
    txFeeHint.innerHTML = freeEligible
      ? `Genesis registration: fee can be 0 until block ${status.genesisFreeBlocks ?? 0}`
      : `Minimum fee: ${walletAmountHtml(minFeeMicro.toString(), decimals)}`;
  }
}

function maybeLoadBlockFromQuery() {
  const params = new URLSearchParams(window.location.search);
  const blockParam = params.get('block');
  if (!blockParam) return;
  const height = Number(blockParam);
  if (!Number.isFinite(height)) return;
  window.location.href = `/block/${height}`;
}

function maybeLoadAddressFromQuery() {
  const address = getAddressFromQuery();
  if (!address) return;
  loadAddressDetails(address);
}

function getTxIdFromPath() {
  const match = window.location.pathname.match(/^\/tx\/([^/]+)$/);
  return match ? match[1] : null;
}

function getAddressFromPath() {
  const match = window.location.pathname.match(/^\/address\/(spg_[A-Za-z0-9]+)$/);
  return match ? match[1] : null;
}

function getAddressFromQuery() {
  const params = new URLSearchParams(window.location.search);
  return params.get('address');
}

function updateUrlWithBlock(height) {
  const url = new URL(window.location.href);
  if (window.location.pathname.startsWith('/block/')) {
    url.pathname = `/block/${height}`;
    url.search = '';
    history.replaceState({}, '', url.toString());
    return;
  }
  url.pathname = '/';
  url.searchParams.set('block', height);
  history.replaceState({}, '', url.toString());
}

function updateUrlWithTx(txid) {
  const url = new URL(window.location.href);
  url.pathname = `/tx/${txid}`;
  url.search = '';
  history.pushState({}, '', url.toString());
}

function updateUrlWithAddress(address) {
  const url = new URL(window.location.href);
  url.pathname = `/address/${address}`;
  url.search = '';
  history.pushState({}, '', url.toString());
}

function copyBlockLink(height) {
  const url = new URL(window.location.href);
  url.pathname = `/block/${height}`;
  url.search = '';
  const text = url.toString();

  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(showToast).catch(() => fallbackCopy(text));
    return;
  }
  fallbackCopy(text);
}

function copyAddressLink(address) {
  const url = new URL(window.location.href);
  url.pathname = `/address/${address}`;
  url.searchParams.delete('address');
  const text = url.toString();

  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(showAddressToast).catch(() => fallbackCopy(text));
    return;
  }
  fallbackCopy(text);
}

function fallbackCopy(text) {
  const input = document.createElement('input');
  input.value = text;
  document.body.appendChild(input);
  input.select();
  try {
    document.execCommand('copy');
    showToast();
  } catch {
    // ignore
  }
  document.body.removeChild(input);
}

function showToast() {
  if (!copyToast) return;
  copyToast.classList.add('show');
  setTimeout(() => copyToast.classList.remove('show'), 1500);
}

function showAddressToast() {
  if (!addressCopyToast) return;
  addressCopyToast.classList.add('show');
  setTimeout(() => addressCopyToast.classList.remove('show'), 1500);
}

function loadWalletFromStorage() {
  try {
    const raw = localStorage.getItem('sparge_dev_wallet');
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function loadAutoHeartbeatSetting() {
  try {
    return localStorage.getItem('sparge_auto_heartbeat') === 'true';
  } catch {
    return false;
  }
}

function saveAutoHeartbeatSetting(enabled) {
  localStorage.setItem('sparge_auto_heartbeat', enabled ? 'true' : 'false');
}

function saveWalletToStorage(wallet) {
  localStorage.setItem('sparge_dev_wallet', JSON.stringify(wallet));
}

function exportWalletToFile(wallet) {
  if (!wallet) return;
  const payload = {
    address: wallet.address,
    publicKeyHex: wallet.publicKeyHex,
    privateKeyHex: wallet.privateKeyHex
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `sparge-wallet-${wallet.address || 'export'}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function importWalletFromJson(json) {
  const wallet = {
    address: String(json.address || ''),
    publicKeyHex: String(json.publicKeyHex || ''),
    privateKeyHex: String(json.privateKeyHex || '')
  };
  if (!wallet.address.startsWith('spg_')) {
    throw new Error('Invalid wallet address.');
  }
  if (!wallet.publicKeyHex || wallet.publicKeyHex.length !== 64) {
    throw new Error('Invalid publicKeyHex.');
  }
  if (!wallet.privateKeyHex || wallet.privateKeyHex.length !== 64) {
    throw new Error('Invalid privateKeyHex.');
  }
  saveWalletToStorage(wallet);
  walletState = wallet;
  renderWallet();
  refreshWalletState();
  renderWalletActivity();
}

function clearWalletStorage() {
  localStorage.removeItem('sparge_dev_wallet');
}

function setWalletUiState(connected) {
  if (!devWalletStatus) return;
  devWalletStatus.textContent = connected ? 'Wallet loaded' : 'No wallet';
}

function disableWalletActions(disabled) {
  if (createWalletBtn) createWalletBtn.disabled = disabled;
  if (sendTxBtn) sendTxBtn.disabled = disabled;
  if (txToInput) txToInput.disabled = disabled;
  if (txAmountInput) txAmountInput.disabled = disabled;
  if (txFeeInput) txFeeInput.disabled = disabled;
  if (txMemoInput) txMemoInput.disabled = disabled;
  if (clearWalletBtn) clearWalletBtn.disabled = disabled;
  if (registerParticipantBtn) registerParticipantBtn.disabled = disabled;
  if (unregisterParticipantBtn) unregisterParticipantBtn.disabled = disabled;
  if (heartbeatBtn) heartbeatBtn.disabled = disabled;
  if (sponsorParticipantBtn) sponsorParticipantBtn.disabled = disabled;
}

async function createWallet() {
  if (!window.crypto || !window.crypto.subtle) {
    sendTxStatus.textContent = 'WebCrypto not available in this browser.';
    return;
  }
  disableWalletActions(true);
  try {
    const keyPair = await crypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify']);
    const publicJwk = await crypto.subtle.exportKey('jwk', keyPair.publicKey);
    const privateJwk = await crypto.subtle.exportKey('jwk', keyPair.privateKey);
    const publicKeyHex = bytesToHex(base64UrlToBytes(publicJwk.x));
    const privateKeyHex = bytesToHex(base64UrlToBytes(privateJwk.d));
    const address = await deriveAddress(publicKeyHex);

    const wallet = {
      address,
      publicKeyHex,
      privateKeyHex,
      createdAt: new Date().toISOString()
    };
    saveWalletToStorage(wallet);
    walletState = wallet;
    renderWallet();
  } finally {
    disableWalletActions(false);
  }
}

function renderWallet() {
  if (!walletState) {
    walletAddressEl.textContent = '-';
    walletPublicKeyEl.textContent = '-';
    walletPrivateKeyEl.textContent = '-';
    walletBalanceEl.textContent = '-';
    walletNonceEl.textContent = '-';
    if (walletBalanceHintEl) walletBalanceHintEl.textContent = 'Waiting for block rewards…';
    setWalletUiState(false);
    if (walletBalanceHintEl) walletBalanceHintEl.textContent = 'Waiting for block rewards…';
    walletPublicKeyEl.classList.add('hidden');
    walletPrivateKeyEl.classList.add('hidden');
    if (togglePublicKeyBtn) togglePublicKeyBtn.textContent = 'Show';
    if (togglePrivateKeyBtn) togglePrivateKeyBtn.textContent = 'Reveal';
    return;
  }
  walletAddressEl.textContent = walletState.address;
  if (walletAddressReceiveEl) walletAddressReceiveEl.textContent = walletState.address;
  walletPublicKeyEl.textContent = walletState.publicKeyHex;
  walletPrivateKeyEl.textContent = walletState.privateKeyHex;
  walletPublicKeyEl.classList.add('hidden');
  walletPrivateKeyEl.classList.add('hidden');
  if (togglePublicKeyBtn) togglePublicKeyBtn.textContent = 'Show';
  if (togglePrivateKeyBtn) togglePrivateKeyBtn.textContent = 'Reveal';
  setWalletUiState(true);
  if (walletActivityLink) {
    walletActivityLink.href = '/wallet#transactions';
  }
}

async function refreshWalletState() {
  if (!walletState) return;
  try {
    const [stats, mempool] = await Promise.all([
      fetch(`/api/address/${walletState.address}`).then((r) => r.json()),
      fetchMempool()
    ]);
    const pendingRegistration = Array.isArray(mempool.transactions)
      && mempool.transactions.some((tx) => tx.type === 'register_participant'
        && tx.participant === walletState.address
        && tx.from === walletState.address);
    const decimals = latestChainState?.decimals ?? 6;
    const balanceValue = formatTokenAmount(stats.balanceMicro, decimals, 6);
    const symbol = latestChainState?.symbol ?? '';
    const balanceText = `${balanceValue} ${symbol}`.trim();
    if (walletBalanceEl) walletBalanceEl.textContent = balanceText;
    if (walletBalanceOverviewEl) walletBalanceOverviewEl.innerHTML = walletAmountHtml(stats.balanceMicro, decimals);
    if (walletNonceEl) walletNonceEl.textContent = stats.nonce ?? '0';
    const balanceValueMicro = BigInt(stats.balanceMicro || '0');
    if (walletBalanceHintEl) {
      walletBalanceHintEl.textContent = balanceValueMicro === 0n ? 'Waiting for block rewards…' : 'Balance updated';
    }
    if (participantStatusEl) {
      const participant = stats.participant;
      if (participant) {
        const isActive = participant.status === 'active';
        const label = isActive ? 'Active' : 'Inactive';
        participantStatusEl.textContent = label;
        if (participantBadgeEl) {
          participantBadgeEl.textContent = label;
          participantBadgeEl.classList.toggle('active', isActive);
          participantBadgeEl.classList.toggle('inactive', !isActive);
          participantBadgeEl.classList.toggle('pending', false);
        }
        participantPending = false;
        if (participantBondEl) {
          participantBondEl.innerHTML = walletAmountHtml(participant.bondMicro, decimals);
        }
        if (participantSponsorEl) participantSponsorEl.textContent = participant.sponsor || '-';
        const latestHeight = Number(latestChainState?.latestHeight ?? 0);
        const lastSeen = Number(participant.lastSeenHeight ?? 0);
        const windowBlocks = Number(latestChainState?.ACTIVE_WINDOW_BLOCKS ?? 5100);
        const remaining = Math.max(0, windowBlocks - (latestHeight - lastSeen));
        const days = ((remaining * Number(latestChainState?.blockTimeSeconds || 51)) / 86400).toFixed(1);
        if (participantNextEl) participantNextEl.textContent = `${remaining} blocks (~${days} days)`;
        if (participantNextShortEl) {
          participantNextShortEl.textContent = `Next activity: ${remaining} blocks`;
        }
        if (participationTabBtn) {
          participationTabBtn.classList.toggle('highlight', participant.status !== 'active');
        }
      } else {
        if (participantPending || pendingRegistration) {
          participantPending = true;
          participantStatusEl.textContent = 'Pending';
          if (participantBadgeEl) {
            participantBadgeEl.textContent = 'Pending';
            participantBadgeEl.classList.remove('active', 'inactive');
            participantBadgeEl.classList.add('pending');
          }
        } else {
          participantStatusEl.textContent = 'Inactive';
          if (participantBadgeEl) {
            participantBadgeEl.textContent = 'Inactive';
            participantBadgeEl.classList.remove('active');
            participantBadgeEl.classList.add('inactive');
            participantBadgeEl.classList.remove('pending');
          }
        }
        if (participantBondEl) participantBondEl.textContent = '-';
        if (participantSponsorEl) participantSponsorEl.textContent = '-';
        if (participantNextEl) participantNextEl.textContent = '-';
        if (participantNextShortEl) {
          participantNextShortEl.textContent = 'Next activity: -';
        }
        if (participationTabBtn) {
          participationTabBtn.classList.add('highlight');
        }
      }
    }
    maybeAutoHeartbeat(stats);
  } catch {
    if (walletBalanceHintEl) walletBalanceHintEl.textContent = 'Unable to refresh wallet state.';
  }
}

function scheduleWalletRefresh() {
  if (walletRefreshTimer) clearInterval(walletRefreshTimer);
  walletRefreshTimer = setInterval(refreshWalletState, 6000);
}

async function signMessage(message, wallet) {
  const digest = await sha256Bytes(new TextEncoder().encode(message));
  const jwk = {
    kty: 'OKP',
    crv: 'Ed25519',
    x: bytesToBase64Url(hexToBytes(wallet.publicKeyHex)),
    d: bytesToBase64Url(hexToBytes(wallet.privateKeyHex))
  };
  const key = await crypto.subtle.importKey('jwk', jwk, { name: 'Ed25519' }, false, ['sign']);
  const signature = await crypto.subtle.sign('Ed25519', key, digest);
  return bytesToHex(new Uint8Array(signature));
}

async function computeTxId(message) {
  const digest = await sha256Bytes(new TextEncoder().encode(message));
  return bytesToHex(digest);
}

function buildCanonicalMessage(tx) {
  const base = [
    tx.type,
    tx.chainId,
    tx.from,
    tx.to,
    tx.amountMicro,
    tx.feeMicro,
    tx.nonce,
    tx.publicKeyHex,
    tx.sponsor || '',
    tx.participant || ''
  ].join('|');
  if (tx.memo) return `${base}|${tx.memo}`;
  return base;
}

async function handleSendTx(event) {
  event.preventDefault();
  if (!walletState) {
    sendTxStatus.textContent = 'Create a wallet first.';
    return;
  }
  sendTxStatus.textContent = '';
  sendTxBtn.disabled = true;
  disableWalletActions(true);

  try {
    const to = txToInput.value.trim();
    const amount = txAmountInput.value.trim();
    const fee = txFeeInput.value.trim();
    const memo = txMemoInput.value;
    if (!to || !amount || !fee) {
      throw new Error('Fill in all required fields.');
    }
    if (memo && memo.length > 128) {
      throw new Error('Memo must be <= 128 chars.');
    }

    const status = await fetch('/api/status').then((r) => r.json());
    const chainId = status.chainId;
    const decimals = Number(status.decimals ?? 6);
    const amountMicro = parseTokenToMicro(amount, decimals);
    const feeMicro = parseTokenToMicro(fee, decimals);
    const minFeeMicro = BigInt(status.minFeeMicro ?? '0');
    if (BigInt(feeMicro) < minFeeMicro) {
      throw new Error(`Fee must be at least ${formatTokenAmount(minFeeMicro.toString(), decimals, 6)} ${status.symbol ?? ''}`);
    }

    const nonceRes = await fetch(`/api/nonce/${walletState.address}`).then((r) => r.json());
    const nonce = String(nonceRes.nonce ?? '0');

    const tx = {
      type: 'transfer',
      chainId,
      from: walletState.address,
      to,
      amountMicro,
      feeMicro,
      nonce,
      publicKeyHex: walletState.publicKeyHex,
      sponsor: '',
      participant: '',
      memo: memo || ''
    };

    const message = buildCanonicalMessage(tx);
    const signatureHex = await signMessage(message, walletState);
    const txid = await computeTxId(message);

    sendTxStatus.textContent = `Sending… TxID ${shortHash(txid)}`;

    const response = await fetch('/api/tx', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...tx,
        signatureHex
      })
    });

    const result = await response.json();
    if (!response.ok) {
      throw new Error(result.error || 'Transaction rejected.');
    }
    sendTxStatus.textContent = `Transaction pending… TxID ${txid}`;
    txAmountInput.value = '';
    txMemoInput.value = '';
    await pollTxMined(txid);
  } catch (err) {
    sendTxStatus.textContent = err.message || 'Unable to send transaction.';
  } finally {
    sendTxBtn.disabled = false;
    disableWalletActions(false);
  }
}

async function pollTxMined(txid) {
  const start = Date.now();
  const maxMs = 120000;
  while (Date.now() - start < maxMs) {
    const res = await fetch(`/api/tx/${txid}`);
    if (res.ok) {
      const tx = await res.json();
      const height = tx.blockHeight !== undefined && tx.blockHeight !== null ? tx.blockHeight : '?';
      sendTxStatus.innerHTML = `Mined in block <a class="tx-link" href="/block/${height}">${height}</a> · <a class="tx-link" href="/tx/${txid}">${txid}</a>`;
      if (tx.type === 'register_participant') {
        participantPending = false;
      }
      refreshWalletState();
      renderWalletActivity();
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 4000));
  }
  sendTxStatus.textContent = `Transaction pending… TxID ${txid}`;
}

async function renderWalletActivity() {
  if (!walletState || (!walletActivity && !walletActivityOverview)) return;
  const res = await fetch(`/api/blocks?page=1&limit=25`).then((r) => r.json());
  const blocks = res.blocks || [];
  const entries = [];
  for (const block of blocks) {
    const txs = normalizeTxList(block);
    for (const tx of txs) {
      if (tx.from === walletState.address || tx.to === walletState.address) {
        entries.push({ ...tx, blockHeight: block.height });
      }
    }
  }
  walletActivityEntries = entries;
  if (!entries.length) {
    if (walletActivity) walletActivity.innerHTML = '<div class="detail-empty">No activity yet.</div>';
    if (walletActivityOverview) walletActivityOverview.innerHTML = '<div class="detail-empty">No activity yet.</div>';
    if (walletActivityPager) walletActivityPager.innerHTML = '';
    return;
  }
  const decimals = latestChainState?.decimals ?? 6;
  const pageSize = 10;
  const totalPages = Math.max(1, Math.ceil(entries.length / pageSize));
  if (walletActivityPage > totalPages) walletActivityPage = totalPages;
  const start = (walletActivityPage - 1) * pageSize;
  const pageRows = entries.slice(start, start + pageSize);
  const rows = pageRows.map((tx) => {
    const meta = activityMeta(tx);
    const amountHtml = walletAmountHtml(tx.amountMicro, decimals);
    return `
      <tr data-txid="${tx.txid || tx.id}">
        <td>
          <div class="activity-cell">
            <img src="${meta.icon}" alt="" class="activity-icon" />
            <span>${meta.label}</span>
          </div>
        </td>
        <td>${tx.blockHeight}</td>
        <td>${amountHtml}</td>
      </tr>
    `;
  }).join('');
  const tableMarkup = `
    <table class="tx-table">
      <thead>
        <tr>
          <th>Type</th>
          <th>Height</th>
          <th>Amount</th>
        </tr>
      </thead>
      <tbody>
        ${rows}
      </tbody>
    </table>
  `;
  if (walletActivity) walletActivity.innerHTML = tableMarkup;
  if (walletActivityOverview) {
    const overviewRows = entries.slice(0, 10).map((tx) => {
      const meta = activityMeta(tx);
      const amountHtml = walletAmountHtml(tx.amountMicro, decimals);
      return `
        <tr data-txid="${tx.txid || tx.id}">
          <td>
            <div class="activity-cell">
              <img src="${meta.icon}" alt="" class="activity-icon" />
              <span>${meta.label}</span>
            </div>
          </td>
          <td>${tx.blockHeight}</td>
          <td>${amountHtml}</td>
        </tr>
      `;
    }).join('');
    walletActivityOverview.innerHTML = `
      <table class="tx-table">
        <thead>
          <tr>
            <th>Type</th>
            <th>Height</th>
            <th>Amount</th>
          </tr>
        </thead>
        <tbody>
          ${overviewRows}
        </tbody>
      </table>
    `;
  }
  if (walletActivityPager) {
    walletActivityPager.innerHTML = `
      <button ${walletActivityPage <= 1 ? 'disabled' : ''} data-action="prev">Prev</button>
      <span>${walletActivityPage} / ${totalPages}</span>
      <button ${walletActivityPage >= totalPages ? 'disabled' : ''} data-action="next">Next</button>
    `;
    walletActivityPager.querySelectorAll('button').forEach((btn) => {
      btn.addEventListener('click', () => {
        const action = btn.dataset.action;
        if (action === 'prev' && walletActivityPage > 1) walletActivityPage -= 1;
        if (action === 'next' && walletActivityPage < totalPages) walletActivityPage += 1;
        renderWalletActivity();
      });
    });
  }

  const attachRowClicks = (container) => {
    if (!container) return;
    container.querySelectorAll('tr[data-txid]').forEach((row) => {
      row.addEventListener('click', () => {
        const txid = row.dataset.txid;
        if (txid) window.location.href = `/tx/${txid}`;
      });
    });
  };
  attachRowClicks(walletActivity);
  attachRowClicks(walletActivityOverview);
}

function maybeAutoHeartbeat(stats) {
  if (!autoHeartbeatToggle || !autoHeartbeatToggle.checked) return;
  const participant = stats.participant;
  if (!participant) return;
  const latestHeight = Number(latestChainState?.latestHeight ?? 0);
  const lastSeen = Number(participant.lastSeenHeight ?? 0);
  const windowBlocks = Number(latestChainState?.ACTIVE_WINDOW_BLOCKS ?? 5100);
  const remaining = windowBlocks - (latestHeight - lastSeen);
  if (remaining > 200) return;
  if (lastAutoHeartbeatHeight === latestHeight) return;
  const feeValue = txFeeInput.value.trim();
  if (!feeValue) return;
  try {
    const feeMicro = parseTokenToMicro(feeValue, Number(latestChainState?.decimals ?? 6));
    const balanceMicro = BigInt(stats.balanceMicro || '0');
    if (balanceMicro < BigInt(feeMicro)) return;
  } catch {
    return;
  }
  lastAutoHeartbeatHeight = latestHeight;
  sendHeartbeat();
}

async function registerParticipant() {
  if (!walletState) {
    sendTxStatus.textContent = 'Create a wallet first.';
    return;
  }
  try {
    registerParticipantBtn.disabled = true;
    const status = await fetch('/api/status').then((r) => r.json());
    const chainId = status.chainId;
    const decimals = Number(status.decimals ?? 6);
    let feeValue = txFeeInput.value.trim();
    const minFeeMicro = BigInt(status.minFeeMicro ?? '0');
    const freeEligible = status.genesisOperatorAddress
      && walletState.address === status.genesisOperatorAddress
      && !status.genesisFreeUsed
      && Number(status.latestHeight ?? 0) < Number(status.genesisFreeBlocks ?? 0);
    if (freeEligible) {
      feeValue = '0';
      if (txFeeInput) txFeeInput.value = '0';
    }
    const feeMicro = parseTokenToMicro(feeValue, decimals);
    if (!freeEligible && BigInt(feeMicro) < minFeeMicro) {
      throw new Error(`Fee must be at least ${formatTokenAmount(minFeeMicro.toString(), decimals, 6)} ${status.symbol ?? ''}`);
    }
    const nonceRes = await fetch(`/api/nonce/${walletState.address}`).then((r) => r.json());
    const nonce = String(nonceRes.nonce ?? '0');
    const tx = {
      type: 'register_participant',
      chainId,
      from: walletState.address,
      to: '',
      amountMicro: '0',
      feeMicro,
      nonce,
      publicKeyHex: walletState.publicKeyHex,
      sponsor: walletState.address,
      participant: walletState.address,
      memo: ''
    };
    const message = buildCanonicalMessage(tx);
    const signatureHex = await signMessage(message, walletState);
    const txid = await computeTxId(message);
    sendTxStatus.textContent = `Registering… TxID ${shortHash(txid)}`;
    const res = await fetch('/api/tx', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...tx, signatureHex })
    });
    const result = await res.json();
    if (!res.ok) {
      throw new Error(result.error || 'Unable to register participant.');
    }
    participantPending = true;
    refreshWalletState();
    sendTxStatus.textContent = `Participant registration pending… TxID ${txid}`;
    await pollTxMined(txid);
  } catch (err) {
    sendTxStatus.textContent = err.message || 'Unable to register participant.';
  } finally {
    registerParticipantBtn.disabled = false;
  }
}

async function sponsorParticipant() {
  if (!walletState) {
    sendTxStatus.textContent = 'Create a wallet first.';
    return;
  }
  const target = sponsorAddressInput ? sponsorAddressInput.value.trim() : '';
  if (!target) {
    sendTxStatus.textContent = 'Enter a participant address to sponsor.';
    return;
  }
  try {
    sponsorParticipantBtn.disabled = true;
    const status = await fetch('/api/status').then((r) => r.json());
    const chainId = status.chainId;
    const decimals = Number(status.decimals ?? 6);
    const feeValue = txFeeInput.value.trim();
    const feeMicro = parseTokenToMicro(feeValue, decimals);
    const minFeeMicro = BigInt(status.minFeeMicro ?? '0');
    if (BigInt(feeMicro) < minFeeMicro) {
      throw new Error(`Fee must be at least ${formatTokenAmount(minFeeMicro.toString(), decimals, 6)} ${status.symbol ?? ''}`);
    }
    const nonceRes = await fetch(`/api/nonce/${walletState.address}`).then((r) => r.json());
    const nonce = String(nonceRes.nonce ?? '0');
    const tx = {
      type: 'register_participant',
      chainId,
      from: walletState.address,
      to: '',
      amountMicro: '0',
      feeMicro,
      nonce,
      publicKeyHex: walletState.publicKeyHex,
      sponsor: walletState.address,
      participant: target,
      memo: ''
    };
    const message = buildCanonicalMessage(tx);
    const signatureHex = await signMessage(message, walletState);
    const txid = await computeTxId(message);
    sendTxStatus.textContent = `Sponsoring… TxID ${shortHash(txid)}`;
    const res = await fetch('/api/tx', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...tx, signatureHex })
    });
    const result = await res.json();
    if (!res.ok) {
      throw new Error(result.error || 'Unable to sponsor participant.');
    }
    sendTxStatus.textContent = `Sponsor tx pending… TxID ${txid}`;
    if (sponsorAddressInput) sponsorAddressInput.value = '';
    await pollTxMined(txid);
  } catch (err) {
    sendTxStatus.textContent = err.message || 'Unable to sponsor participant.';
  } finally {
    sponsorParticipantBtn.disabled = false;
  }
}

async function unregisterParticipant() {
  if (!walletState) {
    sendTxStatus.textContent = 'Create a wallet first.';
    return;
  }
  try {
    unregisterParticipantBtn.disabled = true;
    const status = await fetch('/api/status').then((r) => r.json());
    const chainId = status.chainId;
    const decimals = Number(status.decimals ?? 6);
    const feeValue = txFeeInput.value.trim();
    const feeMicro = parseTokenToMicro(feeValue, decimals);
    const minFeeMicro = BigInt(status.minFeeMicro ?? '0');
    if (BigInt(feeMicro) < minFeeMicro) {
      throw new Error(`Fee must be at least ${formatTokenAmount(minFeeMicro.toString(), decimals, 6)} ${status.symbol ?? ''}`);
    }
    const nonceRes = await fetch(`/api/nonce/${walletState.address}`).then((r) => r.json());
    const nonce = String(nonceRes.nonce ?? '0');
    const tx = {
      type: 'unregister_participant',
      chainId,
      from: walletState.address,
      to: '',
      amountMicro: '0',
      feeMicro,
      nonce,
      publicKeyHex: walletState.publicKeyHex,
      sponsor: '',
      participant: '',
      memo: ''
    };
    const message = buildCanonicalMessage(tx);
    const signatureHex = await signMessage(message, walletState);
    const txid = await computeTxId(message);
    sendTxStatus.textContent = `Unregistering… TxID ${shortHash(txid)}`;
    const res = await fetch('/api/tx', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...tx, signatureHex })
    });
    const result = await res.json();
    if (!res.ok) {
      throw new Error(result.error || 'Unable to unregister.');
    }
    sendTxStatus.textContent = `Unregister pending… TxID ${txid}`;
    await pollTxMined(txid);
  } catch (err) {
    sendTxStatus.textContent = err.message || 'Unable to unregister.';
  } finally {
    unregisterParticipantBtn.disabled = false;
  }
}

async function sendHeartbeat() {
  if (!walletState) {
    sendTxStatus.textContent = 'Create a wallet first.';
    return;
  }
  try {
    heartbeatBtn.disabled = true;
    const status = await fetch('/api/status').then((r) => r.json());
    const chainId = status.chainId;
    const decimals = Number(status.decimals ?? 6);
    const feeValue = txFeeInput.value.trim();
    const feeMicro = parseTokenToMicro(feeValue, decimals);
    const minFeeMicro = BigInt(status.minFeeMicro ?? '0');
    if (BigInt(feeMicro) < minFeeMicro) {
      throw new Error(`Fee must be at least ${formatTokenAmount(minFeeMicro.toString(), decimals, 6)} ${status.symbol ?? ''}`);
    }
    const nonceRes = await fetch(`/api/nonce/${walletState.address}`).then((r) => r.json());
    const nonce = String(nonceRes.nonce ?? '0');
    const tx = {
      type: 'heartbeat',
      chainId,
      from: walletState.address,
      to: '',
      amountMicro: '0',
      feeMicro,
      nonce,
      publicKeyHex: walletState.publicKeyHex,
      sponsor: '',
      participant: '',
      memo: ''
    };
    const message = buildCanonicalMessage(tx);
    const signatureHex = await signMessage(message, walletState);
    const txid = await computeTxId(message);
    sendTxStatus.textContent = `Heartbeat pending… TxID ${shortHash(txid)}`;
    const res = await fetch('/api/tx', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...tx, signatureHex })
    });
    const result = await res.json();
    if (!res.ok) {
      throw new Error(result.error || 'Unable to heartbeat.');
    }
    await pollTxMined(txid);
  } catch (err) {
    sendTxStatus.textContent = err.message || 'Unable to heartbeat.';
  } finally {
    heartbeatBtn.disabled = false;
  }
}

function highlightSelectedRow() {
  if (!blocksTable) return;
  blocksTable.querySelectorAll('tr').forEach((row) => {
    row.classList.toggle('selected', Number(row.dataset.height) === Number(selectedHeight));
  });
}

if (startMiningBtn) startMiningBtn.addEventListener('click', () => setMining(true));
if (stopMiningBtn) stopMiningBtn.addEventListener('click', () => setMining(false));
if (viewBasicBtn) viewBasicBtn.addEventListener('click', () => setView('basic'));
if (viewAdvancedBtn) viewAdvancedBtn.addEventListener('click', () => setView('advanced'));
if (searchForm) {
  searchForm.addEventListener('submit', (event) => {
    event.preventDefault();
    handleSearch(searchInput ? searchInput.value : '');
  });
}
if (createWalletBtn) {
  createWalletBtn.addEventListener('click', async () => {
    await createWallet();
    refreshWalletState();
    renderWalletActivity();
  });
}
if (clearWalletBtn) {
  clearWalletBtn.addEventListener('click', () => {
    clearWalletStorage();
    walletState = null;
    renderWallet();
  });
}
if (exportWalletBtn) {
  exportWalletBtn.addEventListener('click', () => {
    if (!walletState) {
      sendTxStatus.textContent = 'Create or import a wallet first.';
      return;
    }
    exportWalletToFile(walletState);
  });
}
if (importWalletBtn && importWalletFile) {
  importWalletBtn.addEventListener('click', () => {
    importWalletFile.click();
  });
  importWalletFile.addEventListener('change', async (event) => {
    const file = event.target.files && event.target.files[0];
    if (!file) return;
    try {
      const text = await file.text();
      const json = JSON.parse(text);
      importWalletFromJson(json);
      sendTxStatus.textContent = 'Wallet imported.';
    } catch (err) {
      sendTxStatus.textContent = err.message || 'Failed to import wallet.';
    } finally {
      importWalletFile.value = '';
    }
  });
}
if (togglePublicKeyBtn) {
  togglePublicKeyBtn.addEventListener('click', () => {
    walletPublicKeyEl.classList.toggle('hidden');
    togglePublicKeyBtn.textContent = walletPublicKeyEl.classList.contains('hidden') ? 'Show' : 'Hide';
  });
}
if (togglePrivateKeyBtn) {
  togglePrivateKeyBtn.addEventListener('click', () => {
    const confirmed = window.confirm('Reveal private key? Anyone with this key can spend your funds.');
    if (!confirmed) return;
    walletPrivateKeyEl.classList.toggle('hidden');
    togglePrivateKeyBtn.textContent = walletPrivateKeyEl.classList.contains('hidden') ? 'Reveal' : 'Hide';
  });
}
if (sendTxForm) {
  sendTxForm.addEventListener('submit', handleSendTx);
}
if (registerParticipantBtn) {
  registerParticipantBtn.addEventListener('click', registerParticipant);
}
if (unregisterParticipantBtn) {
  unregisterParticipantBtn.addEventListener('click', unregisterParticipant);
}
if (sponsorParticipantBtn) {
  sponsorParticipantBtn.addEventListener('click', sponsorParticipant);
}
if (heartbeatBtn) {
  heartbeatBtn.addEventListener('click', sendHeartbeat);
}
if (autoHeartbeatToggle) {
  autoHeartbeatToggle.checked = loadAutoHeartbeatSetting();
  autoHeartbeatToggle.addEventListener('change', () => {
    saveAutoHeartbeatSetting(autoHeartbeatToggle.checked);
  });
}
if (walletTabButtons && walletTabPanels) {
  walletTabButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.tab;
      if (!tab) return;
      walletTabButtons.forEach((b) => b.classList.toggle('active', b === btn));
      walletTabPanels.forEach((panel) => {
        panel.classList.toggle('active', panel.dataset.tabPanel === tab);
      });
    });
  });
}

if (blockTabButtons && blockTabPanels) {
  blockTabButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.tab;
      if (!tab) return;
      blockTabButtons.forEach((b) => b.classList.toggle('active', b === btn));
      blockTabPanels.forEach((panel) => {
        panel.classList.toggle('active', panel.dataset.tabPanel === tab);
      });
    });
  });
}

if (walletActivityLink) {
  walletActivityLink.addEventListener('click', (event) => {
    event.preventDefault();
    const target = Array.from(walletTabButtons || []).find((btn) => btn.dataset.tab === 'transactions');
    if (target) target.click();
  });
}

if (addressFilterTabs && addressFilterTabs.length) {
  addressFilterTabs.forEach((btn) => {
    btn.addEventListener('click', () => {
      const filter = btn.dataset.filter;
      if (!filter) return;
      addressTxFilter = filter;
      addressFilterTabs.forEach((b) => b.classList.toggle('active', b === btn));
      renderAddressTxPage(getAddressFromPath(), addressTxEntries, latestChainState);
    });
  });
}

if (addressLoadMoreBtn) {
  addressLoadMoreBtn.addEventListener('click', () => {
    const address = getAddressFromPath();
    addressTxLimit += 25;
    fetchAddressTxs(address, addressTxLimit).then((txsRes) => {
      addressTxEntries = txsRes?.txs || [];
      renderAddressTxPage(address, addressTxEntries, latestChainState);
    });
  });
}

if (copyAddressBtn) {
  copyAddressBtn.addEventListener('click', async () => {
    if (!walletState) return;
    try {
      await navigator.clipboard.writeText(walletState.address);
      copyAddressBtn.textContent = 'Copied';
      setTimeout(() => {
        copyAddressBtn.textContent = 'Copy address';
      }, 1200);
    } catch {
      copyAddressBtn.textContent = 'Copy failed';
      setTimeout(() => {
        copyAddressBtn.textContent = 'Copy address';
      }, 1200);
    }
  });
}
document.addEventListener('click', (event) => {
  const target = event.target;
  if (!target || !target.classList || !target.classList.contains('tx-link')) return;
  const href = target.getAttribute('href');
  if (!href || !href.startsWith('/tx/')) return;
  event.preventDefault();
  window.location.href = href;
});
window.addEventListener('popstate', () => {
  const txid = getTxIdFromPath();
  if (txid) {
    loadTxDetails(txid);
  } else {
    renderTxDetails(null);
  }
  const address = getAddressFromQuery();
  if (address) {
    loadAddressDetails(address);
  } else {
    renderAddressDetails(null);
    if (addressTxList) addressTxList.innerHTML = '<div class="detail-empty">Geen transacties beschikbaar.</div>';
  }
  maybeLoadBlockFromQuery();
});

const isExplorerPage = Boolean(blocksTable || chainStats || statusPanel);
const isWalletPage = Boolean(devWalletPanel);
const isNetworkPage = Boolean(networkHealthPanel || observerNodesList);

if (isExplorerPage) {
  refreshAll();
  startAutoRefresh();
  maybeLoadBlockFromQuery();
  maybeLoadAddressFromQuery();
}

if (isNetworkPage) {
  refreshNetworkPage();
  startAutoRefresh();
}

if (observerFilters) {
  observerFilters.addEventListener('submit', (event) => {
    event.preventDefault();
    observerNodesPage = 1;
    refreshNetworkPage();
  });
}

if (observerPrivacyForm) {
  fetchObserverSettings().then(renderObserverPrivacySettings);
  observerPublicListingEnabled.addEventListener('change', () => {
    observerPrivacyFields.classList.toggle('hidden', !observerPublicListingEnabled.checked);
  });
  observerPrivacyForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (observerPrivacyStatus) observerPrivacyStatus.textContent = '';
    try {
      const settings = await saveObserverSettings({
        publicListingEnabled: observerPublicListingEnabled.checked,
        publicAlias: observerPublicListingEnabled.checked ? observerPublicAlias.value : '',
        countryCode: observerPublicListingEnabled.checked ? observerCountryCode.value.trim().toUpperCase() : ''
      });
      renderObserverPrivacySettings(settings);
      if (observerPrivacyStatus) observerPrivacyStatus.textContent = 'Privacy settings saved. Future heartbeats will use them.';
    } catch (err) {
      if (observerPrivacyStatus) observerPrivacyStatus.textContent = err.message || 'Unable to save privacy settings.';
    }
  });
}

if (window.location.pathname.startsWith('/block/')) {
  const match = window.location.pathname.match(/^\/block\/(\d+)/);
  if (match) {
    fetchState().then((state) => {
      latestChainState = state;
      loadBlockDetails(Number(match[1]));
    });
  }
}

if (window.location.pathname.startsWith('/tx/')) {
  const match = window.location.pathname.match(/^\/tx\/([^/]+)/);
  if (match) {
    Promise.all([fetchState(), fetchTxById(match[1])]).then(([state, tx]) => {
      latestChainState = state;
      if (!tx || tx.error === 404) {
        renderTxPage(null, state, 'Transaction not found.');
        return;
      }
      if (tx.error) {
        renderTxPage(null, state, 'Unable to load transaction.');
        return;
      }
      renderTxPage(tx, state);
    });
  }
}

if (window.location.pathname.startsWith('/address/')) {
  const match = window.location.pathname.match(/^\/address\/(spg_[A-Za-z0-9]+)/);
  if (match) {
    const addr = match[1];
    Promise.all([fetchState(), fetchAddressStats(addr), fetchAddressTxs(addr, addressTxLimit)]).then(([state, stats, txsRes]) => {
      latestChainState = state;
      const list = txsRes?.txs || [];
      addressTxEntries = list;
      const safeStats = stats?.error
        ? {
            address: addr,
            balanceMicro: '0',
            avgBalanceMicro: '0',
            avgEligible: false,
            nonce: '0',
            txCount: 0,
            firstSeen: null,
            lastSeen: null,
            participant: null,
            sponsoredActiveCount: 0
          }
        : stats;
      renderAddressPage(addr, safeStats, list, state);
    });
  }
}

if (isWalletPage) {
  refreshWalletContext().then(() => {
    walletState = loadWalletFromStorage();
    renderWallet();
    refreshWalletState();
    renderWalletActivity();
  });
  scheduleWalletRefresh();
}
