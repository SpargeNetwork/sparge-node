const { spawnSync } = require('child_process');
const path = require('path');

function run(cmd, args) {
  const result = spawnSync(cmd, args, { stdio: 'inherit' });
  if (result.error) {
    console.error(result.error.message || result.error);
    process.exit(1);
  }
  if (result.status !== 0) {
    process.exit(result.status || 1);
  }
}

function runSoft(cmd, args) {
  const result = spawnSync(cmd, args, { stdio: 'inherit' });
  if (result.error) {
    console.error(result.error.message || result.error);
    return false;
  }
  return result.status === 0;
}

const nodeCmd = process.platform === 'win32' ? 'node.exe' : 'node';
const npmCmd = process.platform === 'win32' ? 'cmd.exe' : 'npm';
const npxCmd = process.platform === 'win32' ? 'cmd.exe' : 'npx';

if (process.platform === 'win32') {
  runSoft(npmCmd, ['/d', '/s', '/c', 'taskkill /IM SpargeObserver.exe /F >nul 2>nul']);
}

const rebuilt = runSoft(npmCmd, ['/d', '/s', '/c', 'npm run rebuild:node18']);
if (!rebuilt) {
  console.warn('Warning: rebuild:node18 failed; continuing with existing sqlite runtime binary if available.');
}
run(npxCmd, ['/d', '/s', '/c', 'npx pkg -t node18-win-x64 -o dist/SpargeObserver.exe launcher.js']);
run(nodeCmd, [path.join(__dirname, 'copy-sqlite.js')]);
run(nodeCmd, [path.join(__dirname, 'copy-public.js')]);
run(nodeCmd, [path.join(__dirname, 'copy-config.js')]);
