const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn } = require('child_process');
const electronUpdater = require('electron-updater');
const { createUpdateManager } = require('./updateManager');
const {
  app,
  BrowserWindow,
  Menu,
  shell,
  clipboard,
  ipcMain,
  Tray
} = require('electron');

let mainWindow = null;
let backendProcess = null;
let currentProducerUrl = null;
let backendRetryUsed = false;
let backendReadyResolved = false;
let tray = null;
let isQuitting = false;
let updateManager = null;

function getObserverPaths() {
  const baseDir = path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), 'SpargeObserver');
  return {
    baseDir,
    dataDir: path.join(baseDir, 'data'),
    logDir: path.join(baseDir, 'logs'),
    configPath: path.join(baseDir, 'config.json')
  };
}

function copyRecursive(src, dest) {
  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    fs.mkdirSync(dest, { recursive: true });
    for (const entry of fs.readdirSync(src)) {
      copyRecursive(path.join(src, entry), path.join(dest, entry));
    }
    return;
  }
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
}

function syncRuntimeToAppData() {
  const paths = getObserverPaths();
  const binDir = path.join(paths.baseDir, 'bin');
  fs.mkdirSync(binDir, { recursive: true });

  const runtimeDir = path.join(process.resourcesPath, 'observer-runtime');
  const runtimeExeBin = path.join(runtimeDir, 'SpargeObserver.bin');
  if (!fs.existsSync(runtimeExeBin)) {
    throw new Error(`Missing packaged runtime binary: ${runtimeExeBin}`);
  }

  const targetExe = path.join(binDir, 'SpargeObserver.exe');
  copyRecursive(runtimeExeBin, targetExe);

  // Keep sqlite binding/config/public next to runtime EXE so launcher can find them.
  const extraItems = ['better_sqlite3.node', 'config.yml', 'public'];
  for (const item of extraItems) {
    const src = path.join(runtimeDir, item);
    if (!fs.existsSync(src)) continue;
    copyRecursive(src, path.join(binDir, item));
  }

  return targetExe;
}

function readObserverConfig() {
  const paths = getObserverPaths();
  try {
    const raw = fs.readFileSync(paths.configPath, 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function shellSettingsPath() {
  return path.join(getObserverPaths().baseDir, 'shell-settings.json');
}

function readShellSettings() {
  try {
    return JSON.parse(fs.readFileSync(shellSettingsPath(), 'utf8'));
  } catch {
    return { startWithWindows: false, minimizeToTray: false };
  }
}

function writeShellSettings(settings) {
  const paths = getObserverPaths();
  fs.mkdirSync(paths.baseDir, { recursive: true });
  const next = {
    startWithWindows: settings?.startWithWindows === true,
    minimizeToTray: settings?.minimizeToTray === true
  };
  fs.writeFileSync(shellSettingsPath(), JSON.stringify(next, null, 2), 'utf8');
  app.setLoginItemSettings({ openAtLogin: next.startWithWindows });
  return next;
}

function openFolder(targetPath) {
  if (!targetPath) return;
  fs.mkdirSync(targetPath, { recursive: true });
  shell.openPath(targetPath);
}

function parseMarker(line) {
  const setupMatch = line.match(/\[observer\] setup_url=(.+)$/);
  if (setupMatch) return { type: 'setup', url: setupMatch[1].trim() };
  const appMatch = line.match(/\[observer\] app_url=(.+)$/);
  if (appMatch) return { type: 'app', url: appMatch[1].trim() };
  return null;
}

function waitForStatus(baseUrl, timeoutMs = 15000) {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const check = () => {
      const req = require('http').request(
        `${baseUrl.replace(/\/$/, '')}/api/status`,
        { method: 'GET', timeout: 2000 },
        (res) => {
          let body = '';
          res.on('data', (chunk) => (body += chunk));
          res.on('end', () => {
            if (res.statusCode >= 200 && res.statusCode < 300) {
              resolve();
              return;
            }
            retry();
          });
        }
      );
      req.on('error', retry);
      req.on('timeout', () => req.destroy());
      req.end();
    };

    const retry = () => {
      if (Date.now() - started > timeoutMs) {
        reject(new Error('Observer API did not become ready in time'));
        return;
      }
      setTimeout(check, 500);
    };

    check();
  });
}

function isHttpReachable(url, timeoutMs = 1200) {
  return new Promise((resolve) => {
    const req = require('http').request(url, { method: 'GET', timeout: timeoutMs }, (res) => {
      res.resume();
      resolve(res.statusCode >= 200 && res.statusCode < 500);
    });
    req.on('error', () => resolve(false));
    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });
    req.end();
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1320,
    height: 860,
    minWidth: 1100,
    minHeight: 700,
    title: 'Sparge Observer',
    icon: path.join(__dirname, '..', 'public', 'assets', 'sparge_logo.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  mainWindow.loadURL('data:text/html,<h3 style=\"font-family:Segoe UI;padding:16px;\">Starting Sparge Observer...</h3>');

  mainWindow.on('close', (event) => {
    const settings = readShellSettings();
    if (!isQuitting && settings.minimizeToTray) {
      event.preventDefault();
      mainWindow.hide();
    }
  });
}

function logUpdate(level, event, details = {}) {
  const paths = getObserverPaths();
  fs.mkdirSync(paths.logDir, { recursive: true });
  const safe = {
    timestamp: new Date().toISOString(),
    level,
    event,
    version: typeof details.version === 'string' ? details.version.slice(0, 32) : undefined,
    error: typeof details.error === 'string' ? details.error.slice(0, 300) : undefined
  };
  fs.appendFileSync(path.join(paths.logDir, 'update.log'), `${JSON.stringify(safe)}\n`, 'utf8');
}

function sendUpdateState(state) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send('observer:updateState', state);
}

function communityIdentityUrl() {
  const cfg = readObserverConfig();
  const base = process.env.COMMUNITY_PUBLIC_BASE_URL || cfg?.communityPublicBaseUrl || cfg?.producerUrl || currentProducerUrl || '';
  const parsed = new URL(base);
  if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('Community identity URL must use HTTP(S)');
  return new URL('/wallet?community=open', parsed).toString();
}

function ensureTray() {
  if (tray) return;
  const iconPath = path.join(__dirname, '..', 'public', 'assets', 'sparge_logo.png');
  tray = new Tray(iconPath);
  tray.setToolTip('Sparge Observer');
  tray.setContextMenu(Menu.buildFromTemplate([
    {
      label: 'Show Observer',
      click: () => {
        if (mainWindow) {
          mainWindow.show();
          mainWindow.focus();
        }
      }
    },
    {
      label: 'Restart Observer',
      click: () => restartBackend()
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        isQuitting = true;
        app.quit();
      }
    }
  ]));
  tray.on('click', () => {
    if (mainWindow) mainWindow.show();
  });
}

function createMenu() {
  const template = [
    {
      label: 'Observer',
      submenu: [
        {
          label: 'Open Logs Folder',
          click: () => openFolder(getObserverPaths().logDir)
        },
        {
          label: 'Advanced: Open Data Folder',
          click: () => openFolder(getObserverPaths().dataDir)
        },
        {
          label: 'Copy Producer URL',
          click: () => {
            const cfg = readObserverConfig();
            const url = cfg?.producerUrl || currentProducerUrl || '';
            if (url) clipboard.writeText(url);
          }
        },
        {
          label: 'Check for Updates',
          click: () => updateManager?.check(true)
        },
        { type: 'separator' },
        { role: 'quit' }
      ]
    }
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function getBackendCommand() {
  if (app.isPackaged) {
    const exePath = syncRuntimeToAppData();
    return {
      command: exePath,
      args: [],
      cwd: path.dirname(exePath)
    };
  }

  return {
    command: process.platform === 'win32' ? 'node.exe' : 'node',
    args: [path.join(__dirname, '..', 'launcher.js')],
    cwd: path.join(__dirname, '..')
  };
}

function startBackend() {
  backendReadyResolved = false;
  const cfg = readObserverConfig();
  currentProducerUrl = cfg?.producerUrl || null;
  const desiredPort = Number(cfg?.port || 3052);
  const appBaseUrl = `http://127.0.0.1:${desiredPort}`;
  const setupUrl = `http://127.0.0.1:${Number(process.env.OBSERVER_SETUP_PORT || 3059)}/setup`;
  const env = {
    ...process.env,
    OBSERVER_NO_BROWSER: '1',
    OBSERVER_SETUP_PORT: '3059'
  };

  const onLine = async (line) => {
    const marker = parseMarker(line);
    if (!marker || !mainWindow) return;
    if (marker.type === 'setup') {
      backendReadyResolved = true;
      mainWindow.loadURL(marker.url);
      return;
    }
    if (marker.type === 'app') {
      try {
        await waitForStatus(marker.url);
      } catch {
        // If status polling fails, still try loading the UI URL.
      }
      backendReadyResolved = true;
      mainWindow.loadURL(marker.url);
    }
  };

  const fallbackPoller = setInterval(async () => {
    if (backendReadyResolved || !mainWindow || mainWindow.isDestroyed()) {
      clearInterval(fallbackPoller);
      return;
    }
    if (await isHttpReachable(`${appBaseUrl}/api/status`)) {
      backendReadyResolved = true;
      mainWindow.loadURL(`${appBaseUrl}/`);
      clearInterval(fallbackPoller);
      return;
    }
    if (await isHttpReachable(setupUrl)) {
      backendReadyResolved = true;
      mainWindow.loadURL(setupUrl);
      clearInterval(fallbackPoller);
    }
  }, 1000);

  const launch = () => {
    const { command, args, cwd } = getBackendCommand();
    backendProcess = spawn(command, args, {
      cwd,
      env,
      windowsHide: true
    });

    backendProcess.on('error', (err) => {
      // If the copied runtime EXE is transiently missing, recopy and retry once.
      if (!backendRetryUsed && err && err.code === 'ENOENT' && app.isPackaged) {
        backendRetryUsed = true;
        try {
          syncRuntimeToAppData();
        } catch {
          // no-op
        }
        setTimeout(launch, 250);
        return;
      }
      throw err;
    });

    backendProcess.stdout.setEncoding('utf8');
    backendProcess.stdout.on('data', (chunk) => {
      chunk.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).forEach(onLine);
    });
    backendProcess.stderr.setEncoding('utf8');
    backendProcess.stderr.on('data', (chunk) => {
      chunk.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).forEach(onLine);
    });
  };

  launch();
}

function stopBackend() {
  if (!backendProcess || backendProcess.killed) return;
  backendProcess.kill();
  backendProcess = null;
}

function restartBackend() {
  stopBackend();
  backendRetryUsed = false;
  backendReadyResolved = false;
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.loadURL('data:text/html,<h3 style=\"font-family:Segoe UI;padding:16px;\">Restarting Sparge Observer...</h3>');
  }
  setTimeout(startBackend, 500);
}

function resetLocalData(confirmPhrase) {
  if (confirmPhrase !== 'RESET') throw new Error('Reset confirmation missing');
  const paths = getObserverPaths();
  stopBackend();
  fs.rmSync(paths.dataDir, { recursive: true, force: true });
  fs.mkdirSync(paths.dataDir, { recursive: true });
  restartBackend();
  return true;
}

ipcMain.handle('observer:openLogs', () => {
  openFolder(getObserverPaths().logDir);
  return true;
});
ipcMain.handle('observer:openData', () => {
  openFolder(getObserverPaths().dataDir);
  return true;
});
ipcMain.handle('observer:copyProducerUrl', () => {
  const cfg = readObserverConfig();
  const url = cfg?.producerUrl || currentProducerUrl || '';
  if (url) clipboard.writeText(url);
  return url;
});
ipcMain.handle('observer:restart', () => {
  restartBackend();
  return true;
});
ipcMain.handle('observer:stop', () => {
  stopBackend();
  return true;
});
ipcMain.handle('observer:resetLocalData', (_event, confirmPhrase) => resetLocalData(confirmPhrase));
ipcMain.handle('observer:getShellSettings', () => readShellSettings());
ipcMain.handle('observer:setShellSettings', (_event, settings) => {
  const next = writeShellSettings(settings);
  if (next.minimizeToTray) ensureTray();
  return next;
});
ipcMain.handle('observer:openCommunityIdentity', async () => {
  await shell.openExternal(communityIdentityUrl());
  return true;
});
ipcMain.handle('observer:getUpdateState', () => updateManager?.getState() || null);
ipcMain.handle('observer:checkForUpdates', () => updateManager?.check(true));
ipcMain.handle('observer:downloadUpdate', () => updateManager?.download());
ipcMain.handle('observer:installUpdate', () => updateManager?.install() || false);

app.whenReady().then(() => {
  writeShellSettings(readShellSettings());
  if (readShellSettings().minimizeToTray) ensureTray();
  createWindow();
  createMenu();
  startBackend();
  updateManager = createUpdateManager({
    app,
    updater: electronUpdater.autoUpdater,
    notify: sendUpdateState,
    log: logUpdate,
    beforeInstall: () => {
      isQuitting = true;
      stopBackend();
    }
  });
  updateManager.start();
});

app.on('window-all-closed', () => {
  stopBackend();
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  isQuitting = true;
  updateManager?.stop();
  stopBackend();
});
