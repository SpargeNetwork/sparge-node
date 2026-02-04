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

const blocksTable = document.getElementById('blocksTable');
const pagerTop = document.getElementById('pagerTop');
const pagerBottom = document.getElementById('pagerBottom');
const chainStats = document.getElementById('chainStats');
const miningStatus = document.getElementById('miningStatus');
const latestTxList = document.getElementById('latestTxList');
const statusPanel = document.getElementById('statusPanel');
const genesisPanel = document.getElementById('genesisPanel');
const blockDetailsBody = document.getElementById('blockDetailsBody');
const blockTxList = document.getElementById('blockTxList');
const txDetailsBody = document.getElementById('txDetailsBody');
const copyToast = document.getElementById('copyToast');
const addressDetailsBody = document.getElementById('addressDetailsBody');
const addressTxList = document.getElementById('addressTxList');
const addressCopyToast = document.getElementById('addressCopyToast');
const devWalletPanel = document.getElementById('devWalletPanel');
const devWalletStatus = document.getElementById('devWalletStatus');
const createWalletBtn = document.getElementById('createWalletBtn');
const clearWalletBtn = document.getElementById('clearWalletBtn');
const walletAddressEl = document.getElementById('walletAddress');
const walletPublicKeyEl = document.getElementById('walletPublicKey');
const walletPrivateKeyEl = document.getElementById('walletPrivateKey');
const togglePublicKeyBtn = document.getElementById('togglePublicKey');
const togglePrivateKeyBtn = document.getElementById('togglePrivateKey');
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
const sponsorAddressInput = document.getElementById('sponsorAddressInput');
const sponsorParticipantBtn = document.getElementById('sponsorParticipantBtn');
const searchForm = document.getElementById('searchForm');
const searchInput = document.getElementById('searchInput');
const startMiningBtn = document.getElementById('startMining');
const stopMiningBtn = document.getElementById('stopMining');
const viewBasicBtn = document.getElementById('viewBasic');
const viewAdvancedBtn = document.getElementById('viewAdvanced');

function shortHash(hash) {
  if (!hash) return '-';
  return `${hash.slice(0, 8)}…${hash.slice(-8)}`;
}

function shortAddress(address) {
  if (!address) return '-';
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

function addressLink(address, label) {
  if (!address) return '-';
  const text = label || shortAddress(address);
  return `<a class="addr-link" href="/?address=${address}" data-address="${address}">${text}</a>`;
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
  const res = await fetch(`/block/${height}`);
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

async function setMining(active) {
  await fetch(`/api/mining/${active ? 'start' : 'stop'}`, { method: 'POST' });
  updateMiningStatus();
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
    chainStats.innerHTML = [
      { label: 'Latest Block', value: formatNumber(latestHeight) },
      { label: 'Latest Block Txs', value: formatNumber(state.latestBlock?.txCount ?? 0) },
      { label: 'Active Participants', value: formatNumber(state.activeParticipantCount ?? 0) },
      { label: 'Registered Participants', value: formatNumber(state.totalRegisteredParticipants ?? 0) },
      { label: 'Participant Window', value: formatNumber(state.ACTIVE_WINDOW_BLOCKS ?? 0) },
      { label: 'Mint (micro)', value: formatBigIntString(state.mintMicro) },
      {
        label: 'Mint Split (micro)',
        value: `P ${formatBigIntString(state.splitMicro?.participant)} | N ${formatBigIntString(state.splitMicro?.nodePool)} | T ${formatBigIntString(state.splitMicro?.treasury)} | H ${formatBigIntString(state.splitMicro?.holderPool)}`
      },
      {
        label: 'Pools (micro)',
        value: `Node ${formatBigIntString(state.poolsMicro?.node)} | Holder ${formatBigIntString(state.poolsMicro?.holder)}`
      },
      {
        label: 'Holder Avg Window',
        value: `${formatNumber(state.avgWindowBlocks ?? 0)} blocks`,
        sub: `Eligibility: >= ${formatTokenAmount(state.avgEligibilityMicro ?? '0', state.decimals ?? 6, 6)} ${state.symbol}`
      },
      { label: 'Blocks Until Payout', value: formatNumber(state.blocksUntilPayout ?? 0) },
      {
        label: 'Total Transactions',
        value: formatNumber(state.totalTransactions ?? 0),
        sub: `Avg. Gas: ${avgGas} (${formatBigIntString(state.baseFeeMicro)} micro/weight)`
      },
      { label: 'Total Addresses', value: formatNumber(state.totalAddresses ?? 0) }
    ].map((item) => `
      <div class="stat">
        <div class="stat-label">${item.label}</div>
        <div class="stat-value">${item.value}</div>
        ${item.sub ? `<div class="stat-sub">${item.sub}</div>` : ''}
      </div>
    `).join('');
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

  chainStats.innerHTML = [
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
        ['Block Producer', `${split.producer} ${state.symbol}`],
        ['Node Holders', `${split.node} ${state.symbol}`],
        ['Treasury', `${split.treasury} ${state.symbol}`],
        ['Eligible Holders', `${split.holder} ${state.symbol}`]
      ]
    },
    {
      label: 'Active Participants',
      value: formatNumber(state.activeParticipantCount ?? 0),
      sub: `Window: last ${formatNumber(state.ACTIVE_WINDOW_BLOCKS ?? 0)} blocks`
    },
    {
      label: 'Registered Participants',
      value: formatNumber(state.totalRegisteredParticipants ?? 0)
    },
    {
      label: tooltip('Accumulated Rewards (Not Yet Paid)', 'Pools that accumulate until the 14‑day payout.'),
      value: `${pools.node} ${state.symbol}`,
      sub: `Holders pool: ${pools.holder} ${state.symbol}`
    },
    {
      label: tooltip('Next Rewards Payout', 'Rewards are paid out every 14 days to reduce on‑chain noise.'),
      value: `~${toDays(state.blocksUntilPayout ?? 0, state.blockTimeSeconds)} (${formatNumber(state.blocksUntilPayout ?? 0)} blocks)`
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
  ].map((item) => `
    <div class="stat">
      <div class="stat-label">${item.label}</div>
      <div class="stat-value">${item.value}</div>
      ${item.sub ? `<div class="stat-sub">${item.sub}</div>` : ''}
      ${item.list ? `<div class="stat-list">${item.list.map(([k, v]) => `<span><strong>${k}</strong><span>${v}</span></span>`).join('')}</div>` : ''}
    </div>
  `).join('');
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

  const upgradeBadge = block.__upgradeActivated
    ? `<div class="badge">Upgrade activated at this block</div>`
    : '';

  const txs = normalizeTxList(block);
  const participantRewards = txs.filter((tx) => tx.type === 'participant_reward');
  const participantRemainder = txs.find((tx) => tx.type === 'participant_remainder');
  const participantTotal = participantRewards.reduce((sum, tx) => {
    try {
      return sum + BigInt(tx.amountMicro || '0');
    } catch {
      return sum;
    }
  }, 0n) + (participantRemainder ? BigInt(participantRemainder.amountMicro || '0') : 0n);
  const participantSummary = `${participantRewards.length} recipients · ${formatTokenAmount(participantTotal.toString(), latestChainState?.decimals ?? 6, 6)} ${latestChainState?.symbol ?? ''}`;

  blockDetailsBody.innerHTML = [
    upgradeBadge,
    heightRow,
    ['Hash', block.hash],
    ['Prev Hash', block.prevHash],
    ['Prev State Root', block.prevStateRoot ?? '-'],
    ['State Root', block.stateRoot ?? '-'],
    ['Proposer', addressLink(block.rewardTo || latestChainState?.proposerAddress)],
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
      loadTxDetails(txid, true);
    });
  });
}

async function renderLatestTxs() {
  if (!latestTxList) return;
  const res = await fetchBlocks(1);
  const blocks = res.blocks || [];
  const txs = [];
  for (const block of blocks) {
    const list = normalizeTxList(block);
    for (const tx of list) {
      txs.push({ ...tx, blockHeight: block.height });
      if (txs.length >= 12) break;
    }
    if (txs.length >= 12) break;
  }
  if (!txs.length) {
    latestTxList.innerHTML = '<div class="detail-empty">No transactions yet.</div>';
    return;
  }
  const decimals = latestChainState?.decimals ?? 6;
  const symbol = latestChainState?.symbol ?? '';
  latestTxList.innerHTML = `
    <table class="tx-table">
      <thead>
        <tr>
          <th>TxID</th>
          <th>Block</th>
          <th>From</th>
          <th>To</th>
          <th>Amount</th>
        </tr>
      </thead>
      <tbody>
        ${txs.map((tx) => `
          <tr>
            <td><a class="tx-link" href="/tx/${tx.txid || tx.id}">${shortHash(tx.txid || tx.id)}</a></td>
            <td>${tx.blockHeight}</td>
            <td>${addressLink(tx.from, tx.from ? shortAddress(tx.from) : '-')}</td>
            <td>${addressLink(tx.to, tx.to ? shortAddress(tx.to) : '-')}</td>
            <td>${formatTokenAmount(tx.amountMicro, decimals, 6)} ${symbol}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
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
    ? `<a class="tx-link" href="/?block=${tx.blockHeight}">${tx.blockHeight}</a>`
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
    badges.push('<span class="badge">Proposer</span>');
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
      loadBlockDetails(height);
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
    const [state, status, genesis] = await Promise.all([fetchState(), fetchStatus(), fetchGenesis()]);
    latestState = status;
    latestGenesis = genesis;
    latestChainState = state;
    renderPanels();
    renderStats(state);
    await refreshBlocks();
    await updateMiningStatus();
    await renderLatestTxs();

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

function startAutoRefresh() {
  if (refreshTimer) clearInterval(refreshTimer);
  refreshTimer = setInterval(refreshAll, 5000);
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
      updateUrlWithBlock(height);
      loadBlockDetails(height);
      return;
    }
  }
  if (value.startsWith('spg_')) {
    updateUrlWithAddress(value);
    loadAddressDetails(value, true);
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
  if (txFeeInput && !txFeeInput.value) txFeeInput.value = initialFeeTokens;
  if (txFeeHint) {
    txFeeHint.textContent = `Minimum fee: ${formatTokenAmount(minFeeMicro.toString(), decimals, 6)} ${latestChainState.symbol ?? ''}`;
  }
}

function maybeLoadBlockFromQuery() {
  const params = new URLSearchParams(window.location.search);
  const blockParam = params.get('block');
  if (!blockParam) return;
  const height = Number(blockParam);
  if (!Number.isFinite(height)) return;
  loadBlockDetails(height);
}

function maybeLoadAddressFromQuery() {
  const address = getAddressFromQuery();
  if (!address) return;
  loadAddressDetails(address);
}

function getTxIdFromPath() {
  const match = window.location.pathname.match(/^\/tx\/([a-fA-F0-9]+)$/);
  return match ? match[1] : null;
}

function getAddressFromQuery() {
  const params = new URLSearchParams(window.location.search);
  return params.get('address');
}

function updateUrlWithBlock(height) {
  const url = new URL(window.location.href);
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
  url.pathname = '/';
  url.searchParams.set('address', address);
  history.pushState({}, '', url.toString());
}

function copyBlockLink(height) {
  const url = new URL(window.location.href);
  url.pathname = '/';
  url.searchParams.set('block', height);
  const text = url.toString();

  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(showToast).catch(() => fallbackCopy(text));
    return;
  }
  fallbackCopy(text);
}

function copyAddressLink(address) {
  const url = new URL(window.location.href);
  url.pathname = '/';
  url.searchParams.set('address', address);
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
    walletBalanceHintEl.textContent = 'Waiting for block rewards…';
    setWalletUiState(false);
    walletBalanceHintEl.textContent = 'Waiting for block rewards…';
    walletPublicKeyEl.classList.add('hidden');
    walletPrivateKeyEl.classList.add('hidden');
    if (togglePublicKeyBtn) togglePublicKeyBtn.textContent = 'Show';
    if (togglePrivateKeyBtn) togglePrivateKeyBtn.textContent = 'Reveal';
    return;
  }
  walletAddressEl.textContent = walletState.address;
  walletPublicKeyEl.textContent = walletState.publicKeyHex;
  walletPrivateKeyEl.textContent = walletState.privateKeyHex;
  walletPublicKeyEl.classList.add('hidden');
  walletPrivateKeyEl.classList.add('hidden');
  if (togglePublicKeyBtn) togglePublicKeyBtn.textContent = 'Show';
  if (togglePrivateKeyBtn) togglePrivateKeyBtn.textContent = 'Reveal';
  setWalletUiState(true);
}

async function refreshWalletState() {
  if (!walletState) return;
  try {
    const stats = await fetch(`/api/address/${walletState.address}`).then((r) => r.json());
    const decimals = latestChainState?.decimals ?? 6;
    walletBalanceEl.textContent = `${formatTokenAmount(stats.balanceMicro, decimals, 6)} ${latestChainState?.symbol ?? ''}`;
    walletNonceEl.textContent = stats.nonce ?? '0';
    const balanceValue = BigInt(stats.balanceMicro || '0');
    walletBalanceHintEl.textContent = balanceValue === 0n ? 'Waiting for block rewards…' : 'Balance updated';
    if (participantStatusEl) {
      const participant = stats.participant;
      if (participant) {
        participantStatusEl.textContent = participant.status === 'active' ? 'Active' : 'Inactive';
        participantBondEl.textContent = `${formatTokenAmount(participant.bondMicro, decimals, 2)} ${latestChainState?.symbol ?? ''}`;
        participantSponsorEl.textContent = participant.sponsor || '-';
        const latestHeight = Number(latestChainState?.latestHeight ?? 0);
        const lastSeen = Number(participant.lastSeenHeight ?? 0);
        const windowBlocks = Number(latestChainState?.ACTIVE_WINDOW_BLOCKS ?? 5100);
        const remaining = Math.max(0, windowBlocks - (latestHeight - lastSeen));
        const days = ((remaining * Number(latestChainState?.blockTimeSeconds || 51)) / 86400).toFixed(1);
        participantNextEl.textContent = `${remaining} blocks (~${days} days)`;
      } else {
        participantStatusEl.textContent = '-';
        participantBondEl.textContent = '-';
        participantSponsorEl.textContent = '-';
        participantNextEl.textContent = '-';
      }
    }
    maybeAutoHeartbeat(stats);
  } catch {
    walletBalanceHintEl.textContent = 'Unable to refresh wallet state.';
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
      sendTxStatus.innerHTML = `Mined in block <a class="tx-link" href="/?block=${height}">${height}</a> · <a class="tx-link" href="/tx/${txid}">${txid}</a>`;
      refreshWalletState();
      renderWalletActivity();
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 4000));
  }
  sendTxStatus.textContent = `Transaction pending… TxID ${txid}`;
}

async function renderWalletActivity() {
  if (!walletState || !walletActivity) return;
  const res = await fetch(`/api/blocks?page=1&limit=10`).then((r) => r.json());
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
  if (!entries.length) {
    walletActivity.innerHTML = '<div class="detail-empty">No activity yet.</div>';
    return;
  }
  const decimals = latestChainState?.decimals ?? 6;
  const symbol = latestChainState?.symbol ?? '';
  walletActivity.innerHTML = `
    <table class="tx-table">
      <thead>
        <tr>
          <th>Tx</th>
          <th>Block</th>
          <th>Amount</th>
          <th>Direction</th>
        </tr>
      </thead>
      <tbody>
        ${entries.slice(0, 6).map((tx) => `
          <tr>
            <td><a class="tx-link" href="/tx/${tx.txid || tx.id}">${shortHash(tx.txid || tx.id)}</a></td>
            <td>${tx.blockHeight}</td>
            <td>${formatTokenAmount(tx.amountMicro, decimals, 6)} ${symbol}</td>
            <td>${tx.from === walletState.address ? 'Sent' : 'Received'}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
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
document.addEventListener('click', (event) => {
  const target = event.target;
  if (!target || !target.classList || !target.classList.contains('addr-link')) return;
  const address = target.dataset.address;
  if (!address) return;
  event.preventDefault();
  loadAddressDetails(address, true);
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

if (isExplorerPage) {
  refreshAll();
  startAutoRefresh();
  maybeLoadBlockFromQuery();
  maybeLoadAddressFromQuery();
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
