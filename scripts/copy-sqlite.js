const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');

const baseDir = path.join(__dirname, '..', 'node_modules', 'better-sqlite3');
const npmPrebuildCacheDir = path.join(process.env.LOCALAPPDATA || '', 'npm-cache', '_prebuilds');
const prebuildSuffix = 'better-sqlite3-v9.6.0-node-v108-win32-x64.tar.gz';
const candidates = [
  path.join(baseDir, 'lib', 'binding', 'node-v108-win32-x64', 'better_sqlite3.node'),
  path.join(baseDir, 'compiled', '18.5.0', 'win32', 'x64', 'better_sqlite3.node'),
  path.join(baseDir, 'build', 'Release', 'better_sqlite3.node')
];

const distDir = path.join(__dirname, '..', 'dist');
const dest = path.join(distDir, 'better_sqlite3.node');
fs.mkdirSync(distDir, { recursive: true });

function findCachedPrebuildArchive() {
  if (!npmPrebuildCacheDir || !fs.existsSync(npmPrebuildCacheDir)) return null;
  const entry = fs
    .readdirSync(npmPrebuildCacheDir)
    .find((name) => name.endsWith(prebuildSuffix));
  return entry ? path.join(npmPrebuildCacheDir, entry) : null;
}

function tryExtractFromCache() {
  const archive = findCachedPrebuildArchive();
  if (!archive) return false;

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sparge-sqlite-'));
  const result = spawnSync('tar', ['-xf', archive, '-C', tempDir], { stdio: 'pipe' });
  if (result.status !== 0) {
    fs.rmSync(tempDir, { recursive: true, force: true });
    return false;
  }

  const extracted = path.join(tempDir, 'build', 'Release', 'better_sqlite3.node');
  if (!fs.existsSync(extracted)) {
    fs.rmSync(tempDir, { recursive: true, force: true });
    return false;
  }

  fs.copyFileSync(extracted, dest);
  fs.rmSync(tempDir, { recursive: true, force: true });
  console.log(`Copied sqlite binding (node-v108 cache) to ${dest}`);
  return true;
}

function fetchNode18Prebuild() {
  const npmCmd = process.platform === 'win32' ? 'cmd.exe' : 'npx';
  const args = process.platform === 'win32'
    ? ['/d', '/s', '/c', 'npx prebuild-install --runtime=node --target=18.5.0 --platform=win32 --arch=x64']
    : ['prebuild-install', '--runtime=node', '--target=18.5.0', '--platform=win32', '--arch=x64'];
  spawnSync(npmCmd, args, { cwd: baseDir, stdio: 'inherit' });
}

let copied = tryExtractFromCache();
if (!copied) {
  fetchNode18Prebuild();
  copied = tryExtractFromCache();
}
if (!copied) {
  const src = candidates.find((p) => fs.existsSync(p));
  if (!src) {
    if (fs.existsSync(dest)) {
      console.warn(`Using existing sqlite binding at ${dest}`);
      process.exit(0);
    }
    console.error(`Missing sqlite binding at ${candidates.join(', ')}`);
    process.exit(1);
  }

  fs.copyFileSync(src, dest);
  console.log(`Copied sqlite binding to ${dest}`);
  copied = true;
}
