const APPROVED_GITHUB_PREFIX = '/SpargeNetwork/sparge-node/releases/download/';
const OBSERVER_DOCS_URL = 'https://spargenetwork.github.io/sparge-docs/observer/';

function optionalString(value, field, maxLength) {
  if (value === undefined || value === null || value === '') return '';
  if (typeof value !== 'string' || value.length > maxLength) throw new Error(`${field} is invalid`);
  return value;
}

function approvedDownloadUrl(value) {
  const raw = optionalString(value, 'observerDownloads.windowsInstaller.url', 2048);
  if (!raw) return '';
  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error('observerDownloads.windowsInstaller.url must be a valid URL');
  }
  if (parsed.protocol !== 'https:' || parsed.hostname !== 'github.com' || !parsed.pathname.startsWith(APPROVED_GITHUB_PREFIX)) {
    throw new Error('observerDownloads.windowsInstaller.url must use the official Sparge GitHub Releases path');
  }
  if (!parsed.pathname.toLowerCase().endsWith('.exe')) {
    throw new Error('observerDownloads.windowsInstaller.url must reference a Windows .exe installer');
  }
  return parsed.toString();
}

function normalizeObserverDownloadsConfig(config) {
  if (!config.observerDownloads) config.observerDownloads = {};
  const source = config.observerDownloads;
  if (!source.windowsInstaller) source.windowsInstaller = {};
  if (source.enabled !== undefined && typeof source.enabled !== 'boolean') {
    throw new Error('observerDownloads.enabled must be boolean');
  }

  const version = optionalString(source.version, 'observerDownloads.version', 32);
  if (version && !/^[0-9A-Za-z][0-9A-Za-z._-]{0,31}$/.test(version)) {
    throw new Error('observerDownloads.version is invalid');
  }
  const releaseDate = optionalString(source.releaseDate, 'observerDownloads.releaseDate', 10);
  if (releaseDate && !/^\d{4}-\d{2}-\d{2}$/.test(releaseDate)) {
    throw new Error('observerDownloads.releaseDate must use YYYY-MM-DD');
  }
  const fileName = optionalString(source.windowsInstaller.fileName, 'observerDownloads.windowsInstaller.fileName', 160);
  if (fileName && (!/^[0-9A-Za-z][0-9A-Za-z._ -]{0,159}\.exe$/i.test(fileName) || fileName.includes('..'))) {
    throw new Error('observerDownloads.windowsInstaller.fileName must be a safe .exe file name');
  }
  const checksumSha256 = optionalString(source.windowsInstaller.checksumSha256, 'observerDownloads.windowsInstaller.checksumSha256', 64).toLowerCase();
  if (checksumSha256 && !/^[0-9a-f]{64}$/.test(checksumSha256)) {
    throw new Error('observerDownloads.windowsInstaller.checksumSha256 must be 64 hexadecimal characters');
  }
  const fileSizeBytes = source.windowsInstaller.fileSizeBytes === undefined
    ? 0
    : Number(source.windowsInstaller.fileSizeBytes);
  if (!Number.isSafeInteger(fileSizeBytes) || fileSizeBytes < 0) {
    throw new Error('observerDownloads.windowsInstaller.fileSizeBytes must be a non-negative safe integer');
  }
  const url = approvedDownloadUrl(source.windowsInstaller.url);
  const available = source.enabled === true && Boolean(url && version && releaseDate && fileName && fileSizeBytes > 0 && checksumSha256);

  config.observerDownloads = {
    enabled: available,
    version,
    releaseDate,
    windowsInstaller: {
      url: available ? url : '',
      fileName: available ? fileName : '',
      fileSizeBytes: available ? fileSizeBytes : 0,
      checksumSha256: available ? checksumSha256 : ''
    }
  };
  return config.observerDownloads;
}

function publicObserverRelease(config) {
  const release = config.observerDownloads || normalizeObserverDownloadsConfig(config);
  const installer = release.enabled ? release.windowsInstaller : null;
  return {
    available: release.enabled === true,
    channel: 'Public Alpha',
    version: release.version || null,
    releaseDate: release.releaseDate || null,
    windows: {
      installer: installer ? {
        url: installer.url,
        fileName: installer.fileName,
        fileSizeBytes: installer.fileSizeBytes || null,
        checksumSha256: installer.checksumSha256 || null
      } : null,
      portable: null
    },
    documentationUrl: OBSERVER_DOCS_URL,
    troubleshootingUrl: `${OBSERVER_DOCS_URL}#troubleshooting`
  };
}

module.exports = {
  APPROVED_GITHUB_PREFIX,
  OBSERVER_DOCS_URL,
  normalizeObserverDownloadsConfig,
  publicObserverRelease
};
