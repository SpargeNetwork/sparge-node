const UPDATE_INTERVAL_MS = 6 * 60 * 60 * 1000;
const INITIAL_CHECK_DELAY_MS = 15 * 1000;

function publicState(state) {
  return {
    status: state.status,
    currentVersion: state.currentVersion,
    availableVersion: state.availableVersion,
    progressPercent: state.progressPercent,
    checkedAt: state.checkedAt,
    message: state.message
  };
}

function createUpdateManager(options) {
  const {
    app,
    updater,
    platform = process.platform,
    notify = () => {},
    log = () => {},
    beforeInstall = () => {},
    setTimer = setTimeout,
    setRepeatingTimer = setInterval,
    clearRepeatingTimer = clearInterval,
    initialCheckDelayMs = INITIAL_CHECK_DELAY_MS,
    checkIntervalMs = UPDATE_INTERVAL_MS
  } = options;
  const supported = app.isPackaged === true && platform === 'win32';
  let checking = false;
  let interval = null;
  let state = {
    status: supported ? 'idle' : 'unsupported',
    currentVersion: app.getVersion(),
    availableVersion: null,
    progressPercent: null,
    checkedAt: null,
    message: supported ? 'Updates are checked automatically.' : 'Updates are available in installed Windows builds.'
  };

  function update(next) {
    state = { ...state, ...next };
    notify(publicState(state));
    return publicState(state);
  }

  updater.autoDownload = false;
  updater.autoInstallOnAppQuit = false;
  updater.allowPrerelease = true;
  updater.allowDowngrade = false;

  updater.on('checking-for-update', () => {
    update({ status: 'checking', message: 'Checking for updates...', progressPercent: null });
  });
  updater.on('update-available', (info) => {
    checking = false;
    log('info', 'observer_update_available', { version: info?.version || '' });
    update({
      status: 'available',
      availableVersion: info?.version || null,
      checkedAt: new Date().toISOString(),
      message: `Version ${info?.version || 'new'} is available.`
    });
  });
  updater.on('update-not-available', () => {
    checking = false;
    log('info', 'observer_update_current', { version: state.currentVersion });
    update({
      status: 'current',
      availableVersion: null,
      checkedAt: new Date().toISOString(),
      message: 'Sparge Observer is up to date.'
    });
  });
  updater.on('download-progress', (progress) => {
    const percent = Math.max(0, Math.min(100, Number(progress?.percent || 0)));
    update({ status: 'downloading', progressPercent: percent, message: `Downloading update: ${percent.toFixed(0)}%` });
  });
  updater.on('update-downloaded', (info) => {
    log('info', 'observer_update_downloaded', { version: info?.version || state.availableVersion || '' });
    update({
      status: 'downloaded',
      availableVersion: info?.version || state.availableVersion,
      progressPercent: 100,
      message: 'Update ready. Restart to install.'
    });
  });
  updater.on('error', (error) => {
    checking = false;
    log('error', 'observer_update_failed', { error: String(error?.message || error || 'unknown').slice(0, 300) });
    update({ status: 'error', progressPercent: null, message: 'Update check failed. Try again later.' });
  });

  async function check(manual = false) {
    if (!supported) return publicState(state);
    if (checking || state.status === 'downloading') return publicState(state);
    checking = true;
    if (manual) update({ status: 'checking', message: 'Checking for updates...', progressPercent: null });
    try {
      await updater.checkForUpdates();
    } catch (error) {
      checking = false;
      log('error', 'observer_update_check_failed', { error: String(error?.message || error || 'unknown').slice(0, 300) });
      update({ status: 'error', message: 'Update check failed. Try again later.', progressPercent: null });
    }
    return publicState(state);
  }

  async function download() {
    if (!supported || state.status !== 'available') return publicState(state);
    update({ status: 'downloading', progressPercent: 0, message: 'Starting update download...' });
    try {
      await updater.downloadUpdate();
    } catch (error) {
      log('error', 'observer_update_download_failed', { error: String(error?.message || error || 'unknown').slice(0, 300) });
      update({ status: 'error', progressPercent: null, message: 'Update download failed. Try again later.' });
    }
    return publicState(state);
  }

  function install() {
    if (!supported || state.status !== 'downloaded') return false;
    log('info', 'observer_update_installing', { version: state.availableVersion || '' });
    beforeInstall();
    updater.quitAndInstall(false, true);
    return true;
  }

  function start() {
    notify(publicState(state));
    if (!supported) return;
    setTimer(() => check(false), initialCheckDelayMs);
    interval = setRepeatingTimer(() => check(false), checkIntervalMs);
  }

  function stop() {
    if (interval) clearRepeatingTimer(interval);
    interval = null;
  }

  return { getState: () => publicState(state), check, download, install, start, stop };
}

module.exports = {
  INITIAL_CHECK_DELAY_MS,
  UPDATE_INTERVAL_MS,
  createUpdateManager
};
