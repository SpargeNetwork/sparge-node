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
let walletRegistry = null;
let walletDialogAction = null;
let pendingWalletImport = null;
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
let communityMe = null;
let communityChallenge = null;

const blocksTable = document.getElementById('blocksTable');
const pagerTop = document.getElementById('pagerTop');
const pagerBottom = document.getElementById('pagerBottom');
const chainStats = document.getElementById('chainStats');
const homepageStats = document.getElementById('homepageStats');
const latestTransactionsPanel = document.getElementById('latestTransactionsPanel');
const transactionChartEl = document.getElementById('transactionChart');
const transactionChartCanvas = document.getElementById('transactionChartCanvas');
const transactionChartTooltip = document.getElementById('transactionChartTooltip');
const transactionChartEmpty = document.getElementById('transactionChartEmpty');
const transactionChartRanges = document.getElementById('transactionChartRanges');
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
const addressCommunityCard = document.getElementById('addressCommunityCard');
const addressCommunityProfile = document.getElementById('addressCommunityProfile');
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
const observerGuidance = document.getElementById('observerGuidance');
const observerRestartBtn = document.getElementById('observerRestartBtn');
const observerStopBtn = document.getElementById('observerStopBtn');
const observerResetBtn = document.getElementById('observerResetBtn');
const observerOpenExplorerBtn = document.getElementById('observerOpenExplorerBtn');
const observerOpenLogsBtn = document.getElementById('observerOpenLogsBtn');
const observerCopyDiagnosticsBtn = document.getElementById('observerCopyDiagnosticsBtn');
const observerStartWithWindows = document.getElementById('observerStartWithWindows');
const observerMinimizeToTray = document.getElementById('observerMinimizeToTray');
const observerShellStatus = document.getElementById('observerShellStatus');
const observerCommunityBtn = document.getElementById('observerCommunityBtn');
const observerCommunityStatus = document.getElementById('observerCommunityStatus');
const devWalletPanel = document.getElementById('devWalletPanel');
const devWalletStatus = document.getElementById('devWalletStatus');
const createWalletBtn = document.getElementById('createWalletBtn');
const clearWalletBtn = document.getElementById('clearWalletBtn');
const exportWalletBtn = document.getElementById('exportWalletBtn');
const importWalletBtn = document.getElementById('importWalletBtn');
const importWalletFile = document.getElementById('importWalletFile');
const advancedImportWalletBtn = document.getElementById('advancedImportWalletBtn');
const exportPrivateKeyBtn = document.getElementById('exportPrivateKeyBtn');
const emptyCreateWalletBtn = document.getElementById('emptyCreateWalletBtn');
const emptyImportWalletBtn = document.getElementById('emptyImportWalletBtn');
const walletSelectorBtn = document.getElementById('walletSelectorBtn');
const walletDropdown = document.getElementById('walletDropdown');
const walletList = document.getElementById('walletList');
const currentWalletName = document.getElementById('currentWalletName');
const currentWalletAddress = document.getElementById('currentWalletAddress');
const renameWalletBtn = document.getElementById('renameWalletBtn');
const deleteWalletBtn = document.getElementById('deleteWalletBtn');
const walletEmptyState = document.getElementById('walletEmptyState');
const walletContent = document.getElementById('walletContent');
const walletAddressOverviewEl = document.getElementById('walletAddressOverview');
const copyAddressOverviewBtn = document.getElementById('copyAddressOverviewBtn');
const copyAdvancedAddressBtn = document.getElementById('copyAdvancedAddressBtn');
const walletPendingCount = document.getElementById('walletPendingCount');
const walletNetworkStatus = document.getElementById('walletNetworkStatus');
const walletNetworkHeight = document.getElementById('walletNetworkHeight');
const walletCreatedAt = document.getElementById('walletCreatedAt');
const copyPublicKeyBtn = document.getElementById('copyPublicKeyBtn');
const copyPrivateKeyBtn = document.getElementById('copyPrivateKeyBtn');
const walletActionDialog = document.getElementById('walletActionDialog');
const walletDialogEyebrow = document.getElementById('walletDialogEyebrow');
const walletDialogTitle = document.getElementById('walletDialogTitle');
const walletDialogDescription = document.getElementById('walletDialogDescription');
const walletDialogWarning = document.getElementById('walletDialogWarning');
const walletDialogNameField = document.getElementById('walletDialogNameField');
const walletDialogNameInput = document.getElementById('walletDialogNameInput');
const walletDialogSymbol = document.getElementById('walletDialogSymbol');
const walletDialogCancel = document.getElementById('walletDialogCancel');
const walletDialogConfirm = document.getElementById('walletDialogConfirm');
const walletBackupDialog = document.getElementById('walletBackupDialog');
const walletBackupNow = document.getElementById('walletBackupNow');
const walletBackupLater = document.getElementById('walletBackupLater');
const walletToast = document.getElementById('walletToast');
const communityLinkBadge = document.getElementById('communityLinkBadge');
const communityDisabled = document.getElementById('communityDisabled');
const communityDisconnected = document.getElementById('communityDisconnected');
const communityDiscordConnected = document.getElementById('communityDiscordConnected');
const communityLinked = document.getElementById('communityLinked');
const communitySelectedWallet = document.getElementById('communitySelectedWallet');
const communityPendingDiscordName = document.getElementById('communityPendingDiscordName');
const communityPendingWallet = document.getElementById('communityPendingWallet');
const communityLinkDiscordBtn = document.getElementById('communityLinkDiscordBtn');
const communityCreateChallengeBtn = document.getElementById('communityCreateChallengeBtn');
const communityChallengePanel = document.getElementById('communityChallengePanel');
const communityChallengeText = document.getElementById('communityChallengeText');
const communitySignChallengeBtn = document.getElementById('communitySignChallengeBtn');
const communityDiscordName = document.getElementById('communityDiscordName');
const communityLinkedWallet = document.getElementById('communityLinkedWallet');
const communityRoles = document.getElementById('communityRoles');
const communityLastSynced = document.getElementById('communityLastSynced');
const communitySyncBtn = document.getElementById('communitySyncBtn');
const communityUnlinkBtn = document.getElementById('communityUnlinkBtn');
const communitySavePrivacyBtn = document.getElementById('communitySavePrivacyBtn');
const communityPrivacySettings = document.getElementById('communityPrivacySettings');
const communityStatus = document.getElementById('communityStatus');
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
const signingController = window.SpargeWalletSigning?.createController(document) || null;
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
const participantMaturityEl = document.getElementById('participantMaturity');
const participantRegisteredEl = document.getElementById('participantRegistered');
const participantMaturityNextEl = document.getElementById('participantMaturityNext');
const sponsoredActiveEl = document.getElementById('sponsoredActive');
const sponsoredInactiveEl = document.getElementById('sponsoredInactive');
const sponsorSlotsEl = document.getElementById('sponsorSlots');
const sponsorBondLockedEl = document.getElementById('sponsorBondLocked');
const participantMaturityCard = document.getElementById('participantMaturityCard');
const participantMaturityBadgeEl = document.getElementById('participantMaturityBadge');
const participantMaturityPercentEl = document.getElementById('participantMaturityPercent');
const participantMaturityMultiplierEl = document.getElementById('participantMaturityMultiplier');
const participantMaturityProgressEl = document.getElementById('participantMaturityProgress');
const participantMaturityProgressFill = document.getElementById('participantMaturityProgressFill');
const participantMaturityRegisteredEl = document.getElementById('participantMaturityRegistered');
const participantMaturityAgeEl = document.getElementById('participantMaturityAge');
const participantMaturityTargetEl = document.getElementById('participantMaturityTarget');
const participantMaturityRemainingEl = document.getElementById('participantMaturityRemaining');
const participantMaturityEligibilityEl = document.getElementById('participantMaturityEligibility');
const participantMaturityExplanationEl = document.getElementById('participantMaturityExplanation');
const walletSponsorshipsCard = document.getElementById('walletSponsorshipsCard');
const walletSponsorshipMetrics = document.getElementById('walletSponsorshipMetrics');
const walletSponsorshipList = document.getElementById('walletSponsorshipList');
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
const economicsDistributionPanel = document.getElementById('economicsDistributionPanel');
const economicsPoolsPanel = document.getElementById('economicsPoolsPanel');
const economicsParticipantsPanel = document.getElementById('economicsParticipantsPanel');
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
const explorerTx = window.SpargeExplorerTx;
const participantUi = window.SpargeParticipantUi;
let transactionChart = null;
let transactionChartRange = '24h';

function shortHash(hash) {
  if (!hash) return '-';
  return `${hash.slice(0, 8)}…${hash.slice(-8)}`;
}

function shortAddress(address) {
  if (!address) return '-';
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

function shortMiddle(value, front = 8, back = 8) {
  if (!value) return '-';
  const text = String(value);
  if (text.length <= front + back + 1) return text;
  return `${text.slice(0, front)}…${text.slice(-back)}`;
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

function maturityPresentation(participant, state) {
  return participantUi.maturityPresentation(participant, state);
}

function renderWalletMaturity(participant, state) {
  if (!participantMaturityCard) return;
  participantMaturityCard.classList.toggle('hidden', !participant);
  if (!participant) return;
  const view = maturityPresentation(participant, state);
  const percent = Number(participant.rewardMaturityPercent ?? 100);
  const multiplier = Number(participant.rewardMaturityMultiplierBps ?? 10000) / 10000;
  if (participantMaturityBadgeEl) participantMaturityBadgeEl.textContent = participant.rewardMaturityStage ?? 'Mature';
  if (participantMaturityPercentEl) participantMaturityPercentEl.textContent = `${percent}%`;
  if (participantMaturityMultiplierEl) participantMaturityMultiplierEl.textContent = `${multiplier.toFixed(2)}× multiplier`;
  if (participantMaturityRegisteredEl) participantMaturityRegisteredEl.textContent = `Block ${formatNumber(view.registered)}`;
  if (participantMaturityAgeEl) participantMaturityAgeEl.textContent = `${formatNumber(view.age)} blocks`;
  if (participantMaturityTargetEl) {
    participantMaturityTargetEl.textContent = view.targetBlock === null
      ? 'Full maturity reached'
      : `${view.nextPercent}% at block ${formatNumber(view.targetBlock)}`;
  }
  if (participantMaturityRemainingEl) participantMaturityRemainingEl.textContent = view.blocksRemaining === null ? '0' : formatNumber(view.blocksRemaining);
  if (participantMaturityEligibilityEl) participantMaturityEligibilityEl.textContent = view.eligibilityLabel;
  if (participantMaturityProgressEl) participantMaturityProgressEl.setAttribute('aria-valuenow', String(Math.round(view.progress)));
  if (participantMaturityProgressFill) participantMaturityProgressFill.style.width = `${view.progress}%`;
  if (participantMaturityExplanationEl) {
    participantMaturityExplanationEl.textContent = participantUi.explanation(participant, state, formatNumber);
  }
}

function renderWalletSponsorships(stats, state) {
  if (!walletSponsorshipsCard || !walletSponsorshipMetrics || !walletSponsorshipList) return;
  const records = Array.isArray(stats.sponsoredParticipants) ? stats.sponsoredParticipants : [];
  walletSponsorshipsCard.classList.toggle('hidden', records.length === 0);
  if (!records.length) return;
  const decimals = Number(state?.decimals ?? 6);
  const symbol = state?.symbol ?? '';
  const summary = participantUi.sponsorshipSummary(stats, state);
  const max = summary.maximum;
  walletSponsorshipMetrics.innerHTML = [
    ['Active Sponsored Participants', `${summary.active} / ${max}`],
    ['Inactive Sponsored Participants', summary.inactive],
    ['Available Active Slots', summary.available],
    ['Locked Sponsor Bond', `${formatTokenAmount(stats.lockedBondMicro ?? '0', decimals, 6)} ${symbol}`.trim()],
    ['Reclaimable Bond', 'Not available in this protocol version']
  ].map(([label, value]) => `<div class="sponsorship-metric"><span>${label}</span><strong>${value}</strong></div>`).join('');
  const inactiveNotice = records.some((record) => record.status !== 'active')
    ? '<p class="participant-inactive-note">An inactive participant has rewards paused, but its registration remains on-chain.</p>'
    : '';
  walletSponsorshipList.innerHTML = `${inactiveNotice}<table class="tx-table"><thead><tr><th>Participant</th><th>Status</th><th>Maturity</th><th>Multiplier</th><th>Registered Height</th><th>Last Seen Height</th><th>Bond</th></tr></thead><tbody>${records.map((record) => {
    const multiplier = Number(record.rewardMaturityMultiplierBps ?? 10000) / 10000;
    return `<tr><td>${addressLink(record.address, shortAddress(record.address))}</td><td><span class="badge ${record.status === 'active' ? 'active' : 'inactive'}">${record.status === 'active' ? 'Active' : 'Inactive'}</span></td><td>${record.rewardMaturityPercent ?? 100}% · ${record.rewardMaturityStage ?? 'Mature'}</td><td>${multiplier.toFixed(2)}×</td><td>${formatNumber(record.registeredHeight ?? 0)}</td><td>${formatNumber(record.lastSeenHeight ?? 0)}</td><td>${formatTokenAmount(record.bondMicro ?? '0', decimals, 6)} ${symbol}</td></tr>`;
  }).join('')}</tbody></table>`;
}

function canonicalTxid(value) {
  return explorerTx?.normalizeTxid(value) || null;
}

function txLink(value, blockHeight = null) {
  const ref = explorerTx.reference(value, shortHash);
  const display = escapeHtml(ref.display || '-');
  if (!ref.href && blockHeight !== null && blockHeight !== undefined) {
    return `<a class="tx-link" href="/block/${encodeURIComponent(blockHeight)}" title="View event in block ${escapeHtml(blockHeight)}">${display}</a>`;
  }
  if (!ref.href) return `<span class="mono" title="Transaction details unavailable">${display}</span>`;
  return `<a class="tx-link" href="${escapeHtml(ref.href)}" title="${escapeHtml(ref.txid)}">${display}</a>`;
}

function txRowAttribute(value) {
  const txid = canonicalTxid(value);
  return txid ? `data-txid="${escapeHtml(txid)}"` : '';
}

function copyButton(value, label = 'Copy') {
  if (!value) return '';
  return `<button class="copy-link" type="button" data-copy="${escapeHtml(value)}" aria-label="${escapeHtml(label)}">${escapeHtml(label)}</button>`;
}

function wireCopyButtons(root = document) {
  root.querySelectorAll('[data-copy]').forEach((btn) => {
    if (btn.dataset.copyReady === '1') return;
    btn.dataset.copyReady = '1';
    btn.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      const value = btn.getAttribute('data-copy');
      copyToClipboard(value);
      const original = btn.textContent;
      btn.textContent = 'Copied';
      setTimeout(() => {
        btn.textContent = original || 'Copy';
      }, 1200);
    });
  });
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
  const apiPath = explorerTx.apiPath(txid);
  if (!apiPath) return { error: 'invalid-txid' };
  const res = await fetch(apiPath);
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

function statusTone(status) {
  const text = String(status || '').toLowerCase();
  if (['ok', 'healthy', 'online', 'synced', 'fully_synced', 'yes'].includes(text)) return 'ok';
  if (['warn', 'syncing', 'pending', 'warning', 'paused'].includes(text)) return 'warn';
  if (['bad', 'offline', 'mismatch', 'unhealthy', 'failed', 'failure', 'error', 'no'].includes(text)) return 'bad';
  return 'neutral';
}

async function fetchTransactionMetrics(range = '24h') {
  const res = await fetch(`/api/metrics/transactions?range=${encodeURIComponent(range)}`);
  if (!res.ok) throw new Error('Transaction activity is unavailable');
  return res.json();
}

function statusBadge(label, status = label) {
  return `<span class="status-badge ${statusTone(status)}">${escapeHtml(label)}</span>`;
}

function networkCard(label, value, sub = '', tone = 'neutral') {
  return `
    <div class="network-card ${tone ? `tone-${tone}` : ''}">
      <div class="stat-label">${escapeHtml(label)}</div>
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
  const producerOnline = network.producer?.online === true;
  const mismatch = Number(network.mismatchObserverCount ?? 0);
  const activeObservers = Number(network.activeObserverCount ?? 0);
  const syncedObservers = Number(network.fullySyncedObserverCount ?? 0);
  const html = [
    networkCard('Network Health', producerOnline && mismatch === 0 ? statusBadge('Healthy', 'ok') : statusBadge(mismatch > 0 ? 'Mismatch' : 'Warning', mismatch > 0 ? 'mismatch' : 'warning'), producerOnline ? 'Producer online' : 'Producer offline', producerOnline && mismatch === 0 ? 'ok' : 'bad'),
    networkCard('Chain Height', formatNumber(network.currentHeight ?? 0), 'Current producer tip', 'ok'),
    networkCard('Latest Block', lastBlock, lastBlockRelative, 'neutral'),
    networkCard('Average Block Time', `${formatNumber(network.averageBlockTimeSeconds ?? 0)} sec`, '', 'neutral'),
    networkCard('Transactions Pending', pending, 'Producer mempool', Number(network.mempoolSize ?? 0) > 0 ? 'warn' : 'ok'),
    networkCard('Active Observers', formatNumber(activeObservers), 'Recent heartbeat, healthy status', activeObservers > 0 ? 'ok' : 'warn'),
    networkCard('Fully Synced', formatNumber(syncedObservers), 'Observers at producer tip', syncedObservers > 0 ? 'ok' : 'neutral'),
    networkCard('Official Producers', formatNumber(network.producerCount ?? 1), producerOnline ? 'One active producer' : 'Producer unavailable', producerOnline ? 'ok' : 'bad')
  ].join('');
  if (networkOverviewPanel) networkOverviewPanel.innerHTML = html;
}

function renderNetworkHealth(network, state = {}) {
  if (!networkHealthPanel || !network) return;
  const producerOnline = network.producer?.online === true;
  const mismatch = Number(network.mismatchObserverCount ?? 0);
  const syncing = Number(network.syncingObserverCount ?? 0);
  const offline = Number(network.offlineObserverCount ?? 0);
  const observerTone = mismatch > 0 ? 'bad' : syncing > 0 ? 'warn' : 'ok';
  const latestHeight = Number(network.currentHeight ?? state.latestHeight ?? 0);
  const latestHash = network.producer?.latestHash || state.latestHash || '';
  networkHealthPanel.innerHTML = [
    networkCard('Network Health', statusBadge(producerOnline && mismatch === 0 ? 'Healthy' : mismatch > 0 ? 'Degraded' : 'Offline', producerOnline && mismatch === 0 ? 'ok' : 'bad'), mismatch > 0 ? `${formatNumber(mismatch)} observer mismatch` : 'No critical network issues', producerOnline && mismatch === 0 ? 'ok' : 'bad'),
    networkCard('Current Producer', addressLink(state.producerAddress || state.proposerAddress || '', shortAddress(state.producerAddress || state.proposerAddress || '')), 'Official block producer', 'neutral'),
    networkCard('Producer Status', statusBadge(producerOnline ? 'Online' : 'Offline', producerOnline ? 'online' : 'offline'), producerOnline ? 'Serving the canonical chain' : 'Producer unavailable', producerOnline ? 'ok' : 'bad'),
    networkCard('Chain Height', formatNumber(latestHeight), 'Canonical producer height', 'ok'),
    networkCard('Current Block', `<a class="block-link" href="/block/${latestHeight}">#${formatNumber(latestHeight)}</a>`, `${shortHash(latestHash)} · ${formatDateTime(network.lastBlockTimestamp)}`, 'neutral'),
    networkCard('Average Block Time', `${formatNumber(network.averageBlockTimeSeconds ?? state.blockTimeSeconds ?? 0)} sec`, 'Recent rolling average', 'neutral'),
    networkCard('Pending Transactions', formatNumber(network.mempoolSize ?? 0), 'Producer mempool', Number(network.mempoolSize ?? 0) > 0 ? 'warn' : 'ok'),
    networkCard('Public Observers', formatNumber(network.publicActiveObserverCount ?? 0), 'Opted into public listing', Number(network.publicActiveObserverCount ?? 0) > 0 ? 'ok' : 'neutral'),
    networkCard('Synced Observers', formatNumber(network.fullySyncedObserverCount ?? 0), 'At the canonical tip', Number(network.fullySyncedObserverCount ?? 0) > 0 ? 'ok' : 'neutral'),
    networkCard('Official Producers', formatNumber(network.producerCount ?? 1), 'Current protocol topology', producerOnline ? 'ok' : 'bad'),
    networkCard('Observer Health', statusBadge(observerTone === 'ok' ? 'Healthy' : observerTone === 'warn' ? 'Attention' : 'Mismatch', observerTone), `${formatNumber(syncing)} syncing · ${formatNumber(mismatch)} mismatch · ${formatNumber(offline)} offline`, observerTone)
  ].join('');
}

function renderHomepageStats(state, network) {
  if (!homepageStats || !state) return;
  const latestHeight = state.latestBlock?.height ?? state.latestHeight ?? 0;
  const averageBlockTime = network?.averageBlockTimeSeconds ?? state.blockTimeSeconds ?? 0;
  homepageStats.innerHTML = [
    networkCard('Total Transactions', formatNumber(state.totalTransactions ?? 0)),
    networkCard('Average Transaction Fee', `${escapeHtml(state.averageGasFeeTokens ?? '0')} ${escapeHtml(state.symbol || 'SPRG')}`),
    networkCard('Total Addresses', formatNumber(state.totalAddresses ?? 0)),
    networkCard('Latest Block', `<a class="block-link" href="/block/${latestHeight}">${formatNumber(latestHeight)}</a>`, `${formatNumber(averageBlockTime)} sec average`, 'ok')
  ].join('');
}

function renderLatestTransactions(rows) {
  if (!latestTransactionsPanel) return;
  if (!rows.length) {
    latestTransactionsPanel.innerHTML = '<div class="empty-state compact"><strong>No recent transactions.</strong><span>New transfers and participation activity will appear here.</span></div>';
    return;
  }
  latestTransactionsPanel.innerHTML = rows.map((tx) => {
    const id = tx.txid || tx.id;
    return `<article class="latest-transaction-item">
      <div class="latest-transaction-main">
        <span class="transaction-type">${escapeHtml(String(tx.type || 'transaction').replace(/_/g, ' '))}</span>
        ${txLink(id, tx.blockHeight)}
      </div>
      <div class="latest-transaction-meta">
        <a href="/block/${encodeURIComponent(tx.blockHeight)}">Block ${formatNumber(tx.blockHeight)}</a>
        <span>${formatRelativeTime(tx.timestamp)}</span>
      </div>
    </article>`;
  }).join('');
}

function renderEconomics(state) {
  if (!economicsDistributionPanel || !economicsPoolsPanel || !economicsParticipantsPanel || !state) return;
  const decimals = Number(state.decimals ?? 9);
  const symbol = escapeHtml(state.symbol || 'SPRG');
  const amount = (value, digits = 4) => `${formatTokenAmount(value ?? '0', decimals, digits)} ${symbol}`;
  economicsDistributionPanel.innerHTML = [
    networkCard('Emission This Block', amount(state.mintMicro), `Rate: ${formatNumber(state.mintRatePpm ?? 0)} ppm`, 'neutral'),
    networkCard('Participant Rewards', amount(state.splitMicro?.participant), 'Distributed across eligible active participants', 'ok'),
    networkCard('Reserve Accrual This Block', amount(state.splitMicro?.nodePool), 'Added to the future producer reserve', 'neutral'),
    networkCard('Treasury', amount(state.splitMicro?.treasury), `Recipient: ${shortAddress(state.treasuryAddress || '')}`, 'neutral'),
    networkCard('Holder Accrual This Block', amount(state.splitMicro?.holderPool), 'Added to the holder rewards pool', 'neutral')
  ].join('');
  economicsPoolsPanel.innerHTML = [
    networkCard('Future Producer Reserve', amount(state.poolsMicro?.node), 'Accumulated and not yet paid', 'neutral'),
    networkCard('Holder Rewards Pool', amount(state.poolsMicro?.holder), 'Accumulated and not yet paid', 'neutral'),
    networkCard('Next Reward Distribution', `~${toDays(state.blocksUntilPayout ?? 0, state.blockTimeSeconds)}`, `${formatNumber(state.blocksUntilPayout ?? 0)} blocks remaining`, 'ok'),
    networkCard('Reward Cycle', `${formatNumber(state.avgWindowBlocks ?? 0)} blocks`, `${formatNumber(state.avgWindowDays ?? 14)} day rolling window`, 'neutral'),
    networkCard('Holder Eligibility', `≥ ${amount(state.avgEligibilityMicro, 2)}`, 'Rolling average balance requirement', 'neutral')
  ].join('');
  const ramp = state.participantRewardRamp || {};
  economicsParticipantsPanel.innerHTML = [
    networkCard('Active Participants', formatNumber(state.activeParticipantCount ?? 0), `Active in the last ${formatNumber(state.ACTIVE_WINDOW_BLOCKS ?? 0)} blocks`, 'ok'),
    networkCard('Registered Participants', formatNumber(state.totalRegisteredParticipants ?? 0), 'Current on-chain registrations', 'neutral'),
    networkCard('Reward Maturation', ramp.enabled ? statusBadge('Active', 'ok') : statusBadge('Not active', 'neutral'), ramp.enabled ? `Activated at block ${formatNumber(ramp.activationHeight ?? 0)}` : 'Legacy full rewards currently apply', ramp.enabled ? 'ok' : 'neutral'),
    networkCard('Participant Bond', amount(state.participantBondMicro, 2), 'Locked by the sponsor while registered', 'neutral')
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
    observerNodesList.innerHTML = '<div class="empty-state"><strong>No public observers found.</strong><span>Private observers still count in aggregate network health.</span></div>';
  } else {
    observerNodesList.innerHTML = observers.map((node) => `
      <article class="observer-node-card ${escapeHtml(node.status)}">
        <div class="observer-node-head">
          <div>
            <div class="observer-node-country">${escapeHtml(sharedLocationLabel(node.countryCode || ''))}</div>
            <div class="observer-node-title">${escapeHtml(node.publicAlias || 'Observer')}</div>
          </div>
          <span class="observer-status ${escapeHtml(node.status)}">${observerStatusLabel(node.status)}</span>
        </div>
        <div class="observer-node-meta">
          <span><small>Status</small><strong>${observerStatusLabel(node.status)}</strong></span>
          <span><small>Height</small><strong>${formatNumber(node.height ?? 0)}</strong></span>
          <span><small>Lag</small><strong>${formatNumber(node.lag ?? 0)} blocks</strong></span>
          <span><small>Version</small><strong>${escapeHtml(node.version || '-')}</strong></span>
          <span><small>Last Seen</small><strong>${formatSecondsAgo(node.secondsSinceLastSeen)}</strong></span>
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
      <button data-observer-page="prev" ${page <= 1 ? 'disabled' : ''}>Previous</button>
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

function observerStatusCard(label, value, sub = '', tone = 'neutral') {
  return `
    <div class="observer-status-card tone-${tone}">
      <span>${escapeHtml(label)}</span>
      <strong>${value}</strong>
      ${sub ? `<small>${sub}</small>` : ''}
    </div>
  `;
}

function observerPlainState(state, lagBlocks, syncedHeight) {
  if (state?.invariantStatus && state.invariantStatus !== 'ok') {
    return {
      label: 'Invariant failure',
      tone: 'bad',
      guidance: 'The observer detected an impossible local state. Keep it stopped and reset/resync only if you trust the configured producer.'
    };
  }
  if (state?.lastSyncError) {
    const message = String(state.lastSyncError).toLowerCase();
    if (message.includes('genesis') || message.includes('chain') || message.includes('protocol') || message.includes('economics') || message.includes('prevhash')) {
      return {
        label: 'Chain mismatch',
        tone: 'bad',
        guidance: 'This producer does not match your local chain identity. Check the producer URL before resyncing.'
      };
    }
    return {
      label: 'Producer unreachable',
      tone: 'bad',
      guidance: 'The observer cannot reach the producer. Check your internet connection and producer URL.'
    };
  }
  if (lagBlocks > 0) {
    return {
      label: 'Syncing',
      tone: 'warn',
      guidance: `Syncing blocks from the producer. ${formatNumber(lagBlocks)} blocks remaining.`
    };
  }
  if (syncedHeight > 0) {
    return {
      label: 'Fully synced',
      tone: 'ok',
      guidance: 'Observer is fully synced and validating the local chain state.'
    };
  }
  return {
    label: 'Starting',
    tone: 'warn',
    guidance: 'Starting local services and waiting for the first synced block.'
  };
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
  const lastSyncAt = state.lastSyncAt ? `${formatDateTime(state.lastSyncAt)} (${formatRelativeTime(state.lastSyncAt)})` : '-';
  const latestBlockTime = state.latestBlock?.timestamp
    ? `${formatDateTime(state.latestBlock.timestamp)} (${formatRelativeTime(state.latestBlock.timestamp)})`
    : '-';
  const plain = observerPlainState(state, lagBlocks, syncedHeight);
  const healthTone = state.invariantStatus && state.invariantStatus !== 'ok' ? 'bad' : 'ok';

  if (observerStatusBadgeEl) {
    observerStatusBadgeEl.textContent = plain.label.toUpperCase();
    observerStatusBadgeEl.className = `observer-pill ${plain.tone === 'bad' ? 'error' : plain.tone === 'ok' ? 'synced' : syncClass}`;
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
      observerStatusCard('Observer status', statusBadge(plain.label, plain.tone), 'Local validator state', plain.tone),
      observerStatusCard('Sync progress', `${formatNumber(syncedHeight)} / ${producerHeight}`, `${formatNumber(lagBlocks)} blocks behind`, lagBlocks > 0 ? 'warn' : 'ok'),
      observerStatusCard('Local height', formatNumber(syncedHeight), 'Validated locally', 'neutral'),
      observerStatusCard('Network height', producerHeight, 'Producer tip', 'neutral'),
      observerStatusCard('Last block time', latestBlockTime, '', 'neutral'),
      observerStatusCard('Producer connection', statusBadge(state.lastSyncError ? 'Needs attention' : 'Connected', state.lastSyncError ? 'error' : 'online'), shortenUrl(producerUrl), state.lastSyncError ? 'bad' : 'ok'),
      observerStatusCard('Software version', escapeHtml(state.softwareVersion || '-'), `Protocol ${escapeHtml(state.protocolVersion || '-')} · Economics ${escapeHtml(state.economicsVersion || '-')}`, 'neutral'),
      observerStatusCard('Health checks', statusBadge(state.invariantStatus || 'ok', healthTone), state.lastInvariantFailureCode ? `Last failure: ${escapeHtml(state.lastInvariantFailureCode)}` : 'Invariants OK', healthTone)
    ].join('');
  }
  if (observerGuidance) observerGuidance.textContent = plain.guidance;

  if (observerLogEntries.length === 0) {
    pushObserverLog('warn', `Observer connected to ${shortenUrl(producerUrl)}`);
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
    pushObserverLog('error', 'Sync needs attention. Check producer URL and chain identity.');
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
          <tr ${txRowAttribute(tx.txid)} data-block-height="${tx.height}">
            <td>${txLink(tx.txid, tx.height)}</td>
            <td>${tx.height}</td>
            <td>${tx.type}</td>
            <td>${formatTokenAmount(tx.amount, decimals)} ${state?.symbol ?? ''}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
  observerTxList.querySelectorAll('tr[data-block-height]').forEach((row) => {
    row.addEventListener('click', () => {
      const txid = row.dataset.txid;
      const href = explorerTx.txHref(txid);
      window.location.href = href || `/block/${encodeURIComponent(row.dataset.blockHeight)}`;
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

  const distribution = window.SpargeRewardDistribution?.calculate(block);
  const decimals = Number(latestChainState?.decimals ?? 9);
  const symbol = latestChainState?.symbol ?? 'SPRG';
  const exactRewardAmount = (units) => `${formatTokenAmount(units?.toString(), decimals, decimals)} ${escapeHtml(symbol)}`;
  const rewardDestination = (units, address, note) => `
    <span class="reward-detail-value">
      <strong>${exactRewardAmount(units)}</strong>
      ${address ? addressLink(address) : ''}
      ${note ? `<small class="reward-detail-note">${escapeHtml(note)}</small>` : ''}
    </span>
  `;
  const participantNote = distribution?.participantRemainder > 0n
    ? `${distribution.participantRecipients} recipients; ${exactRewardAmount(distribution.participantRemainder)} redirected to Treasury`
    : `${distribution?.participantRecipients ?? 0} recipients; complete pool distributed`;
  const mintRate = distribution ? `${(Number(distribution.mintRatePpm) / 10_000).toFixed(4)}% annualized` : '-';
  const allocationRows = distribution ? [
    '<div class="detail-section-heading">Mint Distribution</div>',
    ['Total New Tokens', rewardDestination(distribution.mintUnits, '', '100% minted by this block')],
    ['Emission Rate', mintRate],
    ['Participants (15% pool)', rewardDestination(distribution.participantPaid, '', participantNote)],
    ['Node Pool (70%)', rewardDestination(distribution.nodePool, distribution.addresses.nodePool, 'Accrued for the Node Holder payout cycle')],
    ['Treasury (10% + remainders)', rewardDestination(distribution.treasury, distribution.addresses.treasury, 'Includes deterministic and Participant pool remainders')],
    ['Holder Pool (5%)', rewardDestination(distribution.holderPool, distribution.addresses.holderPool, 'Accrued for eligible-holder payouts')],
    ['Allocation Check', distribution.balanced ? '100% accounted for' : 'Allocation mismatch']
  ] : [];

  blockDetailsBody.innerHTML = [
    heightRow,
    ['Hash', block.hash],
    ['Prev Hash', block.prevHash],
    ['Prev State Root', block.prevStateRoot ?? '-'],
    ['State Root', block.stateRoot ?? '-'],
    ['Official Producer', addressLink(block.rewardTo || latestChainState?.proposerAddress)],
    ...allocationRows,
    '<div class="detail-section-heading">Protocol</div>',
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
        ${txs.map((tx, txIndex) => `
          <tr ${txRowAttribute(tx.txid || tx.id)} data-tx-index="${txIndex}" class="${currentTxId && (tx.txid || tx.id) === currentTxId ? 'selected' : ''}">
            <td>${txLink(tx.txid || tx.id, block.height)}</td>
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

  blockTxList.querySelectorAll('tr[data-tx-index]').forEach((row) => {
    row.addEventListener('click', (event) => {
      if (event.target && event.target.tagName === 'A') {
        event.preventDefault();
      }
      const href = explorerTx.txHref(row.dataset.txid);
      if (href) {
        window.location.href = href;
        return;
      }
      const tx = txs[Number(row.dataset.txIndex)];
      if (tx) {
        blockTxList.querySelectorAll('tr.selected').forEach((entry) => entry.classList.remove('selected'));
        row.classList.add('selected');
        renderTxDetails({ ...tx, blockHeight: block.height });
      }
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
  const canonical = canonicalTxid(txid);
  if (!canonical) {
    renderTxDetails(null, 'Ongeldige transactie-ID.');
    return;
  }
  currentTxId = canonical;
  if (updateUrl) {
    updateUrlWithTx(canonical);
  }
  const tx = await fetchTxById(canonical);
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
    ['Reward Maturity', data.participant ? `${data.participant.rewardMaturityPercent ?? 100}% · ${data.participant.rewardMaturityStage ?? 'Mature'}` : '-'],
    ['Registered Height', data.participant ? data.participant.registeredHeight : '-'],
    ['Last Seen Height', data.participant ? data.participant.lastSeenHeight : '-'],
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
              <td>${txLink(tx.txid, tx.blockHeight)}</td>
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
    const sponsorshipRows = [
      ['Active sponsored participants', stats.sponsoredActiveCount ?? 0],
      ['Inactive sponsored participants', stats.sponsoredInactiveCount ?? 0],
      ['Available sponsor slots', stats.availableSponsorSlots ?? 10],
      ['Sponsored bond locked', `${formatTokenAmount(stats.lockedBondMicro ?? '0', decimals, 6)} ${symbol}`.trim()],
      ['Reclaimable bond', stats.reclaimableBondMicro === null ? 'Not available in this protocol version' : `${formatTokenAmount(stats.reclaimableBondMicro ?? '0', decimals, 6)} ${symbol}`.trim()]
    ];
    if (stats.participant) {
      const lastSeen = Number(stats.participant.lastSeenHeight ?? 0);
      const latestHeight = Number(state?.latestHeight ?? 0);
      const windowBlocks = Number(state?.ACTIVE_WINDOW_BLOCKS ?? 5100);
      const remaining = Math.max(0, windowBlocks - (latestHeight - lastSeen));
      const days = ((remaining * Number(state?.blockTimeSeconds ?? 51)) / 86400).toFixed(1);
      const maturityNext = stats.participant.blocksUntilNextMaturityStage === null
        ? 'Mature'
        : `${formatNumber(stats.participant.blocksUntilNextMaturityStage)} blocks`;
      const maturityView = maturityPresentation(stats.participant, state);
      const multiplier = Number(stats.participant.rewardMaturityMultiplierBps ?? 10000) / 10000;
      const sponsorDisplay = stats.participant.sponsor
        ? `<span class="detail-actions">${addressLink(stats.participant.sponsor, shortAddress(stats.participant.sponsor))}${copyButton(stats.participant.sponsor, 'Copy sponsor address')}</span>`
        : '-';
      const rows = [
        ['Participant status', stats.participant.status],
        ['Bond locked', `${formatTokenAmount(stats.participant.bondMicro || '0', decimals, 2)} ${symbol}`],
        ['Sponsor', sponsorDisplay],
        ['Reward maturity', `${stats.participant.rewardMaturityPercent ?? 100}% · ${stats.participant.rewardMaturityStage ?? 'Mature'}`],
        ['Current reward multiplier', `${multiplier.toFixed(2)}×`],
        ['Registered', `Block ${formatNumber(stats.participant.registeredHeight ?? 0)}`],
        ['Active since', `Block ${formatNumber(stats.participant.activeSinceHeight ?? stats.participant.registeredHeight ?? 0)}`],
        ['Last Seen Height', `Block ${formatNumber(stats.participant.lastSeenHeight ?? 0)}`],
        ['Blocks until next stage', maturityNext],
        ['Next activity due', `${remaining} blocks (~${days} days)`]
      ].concat(sponsorshipRows).map(([label, value]) => `<div class="detail-row"><span>${label}</span><span>${value}</span></div>`).join('');
      const rampMessage = stats.participant.rewardRampActive
        ? 'Inactivity pauses rewards but does not reset Reward Maturity.'
        : `Reward maturation activates at block ${formatNumber(state?.participantRewardRamp?.activationHeight ?? 1000)}. Until then, legacy full rewards apply.`;
      addressParticipationEl.innerHTML = `<div class="participant-maturity-summary"><div class="maturity-value-row"><strong>${stats.participant.rewardMaturityPercent ?? 100}% maturity</strong><span>${stats.participant.rewardMaturityStage ?? 'Mature'} · ${multiplier.toFixed(2)}×</span></div><div class="maturity-progress" role="progressbar" aria-label="Progress toward next reward maturity stage" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(maturityView.progress)}"><span style="width:${maturityView.progress}%"></span></div><p class="card-note">${rampMessage}</p></div>${rows}`;
      wireCopyButtons(addressParticipationEl);
      addressParticipationCard.style.display = '';
    } else {
      addressParticipationEl.innerHTML = [
        ['Participant status', 'Not registered'],
        ...sponsorshipRows
      ].map(([label, value]) => `<div class="detail-row"><span>${label}</span><span>${value}</span></div>`).join('');
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
            <tr ${txRowAttribute(tx.txid)} data-block-height="${tx.blockHeight}">
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

  addressTxListPage.querySelectorAll('tr[data-block-height]').forEach((row) => {
    row.addEventListener('click', () => {
      const href = explorerTx.txHref(row.dataset.txid);
      if (href) {
        window.location.href = href;
      } else if (row.dataset.blockHeight) {
        window.location.href = `/block/${encodeURIComponent(row.dataset.blockHeight)}`;
      }
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
  const showRewards = blocksTable.dataset.showRewards === 'true';
  if (!Array.isArray(blocks) || !blocks.length) {
    blocksTable.innerHTML = `<tr><td colspan="${showRewards ? 7 : 6}"><div class="empty-state compact"><strong>No blocks yet.</strong><span>Waiting for the producer to create the first block.</span></div></td></tr>`;
    return;
  }
  blocksTable.innerHTML = blocks.map((block) => `
    <tr data-height="${block.height}" class="${Number(block.height) === Number(selectedHeight) ? 'selected' : ''}">
      <td><a class="block-link" href="/block/${block.height}">${formatNumber(block.height)}</a></td>
      <td><span class="table-pill">${block.txCount ?? (block.transactions ? block.transactions.length : (block.rewardBaseUnits && block.rewardBaseUnits !== '0' ? 1 : 0))}</span></td>
      <td><span title="${escapeHtml(formatDateTime(block.timestamp))}">${formatRelativeTime(block.timestamp)}</span><small class="table-sub">${formatDateTime(block.timestamp)}</small></td>
      <td title="${escapeHtml(block.hash)}"><span class="hash-cell">${shortMiddle(block.hash)}</span>${copyButton(block.hash)}</td>
      <td title="${escapeHtml(block.prevHash)}"><span class="hash-cell">${shortMiddle(block.prevHash)}</span>${copyButton(block.prevHash)}</td>
      <td title="${escapeHtml(block.stateRoot ?? '')}"><span class="hash-cell">${shortMiddle(block.stateRoot ?? '')}</span>${copyButton(block.stateRoot ?? '')}</td>
      ${showRewards ? `<td>${block.rewardTokens ?? block.rewardBaseUnits}</td>` : ''}
    </tr>
  `).join('');

  blocksTable.querySelectorAll('tr').forEach((row) => {
    row.addEventListener('click', () => {
      const height = Number(row.dataset.height);
      window.location.href = `/block/${height}`;
    });
  });
  wireCopyButtons(blocksTable);
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
    <button ${prevDisabled ? 'disabled' : ''} data-action="prev">Previous</button>
    <span>${label}</span>
    <button ${nextDisabled ? 'disabled' : ''} data-action="next">Next</button>
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

async function refreshTransactionChart() {
  if (!transactionChartEl || !transactionChartCanvas || !window.SpargeTransactionChart) return;
  if (!transactionChart) {
    transactionChart = window.SpargeTransactionChart.createChart({
      container: transactionChartEl,
      canvas: transactionChartCanvas,
      tooltip: transactionChartTooltip
    });
  }
  try {
    const data = await fetchTransactionMetrics(transactionChartRange);
    transactionChart.setData(data.series || [], transactionChartRange);
    renderLatestTransactions(Array.isArray(data.recentTransactions) ? data.recentTransactions : []);
    if (transactionChartEmpty) transactionChartEmpty.hidden = Array.isArray(data.series) && data.series.length > 0;
  } catch {
    if (transactionChartEmpty) {
      transactionChartEmpty.hidden = false;
      transactionChartEmpty.textContent = 'Transaction activity is temporarily unavailable.';
    }
  }
}

async function updateMiningStatus() {
  if (!miningStatus) return;
  const status = await fetchMiningStatus();
  miningStatus.textContent = status.active ? 'Status: mining actief' : 'Status: mining gestopt';
}

async function refreshAll() {
  if (blocksTable || chainStats || statusPanel || homepageStats) {
    const [state, status, genesis, network] = await Promise.all([fetchState(), fetchStatus(), fetchGenesis(), fetchNetworkStatus()]);
    latestState = status;
    latestGenesis = genesis;
    latestChainState = state;
    latestNetworkStatus = network;
    renderPanels();
    renderStats(state);
    renderHomepageStats(state, network);
    await refreshBlocks();
    await refreshTransactionChart();
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
    initializeWalletRegistry();
    if (!walletState) walletState = loadWalletFromStorage();
    await refreshWalletContext();
    renderWallet();
    refreshWalletState();
    renderWalletActivity();
  }
}

async function refreshNetworkPage() {
  if (!networkHealthPanel && !observerNodesList) return;
  const [network, observers, state] = await Promise.all([
    fetchNetworkStatus(),
    fetchObserverNodes(observerNodesPage),
    fetchStatus()
  ]);
  latestNetworkStatus = network;
  renderNetworkHealth(network, state);
  renderObserverNodes(observers);
}

async function refreshEconomicsPage() {
  if (!economicsDistributionPanel) return;
  const state = await fetchState();
  latestChainState = state;
  renderEconomics(state);
}

function startAutoRefresh() {
  if (refreshTimer) clearInterval(refreshTimer);
  refreshTimer = setInterval(() => {
    if (networkHealthPanel || observerNodesList) {
      refreshNetworkPage();
      return;
    }
    if (economicsDistributionPanel) {
      refreshEconomicsPage();
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
  loadTxDetails(value);
}

async function refreshWalletContext() {
  let status;
  try {
    status = await fetchStatus();
    latestChainState = status;
    if (walletNetworkStatus) walletNetworkStatus.textContent = 'Connected';
    if (walletNetworkHeight) walletNetworkHeight.textContent = formatNumber(status.latestHeight ?? 0);
  } catch (err) {
    if (walletNetworkStatus) walletNetworkStatus.textContent = 'Unavailable';
    if (walletNetworkHeight) walletNetworkHeight.textContent = '-';
    throw err;
  }
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
  return explorerTx.parseTxPath(window.location.pathname);
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
  url.pathname = `/tx/${encodeURIComponent(String(txid || '').trim())}`;
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
  if (walletRegistry) return walletRegistry.getSelected();
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
  if (walletRegistry) {
    walletState = walletRegistry.add(wallet, wallet.name);
    return walletState;
  }
  localStorage.setItem('sparge_dev_wallet', JSON.stringify(wallet));
  walletState = wallet;
  return wallet;
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

function exportPrivateKeyToFile(wallet) {
  if (!wallet) return;
  const blob = new Blob([`${wallet.privateKeyHex}\n`], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `sparge-private-key-${wallet.address}.txt`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function importWalletFromJson(json, name) {
  const wallet = {
    address: String(json.address || ''),
    publicKeyHex: String(json.publicKeyHex || ''),
    privateKeyHex: String(json.privateKeyHex || ''),
    createdAt: json.createdAt || new Date().toISOString(),
    name
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
  walletState = saveWalletToStorage(wallet);
  renderWallet();
  refreshWalletState();
  renderWalletActivity();
  showWalletToast(`${walletState.name || 'Wallet'} imported`);
}

function clearWalletStorage() {
  if (walletRegistry && walletState) {
    walletRegistry.remove(walletState.id);
    walletState = walletRegistry.getSelected();
    return;
  }
  localStorage.removeItem('sparge_dev_wallet');
}

function setWalletUiState(connected) {
  if (!devWalletStatus) return;
  const label = devWalletStatus.querySelector('span:last-child');
  if (label) label.textContent = connected ? 'Wallet loaded' : 'No wallet';
  else devWalletStatus.textContent = connected ? 'Wallet loaded' : 'No wallet';
  devWalletStatus.classList.toggle('connected', connected);
}

function showWalletToast(message) {
  if (!walletToast) return;
  walletToast.textContent = message;
  walletToast.classList.add('show');
  setTimeout(() => walletToast.classList.remove('show'), 1800);
}

function shortWalletAddress(address) {
  if (!address || address.length < 16) return address || '-';
  return `${address.slice(0, 10)}...${address.slice(-6)}`;
}

function formatWalletCreatedAt(value) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '-';
  return new Intl.DateTimeFormat(undefined, { year: 'numeric', month: 'short', day: 'numeric' }).format(date);
}

function closeWalletDropdown() {
  if (!walletDropdown || !walletSelectorBtn) return;
  walletDropdown.classList.add('hidden');
  walletSelectorBtn.setAttribute('aria-expanded', 'false');
}

function renderWalletSelector() {
  const wallets = walletRegistry ? walletRegistry.list() : (walletState ? [walletState] : []);
  if (currentWalletName) currentWalletName.textContent = walletState?.name || 'No wallet selected';
  if (currentWalletAddress) currentWalletAddress.textContent = walletState ? shortWalletAddress(walletState.address) : 'Create or import a wallet';
  if (walletSelectorBtn) walletSelectorBtn.disabled = wallets.length === 0;
  if (renameWalletBtn) renameWalletBtn.disabled = !walletState;
  if (deleteWalletBtn) deleteWalletBtn.disabled = !walletState;
  if (!walletList) return;
  walletList.innerHTML = '';
  wallets.forEach((wallet) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `wallet-option${wallet.id === walletState?.id ? ' selected' : ''}`;
    button.setAttribute('role', 'option');
    button.setAttribute('aria-selected', wallet.id === walletState?.id ? 'true' : 'false');
    const dot = document.createElement('span');
    dot.className = 'wallet-option-dot';
    const copy = document.createElement('span');
    copy.className = 'wallet-option-copy';
    const name = document.createElement('strong');
    name.textContent = wallet.name;
    const address = document.createElement('span');
    address.textContent = shortWalletAddress(wallet.address);
    const created = document.createElement('small');
    created.textContent = `Created ${formatWalletCreatedAt(wallet.createdAt)}`;
    copy.append(name, address, created);
    const selected = document.createElement('span');
    selected.className = 'wallet-option-check';
    selected.textContent = wallet.id === walletState?.id ? '✓' : '';
    button.append(dot, copy, selected);
    button.addEventListener('click', () => switchWallet(wallet.id));
    walletList.appendChild(button);
  });
}

async function switchWallet(id) {
  if (!walletRegistry) return;
  walletState = walletRegistry.select(id);
  walletActivityPage = 1;
  participantPending = false;
  lastAutoHeartbeatHeight = null;
  communityChallenge = null;
  communityChallengePanel?.classList.add('hidden');
  closeWalletDropdown();
  renderWallet();
  await refreshWalletContext();
  await Promise.all([refreshWalletState(), renderWalletActivity(), refreshCommunityIdentity()]);
  showWalletToast(`${walletState.name} selected`);
}

function openWalletAction(options) {
  if (!walletActionDialog) return;
  walletDialogAction = options.onConfirm || null;
  walletDialogEyebrow.textContent = options.eyebrow || 'Wallet action';
  walletDialogTitle.textContent = options.title || 'Confirm';
  walletDialogDescription.textContent = options.description || '';
  walletDialogWarning.textContent = options.warning || '';
  walletDialogWarning.classList.toggle('hidden', !options.warning);
  walletDialogNameField.classList.toggle('hidden', !options.showName);
  walletDialogNameInput.value = options.defaultName || '';
  walletDialogConfirm.textContent = options.confirmLabel || 'Confirm';
  walletDialogConfirm.classList.toggle('danger', options.danger === true);
  walletDialogConfirm.classList.toggle('primary', options.danger !== true);
  walletDialogSymbol.textContent = options.danger ? '!' : (options.symbol || '+');
  walletDialogSymbol.classList.toggle('danger', options.danger === true);
  walletActionDialog.showModal();
  setTimeout(() => (options.showName ? walletDialogNameInput : walletDialogConfirm).focus(), 0);
}

async function confirmWalletAction() {
  if (!walletDialogAction) return;
  const action = walletDialogAction;
  walletDialogConfirm.disabled = true;
  try {
    await action(walletDialogNameInput.value.trim());
    walletActionDialog.close();
    walletDialogAction = null;
  } catch (err) {
    walletDialogWarning.textContent = err.message || 'Unable to complete this action.';
    walletDialogWarning.classList.remove('hidden');
  } finally {
    walletDialogConfirm.disabled = false;
  }
}

function disableWalletActions(disabled) {
  if (createWalletBtn) createWalletBtn.disabled = disabled;
  if (emptyCreateWalletBtn) emptyCreateWalletBtn.disabled = disabled;
  if (importWalletBtn) importWalletBtn.disabled = disabled;
  if (walletSelectorBtn && walletState) walletSelectorBtn.disabled = disabled;
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

async function createWallet(name) {
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
      createdAt: new Date().toISOString(),
      name
    };
    walletState = saveWalletToStorage(wallet);
    renderWallet();
    await refreshWalletContext();
    await Promise.all([refreshWalletState(), renderWalletActivity()]);
    return walletState;
  } catch (err) {
    if (err?.name === 'NotSupportedError' || /unrecognized|not supported/i.test(err?.message || '')) {
      throw new Error('This browser cannot create Sparge wallets. Use a current version of Chrome, Edge, or Firefox.');
    }
    throw err;
  } finally {
    disableWalletActions(false);
  }
}

function renderWallet() {
  renderWalletSelector();
  if (walletEmptyState) walletEmptyState.classList.toggle('hidden', Boolean(walletState));
  if (walletContent) walletContent.classList.toggle('hidden', !walletState);
  if (!walletState) {
    if (walletAddressEl) walletAddressEl.textContent = '-';
    if (walletAddressOverviewEl) walletAddressOverviewEl.textContent = '-';
    if (walletAddressReceiveEl) walletAddressReceiveEl.textContent = '-';
    if (walletPublicKeyEl) walletPublicKeyEl.textContent = '-';
    if (walletPrivateKeyEl) walletPrivateKeyEl.textContent = '-';
    if (walletBalanceEl) walletBalanceEl.textContent = '-';
    if (walletBalanceOverviewEl) walletBalanceOverviewEl.textContent = '-';
    if (walletNonceEl) walletNonceEl.textContent = '-';
    if (walletCreatedAt) walletCreatedAt.textContent = '-';
    if (walletBalanceHintEl) walletBalanceHintEl.textContent = 'Balance updates after confirmation.';
    setWalletUiState(false);
    if (walletPublicKeyEl) walletPublicKeyEl.classList.add('hidden');
    if (walletPrivateKeyEl) walletPrivateKeyEl.classList.add('hidden');
    if (togglePublicKeyBtn) togglePublicKeyBtn.textContent = 'Show';
    if (togglePrivateKeyBtn) togglePrivateKeyBtn.textContent = 'Reveal';
    return;
  }
  if (walletAddressEl) walletAddressEl.textContent = walletState.address;
  if (walletAddressOverviewEl) walletAddressOverviewEl.textContent = walletState.address;
  if (walletAddressReceiveEl) walletAddressReceiveEl.textContent = walletState.address;
  if (walletCreatedAt) walletCreatedAt.textContent = formatWalletCreatedAt(walletState.createdAt);
  if (walletPublicKeyEl) {
    walletPublicKeyEl.textContent = walletState.publicKeyHex;
    walletPublicKeyEl.classList.add('hidden');
  }
  if (walletPrivateKeyEl) {
    walletPrivateKeyEl.textContent = '-';
    walletPrivateKeyEl.classList.add('hidden');
  }
  if (copyPublicKeyBtn) copyPublicKeyBtn.classList.add('hidden');
  if (copyPrivateKeyBtn) copyPrivateKeyBtn.classList.add('hidden');
  [copyAddressOverviewBtn, copyAddressBtn, copyAdvancedAddressBtn].forEach((button) => {
    if (button) button.setAttribute('data-copy', walletState.address);
  });
  if (copyPublicKeyBtn) copyPublicKeyBtn.setAttribute('data-copy', walletState.publicKeyHex);
  wireCopyButtons(devWalletPanel);
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
    const pendingTransactions = Array.isArray(mempool.transactions)
      ? mempool.transactions.filter((tx) => tx.from === walletState.address || tx.to === walletState.address).length
      : 0;
    if (walletPendingCount) walletPendingCount.textContent = String(pendingTransactions);
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
        if (participantMaturityEl) participantMaturityEl.textContent = `${participant.rewardMaturityPercent ?? 100}% · ${participant.rewardMaturityStage ?? 'Mature'}`;
        if (participantRegisteredEl) participantRegisteredEl.textContent = `Block ${formatNumber(participant.registeredHeight ?? 0)}`;
        if (participantMaturityNextEl) {
          participantMaturityNextEl.textContent = participant.blocksUntilNextMaturityStage === null
            ? 'Mature'
            : `${formatNumber(participant.blocksUntilNextMaturityStage)} blocks`;
        }
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
        if (participantMaturityEl) participantMaturityEl.textContent = '-';
        if (participantRegisteredEl) participantRegisteredEl.textContent = '-';
        if (participantMaturityNextEl) participantMaturityNextEl.textContent = '-';
        if (participantNextEl) participantNextEl.textContent = '-';
        if (participantNextShortEl) {
          participantNextShortEl.textContent = 'Next activity: -';
        }
        if (participationTabBtn) {
          participationTabBtn.classList.add('highlight');
        }
      }
      if (sponsoredActiveEl) sponsoredActiveEl.textContent = String(stats.sponsoredActiveCount ?? 0);
      if (sponsoredInactiveEl) sponsoredInactiveEl.textContent = String(stats.sponsoredInactiveCount ?? 0);
      if (sponsorSlotsEl) sponsorSlotsEl.textContent = String(stats.availableSponsorSlots ?? 10);
      if (sponsorBondLockedEl) sponsorBondLockedEl.innerHTML = walletAmountHtml(stats.lockedBondMicro ?? '0', decimals);
      renderWalletMaturity(participant, latestChainState);
      renderWalletSponsorships(stats, latestChainState);
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

async function signCanonicalMessage(message, wallet) {
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

function isSigningRejected(error) {
  return error?.code === 'SIGNING_REJECTED';
}

function friendlyTransactionType(type) {
  return ({
    transfer: 'Transfer',
    register_participant: 'Register Participant',
    unregister_participant: 'Unregister Participant',
    heartbeat: 'Participant Heartbeat',
    create_token: 'Create Token',
    mint: 'Mint',
    burn: 'Burn',
    create_order: 'Create Order',
    cancel_order: 'Cancel Order',
    accept_order: 'Accept Order'
  })[type] || String(type || 'Transaction').replace(/_/g, ' ');
}

function transactionSigningPayload(tx, { decimals, symbol, bondMicro, extraFields = [] }) {
  const fields = [{ label: 'Type', value: friendlyTransactionType(tx.type) }];
  if (tx.to) fields.push({ label: 'Recipient', value: tx.to, mono: true });
  if (tx.type === 'transfer' || BigInt(tx.amountMicro || '0') > 0n) {
    fields.push({ label: 'Amount', value: `${formatTokenAmount(tx.amountMicro, decimals, decimals)} ${symbol}`.trim() });
  }
  if (tx.sponsor) fields.push({ label: 'Sponsor', value: tx.sponsor, mono: true });
  if (tx.participant) fields.push({ label: 'Participant', value: tx.participant, mono: true });
  if (bondMicro !== undefined && bondMicro !== null) {
    fields.push({ label: 'Bond locked', value: `${formatTokenAmount(bondMicro, decimals, decimals)} ${symbol}`.trim() });
  }
  if (tx.memo) fields.push({ label: 'Memo', value: tx.memo });
  fields.push({ label: 'Nonce', value: String(tx.nonce), mono: true });
  return fields.concat(extraFields);
}

async function requestMessageSignature({ purpose, title = 'Sign Message', description, consequence, message, wallet = walletState }) {
  if (!signingController) throw new Error('Signing confirmation is unavailable. Nothing was signed.');
  if (!wallet) throw new Error('Select a wallet before signing.');
  const hash = await computeTxId(message);
  return signingController.request({
    kind: 'message',
    type: 'message_signature',
    title,
    description,
    wallet: wallet.address,
    network: latestChainState?.chainId || 'Off-chain',
    fee: '0 SPRG',
    payload: [{ label: 'Purpose', value: purpose }],
    rawMessage: message,
    hash,
    consequence: consequence || 'This proves ownership of the selected wallet. It does not send funds, create or broadcast a blockchain transaction, expose the private key, or cost any SPRG.',
    confirmLabel: 'Sign Message',
    onConfirm: () => signCanonicalMessage(message, wallet)
  });
}

async function requestTransactionSignature({
  tx,
  status,
  title,
  description,
  consequence,
  danger = false,
  bondMicro,
  extraFields = []
}) {
  if (!signingController) throw new Error('Signing confirmation is unavailable. Nothing was signed or broadcast.');
  if (!walletState) throw new Error('Select a wallet before signing.');
  const signingWallet = walletState;
  if (tx.from !== signingWallet.address) throw new Error('Transaction sender does not match the selected wallet.');
  const message = buildCanonicalMessage(tx);
  const txid = await computeTxId(message);
  const decimals = Number(status.decimals ?? 9);
  const symbol = status.symbol ?? 'SPRG';
  const fee = `${formatTokenAmount(tx.feeMicro, decimals, decimals)} ${symbol}`.trim();
  return signingController.request({
    kind: 'transaction',
    type: tx.type,
    title: title || `Sign ${friendlyTransactionType(tx.type)}`,
    description,
    wallet: signingWallet.address,
    network: status.chainId,
    fee,
    payload: transactionSigningPayload(tx, { decimals, symbol, bondMicro, extraFields }),
    rawMessage: message,
    hash: txid,
    danger,
    consequence,
    confirmLabel: 'Sign & Broadcast',
    onConfirm: async () => {
      const signatureHex = await signCanonicalMessage(message, signingWallet);
      const response = await fetch('/api/tx', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...tx, signatureHex })
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.message || result.error || 'Transaction rejected by the network.');
      return { txid, result };
    }
  });
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

    const { txid } = await requestTransactionSignature({
      tx,
      status,
      title: 'Confirm Transfer',
      description: 'Review the recipient, amount, fee, nonce, and network before signing.',
      consequence: `This will send ${formatTokenAmount(amountMicro, decimals, decimals)} ${status.symbol ?? 'SPRG'} to the displayed recipient and spend the displayed network fee. It will be broadcast immediately after signing and cannot be reversed once confirmed.`
    });
    sendTxStatus.textContent = `Transaction pending… TxID ${txid}`;
    txAmountInput.value = '';
    txMemoInput.value = '';
    await pollTxMined(txid);
  } catch (err) {
    sendTxStatus.textContent = isSigningRejected(err) ? 'Transaction rejected. Nothing was signed or broadcast.' : (err.message || 'Unable to send transaction.');
  } finally {
    sendTxBtn.disabled = false;
    disableWalletActions(false);
  }
}

async function pollTxMined(txid) {
  const start = Date.now();
  const maxMs = 120000;
  while (Date.now() - start < maxMs) {
    const canonical = canonicalTxid(txid);
    if (!canonical) {
      sendTxStatus.textContent = 'Unable to check transaction status.';
      return;
    }
    const res = await fetch(explorerTx.apiPath(canonical));
    if (res.ok) {
      const tx = await res.json();
      const height = tx.blockHeight !== undefined && tx.blockHeight !== null ? tx.blockHeight : '?';
      sendTxStatus.innerHTML = `Mined in block <a class="tx-link" href="/block/${height}">${height}</a> · ${txLink(canonical)}`;
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
    const emptyMarkup = '<div class="wallet-empty-inline"><strong>No transactions yet</strong><span>Send or receive SPRG to start using this wallet.</span></div>';
    if (walletActivity) walletActivity.innerHTML = emptyMarkup;
    if (walletActivityOverview) walletActivityOverview.innerHTML = emptyMarkup;
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
    const txid = tx.txid || tx.id || '';
    return `
      <tr ${txRowAttribute(txid)} data-block-height="${tx.blockHeight}">
        <td>
          <div class="activity-cell">
            <img src="${meta.icon}" alt="" class="activity-icon" />
            <span>${meta.label}</span>
          </div>
        </td>
        <td>${tx.blockHeight}</td>
        <td>${amountHtml}</td>
        <td class="tx-copy-cell">${txLink(txid, tx.blockHeight)}${canonicalTxid(txid) ? copyButton(canonicalTxid(txid), 'Copy transaction ID') : ''}</td>
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
          <th>Transaction</th>
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
      const txid = tx.txid || tx.id || '';
      return `
        <tr ${txRowAttribute(txid)} data-block-height="${tx.blockHeight}">
          <td>
            <div class="activity-cell">
              <img src="${meta.icon}" alt="" class="activity-icon" />
              <span>${meta.label}</span>
            </div>
          </td>
          <td>${tx.blockHeight}</td>
          <td>${amountHtml}</td>
          <td class="tx-copy-cell">${txLink(txid, tx.blockHeight)}${canonicalTxid(txid) ? copyButton(canonicalTxid(txid), 'Copy transaction ID') : ''}</td>
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
            <th><span class="visually-hidden">Transaction actions</span></th>
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
    container.querySelectorAll('tr[data-block-height]').forEach((row) => {
      row.addEventListener('click', () => {
        const href = explorerTx.txHref(row.dataset.txid);
        window.location.href = href || `/block/${encodeURIComponent(row.dataset.blockHeight)}`;
      });
    });
  };
  attachRowClicks(walletActivity);
  attachRowClicks(walletActivityOverview);
  if (walletActivity) wireCopyButtons(walletActivity);
  if (walletActivityOverview) wireCopyButtons(walletActivityOverview);
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
  lastAutoHeartbeatHeight = latestHeight;
  sendTxStatus.textContent = `Participant activity expires in ${Math.max(0, remaining)} blocks. Use Send Heartbeat to review, sign, and broadcast manually.`;
  showWalletToast('Participant heartbeat due for review');
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
    const bondMicro = freeEligible ? '0' : status.participantBondMicro;
    const { txid } = await requestTransactionSignature({
      tx,
      status,
      title: 'Register as Participant',
      description: 'Review the Participant registration, locked bond, fee, and network before signing.',
      bondMicro,
      consequence: `This registers the selected wallet as a Participant, locks ${formatTokenAmount(bondMicro, decimals, decimals)} ${status.symbol ?? 'SPRG'}, spends the displayed network fee, and broadcasts the transaction. Registration affects reward eligibility but does not grant block-production rights.`
    });
    participantPending = true;
    refreshWalletState();
    sendTxStatus.textContent = `Participant registration pending… TxID ${txid}`;
    await pollTxMined(txid);
  } catch (err) {
    sendTxStatus.textContent = isSigningRejected(err) ? 'Registration rejected. Nothing was signed or broadcast.' : (err.message || 'Unable to register participant.');
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
    const { txid } = await requestTransactionSignature({
      tx,
      status,
      title: 'Sponsor Participant',
      description: 'Review the sponsored Participant, locked bond, fee, and network before signing.',
      bondMicro: status.participantBondMicro,
      consequence: `This registers the displayed Participant address, locks ${formatTokenAmount(status.participantBondMicro, decimals, decimals)} ${status.symbol ?? 'SPRG'} from the selected Sponsor wallet, spends the displayed network fee, and broadcasts the transaction. Sponsorship gives no control over the Participant wallet and no share of its rewards.`
    });
    sendTxStatus.textContent = `Sponsor tx pending… TxID ${txid}`;
    if (sponsorAddressInput) sponsorAddressInput.value = '';
    await pollTxMined(txid);
  } catch (err) {
    sendTxStatus.textContent = isSigningRejected(err) ? 'Sponsorship rejected. Nothing was signed or broadcast.' : (err.message || 'Unable to sponsor participant.');
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
    const { txid } = await requestTransactionSignature({
      tx,
      status,
      title: 'Unregister Participant',
      description: 'Review this permanent Participant-state change before signing.',
      danger: true,
      consequence: 'This broadcasts an unregister transaction, stops future Participant reward eligibility, resets Reward Maturity for any later registration, spends the displayed fee, and returns the locked bond to its Sponsor according to protocol rules. The confirmed transaction cannot be reversed.'
    });
    sendTxStatus.textContent = `Unregister pending… TxID ${txid}`;
    await pollTxMined(txid);
  } catch (err) {
    sendTxStatus.textContent = isSigningRejected(err) ? 'Unregister rejected. Nothing was signed or broadcast.' : (err.message || 'Unable to unregister.');
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
    const { txid } = await requestTransactionSignature({
      tx,
      status,
      title: 'Send Participant Heartbeat',
      description: 'Review the fee, nonce, and network before refreshing Participant activity.',
      consequence: 'This spends the displayed network fee and broadcasts an on-chain heartbeat transaction. It refreshes Participant activity but does not transfer SPRG to another wallet.'
    });
    sendTxStatus.textContent = `Heartbeat pending… TxID ${txid}`;
    await pollTxMined(txid);
  } catch (err) {
    sendTxStatus.textContent = isSigningRejected(err) ? 'Heartbeat rejected. Nothing was signed or broadcast.' : (err.message || 'Unable to heartbeat.');
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
function showCreateWalletDialog() {
  const nextNumber = (walletRegistry?.list().length || 0) + 1;
  openWalletAction({
    eyebrow: 'New local wallet',
    title: 'Create New Wallet',
    description: 'Creating a new wallet generates a new set of keys in this browser.',
    warning: 'This action cannot be undone. Back up the wallet immediately so it can be recovered.',
    confirmLabel: 'Create Wallet',
    showName: true,
    defaultName: `Wallet ${nextNumber}`,
    onConfirm: async (name) => {
      await createWallet(name || `Wallet ${nextNumber}`);
      walletBackupDialog?.showModal();
    }
  });
}

function requestWalletImport() {
  importWalletFile?.click();
}

if (createWalletBtn) createWalletBtn.addEventListener('click', showCreateWalletDialog);
if (emptyCreateWalletBtn) emptyCreateWalletBtn.addEventListener('click', showCreateWalletDialog);
if (emptyImportWalletBtn) emptyImportWalletBtn.addEventListener('click', requestWalletImport);
if (advancedImportWalletBtn) advancedImportWalletBtn.addEventListener('click', requestWalletImport);
if (clearWalletBtn) {
  clearWalletBtn.addEventListener('click', () => {
    clearWalletStorage();
    walletState = null;
    renderWallet();
  });
}
if (exportWalletBtn) {
  exportWalletBtn.addEventListener('click', () => {
    if (!walletState) return;
    openWalletAction({
      eyebrow: 'Sensitive backup',
      title: 'Export Wallet Backup',
      description: 'The exported file contains the private key needed to restore this wallet.',
      warning: 'Store it offline. Anyone with this file can spend your funds.',
      confirmLabel: 'Export Backup',
      onConfirm: () => {
        exportWalletToFile(walletState);
        showWalletToast('Wallet backup exported');
      }
    });
  });
}
if (importWalletBtn && importWalletFile) {
  importWalletBtn.addEventListener('click', requestWalletImport);
  importWalletFile.addEventListener('change', async (event) => {
    const file = event.target.files && event.target.files[0];
    if (!file) return;
    try {
      const text = await file.text();
      pendingWalletImport = JSON.parse(text);
      const nextNumber = (walletRegistry?.list().length || 0) + 1;
      openWalletAction({
        eyebrow: 'Local backup',
        title: 'Import Wallet',
        description: 'Import this backup as another locally stored wallet.',
        warning: 'Only import a wallet backup you created and trust.',
        confirmLabel: 'Import Wallet',
        showName: true,
        defaultName: pendingWalletImport.name || `Wallet ${nextNumber}`,
        onConfirm: (name) => importWalletFromJson(pendingWalletImport, name || `Wallet ${nextNumber}`)
      });
    } catch (err) {
      showWalletToast(err.message || 'Failed to read wallet backup');
    } finally {
      importWalletFile.value = '';
    }
  });
}
if (togglePublicKeyBtn) {
  togglePublicKeyBtn.addEventListener('click', () => {
    walletPublicKeyEl.classList.toggle('hidden');
    copyPublicKeyBtn?.classList.toggle('hidden', walletPublicKeyEl.classList.contains('hidden'));
    togglePublicKeyBtn.textContent = walletPublicKeyEl.classList.contains('hidden') ? 'Show' : 'Hide';
  });
}
if (togglePrivateKeyBtn) {
  togglePrivateKeyBtn.addEventListener('click', () => {
    if (!walletState) return;
    if (!walletPrivateKeyEl.classList.contains('hidden')) {
      walletPrivateKeyEl.textContent = '-';
      walletPrivateKeyEl.classList.add('hidden');
      copyPrivateKeyBtn?.classList.add('hidden');
      togglePrivateKeyBtn.textContent = 'Reveal';
      return;
    }
    openWalletAction({
      eyebrow: 'Sensitive information',
      title: 'Reveal Private Key',
      description: 'Your private key gives complete control of this wallet.',
      warning: 'Make sure nobody can see or record your screen before continuing.',
      confirmLabel: 'Reveal Private Key',
      danger: true,
      onConfirm: () => {
        walletPrivateKeyEl.textContent = walletState.privateKeyHex;
        walletPrivateKeyEl.classList.remove('hidden');
        copyPrivateKeyBtn?.classList.remove('hidden');
        copyPrivateKeyBtn?.setAttribute('data-copy', walletState.privateKeyHex);
        wireCopyButtons(devWalletPanel);
        togglePrivateKeyBtn.textContent = 'Hide';
      }
    });
  });
}
if (exportPrivateKeyBtn) {
  exportPrivateKeyBtn.addEventListener('click', () => {
    if (!walletState) return;
    openWalletAction({
      eyebrow: 'Sensitive export',
      title: 'Export Private Key',
      description: 'This creates an unencrypted text file containing your private key.',
      warning: 'Anyone with this file can spend your funds. Store it offline and never share it.',
      confirmLabel: 'Export Private Key',
      danger: true,
      onConfirm: () => {
        exportPrivateKeyToFile(walletState);
        showWalletToast('Private key exported');
      }
    });
  });
}
if (walletSelectorBtn) {
  walletSelectorBtn.addEventListener('click', () => {
    const opening = walletDropdown.classList.contains('hidden');
    walletDropdown.classList.toggle('hidden', !opening);
    walletSelectorBtn.setAttribute('aria-expanded', opening ? 'true' : 'false');
  });
}
if (renameWalletBtn) {
  renameWalletBtn.addEventListener('click', () => {
    if (!walletState || !walletRegistry) return;
    closeWalletDropdown();
    openWalletAction({
      eyebrow: 'Wallet settings',
      title: 'Rename Wallet',
      description: 'Choose a recognizable local name for this wallet.',
      confirmLabel: 'Save Name',
      showName: true,
      defaultName: walletState.name,
      onConfirm: (name) => {
        walletState = walletRegistry.rename(walletState.id, name);
        renderWallet();
        showWalletToast('Wallet renamed');
      }
    });
  });
}
if (deleteWalletBtn) {
  deleteWalletBtn.addEventListener('click', () => {
    if (!walletState || !walletRegistry) return;
    const walletToDelete = walletState;
    closeWalletDropdown();
    openWalletAction({
      eyebrow: 'Remove local wallet',
      title: `Delete ${walletToDelete.name}?`,
      description: 'This removes the wallet and its keys from this browser.',
      warning: 'Only continue after confirming that you have a working backup. This action cannot be undone.',
      confirmLabel: 'Delete Wallet',
      danger: true,
      onConfirm: async () => {
        walletRegistry.remove(walletToDelete.id);
        walletState = walletRegistry.getSelected();
        walletActivityPage = 1;
        renderWallet();
        if (walletState) await Promise.all([refreshWalletContext(), refreshWalletState(), renderWalletActivity()]);
        showWalletToast('Wallet deleted from this browser');
      }
    });
  });
}
if (walletDialogCancel) walletDialogCancel.addEventListener('click', () => walletActionDialog.close());
if (walletDialogConfirm) walletDialogConfirm.addEventListener('click', confirmWalletAction);
if (walletDialogNameInput) {
  walletDialogNameInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      confirmWalletAction();
    }
  });
}
if (walletActionDialog) {
  walletActionDialog.addEventListener('close', () => {
    walletDialogAction = null;
    pendingWalletImport = null;
  });
}
if (walletBackupNow) {
  walletBackupNow.addEventListener('click', () => {
    if (walletState) exportWalletToFile(walletState);
    walletBackupDialog.close();
    showWalletToast('Wallet backup exported');
  });
}
if (walletBackupLater) {
  walletBackupLater.addEventListener('click', () => {
    walletBackupDialog.close();
    showWalletToast('Backup reminder: export before receiving funds');
  });
}
document.querySelectorAll('[data-open-wallet-tab]').forEach((button) => {
  button.addEventListener('click', () => {
    const target = Array.from(walletTabButtons || []).find((tab) => tab.dataset.tab === button.dataset.openWalletTab);
    target?.click();
  });
});
document.addEventListener('click', (event) => {
  if (!walletDropdown || walletDropdown.classList.contains('hidden')) return;
  if (!walletDropdown.contains(event.target) && !walletSelectorBtn?.contains(event.target)) closeWalletDropdown();
});
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
      walletTabButtons.forEach((b) => {
        b.classList.toggle('active', b === btn);
        b.setAttribute('aria-selected', b === btn ? 'true' : 'false');
      });
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

function setObserverShellStatus(message) {
  if (observerShellStatus) observerShellStatus.textContent = message || '';
}

async function runObserverShellAction(action, successMessage) {
  if (!window.observerShell || typeof window.observerShell[action] !== 'function') {
    setObserverShellStatus('This action is available in the desktop app.');
    return;
  }
  try {
    await window.observerShell[action]();
    setObserverShellStatus(successMessage);
  } catch {
    setObserverShellStatus('Action failed. Open Diagnostics for details.');
  }
}

function initializeWalletRegistry() {
  if (!devWalletPanel || walletRegistry) return;
  if (!window.SpargeWalletStore) throw new Error('Wallet storage module is unavailable.');
  walletRegistry = window.SpargeWalletStore.createRegistry(localStorage);
  walletRegistry.initialize();
  walletState = walletRegistry.getSelected();
}

function diagnosticsText() {
  const state = latestChainState || latestState || {};
  return [
    'Sparge Observer diagnostics',
    `Status: ${state.syncState || '-'}`,
    `Local height: ${state.syncedHeight ?? state.latestHeight ?? '-'}`,
    `Producer height: ${state.producerHeight ?? '-'}`,
    `Lag blocks: ${state.lagBlocks ?? '-'}`,
    `Producer: ${state.producerUrl || '-'}`,
    `Protocol: ${state.protocolVersion || '-'}`,
    `Economics: ${state.economicsVersion || '-'}`,
    `Invariant status: ${state.invariantStatus || '-'}`,
    `Last invariant failure: ${state.lastInvariantFailureCode || '-'}`,
    `Last sync: ${state.lastSyncAt || '-'}`,
    `Last block: ${state.latestBlock?.timestamp || '-'}`
  ].join('\n');
}

if (observerOpenExplorerBtn) {
  observerOpenExplorerBtn.addEventListener('click', () => {
    window.location.href = '#observerExplorerSection';
  });
}
if (observerOpenLogsBtn) {
  observerOpenLogsBtn.addEventListener('click', () => runObserverShellAction('openLogsFolder', 'Logs opened.'));
}
if (observerRestartBtn) {
  observerRestartBtn.addEventListener('click', () => runObserverShellAction('restartObserver', 'Restarting observer...'));
}
if (observerStopBtn) {
  observerStopBtn.addEventListener('click', () => {
    const ok = window.confirm('Stop the local observer service? The explorer will stop refreshing until you restart the app or observer.');
    if (!ok) return;
    runObserverShellAction('stopObserver', 'Observer stopped.');
  });
}
if (observerResetBtn) {
  observerResetBtn.addEventListener('click', () => {
    const first = window.confirm('Reset local observer data and resync from the configured producer? This deletes only this observer copy, not the public chain.');
    if (!first) return;
    const phrase = window.prompt('Type RESET to confirm local reset and resync.');
    if (phrase !== 'RESET') {
      setObserverShellStatus('Reset cancelled.');
      return;
    }
    if (!window.observerShell || typeof window.observerShell.resetLocalData !== 'function') {
      setObserverShellStatus('Reset is available in the desktop app.');
      return;
    }
    window.observerShell.resetLocalData('RESET')
      .then(() => setObserverShellStatus('Local data reset. Restarting observer...'))
      .catch(() => setObserverShellStatus('Reset failed. Open Diagnostics for details.'));
  });
}
if (observerCopyDiagnosticsBtn) {
  observerCopyDiagnosticsBtn.addEventListener('click', () => {
    copyToClipboard(diagnosticsText());
    setObserverShellStatus('Diagnostics copied.');
  });
}
if (observerStartWithWindows || observerMinimizeToTray) {
  const loadShellSettings = async () => {
    if (!window.observerShell || typeof window.observerShell.getShellSettings !== 'function') return;
    const settings = await window.observerShell.getShellSettings().catch(() => null);
    if (!settings) return;
    if (observerStartWithWindows) observerStartWithWindows.checked = settings.startWithWindows === true;
    if (observerMinimizeToTray) observerMinimizeToTray.checked = settings.minimizeToTray === true;
  };
  const saveShellSettings = async () => {
    if (!window.observerShell || typeof window.observerShell.setShellSettings !== 'function') {
      setObserverShellStatus('Desktop settings are available in the desktop app.');
      return;
    }
    await window.observerShell.setShellSettings({
      startWithWindows: observerStartWithWindows?.checked === true,
      minimizeToTray: observerMinimizeToTray?.checked === true
    }).catch(() => null);
    setObserverShellStatus('Advanced settings saved.');
  };
  observerStartWithWindows?.addEventListener('change', saveShellSettings);
  observerMinimizeToTray?.addEventListener('change', saveShellSettings);
  loadShellSettings();
}

function setCommunityStatus(message) {
  if (communityStatus) communityStatus.textContent = message || '';
}

async function communityApi(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';
  if (communityMe?.csrfToken && options.method && options.method !== 'GET') {
    headers['X-CSRF-Token'] = communityMe.csrfToken;
  }
  const response = await fetch(`/api/community${path}`, { credentials: 'same-origin', ...options, headers });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.message || 'Community Identity request failed.');
  return payload;
}

function renderCommunityIdentity(enabled, me) {
  if (!communityLinkBadge) return;
  communityDisabled?.classList.toggle('hidden', enabled);
  communityDisconnected?.classList.add('hidden');
  communityDiscordConnected?.classList.add('hidden');
  communityLinked?.classList.add('hidden');
  if (!enabled) {
    communityLinkBadge.textContent = 'Unavailable';
    return;
  }
  if (communitySelectedWallet) communitySelectedWallet.textContent = walletState?.address || 'No wallet selected';
  if (!me?.discordConnected) {
    communityLinkBadge.textContent = 'Not linked';
    communityDisconnected?.classList.remove('hidden');
    return;
  }
  if (!me.identity) {
    communityLinkBadge.textContent = 'Discord connected';
    communityDiscordConnected?.classList.remove('hidden');
    if (communityPendingDiscordName) communityPendingDiscordName.textContent = me.discordDisplayName || 'Discord connected';
    if (communityPendingWallet) communityPendingWallet.textContent = walletState?.address || 'No wallet selected';
    return;
  }
  communityLinkBadge.textContent = 'Linked';
  communityLinked?.classList.remove('hidden');
  if (communityDiscordName) communityDiscordName.textContent = me.identity.discordDisplayName || 'Discord user';
  if (communityLinkedWallet) communityLinkedWallet.textContent = me.identity.walletAddress;
  if (communityRoles) communityRoles.textContent = me.identity.roles?.length ? me.identity.roles.map((role) => role.label).join(', ') : 'Role sync pending';
  if (communityLastSynced) communityLastSynced.textContent = me.identity.lastRoleSyncAt ? formatRelativeTime(me.identity.lastRoleSyncAt) : 'Not synced yet';
  communityPrivacySettings?.querySelectorAll('[data-community-privacy]').forEach((input) => {
    input.checked = me.identity.privacy?.[input.dataset.communityPrivacy] === true;
  });
}

async function refreshCommunityIdentity() {
  if (!communityLinkBadge) return;
  try {
    const status = await communityApi('/status');
    if (!status.enabled) {
      communityMe = null;
      renderCommunityIdentity(false, null);
      return;
    }
    communityMe = await communityApi('/me');
    renderCommunityIdentity(true, communityMe);
  } catch {
    communityLinkBadge.textContent = 'Unavailable';
    setCommunityStatus('Community Identity could not be loaded.');
  }
}

async function createCommunityChallenge() {
  if (!walletState) {
    setCommunityStatus('Select a wallet first.');
    return;
  }
  setCommunityStatus('Creating verification message...');
  try {
    communityChallenge = await communityApi('/challenge', {
      method: 'POST',
      body: JSON.stringify({ walletAddress: walletState.address })
    });
    communityChallenge.walletAddress = walletState.address;
    if (communityChallengeText) communityChallengeText.textContent = communityChallenge.challenge;
    communityChallengePanel?.classList.remove('hidden');
    setCommunityStatus('Review the complete message, then sign it explicitly.');
  } catch (err) {
    setCommunityStatus(err.message);
  }
}

async function signCommunityChallenge() {
  if (!walletState || !communityChallenge || communityChallenge.walletAddress !== walletState.address) {
    setCommunityStatus('The selected wallet changed. Create a new verification message.');
    communityChallenge = null;
    communityChallengePanel?.classList.add('hidden');
    return;
  }
  communitySignChallengeBtn.disabled = true;
  setCommunityStatus('Signing locally...');
  try {
    const signatureHex = await requestMessageSignature({
      purpose: 'Discord Community Verification',
      title: 'Verify Wallet for Discord',
      description: 'Sign the displayed human-readable challenge to prove control of the selected wallet.',
      message: communityChallenge.challenge,
      consequence: 'This creates only a cryptographic wallet-ownership proof and submits it to the Sparge Community Identity service. It sends no funds, creates or broadcasts no blockchain transaction, exposes no private key, and costs 0 SPRG.'
    });
    await communityApi('/verify', {
      method: 'POST',
      body: JSON.stringify({
        challengeId: communityChallenge.challengeId,
        challenge: communityChallenge.challenge,
        walletAddress: walletState.address,
        publicKeyHex: walletState.publicKeyHex,
        signatureHex
      })
    });
    communityChallenge = null;
    communityChallengePanel?.classList.add('hidden');
    setCommunityStatus('Discord and wallet linked.');
    await refreshCommunityIdentity();
  } catch (err) {
    setCommunityStatus(isSigningRejected(err) ? 'Message signing cancelled. Nothing was signed.' : err.message);
  } finally {
    communitySignChallengeBtn.disabled = false;
  }
}

async function loadAddressCommunityProfile(walletAddress) {
  if (!addressCommunityCard || !addressCommunityProfile) return;
  addressCommunityCard.classList.add('hidden');
  try {
    const profile = await communityApi(`/profile/${encodeURIComponent(walletAddress)}`);
    addressCommunityProfile.replaceChildren();
    const rows = [];
    if (profile.discordDisplayName) rows.push(['Discord', profile.discordDisplayName]);
    if (profile.walletAddress) rows.push(['Wallet', profile.walletAddress]);
    if (profile.participantStatus) rows.push(['Participant', profile.participantStatus]);
    if (profile.badges?.length) rows.push(['Badges', profile.badges.map((badge) => badge.label).join(', ')]);
    if (profile.balanceMicro !== null) rows.push(['Balance', formatTokens(profile.balanceMicro, latestChainState?.decimals ?? 9)]);
    rows.push(['Privacy', 'Only owner-enabled fields are shown']);
    for (const [label, value] of rows) {
      const row = document.createElement('div');
      row.className = 'detail-row';
      const key = document.createElement('span');
      const content = document.createElement('span');
      key.textContent = label;
      content.textContent = value;
      row.append(key, content);
      addressCommunityProfile.appendChild(row);
    }
    addressCommunityCard.classList.remove('hidden');
  } catch {
    // Private and missing profiles are intentionally indistinguishable in the UI.
  }
}

communityLinkDiscordBtn?.addEventListener('click', () => {
  window.location.href = '/api/community/discord/start?returnTo=%2Fwallet';
});
communityCreateChallengeBtn?.addEventListener('click', createCommunityChallenge);
communitySignChallengeBtn?.addEventListener('click', signCommunityChallenge);
communitySyncBtn?.addEventListener('click', async () => {
  setCommunityStatus('Synchronizing roles...');
  try {
    await communityApi('/sync-roles', { method: 'POST', body: '{}' });
    setCommunityStatus('Role synchronization completed.');
    await refreshCommunityIdentity();
  } catch (err) {
    setCommunityStatus(err.message);
  }
});
communitySavePrivacyBtn?.addEventListener('click', async () => {
  const privacy = {};
  communityPrivacySettings?.querySelectorAll('[data-community-privacy]').forEach((input) => {
    privacy[input.dataset.communityPrivacy] = input.checked;
  });
  try {
    await communityApi('/privacy', { method: 'PATCH', body: JSON.stringify(privacy) });
    setCommunityStatus('Privacy settings saved.');
    await refreshCommunityIdentity();
  } catch (err) {
    setCommunityStatus(err.message);
  }
});
communityUnlinkBtn?.addEventListener('click', async () => {
  if (!window.confirm('Unlink Discord and remove Sparge-managed roles? This does not affect your wallet or chain state.')) return;
  try {
    await communityApi('/unlink', { method: 'POST', body: JSON.stringify({ confirm: 'UNLINK' }) });
    setCommunityStatus('Community Identity unlinked.');
    await refreshCommunityIdentity();
  } catch (err) {
    setCommunityStatus(err.message);
  }
});

observerCommunityBtn?.addEventListener('click', async () => {
  if (!window.observerShell?.openCommunityIdentity) {
    if (observerCommunityStatus) observerCommunityStatus.textContent = 'Open the official Explorer wallet in your browser.';
    return;
  }
  try {
    await window.observerShell.openCommunityIdentity();
    if (observerCommunityStatus) observerCommunityStatus.textContent = 'Identity page opened in your browser.';
  } catch {
    if (observerCommunityStatus) observerCommunityStatus.textContent = 'Unable to open the identity page.';
  }
});

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
const isEconomicsPage = Boolean(economicsDistributionPanel);

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

if (isEconomicsPage) {
  refreshEconomicsPage();
  startAutoRefresh();
}

if (observerFilters) {
  observerFilters.addEventListener('submit', (event) => {
    event.preventDefault();
    observerNodesPage = 1;
    refreshNetworkPage();
  });
}

if (transactionChartRanges) {
  transactionChartRanges.addEventListener('click', (event) => {
    const button = event.target.closest('[data-chart-range]');
    if (!button) return;
    transactionChartRange = button.dataset.chartRange;
    transactionChartRanges.querySelectorAll('[data-chart-range]').forEach((item) => {
      item.classList.toggle('active', item === button);
      item.setAttribute('aria-pressed', String(item === button));
    });
    refreshTransactionChart();
  });
  transactionChartRanges.querySelectorAll('[data-chart-range]').forEach((item) => {
    item.setAttribute('aria-pressed', String(item.classList.contains('active')));
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
  const txid = getTxIdFromPath();
  if (!txid) {
    fetchState().then((state) => renderTxPage(null, state, 'Invalid transaction ID.'));
  } else {
    Promise.all([fetchState(), fetchTxById(txid)]).then(([state, tx]) => {
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
      loadAddressCommunityProfile(addr);
    });
  }
}

if (isWalletPage) {
  initializeWalletRegistry();
  walletState = loadWalletFromStorage();
  refreshWalletContext().then(() => {
    renderWallet();
    refreshWalletState();
    renderWalletActivity();
    refreshCommunityIdentity();
    const communityResult = new URLSearchParams(window.location.search).get('community');
    if (communityResult) {
      const communityTab = Array.from(walletTabButtons || []).find((button) => button.dataset.tab === 'community');
      communityTab?.click();
      if (communityResult === 'guild-required') setCommunityStatus('Join the configured Sparge Discord server before linking.');
      else if (communityResult !== 'discord-connected') setCommunityStatus('Discord authentication was not completed.');
    }
  });
  scheduleWalletRefresh();
}
