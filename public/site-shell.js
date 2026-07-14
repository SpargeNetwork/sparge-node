(function initSpargeSiteShell(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.SpargeSiteShell = api;
  if (root?.document) {
    const mount = () => api.mount(root.document);
    if (root.document.readyState === 'loading') root.document.addEventListener('DOMContentLoaded', mount, { once: true });
    else mount();
  }
})(typeof window !== 'undefined' ? window : null, function siteShellFactory() {
  const DOCS_URL = 'https://spargenetwork.github.io/sparge-docs/';
  const OBSERVER_URL = '/become-an-observer';
  const STATUS_REFRESH_MS = 15_000;
  const SOCIAL_URLS = Object.freeze({
    discord: '/wallet?community=open',
    x: 'https://x.com/SpargeNetwork'
  });

  const NAV_ITEMS = Object.freeze([
    { id: 'explorer', label: 'Explorer', href: '/' },
    { id: 'network', label: 'Network', href: '/network' },
    { id: 'economics', label: 'Economics', href: '/economics' },
    { id: 'wallet', label: 'Wallet', href: '/wallet' },
    { id: 'docs', label: 'Docs', href: DOCS_URL, external: true }
  ]);

  const STATUS_METRICS = Object.freeze([
    { id: 'network', label: 'Mainnet Alpha', href: '/network' },
    { id: 'supply', label: 'Circulating Supply', href: '/economics' },
    { id: 'minted', label: 'Minted (24h)', href: '/economics' },
    { id: 'fee', label: 'Base Network Fee', href: `${DOCS_URL}protocol/#transaction-types`, external: true },
    { id: 'block', label: 'Current Block', href: '/' },
    { id: 'observers', label: 'Active Observers', href: '/network' }
  ]);

  function escapeAttribute(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function activeSection(pathname) {
    const path = String(pathname || '/').toLowerCase();
    if (path.startsWith('/wallet')) return 'wallet';
    if (path.startsWith('/network')) return 'network';
    if (path.startsWith('/economics')) return 'economics';
    if (path.startsWith('/docs')) return 'docs';
    return 'explorer';
  }

  function navLink(item, active) {
    const current = item.id === active;
    const external = item.external ? ' target="_blank" rel="noreferrer"' : '';
    const currentAttr = current ? ' aria-current="page"' : '';
    return `<a href="${escapeAttribute(item.href)}" class="nav-link${current ? ' active' : ''}"${currentAttr}${external}>${item.label}</a>`;
  }

  function statusMetricMarkup(metric) {
    const external = metric.external ? ' target="_blank" rel="noreferrer"' : '';
    const statusDot = metric.id === 'network' ? '<span class="network-state-dot" aria-hidden="true"></span>' : '';
    return `
      <a class="network-status-metric metric-${metric.id}" data-network-metric="${metric.id}" href="${escapeAttribute(metric.href)}"${external}>
        <span class="network-status-label" data-network-label="${metric.id}">${metric.label}</span>
        <strong class="network-status-value">${statusDot}<span data-network-value="${metric.id}">--</span></strong>
      </a>`;
  }

  function networkStatusMarkup() {
    return `
      <section class="network-status-bar" data-network-status-bar aria-label="Live network status" aria-busy="true">
        <div class="network-status-inner">
          <div class="network-status-track">
            ${STATUS_METRICS.map(statusMetricMarkup).join('')}
          </div>
        </div>
      </section>`;
  }

  function formatBaseUnits(rawValue, decimals, maxFractionDigits = decimals) {
    let value;
    try {
      value = BigInt(rawValue ?? '0');
    } catch (_) {
      return '--';
    }
    const negative = value < 0n;
    const absolute = negative ? -value : value;
    const scale = 10n ** BigInt(Math.max(0, Number(decimals) || 0));
    const whole = absolute / scale;
    const remainder = absolute % scale;
    const grouped = whole.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    const limit = Math.max(0, Math.min(Number(decimals) || 0, Number(maxFractionDigits) || 0));
    const fraction = limit
      ? remainder.toString().padStart(Number(decimals) || 0, '0').slice(0, limit).replace(/0+$/, '')
      : '';
    return `${negative ? '-' : ''}${grouped}${fraction ? `.${fraction}` : ''}`;
  }

  function deriveNetworkState(status, network) {
    const explicit = String(status?.networkStatus || network?.networkStatus || '').toLowerCase();
    if (status?.maintenance === true || explicit === 'maintenance') return { label: 'Maintenance', tone: 'maintenance' };
    if (status?.healthy === false || network?.producer?.online === false || explicit === 'degraded') return { label: 'Degraded', tone: 'degraded' };
    if (status?.syncState === 'syncing' || explicit === 'syncing') return { label: 'Syncing', tone: 'syncing' };
    return { label: 'Healthy', tone: 'healthy' };
  }

  function networkName(status) {
    const chainId = String(status?.chainId || '').toLowerCase();
    if (chainId.includes('mainnet')) return 'Mainnet Alpha';
    if (chainId.includes('testnet')) return 'Testnet Alpha';
    return `${status?.chain || 'Sparge'} Alpha`;
  }

  function setMetric(bar, id, value) {
    const target = bar.querySelector(`[data-network-value="${id}"]`);
    if (target) target.textContent = value;
  }

  function activeObserverCount(network) {
    return Number(network?.activeObserverCount ?? network?.publicActiveObserverCount ?? 0);
  }

  function updateNetworkStatusBar(bar, status, network) {
    const decimals = Number(status?.decimals ?? 9);
    const symbol = status?.symbol || 'SPRG';
    const state = deriveNetworkState(status, network);
    const networkMetric = bar.querySelector('[data-network-metric="network"]');
    const networkLabel = bar.querySelector('[data-network-label="network"]');
    if (networkLabel) networkLabel.textContent = networkName(status);
    if (networkMetric) networkMetric.dataset.state = state.tone;
    setMetric(bar, 'network', state.label);
    setMetric(bar, 'supply', `${formatBaseUnits(status?.circulatingSupplyMicro ?? status?.totalSupplyMicro, decimals, 2)} ${symbol}`);
    setMetric(bar, 'minted', `${formatBaseUnits(status?.minted24hMicro ?? '0', decimals, 2)} ${symbol}`);
    setMetric(bar, 'fee', `${formatBaseUnits(status?.baseFeeMicro ?? '0', decimals, decimals)} ${symbol}`);
    setMetric(bar, 'block', Number(status?.latestHeight ?? network?.currentHeight ?? 0).toLocaleString('en-US'));
    setMetric(bar, 'observers', activeObserverCount(network).toLocaleString('en-US'));
    const blockLink = bar.querySelector('[data-network-metric="block"]');
    const height = Number(status?.latestHeight ?? network?.currentHeight);
    if (blockLink && Number.isSafeInteger(height) && height >= 0) blockLink.href = `/block/${height}`;
    bar.setAttribute('aria-busy', 'false');
    bar.classList.remove('status-unavailable');
  }

  async function fetchStatusJson(view, path) {
    const response = await view.fetch(path, { headers: { Accept: 'application/json' }, cache: 'no-store' });
    if (!response.ok) throw new Error(`Status request failed (${response.status})`);
    return response.json();
  }

  function setupNetworkStatusBar(document, bar) {
    const view = document.defaultView;
    if (!view?.fetch) return;
    let refreshing = false;
    const refresh = async () => {
      if (refreshing) return;
      refreshing = true;
      try {
        const [statusResult, networkResult] = await Promise.allSettled([
          fetchStatusJson(view, '/api/status'),
          fetchStatusJson(view, '/api/network/status')
        ]);
        if (statusResult.status !== 'fulfilled') throw statusResult.reason;
        updateNetworkStatusBar(bar, statusResult.value, networkResult.status === 'fulfilled' ? networkResult.value : {});
      } catch (_) {
        bar.setAttribute('aria-busy', 'false');
        bar.classList.add('status-unavailable');
        const metric = bar.querySelector('[data-network-metric="network"]');
        if (metric) metric.dataset.state = 'degraded';
        setMetric(bar, 'network', 'Unavailable');
      } finally {
        refreshing = false;
      }
    };
    refresh();
    view.setInterval(refresh, STATUS_REFRESH_MS);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') refresh();
    });
  }

  function headerMarkup(active, pageActions) {
    const links = NAV_ITEMS.map((item) => navLink(item, active)).join('');
    return `
      <div class="site-header-inner">
        <a class="brand site-brand" href="/" aria-label="Sparge home">
          <img src="/assets/sparge_logo.png" alt="" class="logo-img" width="32" height="32" />
          <span class="title">Sparge</span>
        </a>
        <button class="nav-menu-toggle" type="button" aria-expanded="false" aria-controls="siteNavMenu" aria-label="Open navigation">
          <span></span><span></span><span></span>
        </button>
        <nav class="site-nav-menu" id="siteNavMenu" aria-label="Primary navigation">
          <div class="site-nav-links">${links}</div>
          <div class="nav-dropdown" data-socials-dropdown>
            <button class="nav-link nav-dropdown-trigger" type="button" aria-expanded="false" aria-haspopup="menu">
              Socials <span class="nav-chevron" aria-hidden="true"></span>
            </button>
            <div class="nav-dropdown-menu" role="menu">
              <a role="menuitem" href="${SOCIAL_URLS.discord}">Discord</a>
              <a role="menuitem" href="${SOCIAL_URLS.x}" target="_blank" rel="noreferrer">X (Twitter)</a>
            </div>
          </div>
          <a class="observer-nav-cta" href="${OBSERVER_URL}">Become an Observer</a>
          <div class="site-page-actions">${pageActions}</div>
        </nav>
      </div>`;
  }

  function setupDropdown(document, header) {
    const dropdown = header.querySelector('[data-socials-dropdown]');
    const trigger = dropdown.querySelector('.nav-dropdown-trigger');
    const menu = dropdown.querySelector('.nav-dropdown-menu');
    const items = Array.from(menu.querySelectorAll('[role="menuitem"]'));

    const close = (returnFocus = false) => {
      dropdown.classList.remove('open');
      trigger.setAttribute('aria-expanded', 'false');
      if (returnFocus) trigger.focus();
    };
    const open = (focusIndex = -1) => {
      dropdown.classList.add('open');
      trigger.setAttribute('aria-expanded', 'true');
      if (focusIndex >= 0) items[focusIndex]?.focus();
    };

    trigger.addEventListener('click', () => {
      if (dropdown.classList.contains('open')) close();
      else open();
    });
    trigger.addEventListener('keydown', (event) => {
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        open(0);
      } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        open(items.length - 1);
      } else if (event.key === 'Escape') {
        close(true);
      }
    });
    menu.addEventListener('keydown', (event) => {
      const index = items.indexOf(document.activeElement);
      if (event.key === 'Escape') {
        event.preventDefault();
        close(true);
      } else if (event.key === 'ArrowDown') {
        event.preventDefault();
        items[(index + 1) % items.length]?.focus();
      } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        items[(index - 1 + items.length) % items.length]?.focus();
      } else if (event.key === 'Home') {
        event.preventDefault();
        items[0]?.focus();
      } else if (event.key === 'End') {
        event.preventDefault();
        items[items.length - 1]?.focus();
      }
    });
    document.addEventListener('pointerdown', (event) => {
      if (!dropdown.contains(event.target)) close();
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && dropdown.classList.contains('open')) close(true);
    });
  }

  function setupMobileMenu(document, header) {
    const toggle = header.querySelector('.nav-menu-toggle');
    const menu = header.querySelector('.site-nav-menu');
    const close = () => {
      header.classList.remove('menu-open');
      toggle.setAttribute('aria-expanded', 'false');
      toggle.setAttribute('aria-label', 'Open navigation');
    };
    toggle.addEventListener('click', () => {
      const opening = !header.classList.contains('menu-open');
      header.classList.toggle('menu-open', opening);
      toggle.setAttribute('aria-expanded', String(opening));
      toggle.setAttribute('aria-label', opening ? 'Close navigation' : 'Open navigation');
    });
    menu.addEventListener('click', (event) => {
      const view = document.defaultView;
      if (event.target.closest('a') && view?.matchMedia('(max-width: 1180px)').matches) close();
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && header.classList.contains('menu-open')) {
        close();
        toggle.focus();
      }
    });
  }

  function mount(document) {
    const headers = document.querySelectorAll('[data-site-header]');
    headers.forEach((header) => {
      if (header.dataset.mounted === 'true') return;
      const actions = header.querySelector('[data-site-actions]');
      const pageActions = actions ? actions.innerHTML : '';
      const active = header.dataset.activeNav || activeSection(document.location?.pathname);
      header.innerHTML = headerMarkup(active, pageActions);
      header.dataset.mounted = 'true';
      let statusBar = document.querySelector('[data-network-status-bar]');
      if (!statusBar) {
        header.insertAdjacentHTML('afterend', networkStatusMarkup());
        statusBar = header.nextElementSibling;
        setupNetworkStatusBar(document, statusBar);
      }
      setupDropdown(document, header);
      setupMobileMenu(document, header);
    });
  }

  return {
    NAV_ITEMS,
    STATUS_METRICS,
    DOCS_URL,
    OBSERVER_URL,
    SOCIAL_URLS,
    activeSection,
    headerMarkup,
    networkStatusMarkup,
    formatBaseUnits,
    deriveNetworkState,
    activeObserverCount,
    updateNetworkStatusBar,
    mount
  };
});
