(function initObserverOnboarding() {
  const OFFICIAL_RELEASE_PREFIX = 'https://github.com/SpargeNetwork/sparge-node/releases/download/';
  const downloadButton = document.getElementById('observerDownloadButton');
  const releaseDownload = document.getElementById('observerReleaseDownload');
  const releaseStatus = document.getElementById('observerReleaseStatus');
  const releaseUnavailable = document.getElementById('observerReleaseUnavailable');
  const releaseMeta = document.getElementById('observerReleaseMeta');
  const releaseVersion = document.getElementById('observerReleaseVersion');
  const releaseDate = document.getElementById('observerReleaseDate');
  const releaseSize = document.getElementById('observerReleaseSize');
  const releaseFile = document.getElementById('observerReleaseFile');
  const checksumPanel = document.getElementById('observerChecksum');
  const checksumValue = document.getElementById('observerChecksumValue');
  const checksumCopy = document.getElementById('observerChecksumCopy');
  const currentVersion = document.getElementById('observerCurrentVersion');
  const producerStatus = document.getElementById('observerProducerStatus');
  const activeCount = document.getElementById('observerActiveCount');

  function formatBytes(value) {
    const bytes = Number(value || 0);
    if (!Number.isFinite(bytes) || bytes <= 0) return 'Not published';
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  function approvedInstaller(installer) {
    return installer
      && typeof installer.url === 'string'
      && installer.url.startsWith(OFFICIAL_RELEASE_PREFIX)
      && typeof installer.fileName === 'string'
      && installer.fileName.toLowerCase().endsWith('.exe');
  }

  function enableDownload(link, installer, label) {
    link.href = installer.url;
    link.textContent = label;
    link.removeAttribute('aria-disabled');
    link.setAttribute('rel', 'noreferrer');
  }

  function renderRelease(release) {
    const installer = release?.windows?.installer;
    const available = release?.available === true && approvedInstaller(installer);
    currentVersion.textContent = release?.version ? `Version ${release.version}` : 'Preparing release';
    if (!available) {
      releaseStatus.textContent = 'Preparing';
      releaseStatus.className = 'status-badge warn';
      return;
    }

    releaseStatus.textContent = 'Available';
    releaseStatus.className = 'status-badge ok';
    releaseUnavailable.hidden = true;
    releaseMeta.hidden = false;
    releaseVersion.textContent = release.version || '-';
    releaseDate.textContent = release.releaseDate || '-';
    releaseSize.textContent = formatBytes(installer.fileSizeBytes);
    releaseFile.textContent = installer.fileName;
    enableDownload(downloadButton, installer, 'Download for Windows');
    enableDownload(releaseDownload, installer, 'Download Installer');

    if (/^[0-9a-f]{64}$/i.test(installer.checksumSha256 || '')) {
      checksumPanel.hidden = false;
      checksumValue.textContent = installer.checksumSha256.toLowerCase();
      checksumCopy.dataset.checksum = installer.checksumSha256.toLowerCase();
    }
  }

  async function loadRelease() {
    try {
      const response = await fetch('/api/releases/observer/latest', { headers: { Accept: 'application/json' }, cache: 'no-store' });
      if (!response.ok) throw new Error('release unavailable');
      renderRelease(await response.json());
    } catch {
      releaseStatus.textContent = 'Unavailable';
      releaseStatus.className = 'status-badge neutral';
    }
  }

  async function loadNetwork() {
    try {
      const response = await fetch('/api/network/status', { headers: { Accept: 'application/json' }, cache: 'no-store' });
      if (!response.ok) throw new Error('network unavailable');
      const network = await response.json();
      producerStatus.textContent = network.producer?.online === true ? 'Online' : 'Unavailable';
      activeCount.textContent = Number(network.activeObserverCount ?? 0).toLocaleString();
    } catch {
      producerStatus.textContent = 'Unavailable';
      activeCount.textContent = '-';
    }
  }

  checksumCopy?.addEventListener('click', async () => {
    const checksum = checksumCopy.dataset.checksum || '';
    if (!checksum) return;
    await navigator.clipboard.writeText(checksum);
    checksumCopy.textContent = 'Copied';
    setTimeout(() => { checksumCopy.textContent = 'Copy checksum'; }, 1200);
  });

  loadRelease();
  loadNetwork();
})();
