const { spawnSync } = require('child_process');

const env = {
  ...process.env,
  npm_config_target: '18.5.0',
  npm_config_runtime: 'node',
  npm_config_disturl: 'https://nodejs.org/download/release/v18.5.0',
  npm_config_platform: 'win32',
  npm_config_arch: 'x64',
  npm_config_build_from_source: 'false'
};

const npmCmd = process.platform === 'win32' ? 'cmd.exe' : 'npm';
const fs = require('fs');
const path = require('path');
const baseDir = path.join(__dirname, '..', 'node_modules', 'better-sqlite3');
const bindingPaths = [
  path.join(baseDir, 'build', 'Release', 'better_sqlite3.node'),
  path.join(baseDir, 'lib', 'binding', 'node-v108-win32-x64', 'better_sqlite3.node'),
  path.join(baseDir, 'compiled', '18.5.0', 'win32', 'x64', 'better_sqlite3.node')
];
const findBinding = () => bindingPaths.find((p) => fs.existsSync(p));

try {
  bindingPaths.forEach((p) => {
    if (fs.existsSync(p)) fs.unlinkSync(p);
  });
} catch {}

let result = spawnSync(
  npmCmd,
  ['/d', '/s', '/c', 'npx prebuild-install --runtime=node --target=18.5.0 --platform=win32 --arch=x64'],
  { stdio: 'inherit', env, cwd: baseDir }
);
if (result.error) {
  console.error(result.error.message || result.error);
  process.exit(1);
}

if (result.status !== 0) {
  result = spawnSync(
    npmCmd,
    ['/d', '/s', '/c', 'npm rebuild better-sqlite3 --build-from-source'],
    { stdio: 'inherit', env, cwd: path.join(__dirname, '..') }
  );
  if (result.error) {
    console.error(result.error.message || result.error);
    process.exit(1);
  }
}

if (!findBinding()) {
  console.error('Could not produce better_sqlite3.node for Node 18');
  process.exit(1);
}

process.exit(result.status || 0);
